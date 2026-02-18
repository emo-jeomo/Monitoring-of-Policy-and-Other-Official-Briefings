/**
 * KOSHA 언론모니터링 시스템 - 메인 앱 스크립트
 */

// ── 상태 관리 ────────────────────────────────────────────────
const state = {
  currentPage: 1,
  pageSize: 20,
  currentTab: 'latest',
  searchParams: {},
  totalArticles: 0,
  totalPages: 0,
  autoRefreshTimer: null,
  crawlCheckTimer: null,
};

// ── DOM 요소 ─────────────────────────────────────────────────
const $$ = (sel) => document.querySelector(sel);
const $$$ = (sel) => document.querySelectorAll(sel);

const elements = {
  newsFeed: $$('#newsFeed'),
  pagination: $$('#pagination'),
  resultInfo: $$('#resultInfo'),
  searchQuery: $$('#searchQuery'),
  filterCategory: $$('#filterCategory'),
  filterSource: $$('#filterSource'),
  dateFrom: $$('#dateFrom'),
  dateTo: $$('#dateTo'),
  filterYear: $$('#filterYear'),
  filterMonthYear: $$('#filterMonthYear'),
  filterMonth: $$('#filterMonth'),
  filterDay: $$('#filterDay'),
  filterHourDate: $$('#filterHourDate'),
  filterHour: $$('#filterHour'),
  btnApplySearch: $$('#btnApplySearch'),
  btnReset: $$('#btnReset'),
  btnSearch: $$('#btnSearch'),
  btnManualCrawl: $$('#btnManualCrawl'),
  categoryList: $$('#categoryList'),
  statTotal: $$('#statTotal'),
  statToday: $$('#statToday'),
  statHour: $$('#statHour'),
  lastUpdateTime: $$('#lastUpdateTime'),
  tabSearchResult: $$('#tabSearchResult'),
  resultCount: $$('#resultCount'),
  sortOrder: $$('#sortOrder'),
  pageSize: $$('#pageSize'),
  crawlStatusBadge: $$('#crawlStatusBadge'),
  crawlLastTime: $$('#crawlLastTime'),
  crawlNextTime: $$('#crawlNextTime'),
  articleModal: $$('#articleModal'),
  modalClose: $$('#modalClose'),
  modalTitle: $$('#modalTitle'),
  modalContent: $$('#modalContent'),
  modalCategory: $$('#modalCategory'),
  modalSource: $$('#modalSource'),
  modalDate: $$('#modalDate'),
  modalLink: $$('#modalLink'),
  toast: $$('#toast'),
};

// ── 유틸리티 ─────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatFullDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function isNew(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const diff = (new Date() - d) / 1000 / 3600;
  return diff < 6;
}

function getSourceBadgeClass(sourceCategory) {
  if (['정부기관', '기관'].includes(sourceCategory)) return 'source-gov';
  if (['법령', '입법'].includes(sourceCategory)) return 'source-law';
  return '';
}

function highlightText(text, query) {
  if (!query || !text) return text || '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="highlight">$1</mark>');
}

function showToast(msg, type = 'info', duration = 3000) {
  const toast = elements.toast;
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, duration);
}

function getCategoryColor(category) {
  const colors = {
    '중대재해': '#e74c3c',
    '산업재해': '#e67e22',
    '법령·제도': '#8e44ad',
    '정책': '#2980b9',
    '화학안전': '#16a085',
    '직업보건': '#27ae60',
    '안전보건': '#1a5276',
    '기관동향': '#d35400',
    '기타': '#7f8c8d',
  };
  return colors[category] || '#7f8c8d';
}

// ── API 호출 ─────────────────────────────────────────────────
async function apiFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('API 오류:', e.message, url);
    return null;
  }
}

