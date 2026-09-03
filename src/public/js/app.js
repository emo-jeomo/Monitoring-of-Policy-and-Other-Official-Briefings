/* ═══════════════════════════════════════════════════════════════
   KOSHA 언론모니터링 시스템 – 메인 앱 JS (완전 통합 카테고리 버전)
   카테고리: 중대재해 / 산업재해·안전 / 법령·제도 / 정책·브리핑 / 직업보건·화학 / 기관동향
   추가기능: 속보티커 / 북마크 / 공유모달 / 검색자동완성 / 읽음표시 / 스파크라인 / 키워드트렌드 / 인쇄 / 모바일
═══════════════════════════════════════════════════════════════ */

// ── 통합 카테고리 메타 ─────────────────────────────────────────
const CAT = {
  '중대재해':    { color: '#c53030', bg: '#fff0f0', dot: '#e53e3e' },
  '산업재해·안전': { color: '#b45309', bg: '#fffbeb', dot: '#d97706' },
  '법령·제도':   { color: '#6b21a8', bg: '#f5f0ff', dot: '#7c3aed' },
  '정책·브리핑': { color: '#0057ff', bg: '#e8eeff', dot: '#0057ff' },
  '직업보건·화학':{ color: '#0e7490', bg: '#f0fdff', dot: '#0891b2' },
  '기관동향':   { color: '#be185d', bg: '#fdf2f8', dot: '#db2777' },
  '기타':       { color: '#5c5c5c', bg: '#f5f5f5', dot: '#8a8a8a' },
};
const cm = cat => CAT[cat] || CAT['기타'];

// 탭 → 카테고리 완전 매핑
const TAB_CAT = {
  disaster: '중대재해',
  safety:   '산업재해·안전',
  law:      '법령·제도',
  policy:   '정책·브리핑',
  health:   '직업보건·화학',
  kosha:    '기관동향',
};

// ── 앱 상태 ─────────────────────────────────────────────────────
const S = {
  tab: 'latest', query: '',
  category: 'all', source: 'all',
  dateFrom: '', dateTo: '',
  crawledFrom: '', crawledTo: '',  // 수집 일시 기반 필터 (crawled_at, UTC)
  advTab: 'range',
  advFrom: '', advTo: '',
  advYear: '', advMonth: '', advDay: '', advHour: '',
  quickPeriod: null,
  page: 1, pageSize: 20,
  totalPages: 1, total: 0,
  viewMode: 'card',
  currentArticleId: null,   // 드로어에서 열린 기사 ID
};

// ── DOM 유틸 ────────────────────────────────────────────────────
const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

// ── 날짜 유틸 ───────────────────────────────────────────────────
function zp(n) { return String(n).padStart(2, '0'); }

/**
 * DB에 저장된 날짜 문자열은 KST(UTC+9) 기준의
 * "YYYY-MM-DD HH:MM:SS" 형식으로 저장됨.
 * JS Date 객체는 서버 로컬 타임존에 따라 다르게 해석되므로
 * 정규식으로 직접 파싱하여 KST 값을 정확히 표시.
 */

/**
 * 날짜 문자열에서 KST 컴포넌트를 직접 추출 (타임존 변환 없이)
 * "YYYY-MM-DD HH:MM:SS" 형식 → {year, month, day, hours, minutes, seconds}
 */
function parseKSTComponents(d) {
  if (!d) return null;
  const s = String(d).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return {
      year: +m[1], month: +m[2], day: +m[3],
      hours: +m[4], minutes: +m[5], seconds: +(m[6] || 0),
    };
  }
  const dm = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dm) {
    return { year: +dm[1], month: +dm[2], day: +dm[3], hours: 0, minutes: 0, seconds: 0 };
  }
  return null;
}

/**
 * KST 날짜를 UTC 기준 Date 객체로 변환 (시간 비교용)
 */
function parseKST(d) {
  if (!d) return null;
  const c = parseKSTComponents(d);
  if (!c) {
    const dt = new Date(String(d));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const utcMs = Date.UTC(c.year, c.month - 1, c.day, c.hours - 9, c.minutes, c.seconds);
  return new Date(utcMs);
}

function relTime(d) {
  if (!d) return '—';
  const c = parseKSTComponents(d);
  if (c) {
    const utcMs = Date.UTC(c.year, c.month - 1, c.day, c.hours - 9, c.minutes, c.seconds);
    const diff = Math.floor((Date.now() - utcMs) / 1000);
    if (diff < 60)     return '방금';
    if (diff < 3600)   return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
    return `${c.year}.${zp(c.month)}.${zp(c.day)}`;
  }
  const dt = parseKST(d);
  if (!dt) return String(d);
  const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diff < 60)     return '방금';
  if (diff < 3600)   return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return String(d).substring(0, 10);
}

// crawled_at(UTC 저장) → KST 문자열 변환 (relTime용)
function crawledAtToKST(utcStr) {
  if (!utcStr) return null;
  try {
    const d = new Date(utcStr.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return utcStr;
    const kst = new Date(d.getTime() + 9 * 3600 * 1000);
    return kst.toISOString().replace('T', ' ').substring(0, 19);
  } catch { return utcStr; }
}

function fmtFull(d) {
  if (!d) return '—';
  const c = parseKSTComponents(d);
  if (!c) return String(d);
  return `${c.year}년 ${c.month}월 ${c.day}일 ${zp(c.hours)}:${zp(c.minutes)}`;
}

function fmtFull2(d) {
  if (!d) return '';
  const c = parseKSTComponents(d);
  if (!c) return String(d).substring(0, 16);
  return `${c.year}-${zp(c.month)}-${zp(c.day)} ${zp(c.hours)}:${zp(c.minutes)}`;
}

function fmtDate(d) {
  if (!d) return '';
  const c = parseKSTComponents(d);
  if (!c) return '';
  return `${c.year}-${zp(c.month)}-${zp(c.day)}`;
}

function isNew(d) {
  if (!d) return false;
  const c = parseKSTComponents(d);
  if (c) {
    const utcMs = Date.UTC(c.year, c.month - 1, c.day, c.hours - 9, c.minutes, c.seconds);
    return (Date.now() - utcMs) / 3600000 < 8;
  }
  const dt = parseKST(d);
  if (!dt) return false;
  return (Date.now() - dt.getTime()) / 3600000 < 8;
}

// ── 검색어 하이라이트 ─────────────────────────────────────────
function hl(text, q) {
  if (!q || !text) return text || '';
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${esc})`, 'gi'), '<mark class="hl">$1</mark>');
}

// ── API 호출 ────────────────────────────────────────────────────
async function apiFetch(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.error('[API]', e.message, url);
    return null;
  }
}

// ── 토스트 ──────────────────────────────────────────────────────
function toast(msg, type = 'info', ms = 3500) {
  const icons = { success: 'ti-check', error: 'ti-alert-triangle', info: 'ti-info-circle' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="ti ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  $('#toastCont').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, ms);
}

// ══════════════════════════════════════════════════════════════
// ① 읽음 기록 (localStorage)
// ══════════════════════════════════════════════════════════════
const READ_KEY = 'kosha_read_ids';
function getReadIds() {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); }
  catch { return new Set(); }
}
function markRead(id) {
  const ids = getReadIds();
  ids.add(String(id));
  // 최대 500개만 유지
  const arr = [...ids].slice(-500);
  try { localStorage.setItem(READ_KEY, JSON.stringify(arr)); } catch {}
}
function isRead(id) { return getReadIds().has(String(id)); }

// ══════════════════════════════════════════════════════════════
// ② 북마크 (localStorage 기반 + 서버 동기)
// ══════════════════════════════════════════════════════════════
const BM_KEY = 'kosha_bookmarks';
function getBmIds() {
  try { return new Set(JSON.parse(localStorage.getItem(BM_KEY) || '[]')); }
  catch { return new Set(); }
}
function setBmIds(set) {
  try { localStorage.setItem(BM_KEY, JSON.stringify([...set])); } catch {}
}
function isBookmarked(id) { return getBmIds().has(String(id)); }

async function toggleBookmark(id) {
  const ids = getBmIds();
  const idStr = String(id);
  const now = !ids.has(idStr);
  if (now) ids.add(idStr); else ids.delete(idStr);
  setBmIds(ids);
  // 서버 동기 (오류 무시)
  try {
    await fetch(`/api/articles/${id}/bookmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookmarked: now }),
    });
  } catch {}
  return now;
}

function updateBookmarkBadge() {
  const cnt = getBmIds().size;
  const badge = $('#navBadgeBookmarks');
  if (badge) badge.textContent = cnt > 0 ? (cnt > 99 ? '99+' : cnt) : '';
}

// ══════════════════════════════════════════════════════════════
// ③ 검색 기록 자동완성
// ══════════════════════════════════════════════════════════════
const HIST_KEY = 'kosha_search_hist';
function getSearchHist() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); }
  catch { return []; }
}
function pushSearchHist(q) {
  if (!q || q.length < 2) return;
  let hist = getSearchHist().filter(h => h !== q);
  hist.unshift(q);
  hist = hist.slice(0, 8);
  try { localStorage.setItem(HIST_KEY, JSON.stringify(hist)); } catch {}
}

// 자동완성 드롭다운 렌더
function renderSuggest(items, onSelect) {
  const box = $('#searchSuggest');
  if (!box) return;
  if (!items.length) { box.innerHTML = ''; box.classList.remove('open'); return; }
  box.innerHTML = items.map((item, i) =>
    `<div class="suggest-item" data-idx="${i}">${item.icon ? `<i class="ti ${item.icon}"></i>` : ''}<span>${item.text}</span></div>`
  ).join('');
  box.classList.add('open');
  $$('.suggest-item', box).forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      onSelect(items[+el.dataset.idx].text);
      box.innerHTML = ''; box.classList.remove('open');
    });
  });
}
function hideSuggest() {
  const box = $('#searchSuggest');
  if (box) { box.innerHTML = ''; box.classList.remove('open'); }
}

// 전체 키워드 캐시
let _kwCache = [];
async function loadKwCache() {
  const data = await apiFetch('/api/stats/keywords?days=30&limit=20');
  if (data?.success) _kwCache = (data.data || []).map(r => r.kw);
}

