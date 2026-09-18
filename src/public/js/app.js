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

// ══════════════════════════════════════════════════════════════
// 대시보드 차트 공용 호버 툴팁 헬퍼
// ══════════════════════════════════════════════════════════════
const DashTooltip = (() => {
  let _el = null;
  let _hideTimer = null;

  function el() {
    if (!_el) _el = document.getElementById('dashChartTooltip');
    return _el;
  }

  /**
   * 툴팁 표시
   * @param {MouseEvent|{clientX,clientY}} e  - 마우스 이벤트 (위치 결정)
   * @param {string}  title  - 굵은 제목 (날짜, 업종명 등)
   * @param {Array<{color:string, label:string, value:string|number}>} rows
   */
  function show(e, title, rows) {
    const t = el(); if (!t) return;
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }

    const titleHtml = title
      ? `<div class="tt-title">${title}</div>`
      : '';
    const rowsHtml = rows.map(r =>
      `<div class="tt-row">
        <span class="tt-dot" style="background:${r.color}"></span>
        <span>${r.label}</span>
        <span class="tt-val">${r.value}</span>
      </div>`
    ).join('');
    t.innerHTML = titleHtml + rowsHtml;

    // 위치 계산: 뷰포트 경계 넘지 않도록
    const pad = 12;
    const tw = t.offsetWidth  || 180;
    const th = t.offsetHeight || 60;
    let x = e.clientX + 14;
    let y = e.clientY - th / 2;
    if (x + tw + pad > window.innerWidth)  x = e.clientX - tw - 14;
    if (y < pad)                            y = pad;
    if (y + th + pad > window.innerHeight)  y = window.innerHeight - th - pad;
    t.style.left = x + 'px';
    t.style.top  = y + 'px';
    t.classList.add('visible');
  }

  function move(e) {
    const t = el(); if (!t || !t.classList.contains('visible')) return;
    const pad = 12;
    const tw = t.offsetWidth  || 180;
    const th = t.offsetHeight || 60;
    let x = e.clientX + 14;
    let y = e.clientY - th / 2;
    if (x + tw + pad > window.innerWidth)  x = e.clientX - tw - 14;
    if (y < pad)                            y = pad;
    if (y + th + pad > window.innerHeight)  y = window.innerHeight - th - pad;
    t.style.left = x + 'px';
    t.style.top  = y + 'px';
  }

  function hide() {
    _hideTimer = setTimeout(() => {
      const t = el(); if (t) t.classList.remove('visible');
    }, 80);
  }

  return { show, move, hide };
})();

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