// ── 뉴스 카드 렌더링 ─────────────────────────────────────────
function renderNewsCard(article, query = '') {
  const title = query ? highlightText(article.title, query) : (article.title || '제목 없음');
  const summary = article.summary || article.content || '';
  const displaySummary = query ? highlightText(summary.substring(0, 120), query) : summary.substring(0, 120);
  const timeStr = formatDate(article.published_at);
  const isNewArticle = isNew(article.published_at);
  const sourceBadgeClass = getSourceBadgeClass(article.source_category);
  const keywords = article.keywords ? article.keywords.split(',').slice(0, 3) : [];

  return `
    <div class="news-card" data-id="${article.id}" data-category="${article.category || ''}">
      <div class="news-card-header">
        <span class="news-badge category-badge" style="background:${getCategoryColor(article.category)}">${article.category || '기타'}</span>
        <span class="news-badge source-badge ${sourceBadgeClass}">
          <i class="fa-solid fa-${article.source_category === '정부기관' || article.source_category === '기관' ? 'landmark' : article.source_category === '법령' || article.source_category === '입법' ? 'scale-balanced' : 'newspaper'}" style="font-size:10px;margin-right:3px;"></i>
          ${article.source || '미상'}
        </span>
        ${isNewArticle ? '<span class="new-badge">NEW</span>' : ''}
      </div>
      <div class="news-card-title">${title}</div>
      ${displaySummary ? `<div class="news-card-summary">${displaySummary}${summary.length > 120 ? '...' : ''}</div>` : ''}
      <div class="news-card-footer">
        <span class="news-time">
          <i class="fa-regular fa-clock"></i>
          ${timeStr}
        </span>
        ${keywords.length > 0 ? `
          <div class="news-keywords">
            ${keywords.map(k => `<span class="news-keyword">#${k.trim()}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ── 뉴스 피드 로딩 ──────────────────────────────────────────
function showLoading() {
  elements.newsFeed.innerHTML = `
    <div class="loading-spinner">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <p>데이터를 불러오는 중입니다...</p>
    </div>
  `;
}

function showEmpty(msg = '검색 결과가 없습니다.') {
  elements.newsFeed.innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-newspaper"></i>
      <h3>${msg}</h3>
      <p>다른 검색어나 필터 조건을 시도해 보세요.</p>
    </div>
  `;
}

async function loadArticles(params = {}) {
  showLoading();

  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== 'all') qs.set(k, v); });
  qs.set('page', state.currentPage);
  qs.set('limit', state.pageSize);

  const data = await apiFetch(`/api/articles?${qs.toString()}`);

  if (!data || !data.success) {
    showEmpty('데이터 로드 실패');
    return;
  }

  state.totalArticles = data.total;
  state.totalPages = data.totalPages;

  // 결과 정보 업데이트
  const query = params.query || '';
  elements.resultInfo.innerHTML = `
    총 <strong>${data.total.toLocaleString()}</strong>건 
    ${query ? `<span style="color:#888">· "${query}" 검색 결과</span>` : ''}
    · ${state.currentPage}/${data.totalPages || 1} 페이지
  `;

  if (data.data.length === 0) {
    showEmpty();
    renderPagination(0, 1);
    return;
  }

  // 카드 렌더링
  elements.newsFeed.innerHTML = data.data.map(a => renderNewsCard(a, query)).join('');

  // 클릭 이벤트
  elements.newsFeed.querySelectorAll('.news-card').forEach(card => {
    card.addEventListener('click', () => openArticleModal(card.dataset.id));
  });

  renderPagination(data.total, data.totalPages);
}

// ── 탭별 로딩 ────────────────────────────────────────────────
function loadByTab(tab) {
  state.currentPage = 1;
  const base = {};

  switch (tab) {
    case 'latest':
      loadArticles({});
      break;
    case 'law':
      loadArticles({ category: '법령·제도' });
      break;
    case 'policy':
      loadArticles({ category: '정책' });
      break;
    case 'disaster':
      loadArticles({ category: '중대재해' });
      break;
    default:
      loadArticles({});
  }
}