function initSearchAutocomplete() {
  const inp = $('#globalSearch');
  if (!inp) return;

  inp.addEventListener('focus', () => {
    const hist = getSearchHist();
    if (hist.length) {
      renderSuggest(
        hist.slice(0, 5).map(h => ({ text: h, icon: 'ti-history' })),
        text => { inp.value = text; S.query = text; doSearch(); }
      );
    }
  });

  inp.addEventListener('input', () => {
    const q = inp.value.trim();
    if (!q) {
      const hist = getSearchHist();
      if (hist.length) {
        renderSuggest(
          hist.slice(0, 5).map(h => ({ text: h, icon: 'ti-history' })),
          text => { inp.value = text; S.query = text; doSearch(); }
        );
      } else hideSuggest();
      return;
    }
    // 키워드 캐시에서 매칭
    const matched = _kwCache.filter(k => k.includes(q)).slice(0, 5);
    if (matched.length) {
      renderSuggest(
        matched.map(k => ({ text: k, icon: 'ti-tag' })),
        text => { inp.value = text; S.query = text; doSearch(); }
      );
    } else hideSuggest();
  });

  inp.addEventListener('blur', () => { setTimeout(hideSuggest, 150); });

  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      S.query = inp.value.trim();
      if (S.query) pushSearchHist(S.query);
      hideSuggest();
      S.tab = 'latest';
      $$('.nav-item').forEach(li => li.classList.toggle('active', li.dataset.tab === 'latest'));
      const titleEl = $('#pageTitle');
      if (titleEl) titleEl.textContent = S.query ? `"${S.query}" 검색 결과` : '전체 최신 기사';
      doSearch();
    }
    if (e.key === 'Escape') hideSuggest();
  });
}

// ══════════════════════════════════════════════════════════════
// ④ 속보 티커 배너
// ══════════════════════════════════════════════════════════════
let _tickerArticles = [];
let _tickerTimer = null;
let _tickerPos = 0;

async function initTicker() {
  const wrap = $('#tickerWrap');
  const track = $('#tickerTrack');
  const closeBtn = $('#tickerClose');
  const toggleBtn = $('#tickerToggleBtn');
  if (!wrap || !track) return;

  // 속보 숨기기 함수
  const hideTicker = () => {
    wrap.style.transform = 'translateY(-100%)';
    setTimeout(() => { wrap.style.display = 'none'; }, 310);
    document.body.classList.add('ticker-hidden');
    sessionStorage.setItem('ticker_closed', '1');
    if (_tickerTimer) clearInterval(_tickerTimer);
  };

  // 속보 보이기 함수
  const showTicker = () => {
    wrap.style.display = 'flex';
    wrap.style.transform = 'translateY(-100%)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wrap.style.transform = 'translateY(0)';
      });
    });
    document.body.classList.remove('ticker-hidden');
    sessionStorage.removeItem('ticker_closed');
    refreshTicker();
    _tickerTimer = setTimeout(renderTickerItem, 5000);
  };

  // 세션 복원: 이미 닫은 경우 숨김 유지
  if (sessionStorage.getItem('ticker_closed') === '1') {
    wrap.style.display = 'none';
    document.body.classList.add('ticker-hidden');
  } else {
    await refreshTicker();
  }

  // 숨기기 버튼 클릭
  closeBtn?.addEventListener('click', hideTicker);

  // 재표시 토글 버튼 클릭
  toggleBtn?.addEventListener('click', () => {
    if (document.body.classList.contains('ticker-hidden')) {
      showTicker();
    } else {
      hideTicker();
    }
  });

  // 5분마다 새로고침
  setInterval(refreshTicker, 5 * 60 * 1000);
}

async function refreshTicker() {
  const data = await apiFetch('/api/articles/latest?limit=10');
  if (!data?.success || !data.data?.length) return;
  _tickerArticles = data.data;
  _tickerPos = 0;
  renderTickerItem();
}

function renderTickerItem() {
  const track = $('#tickerTrack');
  if (!track || !_tickerArticles.length) return;

  const a = _tickerArticles[_tickerPos];
  const newItem = document.createElement('span');
  newItem.className = 'ticker-item ticker-enter';
  newItem.innerHTML = `<span class="ticker-cat" data-cat="${a.category}">${a.category}</span> ${a.title || ''}`;
  newItem.style.cursor = 'pointer';
  newItem.addEventListener('click', () => openDrawer(a.id));

  // 슬라이드 인/아웃 애니메이션
  const old = track.querySelector('.ticker-item');
  if (old) {
    old.classList.add('ticker-exit');
    setTimeout(() => old.remove(), 400);
  }
  track.appendChild(newItem);
  requestAnimationFrame(() => newItem.classList.remove('ticker-enter'));

  _tickerPos = (_tickerPos + 1) % _tickerArticles.length;
  if (_tickerTimer) clearTimeout(_tickerTimer);
  _tickerTimer = setTimeout(renderTickerItem, 5000);
}

// ══════════════════════════════════════════════════════════════
// ⑤ 사이드바 스파크라인 (Canvas)
// ══════════════════════════════════════════════════════════════
async function drawSparkline() {
  const canvas = $('#sparklineCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const data = await apiFetch('/api/stats/hourly-today');
  if (!data?.success) return;
  const counts = data.data.map(d => d.cnt); // 0~23시 24개
  const max = Math.max(...counts, 1);

  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 4, bottom: 4, left: 2, right: 2 };
  const barW = (W - pad.left - pad.right) / 24;

  ctx.clearRect(0, 0, W, H);

  // 현재 KST 시간
  const nowKST = new Date(Date.now() + 9 * 3600 * 1000);
  const curH = nowKST.getUTCHours();

  counts.forEach((cnt, h) => {
    const barH = cnt === 0 ? 2 : Math.max(4, ((cnt / max) * (H - pad.top - pad.bottom)));
    const x = pad.left + h * barW;
    const y = H - pad.bottom - barH;

    if (h === curH) {
      ctx.fillStyle = '#22a866'; // 현재 시간: 밝은 그린
    } else if (cnt > 0) {
      ctx.fillStyle = 'rgba(34,168,102,0.55)';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
    }
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(x + 1, y, barW - 2, barH, [2, 2, 0, 0])
      : ctx.rect(x + 1, y, barW - 2, barH);
    ctx.fill();
  });

  // 호버 힌트 (마우스 이동 시)
  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const hIdx = Math.floor((mx - pad.left) / barW);
    const hint = $('#sparklineHint');
    if (hint && hIdx >= 0 && hIdx < 24) {
      hint.textContent = `${String(hIdx).padStart(2,'0')}시: ${counts[hIdx]}건`;
      hint.style.display = 'block';
    }
  };
  canvas.onmouseleave = () => {
    const hint = $('#sparklineHint');
    if (hint) hint.style.display = 'none';
  };
}

// ══════════════════════════════════════════════════════════════
// ⑥ 키워드 트렌드 차트 (사이드바)
// ══════════════════════════════════════════════════════════════
async function drawKwTrend() {
  const wrap = $('#kwTrend');
  if (!wrap) return;

  const data = await apiFetch('/api/stats/keywords?days=7&limit=8');
  if (!data?.success || !data.data?.length) {
    wrap.innerHTML = '<div class="kw-trend-empty">데이터 없음</div>';
    return;
  }

  const rows = data.data;
  const max = rows[0]?.cnt || 1;

  wrap.innerHTML = rows.map(r => {
    const pct = Math.max(8, Math.round((r.cnt / max) * 100));
    return `
    <div class="kw-trend-row" title="${r.kw}: ${r.cnt}건">
      <span class="kw-trend-label">${r.kw}</span>
      <div class="kw-trend-bar-wrap">
        <div class="kw-trend-bar" style="width:${pct}%"></div>
      </div>
      <span class="kw-trend-cnt">${r.cnt}</span>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// ⑦ 공유 모달 (카카오톡 URL scheme 지원)
// ══════════════════════════════════════════════════════════════
function openShareModal(articleTitle, articleUrl) {
  const overlay = $('#shareModalOverlay');
  const urlInput = $('#shareUrlInput');
  const twitterBtn = $('#shareTwitter');
  const kakaoBtn = $('#shareKakao');
  const lineBtn = $('#shareLine');
  const fbBtn = $('#shareFacebook');
  const copyBtn = $('#shareCopyBtn');
  const closeBtn = $('#shareModalClose');
  const kakaoNotice = $('#shareKakaoNotice');

  if (!overlay) return;

  const shareUrl = articleUrl || window.location.href;
  const shareText = encodeURIComponent((articleTitle || 'KOSHA 기사') + ' - KOSHA 언론모니터링');
  const encUrl = encodeURIComponent(shareUrl);

  if (urlInput) urlInput.value = shareUrl;
  if (twitterBtn) twitterBtn.href = `https://twitter.com/intent/tweet?text=${shareText}&url=${encUrl}`;
  if (fbBtn) fbBtn.href = `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`;
  // LINE 공유
  if (lineBtn) lineBtn.href = `https://line.me/R/msg/text/?${encodeURIComponent(shareUrl)}`;

  // ──────────────────────────────────────────────────────
  // 카카오톡 공유 처리 (SDK 불필요 방식)
  // ──────────────────────────────────────────────────────
  if (kakaoBtn) {
    // 모바일 여부 판단
    const isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobileDevice) {
      // ① 모바일: kakaotalk:// URL 스킴 → 앱이 있으면 앱으로 직접 공유
      //    kakaolink:// 스킴은 SDK 없이는 빈 컨텐츠로 열림 → 앱으로 이동 후 사용자가 메시지 전송
      //    가장 범용적인 방법: kakaolink://send?text=... 앱 직접 호출
      //    안드로이드: intent URI, iOS: kakaotalk:// URL 스킴
      const isAndroid = /Android/i.test(navigator.userAgent);

      kakaoBtn.onclick = (e) => {
        e.preventDefault();
        const msg = encodeURIComponent(`[KOSHA 언론모니터링]\n${articleTitle || '기사'}\n\n${shareUrl}`);

        if (isAndroid) {
          // Android: intent URI로 카카오톡 앱 직접 호출
          const intentUri = `intent://send#Intent;scheme=kakaolink;package=com.kakao.talk;end`;
          // kakaolink 스킴으로 앱 호출 후 URL 클립보드에 복사
          navigator.clipboard?.writeText(shareUrl).catch(() => {});
          // 앱 호출 시도
          const link = document.createElement('a');
          link.href = intentUri;
          link.click();
          setTimeout(() => {
            // 앱이 열리지 않으면 웹 폴백
            toast('카카오톡 앱에서 "나에게 보내기" 또는 대화방을 선택하세요. URL이 클립보드에 복사되었습니다.', 'info', 4000);
          }, 800);
        } else {
          // iOS: kakaotalk URL 스킴
          const kakaoScheme = `kakaotalk://share?text=${msg}`;
          window.location.href = kakaoScheme;
          // 앱이 없는 경우 폴백: URL 복사 + 안내
          setTimeout(() => {
            toast('카카오톡이 설치되어 있지 않은 경우 URL을 복사하여 카카오톡에 붙여넣어 주세요.', 'info', 4000);
          }, 1500);
        }
        if (kakaoNotice) kakaoNotice.style.display = 'none';
      };
      if (kakaoNotice) kakaoNotice.style.display = 'none';
    } else {
      // ② PC: 카카오스토리 공유 (현재 접근 가능한 공식 방법)
      //    카카오링크는 SDK 없이 PC에서 직접 실행 불가
      //    → URL 복사 안내 + 카카오스토리 링크 제공
      kakaoBtn.onclick = async (e) => {
        e.preventDefault();
        // PC에서는 URL 복사 후 카카오스토리로 이동
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast('URL이 클립보드에 복사되었습니다. 카카오톡 PC앱 또는 카카오스토리에 붙여넣어 공유하세요.', 'info', 5000);
        } catch {
          // 클립보드 API 실패 시 카카오스토리로 직접 이동
          window.open(`https://story.kakao.com/share?url=${encUrl}`, '_blank', 'noopener,width=600,height=500');
        }
      };
      // PC 안내 메시지 표시
      if (kakaoNotice) {
        kakaoNotice.innerHTML = '<i class="ti ti-info-circle"></i> PC에서는 URL을 복사하여 카카오톡에 직접 붙여넣어 공유하세요. 버튼을 클릭하면 URL이 자동 복사됩니다.';
        kakaoNotice.style.display = 'block';
      }
    }
  }

  overlay.style.display = 'flex';
  setTimeout(() => overlay.classList.add('open'), 10);

  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copyBtn.innerHTML = '<i class="ti ti-check"></i> 복사됨';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '<i class="ti ti-copy"></i> 복사';
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch {
        // 구형 브라우저 폴백
        const ta = document.createElement('textarea');
        ta.value = shareUrl; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); toast('URL이 복사되었습니다!', 'success'); }
        catch { toast('클립보드 복사에 실패했습니다.', 'error'); }
        document.body.removeChild(ta);
      }
    };
  }

  // Web Share API 지원 시 네이티브 공유 버튼 추가 (모바일 친화적)
  if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    if (!$('#shareNativeBtn')) {
      const nativeBtn = document.createElement('button');
      nativeBtn.id = 'shareNativeBtn';
      nativeBtn.className = 'share-native-btn';
      nativeBtn.innerHTML = '<i class="ti ti-share-3"></i> 공유 메뉴 열기';
      nativeBtn.onclick = async () => {
        try {
          await navigator.share({
            title: articleTitle || 'KOSHA 언론모니터링',
            text: (articleTitle || 'KOSHA 기사') + ' - KOSHA 언론모니터링',
            url: shareUrl
          });
        } catch (err) {
          if (err.name !== 'AbortError') toast('공유에 실패했습니다.', 'error');
        }
      };
      const shareBody = $('.share-modal-body');
      if (shareBody) shareBody.insertBefore(nativeBtn, shareBody.firstChild);
    } else {
      const btn = $('#shareNativeBtn');
      if (btn) btn.onclick = async () => {
        try { await navigator.share({ title: articleTitle, url: shareUrl }); }
        catch (err) { if (err.name !== 'AbortError') toast('공유에 실패했습니다.', 'error'); }
      };
    }
  }

  if (closeBtn) {
    closeBtn.onclick = closeShareModal;
  }
  overlay.onclick = e => { if (e.target === overlay) closeShareModal(); };
}

