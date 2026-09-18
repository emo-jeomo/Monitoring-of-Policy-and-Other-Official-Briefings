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

// 아티클 검색 (통합 검색 + 날짜 필터 + 정렬)
function searchArticles({ query, category, source, dateFrom, dateTo, crawledFrom, crawledTo, page = 1, limit = 20, sort = 'latest' } = {}) {
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
    params.dateTo = dateTo.length === 10 ? dateTo + ' 23:59:59' : dateTo;
  }
  // crawled_at 기반 필터 (수집 일시 기준, crawled_at은 UTC 저장)
  if (crawledFrom) {
    conditions.push(`crawled_at >= @crawledFrom`);
    params.crawledFrom = crawledFrom;
  }
  if (crawledTo) {
    conditions.push(`crawled_at <= @crawledTo`);
    params.crawledTo = crawledTo;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = sort === 'oldest'
    ? 'ORDER BY published_at ASC, crawled_at ASC'
    : 'ORDER BY published_at DESC, crawled_at DESC';
  const offset = (page - 1) * limit;

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM articles ${whereClause}`).get(params);
  const rows  = db.prepare(`
    SELECT * FROM articles ${whereClause}
    ${orderBy}
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

// KST 기준 오늘 날짜 문자열 반환 (서버는 UTC, KST = UTC+9)
function getKSTDateStr(offsetDays = 0) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return kst.toISOString().substring(0, 10); // 'YYYY-MM-DD'
}

// N시간 전 UTC ISO 문자열 반환 (crawled_at 비교용, DB는 UTC 저장)
function getUTCHoursAgo(hours) {
  const now = new Date();
  return new Date(now.getTime() - hours * 3600 * 1000).toISOString().replace('T',' ').substring(0, 19);
}

// crawled_at은 UTC로 저장 → KST 날짜에 해당하는 UTC 범위 계산
// (KST 자정 = UTC 전날 15:00)
function getUTCRangeForKSTDay(offsetDays) {
  // KST 기준 오늘 자정을 UTC 값으로 구함
  const nowUTC = new Date();
  const kstNow = new Date(nowUTC.getTime() + 9 * 3600 * 1000);
  // KST 날짜의 00:00:00 → UTC 타임스탬프
  const kstMidnight = new Date(Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate() + offsetDays,
    0, 0, 0
  ));
  // KST 00:00 = UTC 전날 15:00
  const startUTC = new Date(kstMidnight.getTime() - 9 * 3600 * 1000);
  const endUTC   = new Date(startUTC.getTime() + 86400 * 1000 - 1);
  const fmt = d => d.toISOString().replace('T', ' ').substring(0, 19);
  return { from: fmt(startUTC), to: fmt(endUTC) };
}

// 오늘 수집된 뉴스 수 (crawled_at 기준 – 수집 일시, KST 오늘)
function getTodayCount() {
  const { from, to } = getUTCRangeForKSTDay(0);
  return db.prepare(`
    SELECT COUNT(*) as count FROM articles 
    WHERE crawled_at >= ? AND crawled_at <= ?
  `).get(from, to);
}

// 이번 시간 수집된 뉴스 수 (crawled_at 기준, 최근 1시간)
function getThisHourCount() {
  const oneHourAgo = getUTCHoursAgo(1);
  return db.prepare(`
    SELECT COUNT(*) as count FROM articles 
    WHERE crawled_at >= ?
  `).get(oneHourAgo);
}

// 어제 수집된 뉴스 수 (crawled_at 기준, KST 어제)
function getYesterdayCount() {
  const { from, to } = getUTCRangeForKSTDay(-1);
  return db.prepare(`
    SELECT COUNT(*) as count FROM articles 
    WHERE crawled_at >= ? AND crawled_at <= ?
  `).get(from, to);
}

// UTC 시간을 KST ISO 문자열로 변환 (DB stored as UTC)
function utcToKST(utcStr) {
  if (!utcStr) return null;
  const d = new Date(utcStr.replace(' ', 'T') + 'Z'); // UTC로 파싱
  if (isNaN(d.getTime())) return utcStr; // 파싱 실패 시 원본 반환
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().replace('T', ' ').substring(0, 19);
}

// 전체 통계
function getDashboardStats() {
  const total = db.prepare(`SELECT COUNT(*) as count FROM articles`).get();
  const today = getTodayCount();
  const thisHour = getThisHourCount();
  const yesterday = getYesterdayCount();
  const sources = getSourceStats();
  const categories = getCategoryStats();
  const lastCrawl = db.prepare(`SELECT MAX(finished_at) as last FROM crawl_logs WHERE status = 'success'`).get();
  // lastCrawl.last는 UTC로 저장됨 → KST로 변환
  const lastCrawlKST = lastCrawl.last ? utcToKST(lastCrawl.last) : null;
  // KST 기준 오늘/어제 crawled_at 필터 범위 (클라이언트에 전달하여 BOX 클릭 필터에 사용)
  const todayRange = getUTCRangeForKSTDay(0);
  const yesterdayRange = getUTCRangeForKSTDay(-1);
  const oneHourAgo = getUTCHoursAgo(1);
  return { 
    total: total.count, 
    today: today.count, 
    thisHour: thisHour.count,
    yesterday: yesterday.count,
    sources, categories, 
    lastCrawl: lastCrawlKST,
    lastCrawlRaw: lastCrawl.last,  // 디버깅용
    kstToday: getKSTDateStr(0),    // 클라이언트 검증용
    todayRange,       // crawled_at 기반 오늘 필터 범위 (UTC)
    yesterdayRange,   // crawled_at 기반 어제 필터 범위 (UTC)
    oneHourAgo,       // 최근 1시간 시작 시각 (UTC)
  };
}

// 시간별 수집 분포 (오늘 0-23시, crawled_at UTC → KST 변환 후 시간 집계)
function getHourlyDistribution() {
  const { from, to } = getUTCRangeForKSTDay(0);
  return db.prepare(`
    SELECT 
      CAST(strftime('%H', datetime(crawled_at, '+9 hours')) AS INTEGER) as hour,
      COUNT(*) as count
    FROM articles
    WHERE crawled_at >= ? AND crawled_at <= ?
    GROUP BY hour
    ORDER BY hour ASC
  `).all(from, to);
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
  getYesterdayCount,
  getUTCRangeForKSTDay,
  getUTCHoursAgo,
};
