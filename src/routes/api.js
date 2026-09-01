/**
 * API 라우터
 */
const express = require('express');
const router = express.Router();
const axios = require('axios');
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

// ─── 콘텐츠 프록시 헬퍼 ─────────────────────────────────────────
const PROXY_ALLOWED = ['moel.go.kr', 'kosha.or.kr', 'law.go.kr', 'korea.kr', 'me.go.kr'];
const PROXY_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

async function fetchHtml(url) {
  const response = await axios.get(url, {
    timeout: 12000,
    headers: { ...PROXY_HEADERS, 'Referer': new URL(url).origin },
    maxRedirects: 5,
    responseType: 'arraybuffer',
  });
  const contentType = response.headers['content-type'] || '';
  let html = '';
  try {
    const iconv = require('iconv-lite');
    const buf = Buffer.from(response.data);
    if (contentType.includes('euc-kr') || contentType.includes('ks_c_5601') || contentType.includes('euc_kr')) {
      html = iconv.decode(buf, 'EUC-KR');
    } else {
      html = buf.toString('utf-8');
      if (html.substring(0, 2000).toLowerCase().includes('euc-kr') || html.substring(0, 2000).toLowerCase().includes('ks_c_5601')) {
        html = iconv.decode(buf, 'EUC-KR');
      }
    }
  } catch {
    html = Buffer.from(response.data).toString('utf-8');
  }
  return { html, contentType, headers: response.headers };
}

function extractTextContent(html) {
  // SPA 감지 (Vue/React 앱: 빈 div#app)
  const isSPA = /<div[^>]*id="app"[^>]*>\s*<\/div>/i.test(html);
  if (isSPA) return '';

  // 스크립트·스타일·네비·푸터 제거
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!\-\-[\s\S]*?\-\->/g, '');

  // 본문 영역 추출 시도 (다양한 패턴)
  const bodyPatterns = [
    /<(?:div|article|section)[^>]*(?:class|id)="[^"]*(?:view_cont|boardView|view-content|artcl-txt|article-body|news_content|cont_area|detail-content)[^"]*"[^>]*>([\s\S]{100,}?)(?=<\/(?:div|article|section)>)/i,
    /<(?:div|article|section|main)[^>]*(?:class|id)="[^"]*(?:content|view|article|body|detail|main|board)[^"]*"[^>]*>([\s\S]{200,}?)(?=<\/(?:div|article|section|main)>)/i,
  ];
  for (const pat of bodyPatterns) {
    const m = text.match(pat);
    if (m) { text = m[1]; break; }
  }

  // HTML 태그 제거 후 정리
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 3000);
}

function extractAttachments(html, baseUrl) {
  const attachments = [];
  // href에서 다운로드 가능한 파일 링크 추출
  const linkRe = /href="([^"]*\.(?:pdf|hwp|hwpx|doc|docx|xls|xlsx|ppt|pptx|zip|csv|txt|xml)(?:\?[^"]*)?)"[^>]*>([^<]*)/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    let href = m[1];
    const label = m[2].trim().replace(/&nbsp;/g, '').trim() || href.split('/').pop().split('?')[0];
    if (!href.startsWith('http')) {
      href = href.startsWith('/') ? baseUrl + href : baseUrl + '/' + href;
    }
    if (!attachments.find(a => a.href === href)) {
      attachments.push({ href, label: label || '첨부파일' });
    }
    if (attachments.length >= 10) break;
  }
  // JavaScript 다운로드 링크도 추출 (onclick 패턴)
  const jsRe = /(?:fn_egov_download_file|fileDown|downFile|downloadFile)\(['"](\/[^'"]+)['"]/gi;
  while ((m = jsRe.exec(html)) !== null) {
    const href = baseUrl + m[1];
    if (!attachments.find(a => a.href === href)) {
      attachments.push({ href, label: '첨부파일 다운로드' });
    }
    if (attachments.length >= 10) break;
  }
  return attachments;
}

// ─── 콘텐츠 추출 API (JSON 반환, 드로어 내 렌더링용) ──────────────
// GET /api/proxy/extract?url=https://...
router.get('/proxy/extract', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ success: false, error: '유효하지 않은 URL' });
  }
  if (!PROXY_ALLOWED.some(d => url.includes(d))) {
    return res.status(403).json({ success: false, error: '허용되지 않은 도메인' });
  }

  try {
    const { html } = await fetchHtml(url);
    const baseUrl = new URL(url).origin;
    const textContent = extractTextContent(html);
    const attachments = extractAttachments(html, baseUrl);

    // SPA 감지 여부 반환
    const isSPA = /<div[^>]*id="app"[^>]*>\s*<\/div>/i.test(html);

    res.json({
      success: true,
      text: textContent,
      attachments,
      directUrl: url,
      isSPA,
    });
  } catch (err) {
    console.error('[프록시 추출] 오류:', err.message, url);
    res.json({
      success: false,
      error: err.message,
      directUrl: url,
      text: '',
      attachments: [],
    });
  }
});