function closeShareModal() {
  const overlay = $('#shareModalOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

// ══════════════════════════════════════════════════════════════
// ⑧ 인쇄 기능
// ══════════════════════════════════════════════════════════════
function printArticle(article) {
  if (!article) return;
  const printArea = $('#printArea');
  if (!printArea) return;

  printArea.innerHTML = `
    <div class="print-header">
      <div class="print-brand">KOSHA 언론모니터링 | 한국산업안전보건공단</div>
      <div class="print-date">출력일: ${new Date().toLocaleDateString('ko-KR')}</div>
    </div>
    <div class="print-meta">
      <span class="print-cat">[${article.category || '기타'}]</span>
      <span class="print-source">${article.source || ''}</span>
      <span class="print-time">${fmtFull(article.published_at)}</span>
    </div>
    <h1 class="print-title">${article.title || ''}</h1>
    ${article.summary ? `<div class="print-summary">${article.summary}</div>` : ''}
    ${article.content ? `<div class="print-content">${article.content}</div>` : ''}
    ${article.url ? `<div class="print-url">원문: ${article.url}</div>` : ''}
  `;
  window.print();
}

// ── 카드 렌더 ──────────────────────────────────────────────────
function renderCard(a) {
  const cat   = a.category || '기타';
  const meta  = cm(cat);
  const kws   = (a.keywords || '').split(',').filter(Boolean).slice(0, 3);
  const sum   = a.summary || a.content || '';
  const titleH = hl(a.title || '제목 없음', S.query);
  const sumH   = hl(sum.substring(0, 130), S.query);
  const isNewItem = isNew(a.crawled_at || a.published_at);
  const readClass = isRead(a.id) ? ' card-read' : '';
  const bmClass   = isBookmarked(a.id) ? ' bookmarked' : '';

  const srcIcons = {
    '정부기관': 'ti-building-bank', '기관': 'ti-certificate',
    '법령': 'ti-scale', '통신사': 'ti-radio', '방송': 'ti-device-tv',
    '전문지': 'ti-news',
  };
  const srcIcon = srcIcons[a.source_category] || 'ti-news';

  if (S.viewMode === 'list') {
    return `
    <div class="news-card list-card${readClass}" data-id="${a.id}" data-cat="${cat}" tabindex="0" role="button"
      style="--cat-color:${meta.dot};--tag-bg:${meta.bg};--tag-color:${meta.color}">
      <div class="card-left">
        <span class="cat-tag">${cat}</span>
        <span class="card-time" data-published="${a.published_at || ''}"><i class="ti ti-clock"></i>${relTime(a.published_at)}</span>
      </div>
      <div class="card-body">
        <div class="card-header" style="margin-bottom:5px">
          <span class="src-tag"><i class="ti ${srcIcon}"></i>${a.source || ''}</span>
          ${isNewItem ? '<span class="new-badge">NEW</span>' : ''}
        </div>
        <p class="card-title">${titleH}</p>
        ${sumH ? `<p class="card-summary" style="margin-top:4px">${sumH}${sum.length > 130 ? '…' : ''}</p>` : ''}
      </div>
      <button class="card-bm-btn${bmClass}" data-id="${a.id}" title="${isBookmarked(a.id) ? '북마크 해제' : '북마크'}">
        <i class="ti ${isBookmarked(a.id) ? 'ti-bookmark-filled' : 'ti-bookmark'}"></i>
      </button>
    </div>`;
  }

  return `
  <div class="news-card${readClass}" data-id="${a.id}" data-cat="${cat}" tabindex="0" role="button"
    style="--cat-color:${meta.dot};--tag-bg:${meta.bg};--tag-color:${meta.color}">
    <div class="card-header">
      <span class="cat-tag">${cat}</span>
      <span class="src-tag"><i class="ti ${srcIcon}"></i>${a.source || ''}</span>
      ${isNewItem ? '<span class="new-badge">NEW</span>' : ''}
      <button class="card-bm-btn${bmClass}" data-id="${a.id}" title="${isBookmarked(a.id) ? '북마크 해제' : '북마크'}" style="margin-left:auto">
        <i class="ti ${isBookmarked(a.id) ? 'ti-bookmark-filled' : 'ti-bookmark'}"></i>
      </button>
    </div>
    <div class="card-body">
      <p class="card-title">${titleH}</p>
      ${sumH ? `<p class="card-summary">${sumH}${sum.length > 130 ? '…' : ''}</p>` : ''}
    </div>
    <div class="card-footer">
      <span class="card-time" data-published="${a.published_at || ''}"><i class="ti ti-clock"></i>${relTime(a.published_at)}</span>
      ${kws.length ? `<div class="card-kws">${kws.map(k => `<span class="kw-tag">#${k.trim()}</span>`).join('')}</div>` : ''}
    </div>
  </div>`;
}

// ── 피드 로딩 상태 ──────────────────────────────────────────────
function showLoading() {
  $('#newsFeed').innerHTML = `
    <div class="loading-state">
      <i class="ti ti-loader spin-i"></i>
      <p>불러오는 중...</p>
    </div>`;
}
function showEmpty(msg = '검색 조건에 해당하는 기사가 없습니다.') {
  $('#newsFeed').innerHTML = `
    <div class="empty-state">
      <i class="ti ti-mood-empty empty-icon"></i>
      <h3>기사 없음</h3>
      <p>${msg}</p>
    </div>`;
}

// ── 피드 로드 ──────────────────────────────────────────────────
async function loadFeed() {
  // 북마크 탭 별도 처리
  if (S.tab === 'bookmarks') {
    return loadBookmarkFeed();
  }

  showLoading();
  const qs = new URLSearchParams();
  const p  = buildParams();
  Object.entries(p).forEach(([k,v]) => {
    if (v !== undefined && v !== '' && v !== 'all') qs.set(k, v);
  });
  qs.set('page', S.page);
  qs.set('limit', S.pageSize);

  const sort = $('#sortOrder')?.value || 'latest';
  if (sort === 'oldest') qs.set('sort', 'oldest');

  const data = await apiFetch(`/api/articles?${qs}`);
  if (!data?.success) {
    showEmpty('데이터를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.');
    return;
  }

  S.total      = data.total;
  S.totalPages = data.totalPages || 1;

  const cntEl = $('#resultCnt');
  if (cntEl) cntEl.textContent = `총 ${data.total.toLocaleString()}건`;

  if (!data.data.length) {
    showEmpty();
    renderPager(0);
    return;
  }

  const feed = $('#newsFeed');
  feed.innerHTML = data.data.map(renderCard).join('');
  feed.className = `news-grid${S.viewMode === 'list' ? ' list-view' : ''}`;

  // 카드 클릭 / 북마크 버튼
  $$('.news-card', feed).forEach(card => {
    card.addEventListener('click', e => {
      // 북마크 버튼 클릭은 드로어 열지 않음
      if (e.target.closest('.card-bm-btn')) return;
      openDrawer(card.dataset.id);
    });
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openDrawer(card.dataset.id); });
  });
  $$('.card-bm-btn', feed).forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const bmNow = await toggleBookmark(id);
      const icon = btn.querySelector('i');
      if (icon) icon.className = `ti ${bmNow ? 'ti-bookmark-filled' : 'ti-bookmark'}`;
      btn.classList.toggle('bookmarked', bmNow);
      btn.title = bmNow ? '북마크 해제' : '북마크';
      toast(bmNow ? '북마크에 추가됐습니다.' : '북마크가 해제됐습니다.', 'success', 2000);
      updateBookmarkBadge();
    });
  });

  renderPager(data.total);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── 북마크 피드 ───────────────────────────────────────────────
