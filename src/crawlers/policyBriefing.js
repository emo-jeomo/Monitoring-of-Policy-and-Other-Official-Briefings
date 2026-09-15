/**
 * 정책브리핑 / 정부기관 크롤러 (개선판)
 * 산업안전보건 관련 보도자료를 누락 없이 수집
 * - 고용노동부 RSS (산업안전 관련만)
 * - 안전보건공단 RSS (전량 수집)
 * - 정책브리핑 RSS (산업안전 관련만 필터)
 * - 환경부 화학안전 RSS
 * - 고용노동부 부서별 RSS (산업안전 전담부서)
 * - 국토안전관리원 RSS (건설안전 특화)
 * - 화학물질안전원 RSS (화학사고 특화)
 */
const RSSParser = require('rss-parser');
const { insertArticle, saveCrawlLog } = require('../models/database');

const parser = new RSSParser({
  timeout: 20000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; KOSHA-Monitor/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

// ── 산업안전보건 핵심 필터 키워드 ────────────────────────────────
const MUST_INCLUDE = [
  // 핵심 용어
  '산업안전', '안전보건', '산업재해', '중대재해', '중대산업재해',
  '직업병', '직업성', '직업성질환', '화학물질', '유해물질', '유해화학',
  '작업환경', '근로자 사망', '근로자 부상', '안전사고',
  // 사고 유형 (띄어쓰기 양쪽 패턴)
  '추락사망', '추락 사망', '추락해 숨', '추락사고', '추락 부상',
  '끼임 사망', '끼임사고', '끼임 부상', '끼임재해',
  '감전 사망', '감전사고', '감전 부상', '감전재해',
  '질식 사망', '질식사고', '밀폐공간',
  '폭발사고', '화재 사업장', '화재 사망 근로자',
  // 외국인·이주노동자 (신규)
  '이주노동자', '외국인 근로자 산재', '외국인 근로자 사망',
  '외국인 노동자 안전', '이주노동자 산업재해',
  // 교육·관리
  '안전교육', '위험성평가', '안전관리자', '보건관리자', '특수건강검진',
  'KOSHA', '안전보건공단', '근로감독', '작업중지',
  // 직업성 질환
  '진폐', '석면', '소음성난청', '근골격계', '과로사', '뇌심혈관',
  '열사병 사망', '온열질환 사망', '과로 사망',
  // 산재 보상
  '산재보험', '산재요양', '산재보상', '유족급여', '장해급여', '업무상질병',
  '업무상재해', '요양급여', '휴업급여',
  // 인증·기준
  '안전인증', '자율안전확인', '위험기계', '보호구',
  '물질안전보건자료', 'MSDS', '허용기준', '노출기준',
  // 건설·제조·서비스 업종별
  '건설안전', '제조업안전', '서비스업안전',
  '건설현장 사망', '공사현장 사망', '아파트 공사 사망',
  '조선소 사망', '제철소 사망', '석유화학 사고',
  // 기관 정책
  '산업안전보건법', '중대재해처벌법',
  '산업재해예방', '안전보건대책', '근로환경',
];

// ── 반드시 제외 (무관 분야) ──────────────────────────────────────
const MUST_EXCLUDE = [
  '날씨', '주식', '부동산', '아파트 분양', '대선', '총선', '외교', '국방',
  '연예', '스포츠', '요리', '레시피', '패션', '여행', '관광',
  '황제', '왕', '영화', '공연', '축제', '콘서트',
  '캠핑', '맛집', '카페', '사기', '횡령', '뇌물', '비리',
  '연금 개혁', '국민연금', '건강보험 요율', '코로나 백신', '독감 예방접종',
  '민생회복 쿠폰', '농업', '수산업', '임업', '어업',
  '국토교통', '주택정책', '교통정책', '철도', '항공',
  '문화체육', '교육부', '교육청', '입시', '수능',
  '복지 급여', '아동수당', '양육비', '출산지원',
];

function isRelevant(title, content = '') {
  const text = title + ' ' + content;
  // 제외 키워드 우선 체크 (제목 기준)
  for (const kw of MUST_EXCLUDE) {
    if (title.includes(kw)) return false;
  }
  // 필수 키워드 중 하나 이상 포함
  return MUST_INCLUDE.some(kw => text.includes(kw));
}

function categorize(title, content = '') {
  const text = title + ' ' + content;
  if (/중대재해처벌|중대재해/.test(text)) return '중대재해';
  if (/산업재해|재해예방|추락|끼임|감전|질식|폭발|건설현장|공사현장/.test(text)) return '산업재해·안전';
  if (/화학물질|유해화학|유해물질|화학사고|노출기준|MSDS|직업병|직업성|석면|소음성|근골격|진폐|과로|뇌심혈관|직업성질환|열사병|온열질환/.test(text)) return '직업보건·화학';
  if (/법령|고시|시행령|시행규칙|개정|입법|법률|제정/.test(text)) return '법령·제도';
  if (/안전보건공단|KOSHA/.test(text)) return '기관동향';
  if (/정책|계획|추진|발표|지원사업|대책|보도자료/.test(text)) return '정책·브리핑';
  return '산업재해·안전';
}

function extractKws(text) {
  return MUST_INCLUDE.filter(k => text.includes(k)).slice(0, 5).join(',') || '산업안전보건';
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * RSS pubDate → KST 시간 문자열 (UTC+9 보정)
 */
function toKST(pubDate, updatedDate) {
  const base = updatedDate || pubDate;
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

// ── 고용노동부 보도자료 RSS ───────────────────────────────────────
async function crawlMOEL() {
  let count = 0;
  // 고용노동부 공식 보도자료 + 부서별 RSS 다변화
  const sources = [
    { url: 'https://www.moel.go.kr/rss/pressRss.xml', name: '고용노동부', sc: '정부기관' },
    // 고용노동부 산업안전보건본부 보도자료 RSS (다른 경로 시도)
    { url: 'https://www.moel.go.kr/rss/allRss.xml', name: '고용노동부(전체)', sc: '정부기관' },
  ];

  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url).catch(() => null);
      if (!feed?.items) {
        console.log(`[고용노동부] RSS 응답 없음 (${src.url})`);
        await delay(500);
        continue;
      }
      let srcCount = 0;
      for (const item of feed.items.slice(0, 50)) {
        const title = (item.title || '').replace(/<[^>]*>/g, '').trim();
        const content = item.content || item.contentSnippet || item.summary || '';
        let url = item.link || item.guid || '';
        if (!title || !url) continue;
        if (url.startsWith('/')) url = 'https://www.moel.go.kr' + url;
        if (!url.startsWith('http')) continue;

        // 산업안전 관련만 수집
        if (!isRelevant(title, content)) continue;

        try {
          const r = insertArticle.run({
            title, content,
            summary: content.substring(0, 300),
            url, source: src.name, source_category: src.sc,
            category: categorize(title, content),
            keywords: extractKws(title + ' ' + content),
            author: src.name, image_url: null,
            published_at: toKST(item.pubDate, item.updated || item.isoDate),
          });
          if (r.changes > 0) { count++; srcCount++; }
        } catch (e) {}
      }
      console.log(`[고용노동부 ${src.name}] ${srcCount}건 수집`);
      await delay(1000);
    } catch (e) {
      console.error('[고용노동부] 오류:', e.message);
    }
  }
  return count;
}

// ── 안전보건공단 RSS (보도자료 / 공지사항 / 산업안전 교육) ──────────
async function crawlKOSHA() {
  let count = 0;
  const sources = [
    { url: 'https://www.kosha.or.kr/kosha/rss/press.do',  name: '안전보건공단', label: '보도자료' },
    { url: 'https://www.kosha.or.kr/kosha/rss/notice.do', name: '안전보건공단', label: '공지사항' },
  ];

  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url).catch(() => null);
      if (!feed?.items) {
        console.log(`[KOSHA ${src.label}] RSS 응답 없음`);
        continue;
      }
      let srcCount = 0;
      for (const item of feed.items.slice(0, 40)) {
        const title = (item.title || '').replace(/<[^>]*>/g, '').trim();
        const content = item.content || item.contentSnippet || '';
        let url = item.link || item.guid || '';
        if (!title || !url) continue;
        if (url.startsWith('/')) url = 'https://www.kosha.or.kr' + url;
        if (!url.startsWith('http')) continue;

        try {
          const r = insertArticle.run({
            title, content,
            summary: content.substring(0, 300),
            url, source: src.name, source_category: '기관',
            category: categorize(title, content),
            keywords: extractKws(title + ' ' + content) || 'KOSHA,안전보건공단',
            author: '안전보건공단', image_url: null,
            published_at: toKST(item.pubDate, item.updated || item.isoDate),
          });
          if (r.changes > 0) { count++; srcCount++; }
        } catch (e) {}
      }
      console.log(`[KOSHA ${src.label}] ${srcCount}건 수집`);
      await delay(800);
    } catch (e) {
      console.error(`[KOSHA ${src.label}] 오류:`, e.message);
    }
  }
  console.log(`[안전보건공단] 총 ${count}건 수집`);
  return count;
}

