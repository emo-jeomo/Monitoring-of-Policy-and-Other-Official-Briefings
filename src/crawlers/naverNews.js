/**
 * 구글뉴스 RSS + 산업안전 전문지 RSS 크롤러
 * 산업안전보건 관련 기사를 누락 없이 폭넓게 수집 후 엄격 필터링
 */
const RSSParser = require('rss-parser');
const { insertArticle, saveCrawlLog } = require('../models/database');

const parser = new RSSParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; KOSHA-Monitor/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

// ── 구글뉴스 검색 쿼리 (산업안전보건 전 영역 커버) ─────────────
const SEARCH_QUERIES = [
  // 중대재해 (최우선)
  { q: '중대재해처벌법', cat: '중대재해', weight: 10 },
  { q: '중대재해 사망 기소', cat: '중대재해', weight: 10 },
  { q: '중대재해 구속 입건', cat: '중대재해', weight: 9 },
  { q: '중대재해처벌 판결 선고', cat: '중대재해', weight: 9 },

  // 법령·제도
  { q: '산업안전보건법 개정', cat: '법령·제도', weight: 9 },
  { q: '안전보건 고시 시행규칙', cat: '법령·제도', weight: 8 },
  { q: '산업재해보상보험법', cat: '법령·제도', weight: 7 },
  { q: '위험기계 안전인증 고시', cat: '법령·제도', weight: 6 },

  // 산업재해·사고 (사고 유형별 세분화)
  { q: '산업재해 사망 근로자', cat: '산업재해·안전', weight: 9 },
  { q: '공사현장 추락 사망', cat: '산업재해·안전', weight: 9 },
  { q: '건설현장 추락 사망', cat: '산업재해·안전', weight: 8 },
  { q: '사업장 사망사고 노동자', cat: '산업재해·안전', weight: 8 },
  { q: '끼임 사망 중대재해', cat: '산업재해·안전', weight: 8 },
  { q: '감전 사망 산업재해', cat: '산업재해·안전', weight: 7 },
  { q: '질식 사망 밀폐공간', cat: '산업재해·안전', weight: 7 },
  { q: '폭발사고 사업장 사망', cat: '산업재해·안전', weight: 7 },
  { q: '외국인 근로자 사망 산재', cat: '산업재해·안전', weight: 7 },
  { q: '이주노동자 산업재해 사망', cat: '산업재해·안전', weight: 7 },
  { q: '근로자 안전사고 작업중지', cat: '산업재해·안전', weight: 6 },
  { q: '위험성평가 안전보건', cat: '산업재해·안전', weight: 6 },
  { q: '중대재해 수사 압수수색', cat: '중대재해', weight: 8 },

  // 직업보건·화학
  { q: '직업병 인정 산업보건', cat: '직업보건·화학', weight: 8 },
  { q: '화학물질 사고 사업장', cat: '직업보건·화학', weight: 7 },
  { q: '작업환경 유해물질 노출', cat: '직업보건·화학', weight: 7 },
  { q: '석면 직업성암 소송', cat: '직업보건·화학', weight: 6 },
  { q: '소음성난청 직업병 인정', cat: '직업보건·화학', weight: 6 },
  { q: '근골격계 질환 업무상질병', cat: '직업보건·화학', weight: 6 },
  { q: '유해화학물질 누출 사고', cat: '직업보건·화학', weight: 7 },
  { q: '작업환경측정 특수건강검진', cat: '직업보건·화학', weight: 5 },

  // 기관·정책
  { q: '안전보건공단 KOSHA', cat: '기관동향', weight: 8 },
  { q: '고용노동부 산업안전 정책', cat: '정책·브리핑', weight: 8 },
  { q: '고용노동부 근로감독 특별', cat: '정책·브리핑', weight: 7 },
  { q: '산업안전 예산 지원사업', cat: '정책·브리핑', weight: 5 },
];