async function loadBookmarkFeed() {
  showLoading();
  const ids = [...getBmIds()];
  const titleEl = $('#pageTitle');
  if (titleEl) titleEl.textContent = '북마크한 기사';
  const cntEl = $('#resultCnt');

  if (!ids.length) {
    showEmpty('북마크한 기사가 없습니다. 기사 카드의 🔖 버튼을 눌러 저장하세요.');
    if (cntEl) cntEl.textContent = '총 0건';
    renderPager(0);
    return;
  }

  // 서버 API로 북마크 목록 가져오기 (로컬과 합산)
  const data = await apiFetch('/api/articles/bookmarked');
  let articles = data?.success ? data.data : [];

  // 로컬 북마크 중 서버에 없는 것도 포함
  const serverIds = new Set(articles.map(a => String(a.id)));
  const missingIds = ids.filter(id => !serverIds.has(id));
  if (missingIds.length) {
    // 최대 20개까지 개별 조회
    const extra = await Promise.all(
      missingIds.slice(0, 20).map(id => apiFetch(`/api/articles/${id}`).then(r => r?.data))
    );
    articles = [...articles, ...extra.filter(Boolean)];
  }

  S.total = articles.length;
  S.totalPages = 1;
  if (cntEl) cntEl.textContent = `총 ${articles.length}건`;

  if (!articles.length) {
    showEmpty('북마크한 기사를 불러올 수 없습니다.');
    renderPager(0);
    return;
  }

  const feed = $('#newsFeed');
  feed.innerHTML = articles.map(renderCard).join('');
  feed.className = `news-grid${S.viewMode === 'list' ? ' list-view' : ''}`;

  $$('.news-card', feed).forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.card-bm-btn')) return;
      openDrawer(card.dataset.id);
    });
  });
  $$('.card-bm-btn', feed).forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const bmNow = await toggleBookmark(id);
      toast(bmNow ? '북마크에 추가됐습니다.' : '북마크가 해제됐습니다.', 'success', 2000);
      updateBookmarkBadge();
      // 북마크 탭이면 목록 새로고침
      if (S.tab === 'bookmarks') setTimeout(loadBookmarkFeed, 300);
    });
  });
  renderPager(0);
}

// ── 파라미터 빌드 ─────────────────────────────────────────────
function buildParams() {
  const p = {};

  if (TAB_CAT[S.tab]) {
    p.category = TAB_CAT[S.tab];
  }
  if (S.category && S.category !== 'all') {
    p.category = S.category;
  }

  if (S.query)              p.query  = S.query;
  if (S.source !== 'all')   p.source = S.source;

  if (S.quickPeriod && S.quickPeriod !== 'all') {
    const now  = new Date();
    if (S.quickPeriod === 'today') {
      p.dateFrom = fmtDate(now);
      p.dateTo   = fmtDate(now);
    } else if (S.quickPeriod === 'week') {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      p.dateFrom = fmtDate(from);
      p.dateTo   = fmtDate(now);
    } else if (S.quickPeriod === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      p.dateFrom = fmtDate(firstDay);
      p.dateTo   = fmtDate(lastDay);
    }
    return p;
  }

  const at = S.advTab;
  if (at === 'range') {
    if (S.advFrom) p.dateFrom = S.advFrom;
    if (S.advTo)   p.dateTo   = S.advTo;
  } else if (at === 'year' && S.advYear) {
    p.dateYear = S.advYear;
  } else if (at === 'month' && S.advYear && S.advMonth) {
    p.dateYear = S.advYear; p.dateMonth = S.advMonth;
  } else if (at === 'day' && S.advDay) {
    const [y,m,d] = S.advDay.split('-');
    p.dateYear = y; p.dateMonth = m; p.dateDay = d;
  } else if (at === 'hour' && S.advDay && S.advHour !== '') {
    p.dateHour = `${S.advDay} ${S.advHour}`;
  }

  if (!p.dateFrom && S.dateFrom) p.dateFrom = S.dateFrom;
  if (!p.dateTo   && S.dateTo)   p.dateTo   = S.dateTo;

  // 수집 일시 기반 필터 (crawled_at, UTC)
  if (S.crawledFrom) p.crawledFrom = S.crawledFrom;
  if (S.crawledTo)   p.crawledTo   = S.crawledTo;

  return p;
}

function doSearch() {
  S.page = 1;
  loadFeed();
}

// ── 페이지네이션 ───────────────────────────────────────────────
function renderPager(total) {
  const wrap = $('#pager');
  if (!wrap) return;
  if (S.totalPages <= 1) { wrap.innerHTML = ''; return; }

  const cur = S.page;
  const tp  = S.totalPages;
  const R   = 5;
  const H   = Math.floor(R / 2);
  let s = Math.max(1, cur - H);
  let e = Math.min(tp, s + R - 1);
  if (e - s < R - 1) s = Math.max(1, e - R + 1);

  let h = `<button class="pg${cur === 1 ? ' disabled' : ''}" data-p="${cur - 1}"><i class="ti ti-chevron-left"></i></button>`;
  if (s > 1) { h += `<button class="pg" data-p="1">1</button>`; if (s > 2) h += `<span class="pg-ellipsis">…</span>`; }
  for (let i = s; i <= e; i++) h += `<button class="pg${i === cur ? ' active' : ''}" data-p="${i}">${i}</button>`;
  if (e < tp) { if (e < tp - 1) h += `<span class="pg-ellipsis">…</span>`; h += `<button class="pg" data-p="${tp}">${tp}</button>`; }
  h += `<button class="pg${cur === tp ? ' disabled' : ''}" data-p="${cur + 1}"><i class="ti ti-chevron-right"></i></button>`;

  wrap.innerHTML = h;
  $$('.pg:not(.disabled)', wrap).forEach(btn => {
    btn.addEventListener('click', () => {
      const pg = +btn.dataset.p;
      if (pg && pg !== S.page) { S.page = pg; loadFeed(); }
    });
  });
}