// ── 긴급 기사 판별 ──────────────────────────────────────────────
const URGENT_KWS = ['명 사망','사망자','다수 사망','올해만','또 사망','첫 구속','동시 사망','명이 숨','수십 명'];
function checkUrgent(title) {
  return URGENT_KWS.some(kw => title.includes(kw));
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
  const isUrgentItem = checkUrgent(a.title || '');
  const readClass = isRead(a.id) ? ' card-read' : '';
  const urgentClass = isUrgentItem ? ' card-urgent' : '';
  const bmClass   = isBookmarked(a.id) ? ' bookmarked' : '';

  const srcIcons = {
    '정부기관': 'ti-building-bank', '기관': 'ti-certificate',
    '법령': 'ti-scale', '통신사': 'ti-radio', '방송': 'ti-device-tv',
    '전문지': 'ti-news',
  };
  const srcIcon = srcIcons[a.source_category] || 'ti-news';
  const urgentBadge = isUrgentItem ? '<span class="urgent-badge"><i class="ti ti-siren"></i>긴급</span>' : '';

  if (S.viewMode === 'list') {
    return `
    <div class="news-card list-card${readClass}${urgentClass}" data-id="${a.id}" data-cat="${cat}" tabindex="0" role="button"
      style="--cat-color:${meta.dot};--tag-bg:${meta.bg};--tag-color:${meta.color}">
      <div class="card-left">
        <span class="cat-tag">${cat}</span>
        <span class="card-time" data-published="${a.published_at || ''}"><i class="ti ti-clock"></i>${relTime(a.published_at)}</span>
      </div>
      <div class="card-body">
        <div class="card-header" style="margin-bottom:5px">
          <span class="src-tag"><i class="ti ${srcIcon}"></i>${a.source || ''}</span>
          ${isNewItem ? '<span class="new-badge">NEW</span>' : ''}
          ${urgentBadge}
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
  <div class="news-card${readClass}${urgentClass}" data-id="${a.id}" data-cat="${cat}" tabindex="0" role="button"
    style="--cat-color:${meta.dot};--tag-bg:${meta.bg};--tag-color:${meta.color}">
    <div class="card-header">
      <span class="cat-tag">${cat}</span>
      <span class="src-tag"><i class="ti ${srcIcon}"></i>${a.source || ''}</span>
      ${isNewItem ? '<span class="new-badge">NEW</span>' : ''}
      ${urgentBadge}
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


// ── 대시보드 KPI 카드 로드 ─────────────────────────────────────
async function loadDashboardKPI() {
  const data = await apiFetch('/api/stats/today-summary');
  if (!data?.success) return;
  const d = data.data;
  const setKPI = (id, val) => { const el = $(id); if (el) el.textContent = (val || 0).toLocaleString(); };
  setKPI('#dkpiTotalVal',    d.total);
  setKPI('#dkpiTodayVal',    d.today);
  setKPI('#dkpiDisasterVal', d.todayDisaster);
  setKPI('#dkpiWeekVal',     d.week);
  // ★ KPI 카드 클릭 필터: today-summary API와 동일한 crawled_at 범위 사용
  //   → 사이드바(loadDashboard)의 todayRange와 동일 기준이므로 수치 일치
  const kpiMap = [
    { id: '#dkpiTotal',    fn: () => {
        S.category='all'; S.quickPeriod=null;
        S.crawledFrom=''; S.crawledTo='';
        S.dateFrom=''; S.dateTo='';
        $$('.chip').forEach(c => c.classList.remove('active'));
        $('#chipAll')?.classList.add('active');
        doSearch();
      }
    },
    { id: '#dkpiToday',    fn: () => {
        // crawled_at 기준 오늘 범위 (API 응답값 활용 → 사이드바와 동일)
        S.quickPeriod = null;
        S.crawledFrom = d.todayRange?.from || '';
        S.crawledTo   = d.todayRange?.to   || '';
        S.dateFrom=''; S.dateTo='';
        $$('.chip').forEach(c => c.classList.remove('active'));
        $('#chipToday')?.classList.add('active');
        doSearch();
      }
    },
    { id: '#dkpiDisaster', fn: () => {
        S.category='중대재해';
        S.quickPeriod=null;
        S.crawledFrom = d.todayRange?.from || '';
        S.crawledTo   = d.todayRange?.to   || '';
        S.dateFrom=''; S.dateTo='';
        switchTab('disaster'); doSearch();
      }
    },
    { id: '#dkpiWeek',     fn: () => { $('#chipWeek')?.click(); } },
  ];
  kpiMap.forEach(({ id, fn }) => {
    const el = $(id);
    if (!el || el._kpiBound) return;
    el._kpiBound = true; el.style.cursor = 'pointer';
    el.addEventListener('click', fn);
  });
}

// ── 카테고리 도넛 차트 ─────────────────────────────────────────
const DONUT_COLORS = {
  '중대재해': '#ef4444', '산업재해·안전': '#f97316',
  '법령·제도': '#3b82f6', '정책·브리핑': '#10b981',
  '직업보건·화학': '#8b5cf6', '기관동향': '#64748b',
};
async function loadDonutChart() {
  const data = await apiFetch('/api/stats/categories');
  if (!data?.success) return;
  const cats = data.data;
  const total = cats.reduce((s, c) => s + c.count, 0);
  const el = $('#donutChart');
  if (!el) return;
  const catOrder = ['중대재해','산업재해·안전','법령·제도','정책·브리핑','직업보건·화학','기관동향'];
  const vals = catOrder.map(name => cats.find(c => c.category === name)?.count || 0);
  const colors = catOrder.map(name => DONUT_COLORS[name] || '#94a3b8');
  const ctx = el.getContext('2d');
  // DPR(Retina) 대응 – breakpoint별 고정 크기 (부모 높이 의존성 제거)
  const dpr = window.devicePixelRatio || 1;
  const iw = window.innerWidth;
  // ★ CSS와 동기화: 480px→120, 640px→130, 768px→150, 데스크탑→150 (v1.8)
  const canvasSize = iw <= 480 ? 120 : iw <= 640 ? 130 : iw <= 768 ? 150 : 150;
  el.width  = canvasSize * dpr;
  el.height = canvasSize * dpr;
  el.style.width  = canvasSize + 'px';
  el.style.height = canvasSize + 'px';
  ctx.scale(dpr, dpr);
  const W = canvasSize, H = canvasSize;
  const cx = W/2, cy = H/2, r = Math.min(W,H)/2 - 8, ri = r * 0.58;
  ctx.clearRect(0, 0, W, H);
  let startAngle = -Math.PI / 2;
  vals.forEach((v, i) => {
    if (v === 0) return;
    const slice = (v / total) * 2 * Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + slice);
    ctx.closePath(); ctx.fillStyle = colors[i]; ctx.fill();
    startAngle += slice;
  });
  ctx.beginPath(); ctx.arc(cx, cy, ri, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  const centerEl = $('#donutCenterVal');
  if (centerEl) centerEl.textContent = total.toLocaleString();
  const legend = $('#donutLegend');
  if (legend) {
    legend.innerHTML = catOrder.map((name, i) => {
      const cnt = vals[i]; if (cnt === 0) return '';
      const pct = total > 0 ? ((cnt / total) * 100).toFixed(1) : '0';
      return `<li class="donut-legend-item" data-cat="${name}">
        <span class="donut-dot" style="background:${colors[i]}"></span>
        <span class="donut-name">${name}</span>
        <span class="donut-cnt">${cnt.toLocaleString()} <small>(${pct}%)</small></span>
      </li>`;
    }).join('');
    $$('.donut-legend-item', legend).forEach(li => {
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => {
        S.category = li.dataset.cat;
        const sel = $('#selCategory'); if (sel) sel.value = li.dataset.cat;
        S.tab = 'latest';
        $$('.nav-item').forEach(x => x.classList.remove('active'));
        $('[data-tab="latest"]')?.classList.add('active');
        // 모바일: 사이드바 닫기
        if (window.innerWidth <= 900) {
          $('#sidebar')?.classList.remove('mobile-open');
          $('#sidebarOverlay')?.classList.remove('open');
          document.body.classList.remove('sidebar-active');
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.width = '';
        }
        doSearch();
      });
    });
  }
}

// ── 일별 트렌드 바 차트 ────────────────────────────────────────
async function loadTrendChart(days) {
  const data = await apiFetch(`/api/stats/daily-trend?days=${days}`);
  if (!data?.success) return;
  const rows = data.data;
  const el = $('#trendChart');
  if (!el || rows.length === 0) return;
  const ctx = el.getContext('2d');
  const dpr  = window.devicePixelRatio || 1;
  const iw2  = window.innerWidth;
  const wrap = el.parentElement;
  // ★ CSS flex:1 stretch로 래퍼가 도넛 카드와 동일 높이로 확장된 뒤 측정
  //   clientWidth/Height: 실제 렌더된 px (rAF 2회 후 호출로 레이아웃 확정 보장)
  const displayW = Math.max(wrap?.clientWidth  || 0, 200);
  const stretchH = wrap?.clientHeight ?? 0;
  // v1.8: height:280px 체계 — 래퍼 clientHeight를 우선 사용, 폴백은 뷰포트별 고정값
  // (모바일 세로배치에서 height:auto이므로 clientHeight가 0에 가까울 수 있음)
  const fallbackH = iw2 <= 480 ? 110 : iw2 <= 640 ? 130 : iw2 <= 768 ? 160 : 200;
  const displayH  = stretchH > 40 ? stretchH : fallbackH;
  // canvas 내부 해상도를 DPR 배율로 설정
  el.width  = displayW * dpr;
  el.height = displayH * dpr;
  // CSS style은 건드리지 않음 (flex:1/100%를 CSS가 관리)
  ctx.scale(dpr, dpr);
  const W = displayW, H = displayH;
  ctx.clearRect(0, 0, W, H);
  const totals = rows.map(r => r.total);
  const maxVal = Math.max(...totals, 1);
  const barW = Math.max(3, Math.floor((W - 30) / Math.max(rows.length,1)) - 2);
  const padL = 26, padB = 20, padT = 8;
  const chartH = H - padT - padB; const chartW = W - padL;
  ctx.strokeStyle = 'rgba(148,163,184,0.15)'; ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach(p => {
    const y = padT + chartH * (1 - p);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W, y); ctx.stroke();
  });
  // X축 레이블 표시 간격 (모바일에서 더 넓게)
  const labelStep = window.innerWidth <= 480
    ? Math.max(1, Math.floor(rows.length / 4))
    : Math.max(1, Math.floor(rows.length / 7));
  rows.forEach((r, i) => {
    const x = padL + i * (chartW / rows.length) + (chartW / rows.length - barW) / 2;
    let stackY = padT + chartH;
    const drawSeg = (val, color) => {
      if (val <= 0) return;
      const sh = (val / maxVal) * chartH; stackY -= sh;
      ctx.fillStyle = color; ctx.fillRect(x, stackY, barW, sh);
    };
    drawSeg(r.disaster || 0, '#ef4444cc');
    drawSeg(r.safety || 0,   '#f97316cc');
    drawSeg((r.law||0) + (r.policy||0) + (r.health||0) + (r.agency||0), '#3b82f6aa');
    if (i % labelStep === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `${window.innerWidth <= 480 ? 8 : 9}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText((r.day||'').substring(5), x + barW/2, H - 4);
    }
  });
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${window.innerWidth <= 480 ? 8 : 9}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(maxVal, padL - 2, padT + 8);
  ctx.fillText(0, padL - 2, H - padB + 6);

  // ── 트렌드 바차트 호버 툴팁 ────────────────────────────────
  // 이전 이벤트 제거 후 재등록 (주기 전환 시 중복 방지)
  el._trendMM = e => {
    const rect = el.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (el.width / rect.width / dpr);
    const slotW = chartW / rows.length;
    const idx = Math.floor((mx - padL) / slotW);
    if (idx < 0 || idx >= rows.length) { DashTooltip.hide(); return; }
    const r = rows[idx];
    const other = (r.law||0) + (r.policy||0) + (r.health||0) + (r.agency||0);
    DashTooltip.show(e,
      (r.day||'').substring(5) + ' (' + r.total + '건)',
      [
        { color: '#ef4444', label: '중대재해',    value: (r.disaster||0) + '건' },
        { color: '#f97316', label: '산업재해·안전', value: (r.safety||0)  + '건' },
        { color: '#3b82f6', label: '법령·정책·보건·기관', value: other + '건' },
      ].filter(x => parseInt(x.value) > 0)
    );
    DashTooltip.move(e);
  };
  el._trendML = () => DashTooltip.hide();
  el.removeEventListener('mousemove',  el._trendMM);
  el.removeEventListener('mouseleave', el._trendML);
  el.removeEventListener('touchstart', el._trendML);
  el.addEventListener('mousemove',  el._trendMM);
  el.addEventListener('mouseleave', el._trendML);
  el.addEventListener('touchstart', el._trendML, { passive: true });
}