// ── 정책브리핑 RSS (산업안전 관련만) ─────────────────────────────
async function crawlPolicyBriefing() {
  let count = 0;
  const sources = [
    {
      url: 'https://www.korea.kr/rss/pressRelease.xml',
      name: '정책브리핑',
      sc: '정부기관',
      // 고용노동부 관련 보도자료 우선 필터
      filterByMinistry: ['고용노동부', '안전보건', '산업안전', '노동부'],
    },
    {
      url: 'https://www.korea.kr/rss/news.xml',
      name: '정책브리핑(뉴스)',
      sc: '정부기관',
      filterByMinistry: null,
    },
  ];

  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url).catch(() => null);
      if (!feed?.items) {
        console.log(`[정책브리핑] ${src.name} RSS 응답 없음`);
        continue;
      }

      let srcCount = 0;
      for (const item of feed.items.slice(0, 60)) {
        const title = (item.title || '').replace(/<[^>]*>/g, '').trim();
        const content = item.content || item.contentSnippet || item.summary || '';
        const url = item.link || item.guid || '';
        if (!title || !url || !url.startsWith('http')) continue;

        // 산업안전보건 관련 필터 (엄격 적용)
        if (!isRelevant(title, content)) continue;

        // 부처 필터 (있는 경우)
        if (src.filterByMinistry) {
          const combined = title + content;
          const hasMinistry = src.filterByMinistry.some(m => combined.includes(m));
          if (!hasMinistry) continue;
        }

        try {
          const r = insertArticle.run({
            title, content,
            summary: content.substring(0, 300),
            url, source: src.name, source_category: src.sc,
            category: categorize(title, content),
            keywords: extractKws(title + ' ' + content),
            author: src.name, image_url: null,
            published_at: toKST(item.pubDate, item.updated || item.isoDate),
          });
          if (r.changes > 0) { count++; srcCount++; }
        } catch (e) {}
      }
      console.log(`[${src.name}] ${srcCount}건 수집`);
      await delay(1000);
    } catch (e) {
      console.error(`[정책브리핑] ${src.name} 오류:`, e.message);
    }
  }
  return count;
}