// ── 드로어 (기사 상세) ────────────────────────────────────────
async function openDrawer(id) {
  const drawer = $('#drawer');
  if (!drawer) return;

  S.currentArticleId = id;
  markRead(id);

  // 읽음 표시 반영 (피드 카드)
  const card = $(`.news-card[data-id="${id}"]`);
  if (card && !card.classList.contains('card-read')) {
    card.classList.add('card-read');
  }

  drawer.classList.add('open');
  $('#overlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  $('#drawerTitle').innerHTML = '<div class="skeleton" style="height:24px;width:80%;border-radius:6px;"></div>';
  $('#drawerMeta').innerHTML = '<div class="skeleton" style="height:14px;width:60%;border-radius:4px;"></div>';
  $('#drawerSummaryBox').innerHTML = '<div class="skeleton" style="height:60px;border-radius:8px;"></div>';
  $('#drawerContent').textContent = '';
  $('#drawerTags').innerHTML = '';

  const govViewer = $('#drawerGovViewer');
  const govViewerFrame = $('#drawerGovViewerFrame');
  if (govViewer) govViewer.style.display = 'none';

  const data = await apiFetch(`/api/articles/${id}`);
  if (!data?.success) {
    toast('기사를 불러올 수 없습니다.', 'error');
    closeDrawer();
    return;
  }
  const a    = data.data;
  const meta = cm(a.category || '기타');

  // 북마크 버튼 상태 업데이트
  const bmBtn = $('#drawerBookmarkBtn');
  if (bmBtn) {
    const bm = isBookmarked(id);
    bmBtn.innerHTML = `<i class="ti ${bm ? 'ti-bookmark-filled' : 'ti-bookmark'}"></i>`;
    bmBtn.classList.toggle('bookmarked', bm);
    bmBtn.title = bm ? '북마크 해제' : '북마크 추가';
    bmBtn.onclick = async () => {
      const bmNow = await toggleBookmark(id);
      bmBtn.innerHTML = `<i class="ti ${bmNow ? 'ti-bookmark-filled' : 'ti-bookmark'}"></i>`;
      bmBtn.classList.toggle('bookmarked', bmNow);
      bmBtn.title = bmNow ? '북마크 해제' : '북마크 추가';
      toast(bmNow ? '북마크에 추가됐습니다.' : '북마크가 해제됐습니다.', 'success', 2000);
      updateBookmarkBadge();
    };
  }

  // 공유 버튼
  const shareBtn = $('#drawerShareBtn');
  if (shareBtn) {
    shareBtn.onclick = () => openShareModal(a.title, a.url);
  }

  // 인쇄 버튼
  const printBtn = $('#drawerPrintBtn');
  if (printBtn) {
    printBtn.onclick = () => printArticle(a);
  }

  // 태그
  $('#drawerTags').innerHTML = `
    <span class="cat-tag" style="--tag-bg:${meta.bg};--tag-color:${meta.color}">${a.category || '기타'}</span>
    <span class="src-tag">${a.source || ''}</span>`;

  // 원문 링크
  const url   = a.url && a.url.startsWith('http') ? a.url : null;
  const isLawGovKr  = url && url.includes('law.go.kr');
  const isMoel      = url && url.includes('moel.go.kr');
  const isKosha     = url && url.includes('kosha.or.kr');
  const isGovRestricted = isMoel || isKosha;

  const origBtn = $('#drawerOrigBtn');
  const gotoBtn = $('#drawerGotoBtn');
  [origBtn, gotoBtn].forEach(el => {
    if (!el) return;
    if (url) {
      el.href = url;
      el.style.display = 'flex';
      el.style.opacity = '';
      el.style.pointerEvents = '';
      if (el.id === 'drawerOrigBtn') {
        if (isLawGovKr) {
          el.title = '국가법령정보센터에서 법령을 검색합니다';
          el.innerHTML = '<i class="ti ti-scale"></i> 법령 검색';
        } else if (isMoel) {
          el.title = '고용노동부 공식 사이트에서 원문을 확인합니다';
          el.innerHTML = '<i class="ti ti-building-bank"></i> 고용노동부 확인';
        } else if (isKosha) {
          el.title = '안전보건공단 공식 사이트에서 원문을 확인합니다';
          el.innerHTML = '<i class="ti ti-shield-check"></i> 안전보건공단 확인';
        } else {
          el.innerHTML = '<i class="ti ti-external-link"></i> 원문 보기';
        }
      }
    } else {
      el.href = '#';
      el.style.display = 'none';
    }
  });

  const lawNotice  = $('#drawerLawNotice');
  const govNotice  = $('#drawerGovNotice');

  if (lawNotice)  lawNotice.style.display  = isLawGovKr      ? 'flex' : 'none';
  if (govNotice)  govNotice.style.display  = isGovRestricted ? 'flex' : 'none';

  if (govNotice && isGovRestricted) {
    const siteName = isMoel ? '고용노동부(moel.go.kr)' : '안전보건공단(kosha.or.kr)';
    govNotice.innerHTML = `
      <i class="ti ti-info-circle"></i>
      <span><strong>${siteName}</strong> 공식 자료입니다. 아래에서 내용을 확인하거나 첨부파일을 다운로드할 수 있습니다.</span>`;
  }

  $('#drawerTitle').textContent = a.title || '';

  $('#drawerMeta').innerHTML = `
    <span><i class="ti ti-clock"></i>${fmtFull(a.published_at)}</span>
    <span><i class="ti ti-building"></i>${a.source || ''}</span>
    ${a.author && a.author !== a.source ? `<span><i class="ti ti-user"></i>${a.author}</span>` : ''}
    ${a.crawled_at ? `<span title="수집 일시(KST)"><i class="ti ti-database-import"></i>수집 ${relTime(crawledAtToKST(a.crawled_at))}</span>` : ''}
    ${a.keywords ? `<span><i class="ti ti-tag"></i>${a.keywords.split(',').slice(0,4).join(' · ')}</span>` : ''}`;

  const summary = a.summary || '';
  const summaryBox = $('#drawerSummaryBox');
  if (summary && summaryBox) {
    summaryBox.innerHTML = `
      <div class="summary-label"><i class="ti ti-bulb"></i> 요약</div>
      <p class="summary-text">${summary.substring(0, 300)}${summary.length > 300 ? '…' : ''}</p>`;
    summaryBox.style.display = 'block';
  } else if (summaryBox) {
    summaryBox.style.display = 'none';
  }

  const content = a.content || '';
  const contentEl = $('#drawerContent');
  if (content && content !== summary) {
    contentEl.textContent = content;
    contentEl.style.display = 'block';
  } else if (!summary) {
    contentEl.textContent = '요약 내용이 없습니다. 원문 보기를 눌러 확인하세요.';
    contentEl.style.display = 'block';
  } else {
    contentEl.style.display = 'none';
  }

  // 정부기관 콘텐츠 뷰어
  if (isGovRestricted && url && govViewer) {
    govViewer.style.display = 'block';
    const viewerHeader = $('#govViewerHeader');
    const govViewerBody = $('#drawerGovViewerContent');

    if (viewerHeader) {
      const hIcon = isMoel ? 'ti-building-bank' : 'ti-shield-check';
      const hName = isMoel ? '고용노동부 공식 자료' : '안전보건공단 공식 자료';
      viewerHeader.innerHTML = `<i class="ti ${hIcon}"></i><span>${hName}</span>
        <a href="${url}" target="_blank" rel="noopener noreferrer"
          style="font-size:11px;color:var(--navy-300);text-decoration:none;display:flex;align-items:center;gap:3px;flex-shrink:0;margin-left:auto;">
          <i class="ti ti-external-link" style="font-size:12px;"></i>사이트 열기</a>`;
    }

    if (govViewerBody) {
      govViewerBody.innerHTML = `
        <div class="gov-viewer-loading">
          <i class="ti ti-loader spin-i"></i> 내용을 불러오는 중...
        </div>`;
    }

    const extracted = await apiFetch(`/api/proxy/extract?url=${encodeURIComponent(url)}`);

    if (extracted && govViewerBody) {
      const siteName = isMoel ? '고용노동부' : '안전보건공단';

      if (extracted.isSPA) {
        govViewerBody.innerHTML = buildSPAFallback(url, siteName);
        bindIframeLoadBtn(govViewerFrame);
      } else if (extracted.success && (extracted.text?.length > 30 || extracted.attachments?.length)) {
        let html = '';

        if (extracted.text && extracted.text.length > 30) {
          html += `<div class="gov-extracted-text">${extracted.text.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br>')}</div>`;
        }

        if (extracted.attachments?.length) {
          html += `<div class="gov-attachments">
            <div class="gov-att-title"><i class="ti ti-paperclip"></i> 첨부파일 (${extracted.attachments.length}개)</div>
            <ul class="gov-att-list">
              ${extracted.attachments.map(att => `
                <li>
                  <a href="${att.href}" target="_blank" rel="noopener noreferrer" download class="gov-att-link" title="클릭하여 다운로드">
                    <i class="ti ${getFileIcon(att.href)}"></i>
                    <span>${att.label || att.href.split('/').pop().split('?')[0] || '첨부파일'}</span>
                    <i class="ti ti-download att-download-icon"></i>
                  </a>
                </li>`).join('')}
            </ul>
          </div>`;
        }

        html += `<div style="margin-top:12px;text-align:center">
          <button class="gov-fallback-btn gov-fallback-secondary" id="govViewerLoadBtnDyn"
            data-url="${encodeURIComponent(url)}" style="font-size:11.5px;padding:7px 14px">
            <i class="ti ti-photo-scan"></i> 화면 미리보기 시도 (iframe)
          </button>
        </div>`;

        govViewerBody.innerHTML = html;
        bindIframeLoadBtn(govViewerFrame);
      } else {
        govViewerBody.innerHTML = buildSPAFallback(url, siteName);
        bindIframeLoadBtn(govViewerFrame);
      }
    } else if (govViewerBody) {
      const siteName = isMoel ? '고용노동부' : '안전보건공단';
      govViewerBody.innerHTML = buildSPAFallback(url, siteName);
      bindIframeLoadBtn(govViewerFrame);
    }

    if (govViewerFrame) {
      govViewerFrame.src = '';
      govViewerFrame.style.display = 'none';
    }
  }
}

// SPA/추출불가 시 폴백 HTML 생성
function buildSPAFallback(url, siteName) {
  const isMoel = url.includes('moel.go.kr');
  const isKosha = url.includes('kosha.or.kr');
  const icon = isMoel ? 'ti-building-bank' : isKosha ? 'ti-shield-check' : 'ti-browser';
  return `
    <div class="gov-viewer-notice">
      <p><strong>${siteName}</strong> 사이트는 보안 정책으로 직접 내용 표시가 제한됩니다.<br>
      아래 버튼으로 원문을 확인하거나 미리보기를 시도하세요.</p>
      <div class="gov-fallback-btns">
        <a href="${url}" target="_blank" rel="noopener noreferrer" class="gov-fallback-btn gov-fallback-primary">
          <i class="ti ${icon}"></i> ${siteName} 공식 사이트에서 원문 열기
        </a>
        <button class="gov-fallback-btn gov-fallback-secondary" id="govViewerLoadBtnDyn" data-url="${encodeURIComponent(url)}">
          <i class="ti ti-photo-scan"></i> 화면 미리보기 시도 (iframe)
        </button>
      </div>
      <p class="gov-fallback-hint">※ HWP·PDF 등 첨부파일이 있는 경우 공식 사이트에서 직접 다운로드하실 수 있습니다.</p>
    </div>`;
}

// 동적 iframe 로드 버튼 이벤트 연결
function bindIframeLoadBtn(frame) {
  const btn = document.getElementById('govViewerLoadBtnDyn');
  if (!btn || !frame) return;
  btn.addEventListener('click', () => {
    const url = decodeURIComponent(btn.dataset.url || '');
    if (!url) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader spin-i"></i> 미리보기 불러오는 중...';
    frame.src = `/api/proxy/content?url=${encodeURIComponent(url)}`;
    frame.style.display = 'block';
    frame.onload = () => {
      btn.style.display = 'none';
      frame.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    frame.onerror = () => {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-photo-scan"></i> 화면 미리보기 시도 (iframe)';
      toast('미리보기 로드에 실패했습니다. 공식 사이트에서 직접 확인하세요.', 'error');
    };
  });
}

// 파일 확장자별 아이콘
function getFileIcon(href) {
  const ext = (href.split('.').pop().split('?')[0] || '').toLowerCase();
  const iconMap = { pdf: 'ti-file-type-pdf', hwp: 'ti-file-type-doc', hwpx: 'ti-file-type-doc',
    doc: 'ti-file-type-doc', docx: 'ti-file-type-doc', xls: 'ti-file-spreadsheet',
    xlsx: 'ti-file-spreadsheet', ppt: 'ti-presentation', pptx: 'ti-presentation',
    zip: 'ti-file-zip', txt: 'ti-file-text', csv: 'ti-file-spreadsheet' };
  return iconMap[ext] || 'ti-file-download';
}

function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#overlay').classList.remove('open');
  document.body.style.overflow = '';
  S.currentArticleId = null;
}

// ── 대시보드 & 사이드바 ───────────────────────────────────────
// \ub9c8\uc9c0\ub9c9\uc73c\ub85c \uc218\uc2e0\ud55c lastCrawl KST \ubb38\uc790\uc5f4 \uc800\uc7a5 (\uc0c1\ub300\uc2dc\uac04 \uc8fc\uae30 \uac31\uc2e0\uc6a9)
let _lastCrawlKST = null;

async function loadDashboard() {
  const data = await apiFetch('/api/stats/dashboard');
  if (!data?.success) return;
  const d = data.data;

  const setVal = (id, val) => { const el = $(id); if (el) el.textContent = (val || 0).toLocaleString(); };
  setVal('#statTotal',     d.total);
  setVal('#statToday',     d.today);
  setVal('#statHour',      d.thisHour);
  setVal('#statYesterday', d.yesterday);

  // ── \uc218\uc9d1 \ud604\ud669 BOX \ud074\ub9ad \uc2dc \ud544\ud130 \uc5f0\ub3d9 ──────────────────────────────
  const today = (() => {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    return kst.toISOString().substring(0, 10);
  })();
  const yesterday = (() => {
    const kst = new Date(Date.now() + 9 * 3600 * 1000 - 86400 * 1000);
    return kst.toISOString().substring(0, 10);
  })();

  // \uc218\uc9d1 \ud604\ud669 \ud074\ub9ad \ud544\ud130 \uc791\ub3d9 \ub3c4\uc6b0\ubbf8 \uac1c\uc120
  function makeStatClickable(elId, filterFn, labelText) {
    const el = $(elId);
    if (!el) return;
    el.parentElement?.classList.add('sb-stat-clickable');
    // \ud074\ub9ad \uc774\ubca4\ud2b8 \uc911\ubcf5 \ubc29\uc9c0
    if (el.parentElement?._statClickBound) return;
    el.parentElement._statClickBound = true;
    el.parentElement?.addEventListener('click', () => {
      filterFn();
      // \ud074\ub9ad \ud53c\ub4dc\ubc31
      el.parentElement?.classList.add('sb-stat-active');
      setTimeout(() => el.parentElement?.classList.remove('sb-stat-active'), 800);
      // \ud0ed\ud45c\uc2dc
      const titleEl = $('#pageTitle');
      if (titleEl) titleEl.textContent = labelText;
      // \ubaa8\ubc14\uc77c: \uc0ac\uc774\ub4dc\ubc14 \ub2eb\uae30
      if (window.innerWidth <= 900) {
        $('#sidebar')?.classList.remove('mobile-open');
        $('#sidebarOverlay')?.classList.remove('open');
        document.body.classList.remove('sidebar-active');
        $('#hamburger')?.classList.remove('is-open');
      }
    });
  }

  makeStatClickable('#statTotal', () => {
    switchTab('latest');
    S.quickPeriod = null;
    S.crawledFrom = ''; S.crawledTo = '';
    S.dateFrom = ''; S.dateTo = '';
    $$('.chip').forEach(c => c.classList.remove('active'));
    $('#chipAll')?.classList.add('active');
    doSearch();
  }, '\uc804\uccb4 \uae30\uc0ac');

  makeStatClickable('#statToday', () => {
    switchTab('latest');
    S.quickPeriod = null;
    S.crawledFrom = d.todayRange?.from || '';
    S.crawledTo   = d.todayRange?.to   || '';
    S.dateFrom = ''; S.dateTo = '';
    $$('.chip').forEach(c => c.classList.remove('active'));
    $('#chipToday')?.classList.add('active');
    doSearch();
  }, '\uc624\ub298 \uc218\uc9d1 \uae30\uc0ac');

  makeStatClickable('#statHour', () => {
    switchTab('latest');
    S.quickPeriod = null;
    S.crawledFrom = d.oneHourAgo || '';
    S.crawledTo   = '';
    S.dateFrom = ''; S.dateTo = '';
    $$('.chip').forEach(c => c.classList.remove('active'));
    doSearch();
    toast('\ucd5c\uadfc 1\uc2dc\uac04 \uc218\uc9d1 \uae30\uc0ac\ub97c \ud45c\uc2dc\ud569\ub2c8\ub2e4.', 'info', 2000);
  }, '\ucd5c\uadfc 1\uc2dc\uac04 \uc218\uc9d1 \uae30\uc0ac');

  makeStatClickable('#statYesterday', () => {
    switchTab('latest');
    S.quickPeriod = null;
    S.crawledFrom = d.yesterdayRange?.from || '';
    S.crawledTo   = d.yesterdayRange?.to   || '';
    S.dateFrom = ''; S.dateTo = '';
    $$('.chip').forEach(c => c.classList.remove('active'));
    doSearch();
  }, '\uc5b4\uc81c \uc218\uc9d1 \uae30\uc0ac');

  // ── \ub2e4\uc74c \uc5c5\ub370\uc774\ud2b8 \uc2dc\uac04 ────────────────────────────────────────
  const sched = d.scheduler;
  if (sched?.nextRunTime) {
    const nx = new Date(sched.nextRunTime);
    // \uc11c\ubc84\ub294 UTC → KST \ubcc0\ud658
    const nxKST = new Date(nx.getTime() + 9 * 3600 * 1000);
    const el = $('#nextUpdate');
    if (el) el.textContent = `${zp(nxKST.getUTCHours())}:${zp(nxKST.getUTCMinutes())}`;
  }

  // ── \ucd5c\uc885 \uc5c5\ub370\uc774\ud2b8 \uc2dc\uac04 (KST \ubcc0\ud658 \ud6c4 \uc800\uc7a5) ──────────────────────
  if (d.lastCrawl) {
    _lastCrawlKST = d.lastCrawl; // KST \ubb38\uc790\uc5f4\ub85c \uc774\ubbf8 \ubcc0\ud658\ub428 (API\uc5d0\uc11c \ubcc0\ud658)
    updateLiveText();
  }

  if (sched?.isRunning) {
    [$('#btnCrawl'), $('#btnCrawlMobile')].forEach(b => { if (b) { b.classList.add('loading'); b.disabled = true; } });
  } else {
    [$('#btnCrawl'), $('#btnCrawlMobile')].forEach(b => { if (b) { b.classList.remove('loading'); b.disabled = false; } });
  }

  const catList = $('#catList');
  if (catList && d.categories?.length) {
    const catOrder = ['\uc911\ub300\uc7ac\ud574','\uc0b0\uc5c5\uc7ac\ud574\u00b7\uc548\uc804','\ubc95\ub839\u00b7\uc81c\ub3c4','\uc815\ucc45\u00b7\ube0c\ub9ac\ud551','\uc9c1\uc5c5\ubcf4\uac74\u00b7\ud654\ud559','\uae30\uad00\ub3d9\ud5a5'];
    const catMap = {};
    d.categories.forEach(c => { catMap[c.category] = c.count; });

    catList.innerHTML = catOrder.map(catName => {
      const count = catMap[catName] || 0;
      const m = cm(catName);
      return `<li class="cat-item" data-cat="${catName}" title="${catName} \ud074\ub9ad \uc2dc \ud574\ub2f9 \uce74\ud14c\uace0\ub9ac\ub9cc \ud45c\uc2dc">
        <span class="cat-dot" style="background:${m.dot}"></span>
        <span>${catName}</span>
        <span class="cat-cnt">${count.toLocaleString()}</span>
      </li>`;
    }).join('');

    $$('.cat-item', catList).forEach(li => {
      li.addEventListener('click', () => {
        const catName = li.dataset.cat;
        S.category = catName;
        const sel = $('#selCategory');
        if (sel) sel.value = catName;
        S.tab = 'latest';
        $$('.nav-item').forEach(x => x.classList.remove('active'));
        $('[data-tab="latest"]')?.classList.add('active');
        $$('.cat-item', catList).forEach(x => x.classList.remove('active'));
        li.classList.add('active');
        const titleEl = $('#pageTitle');
        if (titleEl) titleEl.textContent = catName;
        // \ubaa8\ubc14\uc77c: \uc0ac\uc774\ub4dc\ubc14 \ub2eb\uae30
        if (window.innerWidth <= 900) {
          $('#sidebar')?.classList.remove('mobile-open');
          $('#sidebarOverlay')?.classList.remove('open');
          document.body.classList.remove('sidebar-active');
          $('#hamburger')?.classList.remove('is-open');
        }
        doSearch();
      });
    });
  }

  const crawlStatus = $('#crawlStatus');
  if (crawlStatus && d.sources?.length) {
    const top = d.sources.slice(0, 10);
    crawlStatus.innerHTML = top.map(s => `
      <div class="crawl-status-row" data-src="${s.source}" title="${s.source} \ud074\ub9ad \uc2dc \ud574\ub2f9 \ucd9c\ucc98 \uae30\uc0ac\ub9cc \ud45c\uc2dc">
        <span class="crawl-source">${s.source}</span>
        <span class="crawl-cnt">${s.count.toLocaleString()}</span>
      </div>`).join('');

    // \ucd9c\uccb4\ubcc4 \ud074\ub9ad \uc2dc \ucd9c\uccb4 \ud544\ud130 \uc5f0\ub3d9
    $$('.crawl-status-row', crawlStatus).forEach(row => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        const src = row.dataset.src;
        S.source = src;
        const sel = $('#selSource');
        if (sel) sel.value = src;
        S.tab = 'latest';
        S.category = 'all';
        S.quickPeriod = null;
        $$('.nav-item').forEach(x => x.classList.remove('active'));
        $('[data-tab="latest"]')?.classList.add('active');
        const titleEl = $('#pageTitle');
        if (titleEl) titleEl.textContent = src;
        if (window.innerWidth <= 900) {
          $('#sidebar')?.classList.remove('mobile-open');
          $('#sidebarOverlay')?.classList.remove('open');
          document.body.classList.remove('sidebar-active');
          $('#hamburger')?.classList.remove('is-open');
        }
        doSearch();
        toast(`${src} \uae30\uc0ac\ub9cc \ud45c\uc2dc\ud569\ub2c8\ub2e4.`, 'info', 2000);
      });
    });
  }

  const srcSel = $('#selSource');
  if (srcSel && d.sources?.length) {
    const cur = srcSel.value;
    const grouped = {};
    d.sources.forEach(s => {
      const g = s.source_category || '\uae30\ud0c0';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(s);
    });
    srcSel.innerHTML = '<option value="all">\uc804\uccb4 \ucd9c\ucc98</option>';
    Object.entries(grouped).forEach(([g, list]) => {
      const og = document.createElement('optgroup');
      og.label = g;
      list.forEach(s => {
        const o = document.createElement('option');
        o.value = s.source;
        o.textContent = `${s.source} (${s.count})`;
        if (s.source === cur) o.selected = true;
        og.appendChild(o);
      });
      srcSel.appendChild(og);
    });
  }

  const catMap2 = {};
  (d.categories || []).forEach(c => { catMap2[c.category] = c.count; });

  const badgeMap = {
    disaster: '\uc911\ub300\uc7ac\ud574',
    safety:   '\uc0b0\uc5c5\uc7ac\ud574\u00b7\uc548\uc804',
    law:      '\ubc95\ub839\u00b7\uc81c\ub3c4',
    policy:   '\uc815\ucc45\u00b7\ube0c\ub9ac\ud551',
    health:   '\uc9c1\uc5c5\ubcf4\uac74\u00b7\ud654\ud559',
    kosha:    '\uae30\uad00\ub3d9\ud5a5',
  };
  Object.entries(badgeMap).forEach(([key, catName]) => {
    const badge = $(`#navBadge${key.charAt(0).toUpperCase() + key.slice(1)}`);
    if (badge) {
      const cnt = catMap2[catName] || 0;
      badge.textContent = cnt > 0 ? (cnt > 99 ? '99+' : cnt) : '';
    }
  });

  const latestBadge = $('#navBadgeLatest');
  if (latestBadge) {
    const total = d.total || 0;
    latestBadge.textContent = total > 999 ? '999+' : (total > 0 ? total : '');
  }

  // \uc2a4\ud30c\ud06c\ub77c\uc778 \uac31\uc2e0
  drawSparkline();
}

