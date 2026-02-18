/**
 * 법령 정보 크롤러
 * 국가법령정보센터 (법제처) RSS 수집
 * 산업안전보건 관련 법령 개정 정보
 */
const RSSParser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
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

// 법령 카테고리 분류
function categorizeLegislation(title) {
  if (/산업안전보건법/.test(title)) return '산업안전보건법';
  if (/중대재해처벌/.test(title)) return '중대재해처벌법';
  if (/화학물질관리법|화학물질/.test(title)) return '화학물질법';
  if (/근로기준법/.test(title)) return '근로기준법';
  if (/고용보험/.test(title)) return '고용보험법';
  if (/산업재해보상/.test(title)) return '산재보상법';
  if (/위험물/.test(title)) return '위험물안전';
  if (/소방/.test(title)) return '소방안전';
  return '법령·제도';
}

// 법제처 최신 법령 RSS
async function crawlLawRSS() {
  let totalCount = 0;

  const sources = [
    {
      url: 'https://www.law.go.kr/DRF/lawSearch.do?OC=rss&target=law&type=XML&query=산업안전보건',
      name: '법제처(산업안전보건)',
      keyword: '산업안전보건',
    },
    {
      url: 'https://www.law.go.kr/DRF/lawSearch.do?OC=rss&target=law&type=XML&query=중대재해',
      name: '법제처(중대재해)',
      keyword: '중대재해',
    },
  ];

  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.url).catch(() => null);
      if (!feed || !feed.items) continue;

      for (const item of feed.items.slice(0, 20)) {
        const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
        const content = item.content || item.contentSnippet || item.summary || '';

        const articleData = {
          title,
          content,
          summary: content.substring(0, 300),
          url: item.link || item.guid || '',
          source: source.name,
          source_category: '법령',
          category: categorizeLegislation(title),
          keywords: source.keyword,
          author: '법제처',
          image_url: null,
          published_at: item.pubDate
            ? new Date(item.pubDate).toISOString().replace('T', ' ').substring(0, 19)
            : new Date().toISOString().replace('T', ' ').substring(0, 19),
        };

        if (articleData.title && articleData.url) {
          try {
            const result = insertArticle.run(articleData);
            if (result.changes > 0) totalCount++;
          } catch (e) {}
        }
      }

      await delay(1000);
    } catch (error) {
      console.error(`[법제처] ${source.name} 오류:`, error.message);
    }
  }

  return totalCount;
}

// 고용노동부 고시·훈령·예규 RSS
async function crawlMoelRegulationRSS() {
  let totalCount = 0;

  try {
    const url = 'https://www.moel.go.kr/rss/lawRss.xml';
    const feed = await parser.parseURL(url).catch(() => null);
    if (!feed || !feed.items) return 0;

    for (const item of feed.items) {
      const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
      const content = item.content || item.contentSnippet || '';

      const articleData = {
        title,
        content,
        summary: content.substring(0, 300),
        url: item.link || item.guid || '',
        source: '고용노동부(법령)',
        source_category: '법령',
        category: categorizeLegislation(title),
        keywords: '고용노동부,법령',
        author: '고용노동부',
        image_url: null,
        published_at: item.pubDate
          ? new Date(item.pubDate).toISOString().replace('T', ' ').substring(0, 19)
          : new Date().toISOString().replace('T', ' ').substring(0, 19),
      };

      if (articleData.title && articleData.url) {
        try {
          const result = insertArticle.run(articleData);
          if (result.changes > 0) totalCount++;
        } catch (e) {}
      }
    }
  } catch (error) {
    console.error('[고용노동부 법령] RSS 오류:', error.message);
  }

  return totalCount;
}

// 국회 입법 예고 RSS
async function crawlNationalAssemblyRSS() {
  let totalCount = 0;

  try {
    // 국회 의안정보시스템 RSS
    const url = 'https://likms.assembly.go.kr/bill/billsearch.rss?searchKeyword=산업안전&age=22';
    const feed = await parser.parseURL(url).catch(() => null);
    if (!feed || !feed.items) return 0;

    for (const item of feed.items.slice(0, 15)) {
      const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
      const content = item.content || item.contentSnippet || item.summary || '';

      const articleData = {
        title: `[입법] ${title}`,
        content,
        summary: content.substring(0, 300),
        url: item.link || item.guid || '',
        source: '국회의안정보',
        source_category: '입법',
        category: '법령·제도',
        keywords: '국회,입법,산업안전',
        author: '국회',
        image_url: null,
        published_at: item.pubDate
          ? new Date(item.pubDate).toISOString().replace('T', ' ').substring(0, 19)
          : new Date().toISOString().replace('T', ' ').substring(0, 19),
      };

      if (articleData.title && articleData.url) {
        try {
          const result = insertArticle.run(articleData);
          if (result.changes > 0) totalCount++;
        } catch (e) {}
      }
    }
  } catch (error) {
    console.error('[국회입법] RSS 오류:', error.message);
  }

  return totalCount;
}

async function run() {
  console.log('[법령정보] 크롤링 시작...');
  let totalCount = 0;
  try {
    const lawCount = await crawlLawRSS();
    totalCount += lawCount;
    saveCrawlLog('법제처', 'success', lawCount);

    const moelLawCount = await crawlMoelRegulationRSS();
    totalCount += moelLawCount;
    saveCrawlLog('고용노동부(법령)', 'success', moelLawCount);

    const assemblyCount = await crawlNationalAssemblyRSS();
    totalCount += assemblyCount;
    saveCrawlLog('국회의안정보', 'success', assemblyCount);

    console.log(`[법령정보] 총 ${totalCount}건 수집`);
  } catch (error) {
    console.error('[법령정보] 오류:', error.message);
    saveCrawlLog('법령정보', 'error', 0, error.message);
  }
  return totalCount;
}

module.exports = { run, crawlLawRSS, crawlMoelRegulationRSS, crawlNationalAssemblyRSS };