// ─── 콘텐츠 프록시 (정부기관 사이트 내용 미리보기 - iframe용) ──────
// GET /api/proxy/content?url=https://...
router.get('/proxy/content', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ success: false, error: '유효하지 않은 URL' });
  }
  if (!PROXY_ALLOWED.some(d => url.includes(d))) {
    return res.status(403).json({ success: false, error: '허용되지 않은 도메인' });
  }

  const siteName = url.includes('moel.go.kr') ? '고용노동부' : url.includes('kosha.or.kr') ? '안전보건공단' : '정부기관';
  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  try {
    const { html: rawHtml } = await fetchHtml(url);
    const baseUrl = new URL(url).origin;

    // 상대경로 → 절대경로 변환
    let html = rawHtml
      .replace(/href="\/([^"]*?)"/g, `href="${baseUrl}/$1"`)
      .replace(/src="\/([^"]*?)"/g, `src="${baseUrl}/$1"`)
      .replace(/action="\/([^"]*?)"/g, `action="${baseUrl}/$1"`);

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
      'Cache-Control': 'public, max-age=300',
    });
    res.send(html);
  } catch (err) {
    console.error('[프록시] 오류:', err.message, url);
    // 오류 시 안내 페이지 반환
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:'Pretendard Variable',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#1e293b;text-align:center;padding:20px;}
  .box{background:#fff;border-radius:16px;padding:36px 32px;box-shadow:0 4px 24px rgba(0,0,0,.1);max-width:480px;width:100%;}
  .icon{font-size:40px;margin-bottom:14px;}
  h2{font-size:17px;font-weight:700;margin:0 0 10px;}
  p{font-size:13px;color:#64748b;line-height:1.7;margin:0 0 18px;}
  .hint{font-size:11.5px;color:#94a3b8;background:#f1f5f9;padding:10px 14px;border-radius:8px;margin-bottom:18px;line-height:1.6;}
  .btns{display:flex;flex-direction:column;gap:8px;}
  a.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;}
  a.btn-primary{background:#1e4068;color:#fff;}
  a.btn-primary:hover{background:#0d1e35;}
  a.btn-secondary{background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;}
  a.btn-secondary:hover{background:#e2e8f0;}
</style></head><body>
<div class="box">
  <div class="icon">🏛️</div>
  <h2>${siteName} 미리보기 오류</h2>
  <p>${domain} 사이트의 보안 정책으로 인해 직접 미리보기가 불가합니다.<br>아래 버튼으로 공식 사이트에서 원문을 확인하세요.</p>
  <div class="hint">💡 오류: ${err.message || '접근 제한'}</div>
  <div class="btns">
    <a href="${url}" target="_blank" class="btn btn-primary">↗ ${siteName} 공식 사이트에서 열기</a>
    <a href="javascript:window.parent.postMessage('gov-viewer-close','*')" class="btn btn-secondary">✕ 닫기</a>
  </div>
</div>
</body></html>`);
  }
});

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
      crawledFrom,  // 수집일시 기반 필터 시작 (UTC)
      crawledTo,    // 수집일시 기반 필터 종료 (UTC)
      page = 1,
      limit = 20,
      sort = 'latest',
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
      crawledFrom,
      crawledTo,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
      sort,
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

// GET /api/articles/bookmarked  (북마크된 기사 목록) ← :id보다 먼저 등록
router.get('/articles/bookmarked', (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT * FROM articles WHERE is_bookmarked = 1 ORDER BY published_at DESC LIMIT 100`
    ).all();
    res.json({ success: true, data: rows, total: rows.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
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
// GET·POST /api/crawl/run - 수동 크롤링 실행 (apiFetch는 GET, fetch POST 양쪽 지원)
router.all('/crawl/run', async (req, res) => {
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

// ─── 키워드 트렌드 ─────────────────────────────────────────
// GET /api/stats/keywords?days=7&limit=8
router.get('/stats/keywords', (req, res) => {
  try {
    const days  = Math.min(parseInt(req.query.days)  || 7,  30);
    const limit = Math.min(parseInt(req.query.limit) || 8,  20);
    const rows = db.prepare(`
      SELECT kw, COUNT(*) as cnt
      FROM (
        SELECT trim(value) as kw
        FROM articles, json_each('["' || replace(replace(keywords,', ',','),',','","') || '"]')
        WHERE published_at >= datetime('now', ? || ' days')
          AND keywords IS NOT NULL AND keywords != ''
      )
      WHERE length(kw) >= 2
      GROUP BY kw ORDER BY cnt DESC LIMIT ?
    `).all(`-${days}`, limit);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── 시간대별 수집 분포 (오늘) ──────────────────────────────
// GET /api/stats/hourly-today  (오늘 0-23시 crawled_at 기준, KST 변환)
router.get('/stats/hourly-today', (req, res) => {
  try {
    // crawled_at은 UTC 저장 → KST 오늘 범위의 UTC 값 계산
    const nowUTC = new Date();
    const kstNow = new Date(nowUTC.getTime() + 9 * 3600 * 1000);
    const kstMidnight = new Date(Date.UTC(
      kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 0, 0, 0
    ));
    const startUTC = new Date(kstMidnight.getTime() - 9 * 3600 * 1000);
    const endUTC   = new Date(startUTC.getTime() + 86400 * 1000 - 1);
    const fmt = d => d.toISOString().replace('T', ' ').substring(0, 19);

    const rows = db.prepare(`
      SELECT CAST(strftime('%H', datetime(crawled_at, '+9 hours')) AS INTEGER) as hour, COUNT(*) as cnt
      FROM articles
      WHERE crawled_at >= ? AND crawled_at <= ?
      GROUP BY hour ORDER BY hour
    `).all(fmt(startUTC), fmt(endUTC));

    const map = {};
    rows.forEach(r => { map[r.hour] = r.cnt; });
    const data = Array.from({ length: 24 }, (_, h) => ({ hour: h, cnt: map[h] || 0 }));
    const kstDate = kstNow.toISOString().substring(0, 10);
    res.json({ success: true, data, kstDate });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── 북마크 ────────────────────────────────────────────────
// POST /api/articles/:id/bookmark  { bookmarked: true|false }
router.post('/articles/:id/bookmark', (req, res) => {
  try {
    const val = req.body?.bookmarked ? 1 : 0;
    db.prepare('UPDATE articles SET is_bookmarked = ? WHERE id = ?').run(val, req.params.id);
    res.json({ success: true, bookmarked: !!val });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