// \uc2e4\uc2dc\uac04\uc73c\ub85c \ucd5c\uc885 \uc5c5\ub370\uc774\ud2b8 \uc0c1\ub300\uc2dc\uac04 \uac31\uc2e0 (1\ubd84\ub9c8\ub2e4)
function updateLiveText() {
  if (!_lastCrawlKST) return;
  const el = $('#liveText');
  if (el) el.textContent = `\ucd5c\uc885 ${relTime(_lastCrawlKST)}`;
}

// ── 연도 옵션 초기화 ─────────────────────────────────────────
async function initYearOpts() {
  const data = await apiFetch('/api/filters');
  if (!data?.success) return;
  const { dateRange } = data.data;
  if (!dateRange) return;
  const minY = parseInt((dateRange.minDate || '2020').substring(0, 4));
  const maxY = parseInt((dateRange.maxDate || '').substring(0, 4)) || new Date().getFullYear();
  const opts = [];
  for (let y = maxY; y >= minY; y--) opts.push(`<option value="${y}">${y}년</option>`);
  ['#advYear', '#advMonthYear'].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = `<option value="">연도 선택</option>${opts.join('')}`;
  });
}

// ── 탭 전환 ──────────────────────────────────────────────────
function switchTab(tab) {
  S.tab = tab;
  S.page = 1;
  S.category = 'all';
  S.source   = 'all';
  S.query    = '';
  S.quickPeriod = null;
  S.crawledFrom = ''; S.crawledTo = '';
  S.advFrom = ''; S.advTo = ''; S.advYear = ''; S.advMonth = ''; S.advDay = ''; S.advHour = '';

  const titles = {
    latest:    '전체 최신 기사',
    disaster:  '중대재해',
    safety:    '산업재해·안전',
    law:       '법령·제도',
    policy:    '정책·브리핑',
    health:    '직업보건·화학',
    kosha:     '기관 동향',
    bookmarks: '북마크한 기사',
  };
  const titleEl = $('#pageTitle');
  if (titleEl) titleEl.textContent = titles[tab] || '전체 최신 기사';

  $$('.nav-item').forEach(li => li.classList.toggle('active', li.dataset.tab === tab));

  const sel = $('#selCategory');
  if (sel) {
    if (TAB_CAT[tab]) sel.value = TAB_CAT[tab];
    else sel.value = 'all';
  }

  const gs = $('#globalSearch');
  if (gs) gs.value = '';

  $$('.chip').forEach(c => c.classList.remove('active'));
  $('#chipAll')?.classList.add('active');

  doSearch();
}