// ── 긴급 모니터링 기사 ─────────────────────────────────────────
// ── 긴급 카드 빈 공간 자동 흡수 ──────────────────────────────
// 항목 수가 적어 카드에 여백이 생기면 항목을 늘려 공백 없이 채움
// 핵심: ul(flex:1)의 clientHeight는 카드 전체 높이를 이미 채우고 있어 측정 불가
//       → 부모 카드(.dash-card-urgent)의 내부 가용 높이와 항목 scrollHeight를 비교
function urgentAutoExpand() {
  const el   = $('#urgentList');
  if (!el) return;
  const items = $$('.urgent-item', el);
  if (!items.length) { el.removeAttribute('data-expand'); return; }

  // ① 확장 모드 해제 → ul이 자연 높이로 수축하도록
  el.removeAttribute('data-expand');
  // flex:1 임시 제거로 ul이 콘텐츠 높이만 차지하도록 강제
  el.style.flex = 'none';

  // ② 레이아웃 재계산 후 측정 (2 rAF: 첫번째=스타일 적용, 두번째=픽셀 확정)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const card     = el.closest('.dash-card-urgent');
    const cardHead = card?.querySelector('.dash-card-head');

    // 카드 내부 가용 높이 = 카드 clientHeight - padding(top+bottom=24) - 헤더 높이 - 헤더 mb(8)
    const cardInnerH = card
      ? card.clientHeight - 24 - (cardHead ? cardHead.offsetHeight + 8 : 0)
      : 0;
    const naturalH   = el.scrollHeight;   // 항목들의 실제 콘텐츠 높이
    const slack      = cardInnerH - naturalH;

    // ③ flex:1 복원
    el.style.flex = '';

    // 여백 ≥ 34px(항목 1개 최소 높이)이고 항목이 5개 미만일 때 확장
    if (slack >= 34 && items.length < 5) {
      el.setAttribute('data-expand', 'true');
    } else {
      el.removeAttribute('data-expand');
    }
  }));
}

