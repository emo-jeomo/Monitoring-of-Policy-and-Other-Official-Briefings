/**
 * 대한민국 정책브리핑 크롤러
 * 정책브리핑 RSS 및 고용노동부 보도자료 수집
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

function categorizeByContent(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  if (/중대재해처벌|중대재해/.test(text)) return '중대재해';
  if (/산업재해|재해예방/.test(text)) return '산업재해';
  if (/화학물질|유해물질/.test(text)) return '화학안전';
  if (/직업병|직업성/.test(text)) return '직업보건';
  if (/법령|고시|규정|시행령|개정|입법/.test(text)) return '법령·제도';
  if (/정책|브리핑|발표|추진|계획/.test(text)) return '정책';
  if (/안전보건공단|KOSHA/.test(text)) return '기관동향';
  if (/안전|보건|건강/.test(text)) return '안전보건';
  return '정책';
}

// 대한민국 정책브리핑 RSS
async function crawlPolicyBriefingRSS() {
  let totalCount = 0;

  const rssSources = [
    {
      url: 'https://www.korea.kr/rss/policy.xml',
      name: '정책브리핑(정책)',
      category: '정책',
    },
    {
      url: 'https://www.korea.kr/rss/news.xml',
      name: '정책브리핑(뉴스)',
      category: '정책',
    },
    {
      url: 'https://www.moel.go.kr/rss/pressRss.xml',
      name: '고용노동부',
      category: '정책',
    },
  ];

  for (const source of rssSources) {
    try {
      console.log(`[정책브리핑] ${source.name} RSS 파싱 중...`);
      const feed = await parser.parseURL(source.url);

      if (feed && feed.items) {
        for (const item of feed.items) {
          const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
          const content = item.content || item.contentSnippet || item.summary || '';

          // 안전보건 관련 키워드 필터링
          const keywords = [
            '안전', '보건', '산업재해', '중대재해', '화학물질', '직업병',
            '작업환경', '안전보건', '산업안전', '재해', '유해', '위험',
            '고용노동', '근로', '노동',
          ];
          const isRelevant = keywords.some(
            (kw) => title.includes(kw) || content.includes(kw)
          );

          // 필터 없이 수집 (모두 수집 후 프론트에서 필터링)
          const articleData = {
            title,
            content,
            summary: content.substring(0, 300),
            url: item.link || item.guid || '',
            source: source.name,
            source_category: '정부기관',
            category: categorizeByContent(title, content),
            keywords: keywords.filter((kw) => title.includes(kw) || content.includes(kw)).join(','),
            author: item.creator || item.author || source.name,
            image_url: null,
            published_at: item.pubDate
              ? new Date(item.pubDate).toISOString().replace('T', ' ').substring(0, 19)
              : new Date().toISOString().replace('T', ' ').substring(0, 19),
          };

          if (articleData.title && articleData.url) {
            try {
              const result = insertArticle.run(articleData);
              if (result.changes > 0) totalCount++;
            } catch (e) {
              // 중복 무시
            }
          }
        }
      }

      console.log(`[정책브리핑] ${source.name}: 처리 완료`);
      await delay(1000);
    } catch (error) {
      console.error(`[정책브리핑] ${source.name} 오류:`, error.message);
    }
  }

  return totalCount;
}

// 고용노동부 보도자료 RSS
async function crawlMoelRSS() {
  let totalCount = 0;

  const sources = [
    {
      url: 'https://www.moel.go.kr/rss/pressRss.xml',
      name: '고용노동부',
      fallbackUrl: null,
    },
  ];

  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.url).catch(() => null);
      if (!feed) continue;

      for (const item of (feed.items || [])) {
        const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
        const content = item.content || item.contentSnippet || '';

        const articleData = {
          title,
          content,
          summary: content.substring(0, 300),
          url: item.link || item.guid || '',
          source: source.name,
          source_category: '정부기관',
          category: categorizeByContent(title, content),
          keywords: '고용노동,산업안전',
          author: source.name,
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
      console.error(`[고용노동부] RSS 오류:`, error.message);
    }
  }

  return totalCount;
}

// 산업안전보건공단 보도자료 (공식 RSS)
async function crawlKoshaRSS() {
  let totalCount = 0;
  try {
    // KOSHA 공식 RSS 시도
    const url = 'https://www.kosha.or.kr/kosha/rss/press.do';
    const feed = await parser.parseURL(url).catch(() => null);

    if (feed && feed.items) {
      for (const item of feed.items) {
        const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
        const content = item.content || item.contentSnippet || '';

        const articleData = {
          title,
          content,
          summary: content.substring(0, 300),
          url: item.link || item.guid || '',
          source: '안전보건공단',
          source_category: '기관',
          category: '기관동향',
          keywords: 'KOSHA,안전보건공단',
          author: '안전보건공단',
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
    }
  } catch (error) {
    console.error('[KOSHA RSS] 오류:', error.message);
  }
  return totalCount;
}

async function run() {
  console.log('[정책브리핑/보도자료] 크롤링 시작...');
  let totalCount = 0;
  try {
    const policyCount = await crawlPolicyBriefingRSS();
    totalCount += policyCount;
    saveCrawlLog('정책브리핑', 'success', policyCount);

    const koshaCount = await crawlKoshaRSS();
    totalCount += koshaCount;
    saveCrawlLog('안전보건공단', 'success', koshaCount);

    console.log(`[정책브리핑/보도자료] 총 ${totalCount}건 수집`);
  } catch (error) {
    console.error('[정책브리핑] 크롤링 오류:', error.message);
    saveCrawlLog('정책브리핑', 'error', 0, error.message);
  }
  return totalCount;
}

module.exports = { run, crawlPolicyBriefingRSS, crawlKoshaRSS, crawlMoelRSS };