// ── 환경부 화학물질 관련 ─────────────────────────────────────────
async function crawlMOE() {
  let count = 0;
  const chemKws = [
    '화학물질', '유해화학', '화학사고', '화학안전', 'REACH',
    '석면', '다이옥신', '중금속 오염', '화학물질관리',
    '유해화학물질', '화학물질 누출', '화학 폭발', '독성가스',
  ];
  try {
    const feed = await parser.parseURL('https://www.me.go.kr/home/rss/newsRss.jsp').catch(() => null);
    if (!feed?.items) return 0;

    let cnt = 0;
    for (const item of feed.items.slice(0, 40)) {
      const title = (item.title || '').replace(/<[^>]*>/g, '').trim();
      const content = item.contentSnippet || '';
      const url = item.link || '';
      if (!chemKws.some(k => (title + content).includes(k))) continue;
      if (!url.startsWith('http')) continue;

      try {
        const r = insertArticle.run({
          title, content,
          summary: content.substring(0, 300),
          url, source: '환경부', source_category: '정부기관',
          category: '직업보건·화학',
          keywords: '화학물질,환경부,화학안전',
          author: '환경부', image_url: null,
          published_at: toKST(item.pubDate, item.updated || item.isoDate),
        });
        if (r.changes > 0) { count++; cnt++; }
      } catch (e) {}
    }
    console.log(`[환경부] ${cnt}건 수집`);
  } catch (e) {
    console.error('[환경부] 오류:', e.message);
  }
  return count;
}