async function loadUrgentList() {
  const data = await apiFetch('/api/articles/urgent?limit=7');
  const el = $('#urgentList');
  if (!el) return;
  if (!data?.success || !data.data?.length) {
    el.innerHTML = '<li class="urgent-empty"><i class="ti ti-check-circle" style="color:var(--success-400)"></i> 현재 긴급 기사 없음</li>';
    el.removeAttribute('data-expand');
    return;
  }
  el.innerHTML = data.data.map(a => `
    <li class="urgent-item" data-id="${a.id}">
      <div class="urgent-item-meta">
        <span class="urgent-cat">${a.category||'기타'}</span>
        <span class="urgent-time">${relTime(a.published_at)}</span>
      </div>
      <p class="urgent-title-text">${a.title}</p>
    </li>`).join('');
  $$('.urgent-item', el).forEach(li => li.addEventListener('click', () => openDrawer(parseInt(li.dataset.id))));
  // 렌더 직후 1차 확장 검사 (카드 최종 높이 확정 전 예비 측정)
  requestAnimationFrame(() => requestAnimationFrame(() => urgentAutoExpand()));
}

// ── 위험 업종별 통계 ──────────────────────────────────────────
async function loadIndustryStats() {
  const data = await apiFetch('/api/stats/industry?days=30');
  const el = $('#industryList');
  if (!el || !data?.success) return;
  const rows = data.data.filter(r => r.cnt > 0).slice(0, 8);
  if (!rows.length) { el.innerHTML = '<li class="industry-empty">데이터 없음</li>'; return; }
  const maxCnt = rows[0].cnt;
  const colors = ['#ef4444','#f97316','#f59e0b','#10b981','#3b82f6','#8b5cf6','#64748b'];
  el.innerHTML = rows.map((r, i) => {
    const pct = maxCnt > 0 ? Math.round((r.cnt / maxCnt) * 100) : 0;
    const share = maxCnt > 0 ? ((r.cnt / maxCnt) * 100).toFixed(1) : '0';
    return `<li class="industry-item"
        data-name="${r.industry}" data-cnt="${r.cnt}" data-pct="${share}" data-color="${colors[i]||'#64748b'}">
      <div class="industry-item-head">
        <span class="industry-rank">${i+1}</span>
        <span class="industry-name">${r.industry}</span>
        <span class="industry-cnt">${r.cnt}</span>
      </div>
      <div class="industry-bar-wrap">
        <div class="industry-bar" style="width:${pct}%;background:${colors[i]||'#64748b'}"></div>
      </div>
    </li>`;
  }).join('');

  // 업종 바 호버 툴팁
  $$('.industry-item', el).forEach(li => {
    li.addEventListener('mouseenter', e => {
      DashTooltip.show(e,
        li.dataset.name,
        [{ color: li.dataset.color, label: '기사 수', value: li.dataset.cnt + '건 (' + li.dataset.pct + '%)' }]
      );
    });
    li.addEventListener('mousemove',  e => DashTooltip.move(e));
    li.addEventListener('mouseleave', () => DashTooltip.hide());
  });
}