// ── 산업안전 전문지·기관 RSS 직접 수집 ─────────────────────────
// 구글뉴스 RSS에 포착되지 않는 전문지 기사 커버
const DIRECT_RSS_SOURCES = [
  // 전문 미디어
  { url: 'https://www.safety.co.kr/rss/allArticle.xml',    name: '안전저널',           sc: '전문지', cat: '산업재해·안전' },
  { url: 'https://www.safetynews.co.kr/rss/allArticle.xml',name: '안전신문',           sc: '전문지', cat: '산업재해·안전' },
  { url: 'https://www.labortoday.co.kr/rss/allArticle.xml',name: '매일노동뉴스',       sc: '전문지', cat: '산업재해·안전' },
  { url: 'https://www.iloha.kr/rss/S1N10.xml',             name: '이로운넷',           sc: '전문지', cat: '직업보건·화학' },
  { url: 'https://www.safetykorea.kr/rss/allArticle.xml',  name: '세이프티퍼스트닷뉴스', sc: '전문지', cat: '산업재해·안전' },
  // 노동전문지
  { url: 'https://www.nodong.or.kr/rss/allArticle.xml',    name: '노동과세계',         sc: '전문지', cat: '정책·브리핑' },
  // 경제지 산업안전 섹션
  { url: 'https://rss.hankyung.com/economy.xml',           name: '한국경제',           sc: '경제지', cat: '정책·브리핑' },
];

// ── 필수 키워드 (하나 이상 포함 필수) ──────────────────────────
const REQUIRED_KEYWORDS = [
  // 산업안전보건 핵심
  '산업안전', '안전보건', '산업재해', '중대재해', '직업병', '직업성',
  '화학물질', '유해물질', '작업환경', '노출기준', '안전보건공단',
  'KOSHA', '고용노동부', '근로감독', '위험성평가', '보건관리',
  '안전관리자', '중대산업', '사업장 안전', '근로자 사망', '추락사망',
  '산재', '산업보건', '근골격계', '직업성질환', '화학사고',
  '유해위험', '안전교육', '안전불감', '산재보험', '작업중지',
  // 사고 유형 복합 키워드 (띄어쓰기 패턴 포함)
  '추락 사망', '추락해 숨', '추락사고', '추락해 중상',
  '끼임 사망', '끼임사고', '끼임 부상',
  '감전 사망', '감전사고', '감전 부상',
  '질식 사망', '질식사고',
  '폭발사고', '화재 사망',
  '사망사고',
  // 사고 유형 단독 (컨텍스트 체크 병행)
  '추락', '끼임', '감전', '질식',
  // 업무상 질병·재해
  '업무상질병', '업무상재해', '직업성질환', '특수건강검진', '물질안전보건',
  'MSDS', '허용기준', '진폐', '과로사', '뇌심혈관',
  // 외국인 노동자
  '이주노동자 안전', '외국인 근로자 산재',
  // 법·제도
  '안전인증', '자율안전확인', '위험기계',
];

// ── 제외 키워드 (무관 분야) ─────────────────────────────────────
const EXCLUDE_KEYWORDS = [
  '교통사고', '음주운전', '자살', '살인', '강도', '절도',
  '연예', '스포츠', '날씨', '증시', '주식', '부동산', '아파트',
  '대학입시', '수능', '교육청', '캠핑', '여행', '맛집', '레시피',
  '민생회복', '선거', '외교', '국방', '황제', '왕',
  '양육비', '카드포인트', '영화', '공연', '스타트업', '벤처',
  '연금', '의료보험', '건강보험', '코로나', '독감',
  '사기', '횡령', '뇌물', '비리', '부패',
  // 비산업 추락/사고 노이즈
  '놀이동산', '롤러코스터', '스키장', '등산', '낙상', '번지점프',
  '항공기', '산악', '익스트림',
];

// ── 사고 유형 단독 키워드 컨텍스트 체크 ────────────────────────
const ACCIDENT_TYPE_KEYWORDS = ['추락', '끼임', '감전', '질식'];
const ACCIDENT_CONTEXT_KEYWORDS = [
  '사업장', '공사', '현장', '근로자', '작업자', '노동자', '공장',
  '건설', '작업', '숨져', '숨졌', '숨진', '산업현장', '작업장',
  '제조', '조선소', '항만', '물류센터',
];