// ── 빠른 기간 칩 ─────────────────────────────────────────────
function setQuick(period) {
  S.quickPeriod = period;
  S.advFrom = ''; S.advTo = ''; S.advYear = ''; S.advMonth = ''; S.advDay = ''; S.advHour = '';
  $$('.chip').forEach(c => c.classList.remove('active'));
  const map = { all: '#chipAll', today: '#chipToday', week: '#chipWeek', month: '#chipMonth' };
  $(map[period] || '#chipAll')?.classList.add('active');
  doSearch();
}

// ── 날짜 입력 유틸 ─────────────────────────────────────────────
function setupDateInput(inputEl) {
  if (!inputEl) return;

  inputEl.addEventListener('input', (e) => {
    let v = e.target.value.replace(/[^\d\-]/g, '');
    const nums = v.replace(/-/g, '');
    if (nums.length >= 5 && !v.includes('-')) {
      v = `${nums.substring(0,4)}-${nums.substring(4,6)}${nums.length > 6 ? '-' + nums.substring(6,8) : ''}`;
    }
    e.target.value = v;
  });

  inputEl.addEventListener('blur', (e) => {
    const v = e.target.value;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      e.target.classList.add('date-error');
    } else {
      e.target.classList.remove('date-error');
    }
  });
}

// ── 고급 날짜 탭 ─────────────────────────────────────────────
function initAdvTabs() {
  $$('.adv-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      S.advTab = btn.dataset.atab;
      $$('.adv-tab').forEach(b => b.classList.remove('active'));
      $$('.adv-tab-body').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $(`#atab-${S.advTab}`)?.classList.add('active');
    });
  });

  const toggleAdv = () => {
    $('#advPanel').classList.toggle('open');
    $$('#btnAdvDate, #btnAdvDate2').forEach(b => b.classList.toggle('active'));
  };
  $('#btnAdvDate')?.addEventListener('click', toggleAdv);
  $('#btnAdvDate2')?.addEventListener('click', toggleAdv);

  ['#advFrom', '#advTo', '#dateFrom', '#dateTo'].forEach(id => {
    setupDateInput($(id));
  });

  $('#btnAdvApply')?.addEventListener('click', () => {
    const at = S.advTab;
    if (at === 'range') {
      S.advFrom = $('#advFrom')?.value || '';
      S.advTo   = $('#advTo')?.value   || '';
      if (S.advFrom && !/^\d{4}-\d{2}-\d{2}$/.test(S.advFrom)) {
        toast('시작 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)', 'error');
        return;
      }
      if (S.advTo && !/^\d{4}-\d{2}-\d{2}$/.test(S.advTo)) {
        toast('종료 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)', 'error');
        return;
      }
    } else if (at === 'year') {
      S.advYear = $('#advYear')?.value || '';
    } else if (at === 'month') {
      S.advYear  = $('#advMonthYear')?.value || '';
      S.advMonth = $('#advMonth')?.value     || '';
    } else if (at === 'day') {
      S.advDay = $('#advDay')?.value || '';
      if (S.advDay && !/^\d{4}-\d{2}-\d{2}$/.test(S.advDay)) {
        toast('날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)', 'error');
        return;
      }
    } else if (at === 'hour') {
      S.advDay  = $('#advHourDate')?.value || '';
      S.advHour = $('#advHour')?.value     || '';
    }
    S.quickPeriod = null;
    $$('.chip').forEach(c => c.classList.remove('active'));
    $('#chipAll')?.classList.add('active');
    doSearch();
  });
}

// ── 모바일 햄버거 메뉴 ───────────────────────────────────────
// 모바일 (900px 이하) 사이드바 슬라이드 인/아웃
function initMobileMenu() {
  const hamburger = $('#hamburger');
  const sidebar   = $('#sidebar');
  const sbOverlay = $('#sidebarOverlay');

  if (!hamburger || !sidebar) return;

  const isMobile = () => window.innerWidth <= 900;
  let scrollY = 0;

  const open = () => {
    // iOS 스크롤 고정: position:fixed 전에 스크롤 위치 저장
    scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;
    sidebar.classList.add('mobile-open');
    sbOverlay.classList.add('open');
    document.body.classList.add('sidebar-active');
    hamburger.classList.add('is-open');
    hamburger.setAttribute('aria-label', '메뉴 닫기');
    hamburger.setAttribute('aria-expanded', 'true');
  };

  const close = () => {
    sidebar.classList.remove('mobile-open');
    sbOverlay.classList.remove('open');
    document.body.classList.remove('sidebar-active');
    // iOS 스크롤 위치 복원
    document.body.style.top = '';
    window.scrollTo(0, scrollY);
    hamburger.classList.remove('is-open');
    hamburger.setAttribute('aria-label', '메뉴 열기');
    hamburger.setAttribute('aria-expanded', 'false');
  };

  hamburger.addEventListener('click', () => {
    if (sidebar.classList.contains('mobile-open')) close(); else open();
  });

  sbOverlay.addEventListener('click', close);

  // 사이드바 내 탭 클릭 시 모바일에서 자동 닫기
  $$('.nav-item', sidebar).forEach(li => {
    li.addEventListener('click', () => {
      if (isMobile()) close();
    });
  });

  // 터치 스와이프 지원 (사이드바에서 왼쪽으로 60px 이상 스와이프 시 닫기)
  let touchStartX = 0;
  sidebar.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  sidebar.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (dx < -60) close();
  }, { passive: true });

  // 화면 크기 변경 시 900px 초과 → 자동 닫기
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900 && sidebar.classList.contains('mobile-open')) close();
  });

  // ESC 키로 닫기 (drawer close와 중복 방지: drawer가 닫혀있을 때만)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sidebar.classList.contains('mobile-open')) close();
  });
}