// ── 페이지네이션 ─────────────────────────────────────────────
function renderPagination(total, totalPages) {
  const pag = elements.pagination;
  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  const cur = state.currentPage;
  const maxVisible = 7;
  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, cur - half);
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

  let html = '';
  html += `<button class="page-btn ${cur === 1 ? 'disabled' : ''}" data-page="${cur - 1}"><i class="fa-solid fa-chevron-left"></i></button>`;

  if (start > 1) {
    html += `<button class="page-btn" data-page="1">1</button>`;
    if (start > 2) html += `<span style="color:#a0aec0;padding:0 4px;">...</span>`;
  }

  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === cur ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  if (end < totalPages) {
    if (end < totalPages - 1) html += `<span style="color:#a0aec0;padding:0 4px;">...</span>`;
    html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
  }

  html += `<button class="page-btn ${cur === totalPages ? 'disabled' : ''}" data-page="${cur + 1}"><i class="fa-solid fa-chevron-right"></i></button>`;
  pag.innerHTML = html;

  pag.querySelectorAll('.page-btn:not(.disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p && p !== state.currentPage) {
        state.currentPage = p;
        const params = buildSearchParams();
        loadArticles(params);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

// ── 검색 파라미터 빌드 ──────────────────────────────────────
function buildSearchParams() {
  const params = {};
  const query = elements.searchQuery.value.trim();
  const category = elements.filterCategory.value;
  const source = elements.filterSource.value;

  if (query) params.query = query;
  if (category && category !== 'all') params.category = category;
  if (source && source !== 'all') params.source = source;

  const activeTab = $$('.date-tab.active')?.dataset.tab || 'range';

  if (activeTab === 'range') {
    if (elements.dateFrom.value) params.dateFrom = elements.dateFrom.value;
    if (elements.dateTo.value) params.dateTo = elements.dateTo.value;
  } else if (activeTab === 'year') {
    const year = elements.filterYear.value;
    if (year) params.dateYear = year;
  } else if (activeTab === 'month') {
    const year = elements.filterMonthYear.value;
    const month = elements.filterMonth.value;
    if (year) params.dateYear = year;
    if (month) params.dateMonth = month;
  } else if (activeTab === 'day') {
    const day = elements.filterDay.value;
    if (day) {
      const [y, m, d] = day.split('-');
      params.dateYear = y; params.dateMonth = m; params.dateDay = d;
    }
  } else if (activeTab === 'hour') {
    const date = elements.filterHourDate.value;
    const hour = elements.filterHour.value;
    if (date && hour !== '') {
      params.dateHour = `${date} ${hour}`;
    }
  }

  // 현재 탭 카테고리 반영 (검색이 아닌 경우)
  if (!query && !params.category) {
    const tab = state.currentTab;
    if (tab === 'law') params.category = '법령·제도';
    else if (tab === 'policy') params.category = '정책';
    else if (tab === 'disaster') params.category = '중대재해';
  }

  return params;
}

// ── 검색 실행 ────────────────────────────────────────────────
function executeSearch() {
  const params = buildSearchParams();
  state.currentPage = 1;

  // 검색어가 있으면 검색 결과 탭 표시
  const hasSearch = params.query || params.dateFrom || params.dateTo ||
    params.dateYear || params.dateHour;

  if (hasSearch) {
    elements.tabSearchResult.style.display = 'flex';
    setActiveTab('search-result');
  }

  state.searchParams = params;
  loadArticles(params);
}

// ── 초기화 ───────────────────────────────────────────────────
function resetSearch() {
  elements.searchQuery.value = '';
  elements.filterCategory.value = 'all';
  elements.filterSource.value = 'all';
  elements.dateFrom.value = '';
  elements.dateTo.value = '';
  elements.filterYear.value = '';
  elements.filterMonthYear.value = '';
  elements.filterMonth.value = '';
  elements.filterDay.value = '';
  elements.filterHourDate.value = '';
  elements.filterHour.value = '';

  elements.tabSearchResult.style.display = 'none';
  state.currentPage = 1;
  state.searchParams = {};
  setActiveTab('latest');
  loadArticles({});
}

// ── 탭 전환 ──────────────────────────────────────────────────
function setActiveTab(tabName) {
  state.currentTab = tabName;
  $$$(`.tab-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
}

// ── 기사 상세 모달 ───────────────────────────────────────────
async function openArticleModal(id) {
  const data = await apiFetch(`/api/articles/${id}`);
  if (!data || !data.success) { showToast('기사를 불러올 수 없습니다.', 'error'); return; }

  const a = data.data;
  elements.modalTitle.textContent = a.title || '';
  elements.modalContent.textContent = a.content || a.summary || '내용이 없습니다.';
  elements.modalCategory.textContent = a.category || '기타';
  elements.modalCategory.style.background = getCategoryColor(a.category);
  elements.modalSource.textContent = a.source || '';
  elements.modalDate.textContent = formatFullDate(a.published_at);
  elements.modalLink.href = a.url || '#';

  elements.articleModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeArticleModal() {
  elements.articleModal.classList.remove('open');
  document.body.style.overflow = '';
}

// ── 대시보드 통계 로딩 ───────────────────────────────────────
async function loadDashboard() {
  const data = await apiFetch('/api/stats/dashboard');
  if (!data || !data.success) return;

  const d = data.data;
  elements.statTotal.textContent = (d.total || 0).toLocaleString();
  elements.statToday.textContent = (d.today || 0).toLocaleString();
  elements.statHour.textContent = (d.thisHour || 0).toLocaleString();

  // 마지막 업데이트 시간
  if (d.lastCrawl) {
    elements.lastUpdateTime.textContent = `최종 업데이트: ${formatDate(d.lastCrawl)}`;
  } else {
    elements.lastUpdateTime.textContent = '업데이트 대기 중';
  }

  // 카테고리 목록
  if (d.categories && d.categories.length > 0) {
    elements.categoryList.innerHTML = d.categories.map(c => `
      <li data-category="${c.category}" ${state.filterCategory === c.category ? 'class="active"' : ''}>
        <span class="cat-name">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${getCategoryColor(c.category)};margin-right:6px;"></span>
          ${c.category}
        </span>
        <span class="cat-count">${c.count}</span>
      </li>
    `).join('');

    elements.categoryList.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        const cat = li.dataset.category;
        elements.filterCategory.value = cat;
        elements.tabSearchResult.style.display = 'flex';
        setActiveTab('search-result');
        state.currentPage = 1;
        const params = { category: cat };
        state.searchParams = params;
        loadArticles(params);
        // 활성 상태
        elements.categoryList.querySelectorAll('li').forEach(l => l.classList.remove('active'));
        li.classList.add('active');
      });
    });
  }

  // 출처 필터 업데이트
  if (d.sources && d.sources.length > 0) {
    const currentSource = elements.filterSource.value;
    elements.filterSource.innerHTML = '<option value="all">전체 출처</option>';
    
    // 출처 카테고리별 그룹화
    const grouped = {};
    d.sources.forEach(s => {
      const cat = s.source_category || '기타';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(s);
    });

    Object.entries(grouped).forEach(([cat, sources]) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = cat;
      sources.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.source;
        opt.textContent = `${s.source} (${s.count})`;
        if (s.source === currentSource) opt.selected = true;
        optgroup.appendChild(opt);
      });
      elements.filterSource.appendChild(optgroup);
    });
  }

  // 크롤링 상태 업데이트
  const sched = d.scheduler;
  if (sched) {
    if (sched.isRunning) {
      elements.crawlStatusBadge.className = 'crawl-status-badge running';
      elements.crawlStatusBadge.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:10px"></i> 수집 중';
    } else {
      elements.crawlStatusBadge.className = 'crawl-status-badge idle';
      elements.crawlStatusBadge.textContent = '대기 중';
    }
    elements.crawlLastTime.textContent = sched.lastRunTime ? formatDate(sched.lastRunTime) : '-';
    elements.crawlNextTime.textContent = sched.nextRunTime
      ? new Date(sched.nextRunTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : '-';
  }
}

// ── 출처 & 연도 필터 초기화 ─────────────────────────────────
async function initFilters() {
  const data = await apiFetch('/api/filters');
  if (!data || !data.success) return;

  // 연도 필터 채우기
  if (data.data.dateRange) {
    const { minDate, maxDate } = data.data.dateRange;
    const minYear = minDate ? parseInt(minDate.substring(0, 4)) : 2023;
    const maxYear = maxDate ? parseInt(maxDate.substring(0, 4)) : new Date().getFullYear();

    const years = [];
    for (let y = maxYear; y >= minYear; y--) years.push(y);

    [elements.filterYear, elements.filterMonthYear].forEach(sel => {
      sel.innerHTML = '<option value="">연도 선택</option>';
      years.forEach(y => sel.innerHTML += `<option value="${y}">${y}년</option>`);
    });
  }
}

// ── 수동 크롤링 ─────────────────────────────────────────────
async function manualCrawl() {
  const btn = elements.btnManualCrawl;
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    const data = await apiFetch('/api/crawl/run');
    if (!data) throw new Error('응답 없음');

    showToast('업데이트를 시작했습니다. 잠시 후 새 기사가 표시됩니다.', 'success');

    // 30초 후 새로고침
    setTimeout(() => {
      loadDashboard();
      const params = buildSearchParams();
      loadArticles(params);
    }, 30000);
  } catch (e) {
    showToast('업데이트 요청 실패: ' + e.message, 'error');
  } finally {
    setTimeout(() => {
      btn.classList.remove('loading');
      btn.disabled = false;
    }, 3000);
  }
}

// ── 자동 새로고침 (5분마다 통계 갱신) ────────────────────────
function startAutoRefresh() {
  state.autoRefreshTimer = setInterval(async () => {
    await loadDashboard();
    // 최신 뉴스 탭이면 자동으로 목록 갱신
    if (state.currentTab === 'latest' && state.currentPage === 1) {
      loadArticles(state.searchParams);
    }
    elements.lastUpdateTime.textContent = `자동 새로고침: ${new Date().toLocaleTimeString('ko-KR')}`;
  }, 5 * 60 * 1000); // 5분
}

// ── 날짜 탭 전환 ─────────────────────────────────────────────
function initDateTabs() {
  $$$(`.date-tab`).forEach(tab => {
    tab.addEventListener('click', () => {
      $$$(`.date-tab`).forEach(t => t.classList.remove('active'));
      $$$(`.date-tab-content`).forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      $$(`#tab-${tab.dataset.tab}`)?.classList.add('active');
    });
  });
}

