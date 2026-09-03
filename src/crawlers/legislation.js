/**
 * 법령 정보 크롤러
 * 국가법령정보센터(법제처) Open API RSS 수집
 */
const RSSParser = require('rss-parser');
const axios = require('axios');
const { insertArticle, saveCrawlLog } = require('../models/database');

const parser = new RSSParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; KOSHA-Monitor/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function categorizeLaw(title) {
  if (/중대재해/.test(title)) return '중대재해';
  if (/화학물질/.test(title)) return '직업보건·화학';
  return '법령·제도';
}

// ── 법제처 국가법령정보센터 Open API ────────────────────────
// 법령 검색 API (XML): https://www.law.go.kr/DRF/lawSearch.do
async function crawlLawAPI() {
  let count = 0;
  const queries = [
    { q: '산업안전보건', name: '법제처(산업안전보건)' },
    { q: '중대재해처벌', name: '법제처(중대재해)' },
    { q: '산업재해보상', name: '법제처(산업재해보상)' },
    { q: '화학물질관리', name: '법제처(화학물질)' },
  ];

  for (const { q, name } of queries) {
    try {
      // 법제처 법령 검색 API (공개)
      const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=kosha&target=law&type=XML&display=20&page=1&query=${encodeURIComponent(q)}&sort=ddes`;
      const resp = await axios.get(url, { timeout: 10000 }).catch(() => null);
      if (!resp?.data) continue;

      // XML 파싱 (간단한 정규식)
      const items = resp.data.match(/<law>[\s\S]*?<\/law>/g) || [];
      
      for (const item of items.slice(0, 15)) {
        const title = (item.match(/<법령명한글>(.*?)<\/법령명한글>/) || [])[1] || '';
        const lawId = (item.match(/<법령ID>(.*?)<\/법령ID>/) || [])[1] || '';
        const pubDate = (item.match(/<공포일자>(.*?)<\/공포일자>/) || [])[1] || '';
        const lawType = (item.match(/<법령구분명>(.*?)<\/법령구분명>/) || [])[1] || '';

        if (!title) continue;

        // 법령 검색 URL: 법령명 기반 검색 (lsInfoP.do?lsiSeq는 외부 접근 불가 - 404 오류)
        // 검색 URL 형식: https://www.law.go.kr/lsSc.do?menuId=1&subMenuId=15&tabMenuId=81&query={법령명}
        const lawUrl = `https://www.law.go.kr/lsSc.do?menuId=1&subMenuId=15&tabMenuId=81&query=${encodeURIComponent(title)}`;

        const formattedDate = pubDate
          ? `${pubDate.substring(0,4)}-${pubDate.substring(4,6)}-${pubDate.substring(6,8)} 00:00:00`
          : new Date().toISOString().replace('T',' ').substring(0,19);

        try {
          const r = insertArticle.run({
            title: `[${lawType}] ${title}`,
            content: `법령구분: ${lawType} | 공포일자: ${pubDate}`,
            summary: `${lawType} "${title}" 관련 법령 정보`,
            url: lawUrl,
            source: name,
            source_category: '법령',
            category: categorizeLaw(title),
            keywords: q + ',법령',
            author: '법제처',
            image_url: null,
            published_at: formattedDate,
          });
          if (r.changes > 0) count++;
        } catch (e) {}
      }

      await delay(1000);
    } catch (e) {
      console.error(`[법제처] "${q}" 오류:`, e.message);
    }
  }
  return count;
}

// ── 법제처 최신 제·개정 법령 RSS ────────────────────────────
async function crawlLawRecentRSS() {
  let count = 0;
  const sources = [
    {
      // 법령 정보원 최신 법령 뉴스 RSS
      url: 'https://www.klri.re.kr/kor/rssFeed/rss.do',
      name: '한국법제연구원',
      sc: '법령',
    },
  ];

  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url).catch(() => null);
      if (!feed?.items) continue;

      for (const item of feed.items.slice(0, 20)) {
        const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
        const content = item.content || item.contentSnippet || '';
        const url = item.link || item.guid || '';
        if (!title || !url || !url.startsWith('http')) continue;

        // 안전보건 관련 필터
        const relevant = /안전|보건|재해|화학|근로|노동|위험|직업/.test(title + content);
        if (!relevant) continue;

        try {
          const r = insertArticle.run({
            title, content,
            summary: content.substring(0, 300),
            url,
            source: src.name,
            source_category: src.sc,
            category: categorizeLaw(title),
            keywords: '법령,안전보건',
            author: src.name,
            image_url: null,
            published_at: toKST(item.pubDate, item.updated || item.isoDate),
          });
          if (r.changes > 0) count++;
        } catch (e) {}
      }
      await delay(1000);
    } catch (e) {
      console.error(`[법령RSS] ${src.name} 오류:`, e.message);
    }
  }
  return count;
}

// ── 입법예고 시스템 RSS ──────────────────────────────────────
// 고용노동부 입법예고: https://www.moel.go.kr
async function crawlLegislationNoticeRSS() {
  let count = 0;
  const sources = [
    {
      url: 'https://www.moel.go.kr/rss/lawRss.xml',
      name: '고용노동부(법령)',
      sc: '법령',
    },
  ];

  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url).catch(() => null);
      if (!feed?.items) continue;

      for (const item of feed.items.slice(0, 20)) {
        const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
        const content = item.content || item.contentSnippet || '';
        let url = item.link || item.guid || '';
        if (!title || !url) continue;

        if (url.startsWith('/')) url = 'https://www.moel.go.kr' + url;
        if (!url.startsWith('http')) continue;

        try {
          const r = insertArticle.run({
            title: `[법령] ${title}`,
            content,
            summary: content.substring(0, 300),
            url,
            source: src.name,
            source_category: src.sc,
            category: '법령·제도',
            keywords: '고용노동부,법령,개정',
            author: '고용노동부',
            image_url: null,
            published_at: toKST(item.pubDate, item.updated || item.isoDate),
          });
          if (r.changes > 0) count++;
        } catch (e) {}
      }
      await delay(1000);
    } catch (e) {
      console.error(`[고용노동부 법령] 오류:`, e.message);
    }
  }
  return count;
}

async function run() {
  console.log('[법령정보] 크롤링 시작...');
  let total = 0;
  try {
    const lc = await crawlLawAPI();
    total += lc;
    saveCrawlLog('법제처', 'success', lc);

    const lrc = await crawlLawRecentRSS();
    total += lrc;
    saveCrawlLog('법령RSS', 'success', lrc);

    const lnc = await crawlLegislationNoticeRSS();
    total += lnc;
    saveCrawlLog('고용노동부(법령)', 'success', lnc);

    console.log(`[법령정보] 총 ${total}건 수집`);
  } catch (e) {
    console.error('[법령정보] 오류:', e.message);
    saveCrawlLog('법령정보', 'error', 0, e.message);
  }
  return total;
}

module.exports = { run, crawlLawAPI, crawlLegislationNoticeRSS };