// ── 이벤트 바인딩 ────────────────────────────────────────────
function bindEvents() {
  // 글로벌 검색 (Enter) → autocomplete에서 처리됨 (initSearchAutocomplete)

  // 필터 검색 버튼
  $('#btnSearch')?.addEventListener('click', () => {
    S.query    = $('#globalSearch')?.value.trim() || '';
    S.category = $('#selCategory')?.value || 'all';
    S.source   = $('#selSource')?.value   || 'all';
    S.dateFrom = $('#dateFrom')?.value    || '';
    S.dateTo   = $('#dateTo')?.value      || '';
    S.advTab   = 'range';
    S.quickPeriod = null;

    if (S.dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(S.dateFrom)) {
      toast('시작 날짜 형식: YYYY-MM-DD', 'error'); return;
    }
    if (S.dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(S.dateTo)) {
      toast('종료 날짜 형식: YYYY-MM-DD', 'error'); return;
    }

    if (S.query) pushSearchHist(S.query);

    if (S.category && S.category !== 'all') {
      const matchTab = Object.entries(TAB_CAT).find(([,v]) => v === S.category);
      if (matchTab) {
        $$('.nav-item').forEach(li => li.classList.toggle('active', li.dataset.tab === matchTab[0]));
      }
    }

    doSearch();
  });

  // 필터 초기화
  $('#btnReset')?.addEventListener('click', () => {
    const gs = $('#globalSearch'); if (gs) gs.value = '';
    const sc = $('#selCategory'); if (sc) sc.value = 'all';
    const ss = $('#selSource');   if (ss) ss.value = 'all';
    const df = $('#dateFrom');    if (df) df.value = '';
    const dt = $('#dateTo');      if (dt) dt.value = '';
    ['#advFrom','#advTo','#advDay','#advHourDate'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
    const advYear = $('#advYear'); if (advYear) advYear.value = '';
    const advMonthYear = $('#advMonthYear'); if (advMonthYear) advMonthYear.value = '';
    const advMonth = $('#advMonth'); if (advMonth) advMonth.value = '';
    const advHour = $('#advHour'); if (advHour) advHour.value = '';

    Object.assign(S, {
      query:'', category:'all', source:'all',
      dateFrom:'', dateTo:'', crawledFrom:'', crawledTo:'',
      advFrom:'', advTo:'',
      advYear:'', advMonth:'', advDay:'', advHour:'',
      advTab:'range', quickPeriod:null, page:1,
    });
    $$('.chip').forEach(c => c.classList.remove('active'));
    $('#chipAll')?.classList.add('active');
    $$('.nav-item').forEach(li => li.classList.toggle('active', li.dataset.tab === 'latest'));
    S.tab = 'latest';
    const titleEl = $('#pageTitle');
    if (titleEl) titleEl.textContent = '전체 최신 기사';
    $$('.cat-item').forEach(x => x.classList.remove('active'));
    doSearch();
  });

  // 카테고리 / 출처 셀렉트 변경
  $('#selCategory')?.addEventListener('change', e => {
    S.category = e.target.value;
    if (S.category !== 'all') {
      const matchTab = Object.entries(TAB_CAT).find(([,v]) => v === S.category);
      if (matchTab) {
        S.tab = matchTab[0];
        $$('.nav-item').forEach(li => li.classList.toggle('active', li.dataset.tab === matchTab[0]));
        const titleEl = $('#pageTitle');
        if (titleEl) {
          const titles = {disaster:'중대재해',safety:'산업재해·안전',law:'법령·제도',policy:'정책·브리핑',health:'직업보건·화학',kosha:'기관 동향'};
          titleEl.textContent = titles[matchTab[0]] || S.category;
        }
      }
    } else {
      S.tab = 'latest';
      $$('.nav-item').forEach(li => li.classList.toggle('active', li.dataset.tab === 'latest'));
      const titleEl = $('#pageTitle');
      if (titleEl) titleEl.textContent = '전체 최신 기사';
    }
    doSearch();
  });
  $('#selSource')?.addEventListener('change', e => { S.source = e.target.value; doSearch(); });

  // 정렬 / 페이지 수
  $('#sortOrder')?.addEventListener('change', () => doSearch());
  $('#pageSize')?.addEventListener('change', e => { S.pageSize = +e.target.value; doSearch(); });

  // 뷰 토글
  $('#viewCard')?.addEventListener('click', () => {
    S.viewMode = 'card';
    $('#viewCard').classList.add('active');
    $('#viewList')?.classList.remove('active');
    const feed = $('#newsFeed');
    if (feed) { feed.classList.remove('list-view'); loadFeed(); }
  });
  $('#viewList')?.addEventListener('click', () => {
    S.viewMode = 'list';
    $('#viewList').classList.add('active');
    $('#viewCard')?.classList.remove('active');
    const feed = $('#newsFeed');
    if (feed) { feed.classList.add('list-view'); loadFeed(); }
  });

  // 사이드바 탭 내비 (북마크 포함)
  $$('.nav-item').forEach(li => {
    li.addEventListener('click', () => switchTab(li.dataset.tab));
  });

  // 빠른 기간 칩
  $('#chipAll')?.addEventListener('click',   () => setQuick('all'));
  $('#chipToday')?.addEventListener('click', () => setQuick('today'));
  $('#chipWeek')?.addEventListener('click',  () => setQuick('week'));
  $('#chipMonth')?.addEventListener('click', () => setQuick('month'));

  // 수동 업데이트 공통 핸들러 (topbar + 모바일 사이드바 버튼 공용)
  async function doCrawlUpdate(btn) {
    if (!btn || btn.disabled) return;

    // 두 버튼 모두 로딩 상태로
    const btnTop    = $('#btnCrawl');
    const btnMobile = $('#btnCrawlMobile');
    [btnTop, btnMobile].forEach(b => { if (b) { b.classList.add('loading'); b.disabled = true; } });

    const span = btn.querySelector('span');
    const setLabel = t => {
      if (span) span.textContent = t;
      // 반대쪽 버튼 span도 동기화
      const other = btn === btnTop ? btnMobile : btnTop;
      if (other) { const s = other.querySelector('span'); if (s) s.textContent = t; }
    };

    setLabel('크롤링 시작 중...');
    toast('업데이트를 시작합니다. 완료 시 자동으로 결과가 반영됩니다.', 'info', 4000);

    const resetBtns = () => {
      [btnTop, btnMobile].forEach(b => { if (b) { b.classList.remove('loading'); b.disabled = false; } });
      setLabel('지금 업데이트');
    };

    try {
      const startRes = await fetch('/api/crawl/run', { method: 'POST' });
      const startData = await startRes.json().catch(() => ({}));

      if (!startData.success && startData.message?.includes('진행 중')) {
        toast('이미 크롤링이 진행 중입니다. 잠시 후 다시 시도하세요.', 'info');
        resetBtns();
        return;
      }

      setLabel('수집 중...');
      let elapsed = 0;
      const pollInterval = 3000;
      const maxWait = 120000;

      const poll = async () => {
        elapsed += pollInterval;
        const statusData = await apiFetch('/api/crawl/status');
        const isRunning = statusData?.data?.isRunning;

        if (!isRunning || elapsed >= maxWait) {
          // ── 크롤 완료 후 필터 완전 리셋 → 새 기사가 바로 보이도록 ──
          S.tab         = 'latest';
          S.page        = 1;
          S.category    = 'all';
          S.source      = 'all';
          S.query       = '';
          S.quickPeriod = null;
          S.crawledFrom = ''; S.crawledTo = '';
          S.dateFrom    = ''; S.dateTo    = '';
          S.advFrom     = ''; S.advTo     = '';
          S.advYear     = ''; S.advMonth  = ''; S.advDay = ''; S.advHour = '';

          // UI 동기화: 검색창·칩·탭 초기화
          const gs = $('#globalSearch');
          if (gs) gs.value = '';
          $$('.chip').forEach(c => c.classList.remove('active'));
          $('#chipAll')?.classList.add('active');
          $$('.nav-item').forEach(li => li.classList.toggle('active', li.dataset.tab === 'latest'));
          const titleEl = $('#pageTitle');
          if (titleEl) titleEl.textContent = '전체 최신 기사';
          const sel = $('#selCategory');
          if (sel) sel.value = 'all';

          await loadDashboard();
          doSearch();          // 리셋된 상태로 최신 기사 전체 재조회
          resetBtns();
          if (elapsed >= maxWait) {
            toast('업데이트 시간이 초과됐습니다. 결과를 확인하세요.', 'info');
          } else {
            toast('업데이트 완료! 새 기사가 반영됐습니다.', 'success');
          }
          refreshTicker();
          drawKwTrend();
          await loadKwCache();
        } else {
          const sec = Math.round(elapsed / 1000);
          setLabel(`수집 중... (${sec}초)`);
          setTimeout(poll, pollInterval);
        }
      };

      setTimeout(poll, 4000);

    } catch (e) {
      console.error('[크롤링] 오류:', e);
      resetBtns();
      toast('업데이트 요청 실패. 네트워크를 확인하세요.', 'error');
    }
  }

  // 탑바 업데이트 버튼
  $('#btnCrawl')?.addEventListener('click', () => doCrawlUpdate($('#btnCrawl')));
  // 모바일 사이드바 업데이트 버튼
  $('#btnCrawlMobile')?.addEventListener('click', () => doCrawlUpdate($('#btnCrawlMobile')));

  // 드로어 닫기
  $('#drawerClose')?.addEventListener('click', closeDrawer);
  $('#overlay')?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); closeShareModal(); } });

  // 엑셀 다운로드 버튼
  $('#btnExcelDown')?.addEventListener('click', downloadExcel);
}

// ── 엑셀 다운로드 ────────────────────────────────────────────
async function downloadExcel() {
  const qs = new URLSearchParams();
  const p  = buildParams();
  Object.entries(p).forEach(([k,v]) => {
    if (v !== undefined && v !== '' && v !== 'all') qs.set(k, v);
  });
  qs.set('page', 1);
  qs.set('limit', S.pageSize);
  const sort = $('#sortOrder')?.value || 'latest';
  if (sort === 'oldest') qs.set('sort', 'oldest');

  toast('엑셀 파일을 준비 중입니다...', 'info', 2000);

  const data = await apiFetch(`/api/articles?${qs}`);
  if (!data?.success || !data.data?.length) {
    toast('다운로드할 데이터가 없습니다.', 'error');
    return;
  }

  const rows = data.data;

  const BOM = '\uFEFF';
  const cols = [
    { key: 'id',           label: 'ID',           fmt: v => v },
    { key: 'category',     label: '분류',          fmt: v => v },
    { key: 'source',       label: '출처',          fmt: v => v },
    { key: 'title',        label: '제목',          fmt: v => v },
    { key: 'summary',      label: '요약',          fmt: v => v },
    { key: 'keywords',     label: '키워드',        fmt: v => v },
    { key: 'author',       label: '작성자',        fmt: v => v },
    { key: 'published_at', label: '입력일시(KST)', fmt: v => v ? fmtFull2(v) : '' },
    { key: 'url',          label: '원문URL',       fmt: v => v },
  ];

  const escCell = v => {
    if (v == null) return '';
    const s = String(v).replace(/\r?\n/g, ' ');
    return (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes(';'))
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const header = cols.map(c => c.label).join(',');
  const body   = rows.map(r =>
    cols.map(c => escCell(c.fmt ? c.fmt(r[c.key]) : r[c.key])).join(',')
  ).join('\n');

  const csv  = BOM + header + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const now  = new Date();
  const ts   = `${now.getFullYear()}${zp(now.getMonth()+1)}${zp(now.getDate())}_${zp(now.getHours())}${zp(now.getMinutes())}`;
  link.href     = URL.createObjectURL(blob);
  link.download = `KOSHA_모니터링_${ts}_${rows.length}건.csv`;
  link.click();
  URL.revokeObjectURL(link.href);

  toast(`총 ${rows.length}건 엑셀 다운로드 완료`, 'success');
}

// ── 자동 새로고침 ──────────────────────────────────────────────
function startAutoRefresh() {
  // 1분마다: 상대시간("최종 N분 전") 업데이트 + 카드 시간 갱신
  setInterval(() => {
    updateLiveText();
    // 피드 카드의 card-time 요소들도 갱신 (아이콘 유지)
    $$('.card-time[data-published]').forEach(el => {
      const t = el.dataset.published;
      if (!t) return;
      const icon = el.querySelector('i');
      if (icon) {
        // 아이콘 뒤 텍스트만 업데이트
        icon.nextSibling ? icon.nextSibling.textContent = relTime(t)
                         : el.appendChild(document.createTextNode(relTime(t)));
      } else {
        el.textContent = relTime(t);
      }
    });
  }, 60 * 1000);

  // 5분마다: 대시보드 전체 갱신 + 최신 탭이면 피드도 갱신
  setInterval(async () => {
    await loadDashboard();
    if (S.tab === 'latest' && S.page === 1 && !S.query && !S.quickPeriod && !S.crawledFrom) {
      await loadFeed();
    }
    drawKwTrend();
  }, 5 * 60 * 1000);
}

// ── 초기화 ──────────────────────────────────────────────────
async function init() {
  console.log('[KOSHA Monitor] 초기화 시작');

  bindEvents();
  initAdvTabs();
  initMobileMenu();
  initSearchAutocomplete();

  await loadDashboard();
  await initYearOpts();
  await loadKwCache();

  // 스파크라인은 loadDashboard 내부에서 호출됨
  drawKwTrend();

  $('#chipAll')?.classList.add('active');
  doSearch();

  // 북마크 배지 초기화
  updateBookmarkBadge();

  // 속보 티커 초기화
  initTicker();

  startAutoRefresh();
  console.log('[KOSHA Monitor] 초기화 완료');
}

document.addEventListener('DOMContentLoaded', init);