// ── 긴급 키워드 (사망자 다수·구조적 문제 → 긴급 배지) ──────────
const URGENT_KEYWORDS = [
  '명 사망', '사망자', '수십 명', '다수 사망', '대규모', '연속 사망',
  '올해만', '또 사망', '반복 사망', '처음', '첫 구속',
];

// ── 언론사 분류 (확장) ────────────────────────────────────────
const SOURCE_CAT = {
  '연합뉴스': '통신사', '뉴시스': '통신사', '뉴스1': '통신사',
  '조선일보': '종합일간지', '중앙일보': '종합일간지', '동아일보': '종합일간지',
  '한겨레': '종합일간지', '경향신문': '종합일간지', '한국일보': '종합일간지',
  '국민일보': '종합일간지', '서울신문': '종합일간지', '문화일보': '종합일간지',
  '세계일보': '종합일간지',
  'KBS': '방송', 'MBC': '방송', 'SBS': '방송', 'YTN': '방송', 'JTBC': '방송',
  'KBS뉴스': '방송', 'MBC뉴스': '방송', 'SBS뉴스': '방송',
  '매일경제': '경제지', '한국경제': '경제지', '서울경제': '경제지',
  '매일노동뉴스': '전문지', '안전저널': '전문지', '안전신문': '전문지',
  '이로운넷': '전문지', '세이프티퍼스트닷뉴스': '전문지', '안전정보': '전문지',
  '노동과세계': '전문지', '아웃소싱타임스': '전문지', '누리일보': '전문지',
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function isRelevant(title, content) {
  const text = (title + ' ' + (content || '')).toLowerCase();
  const titleLower = title.toLowerCase();

  // 1. 제외 키워드 체크 (제목 기준)
  if (EXCLUDE_KEYWORDS.some(kw => titleLower.includes(kw.toLowerCase()))) return false;

  // 2. 명시적 필수 키워드 체크
  if (REQUIRED_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))) return true;

  // 3. 사고 유형 단독 + 사업장 컨텍스트 복합 체크
  const hasAccidentType = ACCIDENT_TYPE_KEYWORDS.some(kw => titleLower.includes(kw));
  const hasContext = ACCIDENT_CONTEXT_KEYWORDS.some(ctx => text.includes(ctx));
  if (hasAccidentType && hasContext) return true;

  return false;
}

function isUrgent(title, content) {
  const text = title + ' ' + (content || '');
  return URGENT_KEYWORDS.some(kw => text.includes(kw));
}

function extractCategory(title, content, defaultCat) {
  const text = title + ' ' + (content || '');
  if (/중대재해처벌|중대재해/.test(text)) return '중대재해';
  if (/산업재해|재해예방|재해사고|추락사|추락해|추락 사망|추락사고|끼임|끼임사고|끼임 사망|감전사|감전사고|감전 사망|질식사고|질식 사망|건설현장|공사현장|사업장 사망|사망사고|이주노동자|외국인 근로자/.test(text)) return '산업재해·안전';
  if (/화학물질|유해물질|화학사고|화학안전|직업병|직업성|석면|소음성|근골격|작업환경|유해환경|MSDS|허용기준|업무상질병|진폐|과로사|뇌심혈관/.test(text)) return '직업보건·화학';
  if (/법령|고시|시행령|시행규칙|개정|입법|법안|규칙|자율안전확인|안전인증/.test(text)) return '법령·제도';
  if (/정책|계획|추진|발표|브리핑|지원사업|보도자료|예산|국정감사/.test(text)) return '정책·브리핑';
  if (/안전보건공단|KOSHA/.test(text)) return '기관동향';
  return defaultCat || '산업재해·안전';
}

function toKST(dateStr, updatedStr) {
  const base = updatedStr || dateStr;
  if (!base) return new Date().toISOString().replace('T', ' ').substring(0, 19);
  try {
    const d = new Date(base);
    if (isNaN(d.getTime())) return new Date().toISOString().replace('T', ' ').substring(0, 19);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().replace('T', ' ').substring(0, 19);
  } catch {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }
}

