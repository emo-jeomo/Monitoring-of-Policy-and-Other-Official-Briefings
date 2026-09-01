/**
 * 정책브리핑 / 정부기관 크롤러
 * 산업안전보건 관련 보도자료만 엄격 필터링 수집
 * - 고용노동부 RSS (산업안전 관련만)
 * - 안전보건공단 RSS (전량 수집)
 * - 정책브리핑 RSS (산업안전 관련만 필터)
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

// ── 산업안전보건 핵심 필터 키워드 ─────────────────────────────
const MUST_INCLUDE = [
  '산업안전', '안전보건', '산업재해', '중대재해', '중대산업재해',
  '직업병', '직업성', '직업성질환', '화학물질', '유해물질', '유해화학',
  '작업환경', '근로자 사망', '근로자 부상', '안전사고',
  '추락', '끼임', '감전', '질식', '폭발사고', '화재 사업장',
  '안전교육', '위험성평가', '안전관리자', '보건관리자', '특수건강검진',
  'KOSHA', '안전보건공단', '근로감독', '작업중지',
  '진폐', '석면', '소음성난청', '근골격계', '과로사', '뇌심혈관',
  '산재보험', '산재요양', '산재보상', '유족급여', '장해급여',
  '안전인증', '자율안전확인', '위험기계', '보호구',
  '물질안전보건자료', 'MSDS', '허용기준', '노출기준',
  '건설안전', '제조업안전', '서비스업안전',
];

// ── 반드시 제외 (무관 분야) ────────────────────────────────────
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
  if (/산업재해|재해예방|추락|끼임|감전|질식|폭발|건설현장/.test(text)) return '산업재해·안전';
  if (/화학물질|유해화학|유해물질|화학사고|노출기준|MSDS|직업병|직업성|석면|소음성|근골격|진폐|과로|뇌심혈관|직업성질환/.test(text)) return '직업보건·화학';
  if (/법령|고시|시행령|시행규칙|개정|입법|법률/.test(text)) return '법령·제도';
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
 * 수정일시(updated)가 있는 경우 우선 적용
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

// ── 고용노동부 보도자료 RSS ────────────────────────────────────
async function crawlMOEL() {
  let count = 0;
  const sources = [
    { url: 'https://www.moel.go.kr/rss/pressRss.xml', name: '고용노동부', sc: '정부기관' },
  ];

  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url).catch(() => null);
      if (!feed?.items) {
        console.log(`[고용노동부] RSS 응답 없음 (${src.url})`);
        continue;
      }
      for (const item of feed.items) {
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
          if (r.changes > 0) count++;
        } catch (e) {}
      }
      console.log(`[고용노동부] ${count}건 수집`);
      await delay(1000);
    } catch (e) {
      console.error('[고용노동부] 오류:', e.message);
    }
  }
  return count;
}

// ── 안전보건공단 RSS (보도자료 / 공지사항) ──────────────────────
async function crawlKOSHA() {
  let count = 0;
  const sources = [
    { url: 'https://www.kosha.or.kr/kosha/rss/press.do', name: '안전보건공단', label: '보도자료' },
    { url: 'https://www.kosha.or.kr/kosha/rss/notice.do', name: '안전보건공단', label: '공지사항' },
  ];

  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url).catch(() => null);
      if (!feed?.items) {
        console.log(`[KOSHA ${src.label}] RSS 응답 없음`);
        continue;
      }
      for (const item of feed.items.slice(0, 30)) {
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
          if (r.changes > 0) count++;
        } catch (e) {}
      }
      await delay(800);
    } catch (e) {
      console.error(`[KOSHA ${src.label}] 오류:`, e.message);
    }
  }
  console.log(`[안전보건공단] ${count}건 수집`);
  return count;
}

// ── 정책브리핑 RSS (산업안전 관련만) ─────────────────────────────
async function crawlPolicyBriefing() {
  let count = 0;
  // 고용노동부 정책브리핑 직접 검색 RSS
  const sources = [
    {
      // 고용노동부 보도자료 (정책브리핑)
      url: 'https://www.korea.kr/rss/pressRelease.xml',
      name: '정책브리핑',
      sc: '정부기관',
      filterByMinistry: ['고용노동부', '안전보건', '산업안전'],
    },
    {
      // 고용노동부 뉴스 RSS
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
      for (const item of feed.items.slice(0, 50)) {
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
  try {
    const feed = await parser.parseURL('https://www.me.go.kr/home/rss/newsRss.jsp').catch(() => null);
    if (!feed?.items) return 0;

    const chemKws = ['화학물질', '유해화학', '화학사고', '화학안전', 'REACH', '석면', '다이옥신', '중금속 오염', '화학물질관리'];
    for (const item of feed.items) {
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
          category: '화학안전',
          keywords: '화학물질,환경부,화학안전',
          author: '환경부', image_url: null,
          published_at: toKST(item.pubDate, item.updated || item.isoDate),
        });
        if (r.changes > 0) count++;
      } catch (e) {}
    }
  } catch (e) {
    console.error('[환경부] 오류:', e.message);
  }
  return count;
}

async function run() {
  console.log('[정부기관] 크롤링 시작...');
  let total = 0;
  try {
    const mc = await crawlMOEL();      total += mc; saveCrawlLog('고용노동부', 'success', mc);
    const kc = await crawlKOSHA();     total += kc; saveCrawlLog('안전보건공단', 'success', kc);
    const pc = await crawlPolicyBriefing(); total += pc; saveCrawlLog('정책브리핑', 'success', pc);
    const ec = await crawlMOE();       total += ec; saveCrawlLog('환경부', 'success', ec);
    console.log(`[정부기관] 총 ${total}건 수집`);
  } catch (e) {
    console.error('[정부기관] 오류:', e.message);
    saveCrawlLog('정부기관', 'error', 0, e.message);
  }
  return total;
}

module.exports = { run, crawlMOEL, crawlKOSHA, crawlPolicyBriefing, isRelevant };