// ── 지역별 사고 현황 ──────────────────────────────────────────
async function loadRegionStats() {
  const data = await apiFetch('/api/stats/region?days=30');
  const el = $('#regionList');
  if (!el || !data?.success) return;
  const rows = data.data.slice(0, 8);
  if (!rows.length) { el.innerHTML = '<div class="region-empty">지역 데이터 없음</div>'; return; }
  const maxCnt = rows[0].cnt;
  const regionColors = { danger: '#ef4444', warning: '#f97316', normal: 'var(--accent-main,#1e4068)' };
  el.innerHTML = rows.map(r => {
    const pct   = maxCnt > 0 ? Math.round((r.cnt / maxCnt) * 100) : 0;
    const share = maxCnt > 0 ? ((r.cnt / maxCnt) * 100).toFixed(1) : '0';
    const level = pct >= 80 ? 'danger' : pct >= 50 ? 'warning' : 'normal';
    return `<div class="region-item" data-region="${r.region}"
        data-cnt="${r.cnt}" data-pct="${share}" data-level="${level}">
      <div class="region-item-head">
        <span class="region-name"><i class="ti ti-map-pin"></i>${r.region}</span>
        <span class="region-badge region-badge-${level}">${r.cnt}건</span>
      </div>
      <div class="region-bar-wrap">
        <div class="region-bar region-bar-${level}" style="width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');
  $$('.region-item', el).forEach(div => {
    div.style.cursor = 'pointer';
    div.addEventListener('click', () => { S.query = div.dataset.region; const gs = $('#globalSearch'); if (gs) gs.value = div.dataset.region; doSearch(); });

    // 지역 바 호버 툴팁
    const lvlColor = { danger: '#ef4444', warning: '#f97316', normal: '#1e4068' };
    div.addEventListener('mouseenter', e => {
      const lv = div.dataset.level || 'normal';
      const label = lv === 'danger' ? '위험' : lv === 'warning' ? '주의' : '보통';
      DashTooltip.show(e,
        div.dataset.region + ' 지역',
        [{ color: lvlColor[lv], label: '기사 수 · ' + label, value: div.dataset.cnt + '건 (' + div.dataset.pct + '%)' }]
      );
    });
    div.addEventListener('mousemove',  e => DashTooltip.move(e));
    div.addEventListener('mouseleave', () => DashTooltip.hide());
  });
}

// ── 대시보드 전체 로드 ────────────────────────────────────────
async function loadNewDashboard() {
  // ① 도넛·KPI·하단 카드 먼저 렌더 (도넛 카드 높이 확정)
  await Promise.allSettled([loadDashboardKPI(), loadDonutChart(), loadUrgentList(), loadIndustryStats(), loadRegionStats()]);
  // ② 도넛 카드 높이가 CSS stretch로 확정된 뒤 트렌드 canvas 크기 측정
  //    → requestAnimationFrame 2회: 첫 번째는 레이아웃 계산, 두 번째는 실제 픽셀 확정
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await loadTrendChart(14);
  // ③ 트렌드 차트 로드 후 하단 카드 최종 높이 확정 → 긴급 카드 확장 여부 재검사
  //    (업종·지역 카드가 stretch로 높이가 결정되는 시점 이후 측정해야 정확)
  requestAnimationFrame(() => requestAnimationFrame(() => urgentAutoExpand()));
  $$('.trend-btn').forEach(btn => {
    if (btn._trendBound) return; btn._trendBound = true;
    btn.addEventListener('click', async () => {
      $$('.trend-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
      await loadTrendChart(parseInt(btn.dataset.days));
    });
  });
}

// ── 긴급 카드 반응형 확장 감지 (창 크기 변경 시 재조정) ──────
function initUrgentResizeObserver() {
  const card = $('.dash-card-urgent');
  if (!card || !window.ResizeObserver) return;
  let _roTimer;
  const ro = new ResizeObserver(() => {
    clearTimeout(_roTimer);
    _roTimer = setTimeout(() => urgentAutoExpand(), 80); // 디바운스 80ms
  });
  ro.observe(card);
}

// ── 대시보드 토글 ─────────────────────────────────────────────
let _dashOpen = true;
function initDashToggle() {
  const btn = $('#dashToggleBtn'); const panel = $('#dashboardPanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    _dashOpen = !_dashOpen;
    panel.style.display = _dashOpen ? '' : 'none';
    const icon = $('#dashToggleIcon'); const label = $('#dashToggleLabel');
    if (icon) icon.className = `ti ${_dashOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`;
    if (label) label.textContent = _dashOpen ? '대시보드 접기' : '대시보드 펼치기';
  });
}

// ── 자동 새로고침 ──────────────────────────────────────────────
function startAutoRefresh() {
  // 1분마다: 상대시간 + 카드 시간 갱신
  setInterval(() => {
    updateLiveText();
    $$('.card-time[data-published]').forEach(el => {
      const t = el.dataset.published; if (!t) return;
      const icon = el.querySelector('i');
      if (icon) { icon.nextSibling ? icon.nextSibling.textContent = relTime(t) : el.appendChild(document.createTextNode(relTime(t))); }
      else { el.textContent = relTime(t); }
    });
  }, 60 * 1000);

  // 5분마다: 대시보드 전체 갱신 + 피드 갱신
  setInterval(async () => {
    await loadDashboard();
    await loadNewDashboard();
    if (S.tab === 'latest' && S.page === 1 && !S.query && !S.quickPeriod && !S.crawledFrom) await loadFeed();
    drawKwTrend();
  }, 5 * 60 * 1000);
}

// ══════════════════════════════════════════════════════════════
// ⑨ 탭 전환
// ══════════════════════════════════════════════════════════════
function switchTab(tab) {
  S.tab      = tab;
  S.page     = 1;
  S.category = 'all';
  S.query    = '';
  S.quickPeriod = null;
  S.advFrom = ''; S.advTo = '';
  S.advYear = ''; S.advMonth = ''; S.advDay = ''; S.advHour = '';
  S.crawledFrom = ''; S.crawledTo = '';

  // nav 활성화
  $$('.nav-item').forEach(li => li.classList.toggle('active', li.dataset.tab === tab));
  // 카테고리 셀렉트 초기화
  const sel = $('#selCategory');
  if (sel) sel.value = 'all';
  // 검색창 초기화
  const gs = $('#globalSearch');
  if (gs) gs.value = '';
  // 칩 초기화
  $$('.chip').forEach(c => c.classList.remove('active'));
  $('#chipAll')?.classList.add('active');
  // 페이지 타이틀
  const titles = {
    latest: '전체 최신 기사', disaster: '중대재해',
    safety: '산업재해·안전', law: '법령·제도',
    policy: '정책·브리핑', health: '직업보건·화학',
    kosha: '기관 동향', bookmarks: '북마크한 기사',
  };
  const titleEl = $('#pageTitle');
  if (titleEl) titleEl.textContent = titles[tab] || '전체 최신 기사';
  // 모바일: 사이드바 닫기
  if (window.innerWidth <= 900) {
    $('#sidebar')?.classList.remove('mobile-open');
    $('#sidebarOverlay')?.classList.remove('open');
    document.body.classList.remove('sidebar-active');
    $('#hamburger')?.classList.remove('is-open');
    const scrollY = parseInt(document.body.style.top || '0') * -1;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.left = '';
    document.body.style.right = '';
    window.scrollTo(0, scrollY || 0);
  }
}

// ══════════════════════════════════════════════════════════════
// ⑩ 이벤트 바인딩 (bindEvents)
// ══════════════════════════════════════════════════════════════
function bindEvents() {
  // 네비 탭 클릭
  $$('.nav-item').forEach(li => {
    li.addEventListener('click', () => switchTab(li.dataset.tab));
  });

  // 퀵 칩 (오늘/이번주/이번달)
  $('#chipAll')?.addEventListener('click', () => {
    S.quickPeriod = null; S.advFrom = ''; S.advTo = '';
    S.advYear = ''; S.advMonth = ''; S.advDay = ''; S.advHour = '';
    S.dateFrom = ''; S.dateTo = '';
    $$('.chip').forEach(c => c.classList.remove('active'));
    $('#chipAll')?.classList.add('active');
    doSearch();
  });
  $('#chipToday')?.addEventListener('click', () => {
    S.quickPeriod = 'today';
    $$('.chip').forEach(c => c.classList.remove('active'));
    $('#chipToday')?.classList.add('active');
    doSearch();
  });
  $('#chipWeek')?.addEventListener('click', () => {
    S.quickPeriod = 'week';
    $$('.chip').forEach(c => c.classList.remove('active'));
    $('#chipWeek')?.classList.add('active');
    doSearch();
  });
  $('#chipMonth')?.addEventListener('click', () => {
    S.quickPeriod = 'month';
    $$('.chip').forEach(c => c.classList.remove('active'));
    $('#chipMonth')?.classList.add('active');
    doSearch();
  });

  // 검색 버튼
  $('#btnSearch')?.addEventListener('click', () => {
    S.query = $('#globalSearch')?.value.trim() || '';
    if (S.query) pushSearchHist(S.query);
    S.tab = 'latest';
    $$('.nav-item').forEach(li => li.classList.toggle('active', li.dataset.tab === 'latest'));
    const titleEl = $('#pageTitle');
    if (titleEl) titleEl.textContent = S.query ? `"${S.query}" 검색 결과` : '전체 최신 기사';
    doSearch();
  });

  // 필터 초기화
  $('#btnReset')?.addEventListener('click', () => {
    S.query = ''; S.category = 'all'; S.source = 'all';
    S.dateFrom = ''; S.dateTo = '';
    S.quickPeriod = null;
    S.advFrom = ''; S.advTo = '';
    S.advYear = ''; S.advMonth = ''; S.advDay = ''; S.advHour = '';
    S.crawledFrom = ''; S.crawledTo = '';
    const gs = $('#globalSearch'); if (gs) gs.value = '';
    const sc = $('#selCategory'); if (sc) sc.value = 'all';
    const ss = $('#selSource'); if (ss) ss.value = 'all';
    const df = $('#dateFrom'); if (df) { df.value = ''; df.type = 'text'; }
    const dt = $('#dateTo'); if (dt) { dt.value = ''; dt.type = 'text'; }
    $$('.chip').forEach(c => c.classList.remove('active'));
    $('#chipAll')?.classList.add('active');
    $$('.cat-item').forEach(c => c.classList.remove('active'));
    doSearch();
  });

  // 카테고리 셀렉트
  $('#selCategory')?.addEventListener('change', e => {
    S.category = e.target.value;
    doSearch();
  });

  // 정렬, 페이지 크기
  $('#sortOrder')?.addEventListener('change', () => doSearch());
  $('#pageSize')?.addEventListener('change', e => {
    S.pageSize = +e.target.value;
    doSearch();
  });

  // 뷰 토글 (카드/리스트)
  $('#viewCard')?.addEventListener('click', () => {
    S.viewMode = 'card';
    $('#viewCard')?.classList.add('active');
    $('#viewList')?.classList.remove('active');
    doSearch();
  });
  $('#viewList')?.addEventListener('click', () => {
    S.viewMode = 'list';
    $('#viewList')?.classList.add('active');
    $('#viewCard')?.classList.remove('active');
    doSearch();
  });

  // 드로어 닫기
  $('#drawerClose')?.addEventListener('click', closeDrawer);
  $('#overlay')?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDrawer();
      closeShareModal();
      hideSuggest();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      $('#globalSearch')?.focus();
    }
  });

  // 크롤 버튼 (탑바 + 모바일)
  async function doCrawl(btn) {
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    [$('#btnCrawl'), $('#btnCrawlMobile')].forEach(b => { if (b && b !== btn) { b.classList.add('loading'); b.disabled = true; } });
    try {
      const r = await fetch('/api/crawl', { method: 'POST' });
      const j = await r.json();
      if (j.success) {
        toast(`✅ ${j.message || '수집 완료'}`, 'success', 4000);
        setTimeout(() => { loadDashboard(); loadFeed(); loadNewDashboard(); }, 1500);
      } else {
        toast(j.message || '수집 중 오류가 발생했습니다.', 'error');
      }
    } catch {
      toast('서버에 연결할 수 없습니다.', 'error');
    } finally {
      [$('#btnCrawl'), $('#btnCrawlMobile')].forEach(b => { if (b) { b.classList.remove('loading'); b.disabled = false; } });
    }
  }
  $('#btnCrawl')?.addEventListener('click', function() { doCrawl(this); });
  $('#btnCrawlMobile')?.addEventListener('click', function() { doCrawl(this); });

  // 고급 날짜 토글
  const advToggle = () => {
    const panel = $('#advPanel');
    const btn1  = $('#btnAdvDate');
    const btn2  = $('#btnAdvDate2');
    if (!panel) return;
    const open = panel.classList.toggle('open');
    btn1?.classList.toggle('active', open);
    btn2?.classList.toggle('active', open);
  };
  $('#btnAdvDate')?.addEventListener('click', advToggle);
  $('#btnAdvDate2')?.addEventListener('click', advToggle);
  $('#btnAdvApply')?.addEventListener('click', () => {
    const at = S.advTab;
    if (at === 'range') {
      S.advFrom = $('#advFrom')?.value || '';
      S.advTo   = $('#advTo')?.value   || '';
    } else if (at === 'year') {
      S.advYear = $('#advYear')?.value || '';
    } else if (at === 'month') {
      S.advYear  = $('#advMonthYear')?.value || '';
      S.advMonth = $('#advMonth')?.value     || '';
    } else if (at === 'day') {
      S.advDay = $('#advDay')?.value || '';
    } else if (at === 'hour') {
      S.advDay  = $('#advHourDate')?.value || '';
      S.advHour = $('#advHour')?.value     || '';
    }
    S.quickPeriod = null;
    $$('.chip').forEach(c => c.classList.remove('active'));
    doSearch();
  });

  // 엑셀 다운로드
  $('#btnExcelDown')?.addEventListener('click', () => {
    const qs = new URLSearchParams();
    const p  = buildParams();
    Object.entries(p).forEach(([k,v]) => { if (v !== undefined && v !== '' && v !== 'all') qs.set(k, v); });
    qs.set('limit', '5000');
    window.location.href = `/api/articles/export?${qs}`;
  });

  // 공유 모달 닫기
  $('#shareModalClose')?.addEventListener('click', closeShareModal);
}

// ══════════════════════════════════════════════════════════════
// ⑪ 고급 날짜 탭 초기화
// ══════════════════════════════════════════════════════════════
function initAdvTabs() {
  $$('.adv-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.adv-tab').forEach(t => t.classList.remove('active'));
      $$('.adv-tab-body').forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
      S.advTab = tab.dataset.atab;
      $(`#atab-${S.advTab}`)?.classList.add('active');
    });
  });
}