// ── 이벤트 바인딩 ────────────────────────────────────────────
function bindEvents() {
  // 검색 버튼
  elements.btnApplySearch.addEventListener('click', executeSearch);
  elements.btnSearch.addEventListener('click', executeSearch);
  elements.btnReset.addEventListener('click', resetSearch);

  // 엔터 키 검색
  elements.searchQuery.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeSearch();
  });

  // 탭 클릭
  $$$(`.tab-btn[data-tab]`).forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'search-result') {
        setActiveTab(tab);
        state.currentPage = 1;
        loadArticles(state.searchParams);
      } else {
        setActiveTab(tab);
        state.currentPage = 1;
        loadByTab(tab);
      }
    });
  });

  // 정렬/페이지 크기
  elements.sortOrder.addEventListener('change', () => {
    state.currentPage = 1;
    const params = buildSearchParams();
    loadArticles(params);
  });

  elements.pageSize.addEventListener('change', () => {
    state.pageSize = parseInt(elements.pageSize.value);
    state.currentPage = 1;
    const params = buildSearchParams();
    loadArticles(params);
  });

  // 수동 업데이트
  elements.btnManualCrawl.addEventListener('click', manualCrawl);

  // 모달 닫기
  elements.modalClose.addEventListener('click', closeArticleModal);
  elements.articleModal.addEventListener('click', (e) => {
    if (e.target === elements.articleModal) closeArticleModal();
  });

  // ESC 키
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeArticleModal();
  });
}

// ── 초기화 ───────────────────────────────────────────────────
async function init() {
  console.log('[KOSHA 모니터링] 시스템 초기화...');

  // 이벤트 바인딩
  bindEvents();
  initDateTabs();

  // 데이터 로드
  await loadDashboard();
  await initFilters();

  // 최신 뉴스 로드
  loadByTab('latest');

  // 자동 새로고침 시작
  startAutoRefresh();

  console.log('[KOSHA 모니터링] 초기화 완료');
}

// DOM 로드 완료 시 시작
document.addEventListener('DOMContentLoaded', init);
