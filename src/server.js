/**
 * KOSHA 언론모니터링 시스템 - 메인 서버
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const apiRouter = require('./routes/api');
const { startScheduler, runAllCrawlers } = require('./crawlers/scheduler');
const { insertSampleData } = require('./crawlers/sampleData');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── 미들웨어 ──────────────────────────────────────────────
app.use(cors());
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false, // 개발 편의를 위해 비활성화
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// ─── API 라우터 ────────────────────────────────────────────
app.use('/api', apiRouter);

// ─── SPA 폴백 (모든 라우트는 index.html로) ─────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── 서버 시작 ─────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log('\n' + '='.repeat(60));
  console.log('  KOSHA 언론모니터링 시스템');
  console.log('  한국산업안전보건공단');
  console.log('='.repeat(60));
  console.log(`  서버 주소: http://0.0.0.0:${PORT}`);
  console.log(`  시작 시간: ${new Date().toLocaleString('ko-KR')}`);
  console.log('='.repeat(60) + '\n');

  // 샘플 데이터 삽입 (DB가 비어 있을 때만)
  insertSampleData();

  // 스케줄러 시작 (1시간마다 크롤링)
  startScheduler();

  // 시작 시 최초 크롤링 실행 (5초 후)
  setTimeout(async () => {
    console.log('[서버] 초기 크롤링 시작...');
    await runAllCrawlers();
  }, 5000);
});

// 오류 처리
process.on('uncaughtException', (err) => {
  console.error('[서버] 예기치 않은 오류:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[서버] 처리되지 않은 Promise 거부:', reason);
});

module.exports = app;