// ══════════════════════════════════════════════════════════════
// ⑫ 모바일 메뉴 초기화
// ══════════════════════════════════════════════════════════════
function initMobileMenu() {
  const hamburger = $('#hamburger');
  const sidebar   = $('#sidebar');
  const overlay   = $('#sidebarOverlay');
  if (!hamburger || !sidebar || !overlay) return;

  let _scrollY = 0;

  const openMenu = () => {
    _scrollY = window.scrollY;
    hamburger.classList.add('is-open');
    sidebar.classList.add('mobile-open');
    overlay.classList.add('open');
    // iOS 스크롤 잠금
    document.body.style.position = 'fixed';
    document.body.style.top      = `-${_scrollY}px`;
    document.body.style.left     = '0';
    document.body.style.right    = '0';
    document.body.style.width    = '100%';
    document.body.classList.add('sidebar-active');
    hamburger.setAttribute('aria-label', '메뉴 닫기');
    hamburger.setAttribute('aria-expanded', 'true');
  };

  const closeMenu = () => {
    hamburger.classList.remove('is-open');
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('open');
    // iOS 스크롤 복원
    document.body.style.position = '';
    document.body.style.top      = '';
    document.body.style.left     = '';
    document.body.style.right    = '';
    document.body.style.width    = '';
    document.body.classList.remove('sidebar-active');
    window.scrollTo(0, _scrollY);
    hamburger.setAttribute('aria-label', '메뉴 열기');
    hamburger.setAttribute('aria-expanded', 'false');
  };

  hamburger.addEventListener('click', () => {
    sidebar.classList.contains('mobile-open') ? closeMenu() : openMenu();
  });
  overlay.addEventListener('click', closeMenu);

  // 스와이프로 닫기 (터치)
  let touchStartX = 0;
  sidebar.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  sidebar.addEventListener('touchend', e => {
    if (e.changedTouches[0].clientX - touchStartX < -60) closeMenu();
  }, { passive: true });
}

