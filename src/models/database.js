const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'kosha_news.db');
const db = new Database(DB_PATH);

// WAL 모드 활성화 (성능 향상)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    summary TEXT,
    url TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    source_category TEXT DEFAULT 'news',
    category TEXT DEFAULT '기타',
    keywords TEXT,
    author TEXT,
    image_url TEXT,
    published_at DATETIME,
    crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read INTEGER DEFAULT 0,
    is_bookmarked INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS crawl_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    error_msg TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT UNIQUE NOT NULL,
    category TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
  CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
  CREATE INDEX IF NOT EXISTS idx_articles_crawled ON articles(crawled_at DESC);
`);

// 기본 키워드 삽입
const defaultKeywords = [
  { keyword: '산업안전보건', category: '안전보건' },
  { keyword: '산업재해', category: '산업재해' },
  { keyword: '중대재해', category: '중대재해' },
  { keyword: '중대재해처벌법', category: '법령' },
  { keyword: '산업안전보건법', category: '법령' },
  { keyword: '안전보건관리', category: '안전보건' },
  { keyword: '근로자 안전', category: '안전보건' },
  { keyword: '직업병', category: '직업보건' },
  { keyword: '화학물질', category: '화학안전' },
  { keyword: '작업환경', category: '직업보건' },
  { keyword: '안전관리자', category: '안전보건' },
  { keyword: '보건관리자', category: '직업보건' },
  { keyword: '안전보건공단', category: '기관' },
  { keyword: 'KOSHA', category: '기관' },
  { keyword: '산업보건', category: '직업보건' },
];

const insertKeyword = db.prepare(
  `INSERT OR IGNORE INTO keywords (keyword, category) VALUES (?, ?)`
);
const insertKeywords = db.transaction((kws) => {
  for (const kw of kws) insertKeyword.run(kw.keyword, kw.category);
});
insertKeywords(defaultKeywords);

// 아티클 삽입
const insertArticle = db.prepare(`
  INSERT OR IGNORE INTO articles 
    (title, content, summary, url, source, source_category, category, keywords, author, image_url, published_at)
  VALUES 
    (@title, @content, @summary, @url, @source, @source_category, @category, @keywords, @author, @image_url, @published_at)
`);

// 아티클 검색 (통합 검색 + 날짜 필터)
function searchArticles({ query, category, source, dateFrom, dateTo, page = 1, limit = 20 } = {}) {
  let conditions = [];
  let params = {};

  if (query) {
    conditions.push(`(title LIKE @query OR content LIKE @query OR summary LIKE @query OR keywords LIKE @query)`);
    params.query = `%${query}%`;
  }
  if (category && category !== 'all') {
    conditions.push(`category = @category`);
    params.category = category;
  }
  if (source && source !== 'all') {
    conditions.push(`source = @source`);
    params.source = source;
  }
  if (dateFrom) {
    conditions.push(`published_at >= @dateFrom`);
    params.dateFrom = dateFrom;
  }
  if (dateTo) {
    conditions.push(`published_at <= @dateTo`);
    params.dateTo = dateTo + ' 23:59:59';
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM articles ${whereClause}`).get(params);
  const rows = db.prepare(`
    SELECT * FROM articles ${whereClause}
    ORDER BY published_at DESC, crawled_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  return { total: total.cnt, page, limit, data: rows };
}

// 최신 아티클
function getLatestArticles(limit = 30) {
  return db.prepare(`
    SELECT * FROM articles 
    ORDER BY published_at DESC, crawled_at DESC 
    LIMIT ?
  `).all(limit);
}

// 카테고리별 통계
function getCategoryStats() {
  return db.prepare(`
    SELECT category, COUNT(*) as count, MAX(published_at) as latest
    FROM articles 
    GROUP BY category 
    ORDER BY count DESC
  `).all();
}

// 출처별 통계
function getSourceStats() {
  return db.prepare(`
    SELECT source, source_category, COUNT(*) as count, MAX(crawled_at) as last_crawled
    FROM articles 
    GROUP BY source 
    ORDER BY count DESC
  `).all();
}

// 크롤 로그 저장
function saveCrawlLog(source, status, count, errorMsg = null) {
  return db.prepare(`
    INSERT INTO crawl_logs (source, status, count, error_msg, finished_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(source, status, count, errorMsg);
}

// 최근 크롤 로그
function getRecentCrawlLogs(limit = 20) {
  return db.prepare(`
    SELECT * FROM crawl_logs 
    ORDER BY started_at DESC 
    LIMIT ?
  `).all(limit);
}

// 오늘의 뉴스 수
function getTodayCount() {
  return db.prepare(`
    SELECT COUNT(*) as count FROM articles 
    WHERE DATE(published_at) = DATE('now', 'localtime')
  `).get();
}

// 이번 시간 뉴스 수
function getThisHourCount() {
  return db.prepare(`
    SELECT COUNT(*) as count FROM articles 
    WHERE published_at >= datetime('now', '-1 hour')
  `).get();
}

// 전체 통계
function getDashboardStats() {
  const total = db.prepare(`SELECT COUNT(*) as count FROM articles`).get();
  const today = getTodayCount();
  const thisHour = getThisHourCount();
  const sources = getSourceStats();
  const categories = getCategoryStats();
  const lastCrawl = db.prepare(`SELECT MAX(finished_at) as last FROM crawl_logs WHERE status = 'success'`).get();
  return { total: total.count, today: today.count, thisHour: thisHour.count, sources, categories, lastCrawl: lastCrawl.last };
}

// 시간별 아티클 분포 (최근 24시간)
function getHourlyDistribution() {
  return db.prepare(`
    SELECT 
      strftime('%Y-%m-%d %H:00', published_at) as hour,
      COUNT(*) as count
    FROM articles
    WHERE published_at >= datetime('now', '-24 hours')
    GROUP BY hour
    ORDER BY hour ASC
  `).all();
}

// 키워드 목록
function getActiveKeywords() {
  return db.prepare(`SELECT * FROM keywords WHERE is_active = 1`).all();
}

// 아티클 조회수 증가
function incrementViewCount(id) {
  return db.prepare(`UPDATE articles SET view_count = view_count + 1 WHERE id = ?`).run(id);
}

module.exports = {
  db,
  insertArticle,
  searchArticles,
  getLatestArticles,
  getCategoryStats,
  getSourceStats,
  saveCrawlLog,
  getRecentCrawlLogs,
  getDashboardStats,
  getHourlyDistribution,
  getActiveKeywords,
  incrementViewCount,
  getTodayCount,
  getThisHourCount,
};
