/**
 * 구글 뉴스 RSS 크롤러
 * 산업안전보건 관련 기사만 엄격 필터링
 */
const RSSParser = require('rss-parser');
const { insertArticle, saveCrawlLog } = require('../models/database');

const parser = new RSSParser({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KOSHA-Monitor/1.0)' },
});

// ── 핵심 검색 키워드 (구글뉴스 RSS 쿼리용) ─────────────────
const SEARCH_QUERIES = [
  { q: '중대재해처벌법', cat: '중대재해', weight: 10 },
  { q: '중대재해 사망', cat: '중대재해', weight: 10 },
  { q: '산업안전보건법', cat: '법령·제도', weight: 9 },
  { q: '산업재해 사망 근로자', cat: '산업재해·안전', weight: 9 },
  { q: '안전보건공단 KOSHA', cat: '기관동향', weight: 8 },
  { q: '고용노동부 산업안전', cat: '정책·브리핑', weight: 8 },
  { q: '직업병 인정 산업', cat: '직업보건·화학', weight: 7 },
  { q: '화학물질 사고 사업장', cat: '직업보건·화학', weight: 7 },
  { q: '작업환경 유해물질', cat: '직업보건·화학', weight: 7 },
  { q: '산업재해보상보험', cat: '법령·제도', weight: 6 },
  { q: '근로자 안전사고', cat: '산업재해·안전', weight: 6 },
  { q: '건설현장 추락 사망', cat: '산업재해·안전', weight: 6 },
  { q: '위험성평가 안전보건', cat: '산업재해·안전', weight: 6 },
  { q: '안전보건 고시 개정', cat: '법령·제도', weight: 5 },
  { q: '석면 직업성암', cat: '직업보건·화학', weight: 5 },
  // ── 2026-09 추가: 공사현장·사업장 사망사고 누락 방지 ──
  { q: '공사현장 추락 사망', cat: '산업재해·안전', weight: 8 },
  { q: '사업장 사망사고 추락', cat: '산업재해·안전', weight: 7 },
  { q: '끼임 사망 중대재해', cat: '산업재해·안전', weight: 7 },
  { q: '감전 사망 산업재해', cat: '산업재해·안전', weight: 6 },
  { q: '질식 사망 밀폐공간', cat: '산업재해·안전', weight: 6 },
  { q: '폭발사고 사업장 사망', cat: '산업재해·안전', weight: 6 },
];

// ── 관련성 필터 - 이 키워드 중 하나 이상 포함 필수 ─────────
const REQUIRED_KEYWORDS = [
  '산업안전', '안전보건', '산업재해', '중대재해', '직업병', '직업성',
  '화학물질', '유해물질', '작업환경', '노출기준', '안전보건공단',
  'KOSHA', '고용노동부', '근로감독', '위험성평가', '보건관리',
  '안전관리자', '중대산업', '사업장 안전', '근로자 사망', '추락사망',
  '산재', '산업보건', '근골격계', '직업성질환', '화학사고',
  '유해위험', '안전교육', '안전불감', '산재보험', '작업중지',
  // ── 2026-09 추가: 사고 유형 단어 기반 수집 확대 ──
  '추락 사망', '추락해 숨', '추락사고',       // 추락 사망사고 (띄어쓰기 패턴)
  '끼임 사망', '끼임사고',                     // 끼임 사망사고
  '감전 사망', '감전사고',                     // 감전 사망사고
  '질식 사망', '질식사고',                     // 밀폐공간 질식
  '폭발사고', '화재 사망',                     // 폭발·화재 사망 (사업장 한정)
  '사망사고', '추락', '끼임', '감전', '질식', // 사고 유형 단독 키워드
];

// ── 제외 키워드 (무관한 분야) ──────────────────────────────
const EXCLUDE_KEYWORDS = [
  '교통사고', '음주운전', '자살', '살인', '강도', '절도',
  '연예', '스포츠', '날씨', '증시', '주식', '부동산', '아파트',
  '대학입시', '수능', '교육청', '캠핑', '여행', '맛집', '레시피',
  '민생회복', '선거', '정치', '외교', '국방', '황제', '왕',
  '양육비', '카드포인트', '영화', '공연', '스타트업', '벤처',
  '복지', '연금', '의료보험', '건강보험', '코로나', '독감',
  '사기', '횡령', '뇌물', '비리', '부패', '규제완화',
  // ── 2026-09 추가: 비산업 추락/사고 노이즈 제거 ──
  '놀이동산', '롤러코스터', '스키장', '등산', '낙상', '번지점프',
  '항공기', '엘리베이터 추락', '산악', '익스트림',
];

// ── 사고 유형 단독 키워드 (컨텍스트 확인 필요) ────────────
// 이 키워드들은 단독으로 있을 때 노이즈 가능성이 있어 산업안전 컨텍스트 동반 확인
const ACCIDENT_TYPE_KEYWORDS = ['추락', '끼임', '감전', '질식'];
// 산업안전 현장을 가리키는 컨텍스트 (범용 단어 '사고', '사망' 제외 — 놀이동산/등산 등 오탐 방지)
const ACCIDENT_CONTEXT_KEYWORDS = [
  '사업장', '공사', '현장', '근로자', '작업자', '노동자', '공장',
  '건설', '작업', '숨져', '숨졌', '숨진', '산업현장', '작업장',
];

