/**
 * 네이버 뉴스 RSS 크롤러
 * 산업안전보건 관련 키워드로 네이버 뉴스 검색 결과 수집
 */
const RSSParser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const { insertArticle, saveCrawlLog } = require('../models/database');

const parser = new RSSParser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  },
});

// 네이버 뉴스 검색 RSS (공개 API)
const NAVER_NEWS_RSS_KEYWORDS = [
  '산업안전보건',
  '산업재해',
  '중대재해',
  '중대재해처벌법',
  '안전보건공단',
  '직업병',
  '화학물질안전',
  '작업환경',
];

// 언론사 분류 매핑
const SOURCE_CATEGORY_MAP = {
  '연합뉴스': '통신사',
  '뉴시스': '통신사',
  '뉴스1': '통신사',
  '조선일보': '종합일간지',
  '중앙일보': '종합일간지',
  '동아일보': '종합일간지',
  '한겨레': '종합일간지',
  '경향신문': '종합일간지',
  '한국일보': '종합일간지',
  '국민일보': '종합일간지',
  '서울신문': '종합일간지',
  '문화일보': '종합일간지',
  '세계일보': '종합일간지',
  'KBS': '방송',
  'MBC': '방송',
  'SBS': '방송',
  'YTN': '방송',
  'MBN': '방송',
  'JTBC': '방송',
  '매일경제': '경제지',
  '한국경제': '경제지',
  '서울경제': '경제지',
  '파이낸셜뉴스': '경제지',
  '머니투데이': '경제지',
  '이데일리': '경제지',
  '아시아경제': '경제지',
  '헤럴드경제': '경제지',
  '노동일보': '전문지',
  '매일노동뉴스': '전문지',
  '안전저널': '전문지',
  '안전신문': '전문지',
  '워크인': '전문지',
};

function categorizeByTitle(title) {
  const t = title || '';
  if (/중대재해처벌|중대재해/.test(t)) return '중대재해';
  if (/산업재해|재해예방|재해사고/.test(t)) return '산업재해';
  if (/화학물질|유해물질|MSDS/.test(t)) return '화학안전';
  if (/직업병|직업성|석면|소음성/.test(t)) return '직업보건';
  if (/법령|고시|규정|시행령|개정|입법/.test(t)) return '법령·제도';
  if (/정책|브리핑|발표|추진/.test(t)) return '정책';
  if (/안전보건공단|KOSHA/.test(t)) return '기관동향';
  if (/안전|보건|건강/.test(t)) return '안전보건';
  return '기타';
}

function extractSourceFromUrl(url) {
  const patterns = [
    { pattern: /n\.news\.naver\.com/, source: '네이버뉴스' },
    { pattern: /yonhapnews|yna\.co\.kr/, source: '연합뉴스' },
    { pattern: /newsis\.com/, source: '뉴시스' },
    { pattern: /news1\.kr/, source: '뉴스1' },
    { pattern: /chosun\.com/, source: '조선일보' },
    { pattern: /joongang\.co\.kr/, source: '중앙일보' },
    { pattern: /donga\.com/, source: '동아일보' },
    { pattern: /hani\.co\.kr/, source: '한겨레' },
    { pattern: /khan\.co\.kr/, source: '경향신문' },
    { pattern: /hankookilbo\.com/, source: '한국일보' },
    { pattern: /kmib\.co\.kr/, source: '국민일보' },
    { pattern: /seoul\.co\.kr/, source: '서울신문' },
    { pattern: /munhwa\.com/, source: '문화일보' },
    { pattern: /segyetimes\.com/, source: '세계일보' },
    { pattern: /kbs\.co\.kr/, source: 'KBS' },
    { pattern: /imbc\.com/, source: 'MBC' },
    { pattern: /sbs\.co\.kr/, source: 'SBS' },
    { pattern: /ytn\.co\.kr/, source: 'YTN' },
    { pattern: /mbn\.co\.kr/, source: 'MBN' },
    { pattern: /jtbc\.joins\.com|jtbc\.co\.kr/, source: 'JTBC' },
    { pattern: /mk\.co\.kr/, source: '매일경제' },
    { pattern: /hankyung\.com/, source: '한국경제' },
    { pattern: /sedaily\.com/, source: '서울경제' },
    { pattern: /fnnews\.com/, source: '파이낸셜뉴스' },
    { pattern: /mt\.co\.kr/, source: '머니투데이' },
    { pattern: /edaily\.co\.kr/, source: '이데일리' },
    { pattern: /asiae\.co\.kr/, source: '아시아경제' },
    { pattern: /heraldcorp\.com/, source: '헤럴드경제' },
    { pattern: /labortoday\.co\.kr/, source: '매일노동뉴스' },
    { pattern: /safetykorea\.kr|anjeon\.co\.kr/, source: '안전저널' },
  ];
  for (const { pattern, source } of patterns) {
    if (pattern.test(url)) return source;
  }
  return '기타언론';
}