// ── 국토안전관리원 RSS (건설현장 안전 특화) ───────────────────────
async function crawlKICT() {
  let count = 0;
  const sources = [
    // 국토안전관리원 소식 (건설안전 특화)
    { url: 'https://www.kalis.or.kr/rss/allArticle.xml', name: '국토안전관리원', sc: '기관' },
  ];
  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url).catch(() => null);
      if (!feed?.items) { console.log(`[${src.name}] RSS 응답 없음`); continue; }
      let cnt = 0;
      for (const item of feed.items.slice(0, 30)) {
        const title = (item.title || '').replace(/<[^>]*>/g, '').trim();
        const content = item.contentSnippet || item.content || '';
        let url = item.link || item.guid || '';
        if (!title || !url || !url.startsWith('http')) continue;
        try {
          const r = insertArticle.run({
            title, content,
            summary: content.substring(0, 300),
            url, source: src.name, source_category: src.sc,
            category: '산업재해·안전',
            keywords: '건설안전,국토안전관리원,건설현장',
            author: src.name, image_url: null,
            published_at: toKST(item.pubDate, item.isoDate),
          });
          if (r.changes > 0) { count++; cnt++; }
        } catch (e) {}
      }
      console.log(`[${src.name}] ${cnt}건 수집`);
      await delay(800);
    } catch (e) {
      console.log(`[${src.name}] 수집 불가 (${e.message})`);
    }
  }
  return count;
}

// ── 화학물질안전원 RSS ────────────────────────────────────────────
async function crawlChemSafety() {
  let count = 0;
  const sources = [
    { url: 'https://www.nics.go.kr/rss/allArticle.xml', name: '화학물질안전원', sc: '기관' },
  ];
  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url).catch(() => null);
      if (!feed?.items) { console.log(`[${src.name}] RSS 응답 없음`); continue; }
      let cnt = 0;
      for (const item of feed.items.slice(0, 30)) {
        const title = (item.title || '').replace(/<[^>]*>/g, '').trim();
        const content = item.contentSnippet || item.content || '';
        let url = item.link || item.guid || '';
        if (!title || !url || !url.startsWith('http')) continue;
        try {
          const r = insertArticle.run({
            title, content,
            summary: content.substring(0, 300),
            url, source: src.name, source_category: src.sc,
            category: '직업보건·화학',
            keywords: '화학물질,화학사고,화학안전원',
            author: src.name, image_url: null,
            published_at: toKST(item.pubDate, item.isoDate),
          });
          if (r.changes > 0) { count++; cnt++; }
        } catch (e) {}
      }
      console.log(`[${src.name}] ${cnt}건 수집`);
      await delay(800);
    } catch (e) {
      console.log(`[${src.name}] 수집 불가 (${e.message})`);
    }
  }
  return count;
}

async function run() {
  console.log('[정부기관] 크롤링 시작...');
  let total = 0;
  try {
    const mc = await crawlMOEL();
    total += mc; saveCrawlLog('고용노동부', 'success', mc);

    const kc = await crawlKOSHA();
    total += kc; saveCrawlLog('안전보건공단', 'success', kc);

    const pc = await crawlPolicyBriefing();
    total += pc; saveCrawlLog('정책브리핑', 'success', pc);

    const ec = await crawlMOE();
    total += ec; saveCrawlLog('환경부', 'success', ec);

    const kict = await crawlKICT();
    total += kict; saveCrawlLog('국토안전관리원', 'success', kict);

    const chem = await crawlChemSafety();
    total += chem; saveCrawlLog('화학물질안전원', 'success', chem);

    console.log(`[정부기관] 총 ${total}건 수집`);
  } catch (e) {
    console.error('[정부기관] 오류:', e.message);
    saveCrawlLog('정부기관', 'error', 0, e.message);
  }
  return total;
}

module.exports = { run, crawlMOEL, crawlKOSHA, crawlPolicyBriefing, isRelevant };
