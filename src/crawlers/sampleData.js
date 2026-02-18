/**
 * 샘플 데이터 생성 모듈
 * 초기 구동 시 데모 데이터를 삽입하여 UI 테스트 가능하게 함
 */
const { insertArticle, db } = require('../models/database');

const sampleArticles = [
  // 중대재해 카테고리
  {
    title: '중대재해처벌법 시행 2년, 처벌 현황과 향후 과제',
    content: '중대재해처벌법이 시행된 지 2년이 지나면서 산업현장의 안전 문화가 변화하고 있다. 고용노동부에 따르면 중대재해 발생 건수가 전년 대비 12% 감소한 것으로 나타났다.',
    summary: '중대재해처벌법 시행 2주년을 맞아 처벌 현황을 분석하고 향후 개선과제를 살펴본다.',
    url: 'https://example.com/news/001',
    source: '매일노동뉴스',
    source_category: '전문지',
    category: '중대재해',
    keywords: '중대재해처벌법,중대재해,산업안전',
    author: '김기자',
    image_url: null,
    published_at: getRecentDate(0, 1),
  },
  {
    title: '고용노동부, 중대재해처벌법 적용 범위 확대 검토',
    content: '고용노동부가 중대재해처벌법의 적용 범위를 50인 미만 사업장까지 확대하는 방안을 검토하고 있다고 밝혔다.',
    summary: '50인 미만 소규모 사업장에도 중대재해처벌법을 적용하는 방안이 논의되고 있다.',
    url: 'https://example.com/news/002',
    source: '고용노동부',
    source_category: '정부기관',
    category: '중대재해',
    keywords: '중대재해처벌법,고용노동부,소규모사업장',
    author: '고용노동부',
    image_url: null,
    published_at: getRecentDate(0, 2),
  },
  // 산업재해 카테고리
  {
    title: '2025년 산업재해 통계 발표 - 사망자 수 역대 최저',
    content: '안전보건공단은 2025년 산업재해 통계를 발표하며 사망자 수가 역대 최저를 기록했다고 밝혔다. 총 사망자 수는 전년 대비 8.3% 감소한 791명으로 집계됐다.',
    summary: '2025년 산업재해 사망자가 791명으로 역대 최저를 기록했다.',
    url: 'https://example.com/news/003',
    source: '안전보건공단',
    source_category: '기관',
    category: '산업재해',
    keywords: '산업재해,사망,안전보건공단,통계',
    author: '안전보건공단',
    image_url: null,
    published_at: getRecentDate(0, 3),
  },
  {
    title: '건설현장 추락사고 예방 강화 대책 발표',
    content: '고용노동부는 건설현장 추락사고를 줄이기 위한 종합대책을 발표했다. 안전망 설치 의무화 및 작업중지권 강화가 핵심 내용이다.',
    summary: '건설현장 추락사고 예방을 위한 안전망 설치 의무화 등 종합대책이 발표됐다.',
    url: 'https://example.com/news/004',
    source: '안전저널',
    source_category: '전문지',
    category: '산업재해',
    keywords: '건설현장,추락사고,안전망,산업재해',
    author: '이기자',
    image_url: null,
    published_at: getRecentDate(1, 0),
  },
  // 법령·제도 카테고리
  {
    title: '산업안전보건법 시행규칙 일부개정 - 안전보건교육 강화',
    content: '고용노동부는 산업안전보건법 시행규칙을 개정하여 안전보건교육 시간을 신규 채용자의 경우 기존 8시간에서 16시간으로 늘린다고 발표했다.',
    summary: '산업안전보건법 시행규칙 개정으로 신규 채용자 안전교육이 16시간으로 강화된다.',
    url: 'https://example.com/news/005',
    source: '법제처(산업안전보건)',
    source_category: '법령',
    category: '법령·제도',
    keywords: '산업안전보건법,시행규칙,안전교육,개정',
    author: '법제처',
    image_url: null,
    published_at: getRecentDate(1, 2),
  },
  {
    title: '화학물질관리법 개정안 국회 통과 - 취급시설 기준 강화',
    content: '화학물질관리법 개정안이 국회 본회의를 통과했다. 취급시설의 안전관리 기준이 대폭 강화되며, 소규모 사업장에 대한 유예기간이 부여된다.',
    summary: '화학물질관리법 개정으로 취급시설 안전관리 기준이 강화됐다.',
    url: 'https://example.com/news/006',
    source: '국회의안정보',
    source_category: '입법',
    category: '법령·제도',
    keywords: '화학물질관리법,개정,국회,취급시설',
    author: '국회',
    image_url: null,
    published_at: getRecentDate(1, 4),
  },
  // 정책 카테고리
  {
    title: '정부, 2026년 산업안전 종합계획 발표 - 재해율 0.5% 목표',
    content: '정부는 2026년 산업안전 종합계획을 발표하며 산업재해율을 0.5% 이하로 낮추는 것을 목표로 제시했다. 스마트 안전관리 시스템 보급 확대와 안전보건 인프라 강화가 주요 과제다.',
    summary: '정부의 2026년 산업안전 종합계획에서 재해율 0.5% 달성을 목표로 제시했다.',
    url: 'https://example.com/news/007',
    source: '정책브리핑(정책)',
    source_category: '정부기관',
    category: '정책',
    keywords: '산업안전,종합계획,정책,재해율',
    author: '정책브리핑',
    image_url: null,
    published_at: getRecentDate(2, 0),
  },
  {
    title: '안전보건공단, 소규모 사업장 무료 컨설팅 서비스 확대',
    content: '안전보건공단은 50인 미만 소규모 사업장을 대상으로 무료 안전보건 컨설팅 서비스를 대폭 확대한다고 밝혔다. 올해 전국 1만 개 사업장을 지원할 계획이다.',
    summary: '안전보건공단이 소규모 사업장 무료 컨설팅을 1만개 사업장으로 확대한다.',
    url: 'https://example.com/news/008',
    source: '안전보건공단',
    source_category: '기관',
    category: '기관동향',
    keywords: 'KOSHA,안전보건공단,컨설팅,소규모사업장',
    author: '안전보건공단',
    image_url: null,
    published_at: getRecentDate(2, 1),
  },
  // 직업보건 카테고리
  {
    title: '반도체 노동자 직업병 인정 기준 확대 - 고법원 판결',
    content: '대법원은 반도체 공장 노동자의 백혈병이 업무상 재해에 해당한다고 판결했다. 이번 판결로 반도체 업종 직업병 인정 범위가 확대될 전망이다.',
    summary: '대법원이 반도체 노동자 백혈병을 업무상 재해로 인정하는 판결을 내렸다.',
    url: 'https://example.com/news/009',
    source: '한겨레',
    source_category: '종합일간지',
    category: '직업보건',
    keywords: '직업병,반도체,백혈병,대법원',
    author: '박기자',
    image_url: null,
    published_at: getRecentDate(2, 3),
  },
  // 화학안전 카테고리
  {
    title: '화학물질 취급 사업장 안전점검 결과 발표 - 위반 사례 증가',
    content: '환경부와 고용노동부가 합동으로 실시한 화학물질 취급 사업장 안전점검 결과, 위반 사례가 전년 대비 15% 증가한 것으로 나타났다.',
    summary: '합동 안전점검에서 화학물질 취급 사업장 위반 사례가 15% 증가한 것으로 확인됐다.',
    url: 'https://example.com/news/010',
    source: '환경부',
    source_category: '정부기관',
    category: '화학안전',
    keywords: '화학물질,안전점검,위반,환경부',
    author: '환경부',
    image_url: null,
    published_at: getRecentDate(3, 0),
  },
  {
    title: '유해화학물질 노출 기준 강화 고시 개정 예고',
    content: '고용노동부가 유해화학물질 노출 기준을 강화하는 고시 개정을 예고했다. 벤젠, 포름알데히드 등 17종의 허용 기준치가 낮아질 예정이다.',
    summary: '벤젠 등 17종 유해화학물질의 허용 노출 기준이 강화될 예정이다.',
    url: 'https://example.com/news/011',
    source: '고용노동부',
    source_category: '정부기관',
    category: '화학안전',
    keywords: '화학물질,유해화학물질,노출기준,고시',
    author: '고용노동부',
    image_url: null,
    published_at: getRecentDate(3, 2),
  },
  // 안전보건 카테고리
  {
    title: 'AI 기반 스마트 안전관리 시스템 도입 사업장 확대',
    content: '안전보건공단은 AI와 IoT 기술을 활용한 스마트 안전관리 시스템 보급을 확대한다. 올해 총 500개 사업장에 무상 지원할 계획이다.',
    summary: 'AI·IoT 기반 스마트 안전관리 시스템이 500개 사업장에 무상 보급된다.',
    url: 'https://example.com/news/012',
    source: '안전보건공단',
    source_category: '기관',
    category: '안전보건',
    keywords: 'AI,IoT,스마트안전,안전보건공단',
    author: '안전보건공단',
    image_url: null,
    published_at: getRecentDate(4, 0),
  },
  {
    title: '외국인 근로자 산업재해 예방 대책 마련 시급',
    content: '최근 외국인 근로자의 산업재해 발생 건수가 증가하면서 체계적인 예방 대책 마련이 시급하다는 지적이 나오고 있다. 언어 장벽으로 인한 안전교육 미흡이 주된 원인으로 지목되고 있다.',
    summary: '외국인 근로자 산업재해 증가에 따른 예방 대책 마련이 필요하다는 지적이 나왔다.',
    url: 'https://example.com/news/013',
    source: '경향신문',
    source_category: '종합일간지',
    category: '산업재해',
    keywords: '외국인근로자,산업재해,안전교육',
    author: '최기자',
    image_url: null,
    published_at: getRecentDate(4, 2),
  },
  {
    title: '온열 질환 예방 가이드라인 개정 - 야외 작업 기준 강화',
    content: '고용노동부는 기후변화에 대응하여 야외 작업 환경에서의 온열 질환 예방 가이드라인을 개정했다. 폭염 경보 시 야외 작업 중지 기준이 강화됐다.',
    summary: '폭염 시 야외 작업 중지 기준을 강화하는 온열 질환 예방 가이드라인이 개정됐다.',
    url: 'https://example.com/news/014',
    source: '정책브리핑(뉴스)',
    source_category: '정부기관',
    category: '직업보건',
    keywords: '온열질환,폭염,야외작업,가이드라인',
    author: '고용노동부',
    image_url: null,
    published_at: getRecentDate(5, 0),
  },
  {
    title: '안전보건관리체계 구축 지원 사업 공고 - 중소기업 우선 지원',
    content: '안전보건공단은 안전보건관리체계 구축 지원 사업 참여 기업을 모집한다. 올해는 중소기업을 우선 지원하며 1개 기업당 최대 5천만 원을 지원한다.',
    summary: '중소기업 안전보건관리체계 구축을 위해 최대 5천만 원을 지원하는 사업이 공고됐다.',
    url: 'https://example.com/news/015',
    source: '안전보건공단',
    source_category: '기관',
    category: '기관동향',
    keywords: '안전보건관리체계,중소기업,지원사업',
    author: '안전보건공단',
    image_url: null,
    published_at: getRecentDate(5, 3),
  },
  // 추가 데이터
  {
    title: '노동부-공단 합동 건설현장 기획감독 실시',
    content: '고용노동부와 안전보건공단은 오는 3월부터 6월까지 건설현장에 대한 합동 기획감독을 실시한다고 밝혔다.',
    summary: '3월부터 건설현장 합동 기획감독이 실시된다.',
    url: 'https://example.com/news/016',
    source: '고용노동부',
    source_category: '정부기관',
    category: '안전보건',
    keywords: '기획감독,건설현장,고용노동부',
    author: '고용노동부',
    image_url: null,
    published_at: getRecentDate(6, 0),
  },
  {
    title: '근골격계질환 예방 관리 지침 전면 개정',
    content: '고용노동부는 근골격계질환 예방 관리 지침을 13년 만에 전면 개정한다. 최신 연구 결과와 현장 의견을 반영하여 관리 기준을 현실화했다.',
    summary: '13년만에 근골격계질환 예방 관리 지침이 전면 개정됐다.',
    url: 'https://example.com/news/017',
    source: '매일노동뉴스',
    source_category: '전문지',
    category: '직업보건',
    keywords: '근골격계질환,예방,지침,개정',
    author: '정기자',
    image_url: null,
    published_at: getRecentDate(6, 4),
  },
  {
    title: '[입법예고] 산업안전보건법 시행령 개정안',
    content: '고용노동부는 산업안전보건법 시행령 개정안을 입법 예고했다. 위험성 평가 절차 간소화와 안전보건 관리 감독자 자격 요건이 주요 개정 내용이다.',
    summary: '산업안전보건법 시행령 개정안이 입법 예고됐다. 위험성 평가 절차가 간소화된다.',
    url: 'https://example.com/news/018',
    source: '법제처(산업안전보건)',
    source_category: '법령',
    category: '법령·제도',
    keywords: '산업안전보건법,시행령,입법예고,위험성평가',
    author: '법제처',
    image_url: null,
    published_at: getRecentDate(7, 0),
  },
  {
    title: '고압가스 취급 사고 예방 매뉴얼 배포',
    content: '안전보건공단은 고압가스 취급 과정에서 발생하는 사고를 예방하기 위한 매뉴얼을 제작·배포한다고 밝혔다.',
    summary: '안전보건공단이 고압가스 취급 사고 예방 매뉴얼을 배포한다.',
    url: 'https://example.com/news/019',
    source: '안전저널',
    source_category: '전문지',
    category: '화학안전',
    keywords: '고압가스,사고예방,매뉴얼',
    author: '안전저널',
    image_url: null,
    published_at: getRecentDate(7, 2),
  },
  {
    title: 'KOSHA 안전보건 국제 컨퍼런스 개최',
    content: '안전보건공단은 오는 4월 서울에서 아시아·태평양 지역 안전보건 전문가들이 참여하는 국제 컨퍼런스를 개최한다.',
    summary: 'KOSHA가 아태 지역 안전보건 국제 컨퍼런스를 서울에서 개최한다.',
    url: 'https://example.com/news/020',
    source: '안전보건공단',
    source_category: '기관',
    category: '기관동향',
    keywords: 'KOSHA,안전보건공단,국제컨퍼런스',
    author: '안전보건공단',
    image_url: null,
    published_at: getRecentDate(8, 0),
  },
];

function getRecentDate(daysAgo, hoursAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

function insertSampleData() {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM articles').get();
  if (count.cnt > 0) {
    console.log(`[샘플데이터] 기존 데이터 ${count.cnt}건 존재, 샘플 추가 건너뜀`);
    return;
  }

  let inserted = 0;
  for (const article of sampleArticles) {
    try {
      const result = insertArticle.run(article);
      if (result.changes > 0) inserted++;
    } catch (e) {
      // 무시
    }
  }
  console.log(`[샘플데이터] ${inserted}건 삽입 완료`);
}

module.exports = { insertSampleData };