// ══════════════════════════════════════════════════════════════
// ⑬ 연도 옵션 초기화
// ══════════════════════════════════════════════════════════════
async function initYearOpts() {
  const now = new Date();
  const curY = now.getFullYear() + 1;   // 내년까지
  const minY = 2022;
  const years = [];
  for (let y = curY; y >= minY; y--) years.push(y);

  const populate = (sel) => {
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">연도 선택</option>';
    years.forEach(y => {
      const o = document.createElement('option');
      o.value = y; o.textContent = `${y}년`;
      if (String(y) === cur) o.selected = true;
      sel.appendChild(o);
    });
  };
  populate($('#advYear'));
  populate($('#advMonthYear'));
}

// ── 초기화 ──────────────────────────────────────────────────
async function init() {
  console.log('[KOSHA Monitor] 초기화 시작');
  bindEvents();
  initAdvTabs();
  initMobileMenu();
  initSearchAutocomplete();
  initDashToggle();
  initUrgentResizeObserver();   // 창 크기 변경 시 긴급 카드 자동 확장 재조정

  await loadDashboard();
  await initYearOpts();
  await loadKwCache();

  // 대시보드 위젯 로드 (KPI, 도넛, 트렌드, 긴급, 업종, 지역)
  loadNewDashboard();

  drawKwTrend();
  $('#chipAll')?.classList.add('active');
  doSearch();
  updateBookmarkBadge();
  initTicker();
  startAutoRefresh();
  console.log('[KOSHA Monitor] 초기화 완료');
}

document.addEventListener('DOMContentLoaded', init);
