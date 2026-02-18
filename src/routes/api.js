/**
 * API 라우터
 */
const express = require('express');
const router = express.Router();
const {
  searchArticles,
  getLatestArticles,
  getCategoryStats,
  getSourceStats,
  getDashboardStats,
  getHourlyDistribution,
  getRecentCrawlLogs,
  getActiveKeywords,
  incrementViewCount,
  db,
} = require('../models/database');
const { runAllCrawlers, getStatus: getSchedulerStatus } = require('../crawlers/scheduler');

// ─── 뉴스 목록 & 검색 ───────────────────────────────────────
// GET /api/articles?query=&category=&source=&dateFrom=&dateTo=&page=&limit=
router.get('/articles', (req, res) => {
  try {
    const {
      query,
      category,
      source,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
      dateHour, // 특정 시간대 필터
      dateYear, // 연도 필터
      dateMonth, // 월 필터
      dateDay, // 일 필터
    } = req.query;

    let adjustedDateFrom = dateFrom;
    let adjustedDateTo = dateTo;

    // 연/월/일/시간 단위 필터링 처리
    if (dateHour) {
      // 특정 시간대: "2024-01-15 14"
      const [datePart, hourPart] = dateHour.split(' ');
      adjustedDateFrom = `${datePart} ${hourPart.padStart(2, '0')}:00:00`;
      adjustedDateTo = `${datePart} ${hourPart.padStart(2, '0')}:59:59`;
    } else if (dateYear && dateMonth && dateDay) {
      // 특정 날짜
      adjustedDateFrom = `${dateYear}-${String(dateMonth).padStart(2, '0')}-${String(dateDay).padStart(2, '0')} 00:00:00`;
      adjustedDateTo = `${dateYear}-${String(dateMonth).padStart(2, '0')}-${String(dateDay).padStart(2, '0')} 23:59:59`;
    } else if (dateYear && dateMonth) {
      // 특정 월
      const lastDay = new Date(dateYear, dateMonth, 0).getDate();
      adjustedDateFrom = `${dateYear}-${String(dateMonth).padStart(2, '0')}-01 00:00:00`;
      adjustedDateTo = `${dateYear}-${String(dateMonth).padStart(2, '0')}-${lastDay} 23:59:59`;
    } else if (dateYear) {
      // 특정 연도
      adjustedDateFrom = `${dateYear}-01-01 00:00:00`;
      adjustedDateTo = `${dateYear}-12-31 23:59:59`;
    }

    const result = searchArticles({
      query,
      category,
      source,
      dateFrom: adjustedDateFrom,
      dateTo: adjustedDateTo,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
    });

    res.json({
      success: true,
      ...result,
      totalPages: Math.ceil(result.total / result.limit),
    });
  } catch (error) {
    console.error('[API] /articles 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/articles/latest - 최신 뉴스 (홈 화면용)
router.get('/articles/latest', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const articles = getLatestArticles(limit);
    res.json({ success: true, data: articles, count: articles.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/articles/:id - 개별 기사 조회
router.get('/articles/:id', (req, res) => {
  try {
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, error: '기사를 찾을 수 없습니다.' });
    }
    incrementViewCount(req.params.id);
    res.json({ success: true, data: article });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── 통계 & 대시보드 ───────────────────────────────────────
// GET /api/stats/dashboard
router.get('/stats/dashboard', (req, res) => {
  try {
    const stats = getDashboardStats();
    const scheduler = getSchedulerStatus();
    const hourly = getHourlyDistribution();
    res.json({
      success: true,
      data: { ...stats, scheduler, hourly },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/stats/categories
router.get('/stats/categories', (req, res) => {
  try {
    const categories = getCategoryStats();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/stats/sources
router.get('/stats/sources', (req, res) => {
  try {
    const sources = getSourceStats();
    res.json({ success: true, data: sources });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/stats/hourly
router.get('/stats/hourly', (req, res) => {
  try {
    const hourly = getHourlyDistribution();
    res.json({ success: true, data: hourly });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── 크롤링 관리 ───────────────────────────────────────────
// POST /api/crawl/run - 수동 크롤링 실행
router.post('/crawl/run', async (req, res) => {
  try {
    const schedulerStatus = getSchedulerStatus();
    if (schedulerStatus.isRunning) {
      return res.json({ success: false, message: '현재 크롤링이 진행 중입니다.' });
    }

    // 비동기로 크롤링 시작 (응답은 즉시 반환)
    res.json({ success: true, message: '크롤링을 시작했습니다.' });

    // 백그라운드에서 실행
    runAllCrawlers().catch(console.error);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/crawl/status - 크롤링 상태 조회
router.get('/crawl/status', (req, res) => {
  try {
    const status = getSchedulerStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/crawl/logs - 크롤링 로그 조회
router.get('/crawl/logs', (req, res) => {
  try {
    const logs = getRecentCrawlLogs(50);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── 키워드 관리 ───────────────────────────────────────────
// GET /api/keywords
router.get('/keywords', (req, res) => {
  try {
    const keywords = getActiveKeywords();
    res.json({ success: true, data: keywords });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── 필터 옵션 ─────────────────────────────────────────────
// GET /api/filters - 가능한 카테고리, 출처 목록 반환
router.get('/filters', (req, res) => {
  try {
    const categories = db.prepare(
      `SELECT DISTINCT category FROM articles WHERE category IS NOT NULL ORDER BY category`
    ).all().map((r) => r.category);

    const sources = db.prepare(
      `SELECT DISTINCT source, source_category FROM articles ORDER BY source`
    ).all();

    // 날짜 범위 (DB 내 최솟값, 최댓값)
    const dateRange = db.prepare(
      `SELECT MIN(DATE(published_at)) as minDate, MAX(DATE(published_at)) as maxDate FROM articles`
    ).get();

    res.json({
      success: true,
      data: { categories, sources, dateRange },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
