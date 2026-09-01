/**
 * 크롤링 스케줄러
 * node-cron을 사용하여 1시간마다 자동 크롤링
 */
const cron = require('node-cron');
const naverNews = require('./naverNews');
const policyBriefing = require('./policyBriefing');
const legislation = require('./legislation');
const { saveCrawlLog } = require('../models/database');

let isRunning = false;
let lastRunTime = null;
let nextRunTime = null;
let runCount = 0;

// 전체 크롤링 실행
async function runAllCrawlers() {
  if (isRunning) {
    console.log('[스케줄러] 이미 크롤링이 진행 중입니다.');
    return { status: 'busy', message: '크롤링 진행 중' };
  }

  isRunning = true;
  lastRunTime = new Date().toISOString();
  const startTime = Date.now();
  let totalCount = 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[스케줄러] 크롤링 시작: ${new Date().toLocaleString('ko-KR')}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // 1. 뉴스 크롤링 (구글 뉴스 RSS)
    try {
      const newsCount = await naverNews.run();
      totalCount += newsCount;
    } catch (e) {
      console.error('[스케줄러] 뉴스 크롤링 오류:', e.message);
    }

    // 2. 정책브리핑 크롤링
    try {
      const policyCount = await policyBriefing.run();
      totalCount += policyCount;
    } catch (e) {
      console.error('[스케줄러] 정책브리핑 크롤링 오류:', e.message);
    }

    // 3. 법령정보 크롤링
    try {
      const lawCount = await legislation.run();
      totalCount += lawCount;
    } catch (e) {
      console.error('[스케줄러] 법령정보 크롤링 오류:', e.message);
    }

    runCount++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[스케줄러] 크롤링 완료: 총 ${totalCount}건, 소요시간 ${elapsed}초`);
    saveCrawlLog('전체', 'success', totalCount);

    return {
      status: 'success',
      count: totalCount,
      elapsed: `${elapsed}s`,
      time: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[스케줄러] 크롤링 전체 오류:', error.message);
    saveCrawlLog('전체', 'error', 0, error.message);
    return { status: 'error', message: error.message };
  } finally {
    isRunning = false;
    // 다음 실행 시간 계산
    const next = new Date();
    next.setHours(next.getHours() + 1);
    next.setMinutes(0);
    next.setSeconds(0);
    nextRunTime = next.toISOString();
  }
}

// 다음 정각 시간 계산 (UTC 기준)
function calcNextHour() {
  const next = new Date();
  next.setUTCMinutes(0);
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next.toISOString();
}

// 1시간마다 자동 크롤링 (매시 정각 UTC)
function startScheduler() {
  // 매시 0분 0초 (UTC) 실행 – node-cron은 서버 로컬 타임존 기준
  cron.schedule('0 * * * *', async () => {
    console.log(`[스케줄러] 정기 크롤링 시작 (매시간) – ${new Date().toISOString()}`);
    nextRunTime = calcNextHour();
    await runAllCrawlers();
    nextRunTime = calcNextHour();
  });

  nextRunTime = calcNextHour();

  console.log('[스케줄러] 1시간 주기 스케줄러 시작됨');
  console.log(`[스케줄러] 다음 실행 시간: ${new Date(nextRunTime).toLocaleString('ko-KR')}`);
}

function getStatus() {
  return {
    isRunning,
    lastRunTime,
    nextRunTime,
    runCount,
  };
}

module.exports = {
  startScheduler,
  runAllCrawlers,
  getStatus,
};