async function crawlNaverNewsRSS() {
  let totalCount = 0;
  const results = [];

  for (const keyword of NAVER_NEWS_RSS_KEYWORDS) {
    try {
      const encodedKeyword = encodeURIComponent(keyword);
      const rssUrl = `https://news.naver.com/rss/search?query=${encodedKeyword}`;

      // 네이버 뉴스 검색 페이지에서 데이터 수집
      const response = await axios.get(
        `https://openapi.naver.com/v1/search/news.json?query=${encodedKeyword}&display=20&sort=date`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; KOSHA-Monitor/1.0)',
          },
          timeout: 10000,
        }
      ).catch(() => null);

      // RSS 파싱 시도
      try {
        const feed = await parser.parseURL(
          `https://news.naver.com/rss/main.rss`
        ).catch(() => null);
        
        if (feed && feed.items) {
          for (const item of feed.items.slice(0, 10)) {
            const title = item.title || '';
            if (
              NAVER_NEWS_RSS_KEYWORDS.some(kw =>
                title.includes(kw) || (item.contentSnippet || '').includes(kw)
              )
            ) {
              const source = extractSourceFromUrl(item.link || '');
              const articleData = {
                title: title.replace(/<[^>]+>/g, '').trim(),
                content: item.content || item.contentSnippet || '',
                summary: (item.contentSnippet || '').substring(0, 300),
                url: item.link || '',
                source,
                source_category: SOURCE_CATEGORY_MAP[source] || '언론',
                category: categorizeByTitle(title),
                keywords: keyword,
                author: item.creator || item.author || '',
                image_url: null,
                published_at: item.pubDate
                  ? new Date(item.pubDate).toISOString().replace('T', ' ').substring(0, 19)
                  : new Date().toISOString().replace('T', ' ').substring(0, 19),
              };
              const result = insertArticle.run(articleData);
              if (result.changes > 0) totalCount++;
            }
          }
        }
      } catch (e) {
        // RSS 파싱 실패 시 무시
      }

      await delay(1000);
    } catch (error) {
      console.error(`[네이버뉴스] 키워드 "${keyword}" 크롤링 오류:`, error.message);
    }
  }

  return totalCount;
}

// 구글 뉴스 RSS (안정적인 공개 RSS)
async function crawlGoogleNewsRSS() {
  let totalCount = 0;
  const queries = [
    '산업안전보건',
    '중대재해처벌법',
    '산업재해 한국',
    '안전보건공단',
    '직업병 산업',
  ];

  for (const query of queries) {
    try {
      const encodedQuery = encodeURIComponent(query);
      const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=ko&gl=KR&ceid=KR:ko`;

      const feed = await parser.parseURL(rssUrl);

      if (feed && feed.items) {
        for (const item of feed.items.slice(0, 15)) {
          const title = (item.title || '').replace(/ - [^-]+$/, '').trim();
          const sourceMatch = (item.title || '').match(/ - (.+)$/);
          const source = sourceMatch ? sourceMatch[1].trim() : extractSourceFromUrl(item.link || '');

          const articleData = {
            title: title.replace(/<[^>]+>/g, '').trim(),
            content: item.content || item.contentSnippet || '',
            summary: (item.contentSnippet || '').substring(0, 300),
            url: item.link || '',
            source,
            source_category: SOURCE_CATEGORY_MAP[source] || '언론',
            category: categorizeByTitle(title),
            keywords: query,
            author: item.creator || item.author || source,
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
              // 중복 URL은 무시
            }
          }
        }
      }

      await delay(1500);
    } catch (error) {
      console.error(`[구글뉴스] "${query}" 크롤링 오류:`, error.message);
    }
  }

  return totalCount;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('[네이버/구글뉴스] 크롤링 시작...');
  let count = 0;
  try {
    // 구글 뉴스 RSS (공개, 안정적)
    const googleCount = await crawlGoogleNewsRSS();
    count += googleCount;
    console.log(`[구글뉴스] ${googleCount}건 수집`);

    saveCrawlLog('구글뉴스', 'success', googleCount);
  } catch (error) {
    console.error('[뉴스크롤러] 오류:', error.message);
    saveCrawlLog('뉴스크롤러', 'error', 0, error.message);
  }
  return count;
}

module.exports = { run, crawlGoogleNewsRSS, crawlNaverNewsRSS };
