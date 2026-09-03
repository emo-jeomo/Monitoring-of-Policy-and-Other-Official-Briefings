/**
 * 소급 수집 스크립트 (backfill_crawl.js)
 * 
 * 목적: 개선된 크롤러(naverNews.js)로 누락된 기사를 소급 수집
 * - 확장된 SEARCH_QUERIES(21개) + 개선된 isRelevant() 적용
 * - 구글뉴스 RSS는 최신 기사 위주이므로 날짜 범위별 반복 수집
 * 
 * 실행: node scripts/backfill_crawl.js
 */

const { crawlGoogleNews } = require('../src/crawlers/naverNews');
const { run: runPolicy } = require('../src/crawlers/policyBriefing');
const { run: runLegislation } = require('../src/crawlers/legislation');
const db = require('../src/models/database');

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('==============================================');
  console.log(' 소급 수집 시작 (backfill_crawl.js)');
  console.log('==============================================\n');

  const before = db.db.prepare('SELECT COUNT(*) as cnt FROM articles').get();
  console.log(`[사전] DB 기사 수: ${before.cnt}건\n`);

  let totalNew = 0;

  // ── 1. 구글뉴스 RSS 수집 (개선된 쿼리 21개 × 최대 20건) ──────
  console.log('[1/3] 구글뉴스 RSS 소급 수집 시작...');
  console.log('  - 검색 쿼리 21개 × 최대 20건 = 최대 420건 확인');
  console.log('  - 개선된 isRelevant(): 추락/끼임/감전/질식 + 사업장 컨텍스트 체크');
  
  // 구글뉴스 RSS는 최신 기사만 제공하므로 3회 반복 수집
  // (쿼리마다 다른 기사가 걸릴 수 있음)
  let googleCount = 0;
  for (let round = 1; round <= 3; round++) {
    console.log(`\n  [구글뉴스 Round ${round}/3]`);
    const cnt = await crawlGoogleNews();
    googleCount += cnt;
    console.log(`  → ${cnt}건 신규 수집`);
    if (round < 3) await delay(3000); // 3초 대기
  }
  totalNew += googleCount;
  console.log(`\n[구글뉴스] 총 ${googleCount}건 신규 수집 완료\n`);

  // ── 2. 정책브리핑/기관 RSS 수집 ────────────────────────────
  console.log('[2/3] 정책브리핑 소급 수집 시작...');
  try {
    const policyCnt = await runPolicy();
    totalNew += policyCnt;
    console.log(`[정책브리핑] ${policyCnt}건 신규 수집 완료\n`);
  } catch (e) {
    console.error('[정책브리핑] 오류:', e.message);
  }

  // ── 3. 법령/제도 RSS 수집 ───────────────────────────────────
  console.log('[3/3] 법령·제도 소급 수집 시작...');
  try {
    const legCnt = await runLegislation();
    totalNew += legCnt;
    console.log(`[법령·제도] ${legCnt}건 신규 수집 완료\n`);
  } catch (e) {
    console.error('[법령·제도] 오류:', e.message);
  }

  // ── 결과 요약 ────────────────────────────────────────────────
  const after = db.db.prepare('SELECT COUNT(*) as cnt FROM articles').get();
  const actualNew = after.cnt - before.cnt;

  console.log('==============================================');
  console.log(' 소급 수집 완료');
  console.log('==============================================');
  console.log(`  수집 전: ${before.cnt}건`);
  console.log(`  수집 후: ${after.cnt}건`);
  console.log(`  실제 신규: ${actualNew}건 (중복 제외)`);
  console.log(`  크롤러 보고: ${totalNew}건`);
  console.log('==============================================\n');

  // 최근 10건 확인
  const recent = db.db.prepare(
    "SELECT title, published_at, source FROM articles ORDER BY crawled_at DESC LIMIT 10"
  ).all();
  console.log('[최근 수집 기사 10건]');
  recent.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.published_at}] ${r.source} | ${r.title}`);
  });

  // 샤힌 기사 수집 여부 확인
  const shahin = db.db.prepare(
    "SELECT title, published_at, source FROM articles WHERE title LIKE '%샤힌%' ORDER BY published_at DESC"
  ).all();
  console.log('\n[샤힌 관련 기사 확인]');
  if (shahin.length > 0) {
    shahin.forEach(r => console.log(`  ✅ [${r.published_at}] ${r.source} | ${r.title}`));
  } else {
    console.log('  ⚠️  샤힌 관련 기사 미수집 (구글뉴스 RSS에 아직 노출 안됨 가능성)');
  }
}

main().catch(console.error);