// ── 구글뉴스 RSS 수집 ────────────────────────────────────────────
async function crawlGoogleNews() {
  let total = 0;
  for (const { q, cat } of SEARCH_QUERIES) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
      const feed = await parser.parseURL(url).catch(() => null);
      if (!feed?.items) { await delay(300); continue; }

      for (const item of feed.items.slice(0, 20)) {
        const rawTitle = (item.title || '').replace(/<[^>]*>/g, '').trim();
        const titleParts = rawTitle.split(/\s*[-–]\s*/);
        const source = titleParts.length > 1 ? titleParts.pop().trim() : '기타';
        const title = titleParts.join(' - ').trim();
        const snippet = item.contentSnippet || '';

        if (!isRelevant(title, snippet)) continue;

        let articleUrl = (item.link || '').replace('/rss/articles/', '/articles/');
        if (!articleUrl.startsWith('http')) continue;

        const category = extractCategory(title, snippet, cat);
        const urgent = isUrgent(title, snippet);
        const kws = REQUIRED_KEYWORDS.filter(k => (title + snippet).includes(k)).slice(0, 5);
        const kwStr = urgent ? (kws.join(',') || q) + ',긴급' : (kws.join(',') || q);

        try {
          const pubKST = toKST(item.pubDate, item.updated || item.isoDate);
          const r = insertArticle.run({
            title,
            content: snippet,
            summary: snippet.substring(0, 300),
            url: articleUrl,
            source,
            source_category: SOURCE_CAT[source] || '언론',
            category,
            keywords: kwStr,
            author: source,
            image_url: null,
            published_at: pubKST,
          });
          if (r.changes > 0) total++;
        } catch { /* 중복 무시 */ }
      }
      await delay(500);
    } catch (e) {
      console.error(`[구글뉴스] "${q}" 오류:`, e.message);
    }
  }
  return total;
}

// ── 전문지 직접 RSS 수집 ─────────────────────────────────────────
async function crawlDirectRSS() {
  let total = 0;
  for (const src of DIRECT_RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(src.url).catch(() => null);
      if (!feed?.items) { await delay(300); continue; }

      for (const item of feed.items.slice(0, 25)) {
        const title = (item.title || '').replace(/<[^>]*>/g, '').trim();
        const snippet = item.contentSnippet || item.content || '';

        if (!title || !isRelevant(title, snippet)) continue;

        const articleUrl = (item.link || '').trim();
        if (!articleUrl.startsWith('http')) continue;

        const category = extractCategory(title, snippet, src.cat);
        const urgent = isUrgent(title, snippet);
        const kws = REQUIRED_KEYWORDS.filter(k => (title + snippet).includes(k)).slice(0, 5);
        const kwStr = urgent ? (kws.join(',') || src.name) + ',긴급' : (kws.join(',') || src.name);

        try {
          const pubKST = toKST(item.pubDate, item.updated || item.isoDate);
          const r = insertArticle.run({
            title,
            content: snippet,
            summary: snippet.substring(0, 300),
            url: articleUrl,
            source: src.name,
            source_category: src.sc,
            category,
            keywords: kwStr,
            author: src.name,
            image_url: null,
            published_at: pubKST,
          });
          if (r.changes > 0) total++;
        } catch { /* 중복 무시 */ }
      }
      await delay(500);
    } catch (e) {
      console.error(`[직접RSS] ${src.name} 오류:`, e.message);
    }
  }
  return total;
}

async function run() {
  console.log('[구글뉴스+전문지] 크롤링 시작...');
  let count = 0;
  try {
    const googleCount = await crawlGoogleNews();
    const directCount = await crawlDirectRSS();
    count = googleCount + directCount;
    console.log(`[구글뉴스] ${googleCount}건 | [전문지RSS] ${directCount}건 | 계 ${count}건`);
    saveCrawlLog('구글뉴스', 'success', count);
  } catch (e) {
    console.error('[구글뉴스+전문지] 오류:', e.message);
    saveCrawlLog('구글뉴스', 'error', 0, e.message);
  }
  return count;
}

module.exports = { run, crawlGoogleNews, crawlDirectRSS, isRelevant };