function isRelevant(title, content) {
  const text = (title + ' ' + (content || '')).toLowerCase();

  // 제외 키워드 체크 (제목 기준)
  const titleLower = title.toLowerCase();
  if (EXCLUDE_KEYWORDS.some(kw => titleLower.includes(kw.toLowerCase()))) return false;

  // 필수 키워드 체크 (복합 키워드·명시적 키워드 우선 매칭)
  if (REQUIRED_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))) return true;

  // ── 사고 유형 단독 키워드: 사업장/현장 컨텍스트와 함께 있을 때만 수집 ──
  // 예: "울산 공사 현장서 50대 추락해 숨져" → 추락 + 현장 + 숨져 → 수집
  const hasAccidentType = ACCIDENT_TYPE_KEYWORDS.some(kw => titleLower.includes(kw));
  const hasContext = ACCIDENT_CONTEXT_KEYWORDS.some(ctx => text.includes(ctx));
  if (hasAccidentType && hasContext) return true;

  return false;
}

function extractCategory(title, content, defaultCat) {
  const text = title + ' ' + (content || '');
  if (/중대재해처벌|중대재해/.test(text)) return '중대재해';
  if (/산업재해|재해예방|재해사고|추락사|추락해|추락 사망|추락사고|끼임|끼임사고|끼임 사망|감전사|감전사고|감전 사망|질식사고|질식 사망|건설현장|공사현장|사업장 사망|사망사고/.test(text)) return '산업재해·안전';
  if (/화학물질|유해물질|화학사고|화학안전|직업병|직업성|석면|소음성|근골격|작업환경|유해환경/.test(text)) return '직업보건·화학';
  if (/법령|고시|시행령|시행규칙|개정|입법|법안|규칙/.test(text)) return '법령·제도';
  if (/정책|계획|추진|발표|브리핑|지원사업|보도자료/.test(text)) return '정책·브리핑';
  if (/안전보건공단|KOSHA/.test(text)) return '기관동향';
  return defaultCat || '산업재해·안전';
}

function extractSource(title) {
  const m = title.match(/[-–]\s*([^\-–]+)$/);
  return m ? m[1].trim() : '기타';
}

const SOURCE_CAT = {
  '연합뉴스': '통신사', '뉴시스': '통신사', '뉴스1': '통신사',
  '조선일보': '종합일간지', '중앙일보': '종합일간지', '동아일보': '종합일간지',
  '한겨레': '종합일간지', '경향신문': '종합일간지', '한국일보': '종합일간지',
  '국민일보': '종합일간지', '서울신문': '종합일간지', '문화일보': '종합일간지',
  'KBS': '방송', 'MBC': '방송', 'SBS': '방송', 'YTN': '방송', 'JTBC': '방송',
  '매일경제': '경제지', '한국경제': '경제지', '매일노동뉴스': '전문지',
  '안전저널': '전문지', '안전신문': '전문지', '이로운넷': '전문지',
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * RSS pubDate → KST 문자열 변환
 * RSS는 GMT(UTC) 기준으로 제공되므로 +9시간 보정
 * 수정일시(updated)가 있으면 우선 사용
 */
function toKST(dateStr, updatedStr) {
  // 수정일시 우선
  const base = updatedStr || dateStr;
  if (!base) return new Date().toISOString().replace('T', ' ').substring(0, 19);
  try {
    const d = new Date(base);
    if (isNaN(d.getTime())) return new Date().toISOString().replace('T', ' ').substring(0, 19);
    // KST = UTC + 9h
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().replace('T', ' ').substring(0, 19);
  } catch {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }
}

async function crawlGoogleNews() {
  let total = 0;
  for (const { q, cat, weight } of SEARCH_QUERIES) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
      const feed = await parser.parseURL(url).catch(() => null);
      if (!feed?.items) continue;

      for (const item of feed.items.slice(0, 20)) {
        const rawTitle = (item.title || '').replace(/<[^>]*>/g, '').trim();
        // 제목에서 언론사 분리
        const titleParts = rawTitle.split(/\s*[-–]\s*/);
        const source = titleParts.length > 1 ? titleParts.pop().trim() : '기타';
        const title = titleParts.join(' - ').trim();
        const snippet = item.contentSnippet || '';

        // 관련성 필터
        if (!isRelevant(title, snippet)) continue;

        // 구글뉴스 URL → /articles/ 형태로 변환 (브라우저 접근 가능)
        let articleUrl = (item.link || '').replace('/rss/articles/', '/articles/');
        if (!articleUrl.startsWith('http')) continue;

        const category = extractCategory(title, snippet, cat);
        const kws = REQUIRED_KEYWORDS.filter(k => (title + snippet).includes(k)).slice(0, 5);

        try {
          // 수정일시(updated/isoDate) 우선, 없으면 pubDate → KST 변환
          const pubKST = toKST(item.pubDate, item.updated || item.isoDate);
          const r = insertArticle.run({
            title,
            content: snippet,
            summary: snippet.substring(0, 300),
            url: articleUrl,
            source,
            source_category: SOURCE_CAT[source] || '언론',
            category,
            keywords: kws.join(',') || q,
            author: source,
            image_url: null,
            published_at: pubKST,
          });
          if (r.changes > 0) total++;
        } catch (e) { /* 중복 무시 */ }
      }
      await delay(600);
    } catch (e) {
      console.error(`[구글뉴스] "${q}" 오류:`, e.message);
    }
  }
  return total;
}

async function run() {
  console.log('[구글뉴스] 크롤링 시작...');
  let count = 0;
  try {
    count = await crawlGoogleNews();
    console.log(`[구글뉴스] ${count}건 수집`);
    saveCrawlLog('구글뉴스', 'success', count);
  } catch (e) {
    console.error('[구글뉴스] 오류:', e.message);
    saveCrawlLog('구글뉴스', 'error', 0, e.message);
  }
  return count;
}

module.exports = { run, crawlGoogleNews, isRelevant };
