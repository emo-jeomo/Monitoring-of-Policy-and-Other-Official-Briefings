"""
KOSHA 언론모니터링 시스템 - 업데이트 노트 v2
시스템 v1.6 (KPI 수치 통일 버그 수정 반영)
"""
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

doc = Document()
sec = doc.sections[0]
sec.page_width = Cm(21); sec.page_height = Cm(29.7)
sec.left_margin = sec.right_margin = Cm(2.5)
sec.top_margin  = sec.bottom_margin = Cm(2.5)

# ── 헬퍼 ────────────────────────────────────────────────────
def sf(run, bold=False, size=10, color=None, italic=False):
    run.bold = bold; run.italic = italic
    run.font.size = Pt(size); run.font.name = '맑은 고딕'
    run._r.rPr.rFonts.set(qn('w:eastAsia'), '맑은 고딕')
    if color: run.font.color.rgb = RGBColor(*color)

def ps(p, before=0, after=0, line=None):
    pf = p.paragraph_format
    pf.space_before = Pt(before); pf.space_after = Pt(after)
    if line: pf.line_spacing = Pt(line)

def cbg(cell, hx):
    tc = cell._tc; pr = tc.get_or_add_tcPr()
    s = OxmlElement('w:shd')
    s.set(qn('w:val'),'clear'); s.set(qn('w:color'),'auto'); s.set(qn('w:fill'),hx)
    pr.append(s)

def H(text, lv=1, color=(27,79,114)):
    p = doc.add_paragraph()
    sz = {1:16,2:13,3:11.5,4:10.5}
    ps(p, before=14, after=5)
    r = p.add_run(text); sf(r, bold=True, size=sz.get(lv,11), color=color)
    return p

def B(text, indent=0, bold=False, color=None, size=9.5, before=2, after=2):
    p = doc.add_paragraph(); ps(p, before=before, after=after, line=14)
    if indent: p.paragraph_format.left_indent = Cm(indent)
    r = p.add_run(text); sf(r, bold=bold, size=size, color=color)
    return p

def DIV(color='2874A6'):
    p = doc.add_paragraph(); ps(p, before=0, after=4)
    pr = p._p.get_or_add_pPr(); bd = OxmlElement('w:pBdr')
    bt = OxmlElement('w:bottom')
    bt.set(qn('w:val'),'single'); bt.set(qn('w:sz'),'4')
    bt.set(qn('w:space'),'1');    bt.set(qn('w:color'),color)
    bd.append(bt); pr.append(bd)

def TH(tbl, headers, bg='1B4F72', fg=(255,255,255), sizes=None):
    row = tbl.rows[0]
    for i,h in enumerate(headers):
        c = row.cells[i]; cbg(c, bg)
        p = c.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        ps(p, before=4, after=4)
        r = p.add_run(h); sf(r, bold=True, size=sizes[i] if sizes else 9.5, color=fg)

def TR(tbl, vals, bgs=None, aligns=None, bold_cols=None, size=9):
    row = tbl.add_row()
    for i,v in enumerate(vals):
        c = row.cells[i]
        if bgs and i<len(bgs) and bgs[i]: cbg(c, bgs[i])
        p = c.paragraphs[0]
        p.alignment = (aligns[i] if aligns and i<len(aligns) else None) or WD_ALIGN_PARAGRAPH.LEFT
        ps(p, before=3, after=3, line=13)
        r = p.add_run(str(v)); sf(r, bold=bool(bold_cols and i in bold_cols), size=size)

def new_tbl(cols_cm, bg_header='1B4F72'):
    t = doc.add_table(rows=1, cols=len(cols_cm))
    t.style = 'Table Grid'; t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i,w in enumerate(cols_cm): t.columns[i].width = Cm(w)
    return t

# ════════════════════════════════════════════════════════════
# 표지
# ════════════════════════════════════════════════════════════
p0 = doc.add_paragraph(); ps(p0,before=56,after=8); p0.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=p0.add_run('KOSHA 언론모니터링 시스템'); sf(r,bold=True,size=22,color=(27,79,114))

p1=doc.add_paragraph(); ps(p1,before=4,after=6); p1.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=p1.add_run('시스템 업데이트 노트'); sf(r,bold=True,size=16,color=(40,116,166))

p2=doc.add_paragraph(); ps(p2,before=4,after=4); p2.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=p2.add_run('v1.0 → v1.6  |  2026년 9월 16일 기준'); sf(r,size=10.5,color=(100,100,100))

p3=doc.add_paragraph(); ps(p3,before=2,after=56); p3.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=p3.add_run('금번 추가: KPI 수치 기준 통일 (crawled_at) — 사이드바↔상단 카드 수치 불일치 해결')
sf(r,size=9,color=(120,120,120),italic=True)

pL=doc.add_paragraph(); pL.alignment=WD_ALIGN_PARAGRAPH.CENTER; ps(pL,before=0,after=0)
r=pL.add_run('─'*44); sf(r,size=10,color=(189,195,199))
doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 목차
# ════════════════════════════════════════════════════════════
H('목  차',1,(27,79,114)); DIV()
toc=[
    ('1.','시스템 개요 및 현황 (v1.6 기준)'),
    ('2.','전체 버전 업데이트 이력'),
    ('3.','v1.5 ~ v1.6 상세 변경 내역'),
    ('   3-1.','"지금 업데이트" 버튼 404 버그 수정 (v1.5)'),
    ('   3-2.','하단 3카드 등높이 + 호버 툴팁 신규 (v1.5)'),
    ('   3-3.','하단 3카드 아이템 높이 통일 ~34px (v1.5.1)'),
    ('   3-4.','KPI 수치 기준 불일치 수정 (v1.6) ★금번'),
    ('4.','현재 시스템 구성 요약'),
    ('5.','현재 DB 수집 현황 (2026-09-16 기준)'),
    ('6.','향후 개선 예정 사항'),
]
for num,title in toc:
    p=doc.add_paragraph(); ps(p,before=2,after=2)
    r=p.add_run(f'{num}  '); sf(r,bold=True,size=9.5,color=(40,116,166))
    r=p.add_run(title); sf(r,size=9.5)
doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 1. 시스템 개요
# ════════════════════════════════════════════════════════════
H('1.  시스템 개요 및 현황 (v1.6 기준)',1,(27,79,114)); DIV()
B('KOSHA 언론모니터링 시스템은 산업안전보건 관련 뉴스·법령·정책 보도자료를 자동 수집·분류하여 '
  '실시간 대시보드로 제공하는 Express.js 기반 웹 애플리케이션입니다.',size=9.5,before=4,after=6)

t=new_tbl([4.5,13.0])
TH(t,['구성 요소','내용'])
rows=[
    ('런타임','Node.js 20 / Express.js  ·  PM2 프로세스 관리 (kosha-monitor)'),
    ('데이터베이스','SQLite3 (data/kosha_news.db)  ·  better-sqlite3 드라이버'),
    ('크롤러 4종','① naverNews.js — 구글뉴스 RSS 32개 쿼리 + 전문지 RSS 7개 직접 수집\n'
                  '② policyBriefing.js — 고용노동부·KOSHA·정책브리핑·환경부 등 정부기관 RSS\n'
                  '③ legislation.js — 법제처 Open API + 한국법제연구원·고용부 법령 RSS\n'
                  '④ sampleData.js — 초기 시드 데이터 (기존 데이터 있으면 건너뜀)'),
    ('스케줄러','30분 주기 자동 크롤링 (scheduler.js)'),
    ('프론트엔드','Vanilla JS + CSS Custom Properties  ·  Tabler Icons  ·  Canvas API (도넛·바차트)'),
    ('API 엔드포인트','25개 REST API (/api/articles, /api/stats/*, /api/crawl 등)'),
    ('누적 수집','3,617건 (2026-09-16 기준)  ·  오늘 37건  ·  이번주 475건'),
]
for i,(k,v) in enumerate(rows):
    TR(t,[k,v],bgs=['EBF5FB'if i%2==0 else 'FFFFFF']*2,
       aligns=[WD_ALIGN_PARAGRAPH.CENTER,WD_ALIGN_PARAGRAPH.LEFT],bold_cols=[0],size=9)
doc.add_paragraph(); doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 2. 전체 버전 이력
# ════════════════════════════════════════════════════════════
H('2.  전체 버전 업데이트 이력',1,(27,79,114)); DIV()

t=new_tbl([1.6,3.0,2.5,10.4])
TH(t,['버전','커밋 ID','날짜','주요 내용 요약'])
ver_rows=[
    ('v1.0','364b167','2026-02-18','Express 서버·SQLite·크롤러·피드 UI 최초 구축'),
    ('v1.1','f0064c1','2026-09-01','다크테마 통합 / 크롤 완료 후 피드 자동갱신 / 모바일 반응형 초도 수정'),
    ('v1.2','2755657','2026-09-03','공사현장 추락·끼임·감전·질식 누락 수집 강화\nisRelevant() 컨텍스트 체크 도입'),
    ('v1.3','e391c97','2026-09-15','구글뉴스 쿼리 15→32개 확장 / 전문지 RSS 7개 직접수집 추가\n대시보드 신규: KPI 4종·도넛차트·수집트렌드·긴급·업종·지역 카드'),
    ('v1.4','286178f','2026-09-15','반응형 5단계 브레이크포인트(1100/900/768/640/480px) 전면 재작성\n드로어 UI 모바일 최적화 / Canvas DPR(Retina) 대응'),
    ('v1.4.1','e1bfb80','2026-09-15','대시보드 레이아웃 배치 전면 수정\nKPI 카드 크기 상향 / 도넛 180px / 트렌드 190px / 반응형 그리드 재정비'),
    ('v1.4.2','87feeb1','2026-09-15','카테고리별 현황 ↔ 수집 트렌드 카드 등높이 동기화\nalign-items:stretch + rAF×2 후 clientHeight 동적 측정'),
    ('v1.5','0996321','2026-09-15','① "지금 업데이트" POST /api/crawl 404 버그 수정\n② 하단 3카드 align-items:stretch 등높이\n③ DashTooltip 호버 툴팁 (트렌드·업종·지역 3곳)'),
    ('v1.5.1','2bf4083','2026-09-15','긴급·업종·지역 3카드 아이템 높이 ~34px 기준 통일\npadding·font·bar·gap·clamp 기준 정비 / 아이템 수 7·8·8개로 조정'),
    ('v1.6','7c03cad','2026-09-16','★ KPI 수치 기준 통일: published_at → crawled_at\n사이드바 "오늘 37건" ↔ KPI 카드 "오늘 13건" 불일치 해결\nKPI 카드 클릭 필터도 crawled_at 범위 기준으로 통일'),
]
for i,rv in enumerate(ver_rows):
    is_new = rv[0]=='v1.6'
    bg='FEF9E7' if is_new else ('EBF5FB' if i%2==0 else 'FFFFFF')
    TR(t,list(rv),bgs=[bg]*4,
       aligns=[WD_ALIGN_PARAGRAPH.CENTER]*3+[WD_ALIGN_PARAGRAPH.LEFT],
       bold_cols=[0,1] if is_new else [0],size=8.5)
doc.add_paragraph(); doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 3. v1.5 ~ v1.6 상세
# ════════════════════════════════════════════════════════════
H('3.  v1.5 ~ v1.6 상세 변경 내역',1,(27,79,114)); DIV()

# 3-1
H('3-1.  "지금 업데이트" 버튼 404 버그 수정 (v1.5)',2,(31,97,141))
t=new_tbl([3.0,14.5])
TH(t,['항목','내용'],bg='922B21')
rows31=[
    ('증상','상단 "지금 업데이트" 버튼 클릭 → "서버에 연결할 수 없습니다" 오류 알림'),
    ('원인','프론트엔드: POST /api/crawl 호출\n서버: router.all(\'/api/crawl/run\') 만 존재 → 경로 불일치 → 404'),
    ('해결','handleCrawl() 공용 핸들러 함수 추출\n→ router.post(\'/crawl\', handleCrawl) 신규 추가\n→ 기존 /crawl/run 하위 호환 유지'),
    ('검증','curl -X POST localhost:3000/api/crawl → 200 OK 확인'),
]
for i,(k,v) in enumerate(rows31):
    TR(t,[k,v],bgs=['FDEDEC'if i%2==0 else 'FFFFFF']*2,
       aligns=[WD_ALIGN_PARAGRAPH.CENTER,WD_ALIGN_PARAGRAPH.LEFT],bold_cols=[0],size=9)
doc.add_paragraph()

# 3-2
H('3-2.  하단 3카드 등높이 + 호버 툴팁 신규 (v1.5)',2,(31,97,141))
B('① 하단 3카드(긴급·업종·지역) align-items:stretch 적용으로 카드 높이 동기화',size=9.5,indent=0.3)
B('② DashTooltip 싱글턴 헬퍼 구현 — 대시보드 차트 3곳에 마우스 호버 팝업 추가',size=9.5,indent=0.3,before=1)

t=new_tbl([3.5,5.5,8.5])
TH(t,['대상 차트','표시 내용','구현 방식'],bg='1F618D')
rows32=[
    ('수집 트렌드 바차트','날짜·총 건수·카테고리별 분포','Canvas mousemove → 컬럼 인덱스 계산'),
    ('업종별 동향 바','업종명·기사 수·점유율(%)','li.mouseenter → DashTooltip.show()'),
    ('지역별 현황 바','지역명·건수·위험 레벨','div.mouseenter → DashTooltip.show()'),
]
for i,r in enumerate(rows32):
    TR(t,list(r),bgs=['EBF5FB'if i%2==0 else 'FFFFFF']*3,
       aligns=[WD_ALIGN_PARAGRAPH.CENTER,WD_ALIGN_PARAGRAPH.LEFT,WD_ALIGN_PARAGRAPH.LEFT],
       bold_cols=[0],size=9)
doc.add_paragraph()

# 3-3
H('3-3.  하단 3카드 아이템 높이 통일 ~34px (v1.5.1)',2,(31,97,141))
t=new_tbl([3.0,3.5,3.5,7.5])
TH(t,['카드','변경 전','변경 후','주요 변경 사항'],bg='117A65')
rows33=[
    ('긴급 모니터링','~58px / 6개','~34px / 7개','padding 6→4px, title 2줄→1줄 말줄임, gap 축소'),
    ('업종별 동향','~29px / 7개','~34px / 8개','min-height:34px, space-between 배분, badge 18→16px'),
    ('지역별 현황','~26px / 8개','~34px / 8개','min-height:34px, flex column, justify-content:center'),
]
for i,r in enumerate(rows33):
    TR(t,list(r),bgs=['EAFAF1'if i%2==0 else 'FFFFFF']*4,
       aligns=[WD_ALIGN_PARAGRAPH.CENTER]*3+[WD_ALIGN_PARAGRAPH.LEFT],bold_cols=[0],size=9)
doc.add_paragraph()
B('공통 기준: 이름 12px / 수치 11px / 메타(시간·뱃지) 10px / 바 두께 5px / gap→space-between',
  size=9,indent=0.3,before=2,after=6)

# 3-4 ★금번
H('3-4.  KPI 수치 기준 불일치 수정 (v1.6) ★금번 추가',2,(31,97,141))
B('증상: 좌측 사이드바 "오늘 수집 37건" ↔ 상단 KPI 카드 "오늘 수집 13건" — 동일 시점에 수치가 다르게 표시됨',
  size=9.5,indent=0.3,before=4)

t=new_tbl([3.5,4.0,4.0,6.0])
TH(t,['위치','호출 API','기존 기준','수정 후 기준'],bg='1B4F72')
rows34=[
    ('좌측 사이드바','GET /api/stats/dashboard','crawled_at (수집 시각)\n→ 오늘 37건 ✅','crawled_at 유지 (기준값)'),
    ('상단 KPI 카드','GET /api/stats/today-summary','published_at (기사 발행일)\n→ 오늘 13건 ❌','crawled_at으로 통일\n→ 오늘 37건 ✅'),
]
for i,r in enumerate(rows34):
    bg='FDEDEC' if i==1 else 'EBF5FB'
    TR(t,list(r),bgs=[bg]*4,
       aligns=[WD_ALIGN_PARAGRAPH.CENTER]*2+[WD_ALIGN_PARAGRAPH.LEFT]*2,
       bold_cols=[0],size=9)
doc.add_paragraph()
B('수정 범위 (api.js): today-summary 엔드포인트의 today / todayDisaster / todaySafety / week / weekDisaster 쿼리를\n'
  '  published_at → crawled_at 기준으로 전환. getUTCRangeForKSTDay(0) / getUTCHoursAgo(7×24) 헬퍼 활용.',
  size=9.5,indent=0.3,before=2)
B('수정 범위 (app.js): loadDashboardKPI() 클릭 핸들러가 API 응답의 todayRange를 직접 사용하여\n'
  '  KPI 카드 수치와 클릭 후 피드 필터 결과도 완전 일치.',
  size=9.5,indent=0.3,before=1,after=6)

# 검증 박스
pv=doc.add_paragraph(); ps(pv,before=2,after=2); pv.paragraph_format.left_indent=Cm(0.5)
rv=pv.add_run('검증 결과:  dashboard.today = 37  ✅   today-summary.today = 37  ✅   (수정 전 today-summary = 13 ❌)')
sf(rv,bold=True,size=9.5,color=(30,132,73))
doc.add_paragraph(); doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 4. 현재 시스템 구성
# ════════════════════════════════════════════════════════════
H('4.  현재 시스템 구성 요약',1,(27,79,114)); DIV()
H('4-1.  API 엔드포인트 목록',2,(31,97,141))

t=new_tbl([2.0,7.5,8.0])
TH(t,['메서드','경로','설명'])
api_rows=[
    ('GET', '/api/articles',             '전체 기사 목록 (검색·카테고리·정렬·페이지)'),
    ('GET', '/api/articles/latest',      '최신 기사 N건'),
    ('GET', '/api/articles/bookmarked',  '북마크 기사 목록'),
    ('GET', '/api/articles/urgent',      '긴급 기사 N건 (is_urgent=1)'),
    ('GET', '/api/articles/:id',         '기사 단건 상세'),
    ('POST','/api/articles/:id/bookmark','북마크 토글'),
    ('GET', '/api/stats/dashboard',      'KPI 4종 + 출처별 통계 (사이드바 기준)'),
    ('GET', '/api/stats/today-summary',  '오늘·이번주·전체 수집 요약 ★v1.6 crawled_at 기준으로 통일'),
    ('GET', '/api/stats/categories',     '카테고리별 기사 수'),
    ('GET', '/api/stats/keywords',       '키워드 빈도 TOP 8'),
    ('GET', '/api/stats/hourly',         '시간대별 수집 분포 (7일)'),
    ('GET', '/api/stats/hourly-today',   '오늘 시간대별 수집 분포'),
    ('GET', '/api/stats/daily-trend',    '일별 트렌드 (14일·카테고리별)'),
    ('GET', '/api/stats/weekly-trend',   '주별 트렌드'),
    ('GET', '/api/stats/industry',       '업종별 기사 수 (days 파라미터)'),
    ('GET', '/api/stats/region',         '지역별 기사 수 (days 파라미터)'),
    ('POST','/api/crawl',                '수동 크롤링 트리거 ★v1.5 신규'),
    ('ALL', '/api/crawl/run',            '크롤링 실행 (하위 호환)'),
    ('GET', '/api/crawl/status',         '크롤러 실행 상태'),
    ('GET', '/api/crawl/logs',           '크롤링 이력 로그'),
    ('GET', '/api/keywords',             '키워드 목록'),
    ('GET', '/api/filters',              '필터 옵션 (카테고리·언론사)'),
    ('GET', '/api/proxy/extract',        '외부 기사 원문 추출 프록시'),
    ('GET', '/api/proxy/content',        '외부 콘텐츠 프록시'),
    ('GET', '/api/stats/today-summary',  '통합 요약 (KPI 카드·이번주·중대재해)'),
]
for i,r in enumerate(api_rows):
    is_star='★' in r[2]
    bg='FEF9E7' if is_star else ('EBF5FB' if i%2==0 else 'FFFFFF')
    TR(t,list(r),bgs=[bg]*3,
       aligns=[WD_ALIGN_PARAGRAPH.CENTER,WD_ALIGN_PARAGRAPH.LEFT,WD_ALIGN_PARAGRAPH.LEFT],
       bold_cols=[0],size=8.5)
doc.add_paragraph()

H('4-2.  대시보드 UI 구성 및 상태',2,(31,97,141))
t=new_tbl([4.0,4.5,9.0])
TH(t,['UI 블록','구현 기술','현재 상태 / 특이사항'],bg='117A65')
ui_rows=[
    ('KPI 카드 4종','DOM + today-summary API','전체·오늘·중대재해·이번주 / ★v1.6 crawled_at 기준 통일'),
    ('카테고리별 현황','Canvas 도넛차트','180px / DPR 대응 / 4단계 반응형 / 범례 클릭 필터'),
    ('수집 트렌드','Canvas 바차트','14일 카테고리 스택 / stretch 동적 높이 / 호버 툴팁'),
    ('긴급 모니터링','DOM 리스트','7건 / 박스형 ~34px / 클릭→드로어'),
    ('업종별 동향','DOM + CSS 바','8건 / 리스트형 ~34px / 호버 툴팁'),
    ('지역별 현황','DOM + CSS 바','8건 / 위험레벨 뱃지 / 클릭→검색 연동 / 호버 툴팁'),
    ('호버 툴팁','DashTooltip 싱글턴','뷰포트 경계 자동 조정 / 0.12s 페이드인'),
    ('기사 드로어','DOM + 프록시 API','원문 추출·북마크·공유·외부 링크'),
    ('전역 검색','apiFetch+디바운스','키워드·카테고리·기간·언론사 복합 필터'),
    ('다크테마','CSS Custom Properties','라이트/다크 토글 / localStorage 저장'),
]
for i,r in enumerate(ui_rows):
    is_star='★' in r[2]
    bg='FEF9E7' if is_star else ('EAFAF1' if i%2==0 else 'FFFFFF')
    TR(t,list(r),bgs=[bg]*3,
       aligns=[WD_ALIGN_PARAGRAPH.CENTER]*2+[WD_ALIGN_PARAGRAPH.LEFT],
       bold_cols=[0],size=9)
doc.add_paragraph(); doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 5. DB 수집 현황
# ════════════════════════════════════════════════════════════
H('5.  현재 DB 수집 현황 (2026-09-16 기준)',1,(27,79,114)); DIV()
H('5-1.  카테고리별 누적 기사 수 (총 3,617건)',2,(31,97,141))

t=new_tbl([2.0,4.5,2.5,2.5,6.0])
TH(t,['순위','카테고리','기사 수','점유율','비고'])
db_rows=[
    ('1','산업재해·안전','1,100건','30.4%','fallback 기본값 포함, 가장 광범위'),
    ('2','중대재해',     '944건', '26.1%','중대재해처벌법 전량, 1순위 우선 분류'),
    ('3','직업보건·화학','494건', '13.7%','직업병·화학물질·작업환경'),
    ('4','법령·제도',    '462건', '12.8%','법제처 API + 고용노동부 법령 RSS'),
    ('5','정책·브리핑',  '386건', '10.7%','정부기관 보도자료'),
    ('6','기관동향',     '231건', '6.4%', 'KOSHA 보도자료·공지사항'),
    ('합계','─',        '3,617건','100%', '2026-09-16 기준 누적'),
]
for i,r in enumerate(db_rows):
    is_t=r[0]=='합계'
    bg='D6EAF8' if is_t else ('EBF5FB' if i%2==0 else 'FFFFFF')
    TR(t,list(r),bgs=[bg]*5,
       aligns=[WD_ALIGN_PARAGRAPH.CENTER]*4+[WD_ALIGN_PARAGRAPH.LEFT],
       bold_cols=[0,1,2] if is_t else [0],size=9)
doc.add_paragraph()

H('5-2.  키워드 빈도 TOP 8',2,(31,97,141))
t=new_tbl([2.0,4.5,11.0])
TH(t,['순위','키워드','빈도'],bg='2874A6')
kw_rows=[
    ('1','중대재해','55건'),('2','안전보건','40건'),('3','끼임','35건'),
    ('4','산업안전','28건'),('5','산재','26건'),('6','사망사고','23건'),
    ('7','끼임 사망','22건'),('8','산업재해','18건'),
]
for i,r in enumerate(kw_rows):
    TR(t,list(r),bgs=['EBF5FB'if i%2==0 else 'FFFFFF']*3,
       aligns=[WD_ALIGN_PARAGRAPH.CENTER]*3,bold_cols=[0,1],size=9)
doc.add_paragraph()

H('5-3.  업종별 동향 (최근 30일)',2,(31,97,141))
t=new_tbl([2.0,4.5,11.0])
TH(t,['순위','업종','기사 수'],bg='117A65')
ind_rows=[
    ('1','건설업','77건'),('2','제조업','40건'),('3','물류·운수','29건'),
    ('4','석유화학','4건'),('5','조선·해양','2건'),('6','서비스업','1건'),
    ('7','광업','1건'),('8','농업·임업','0건'),
]
for i,r in enumerate(ind_rows):
    TR(t,list(r),bgs=['EAFAF1'if i%2==0 else 'FFFFFF']*3,
       aligns=[WD_ALIGN_PARAGRAPH.CENTER]*3,bold_cols=[0,1],size=9)
doc.add_paragraph(); doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 6. 향후 개선 예정
# ════════════════════════════════════════════════════════════
H('6.  향후 개선 예정 사항',1,(27,79,114)); DIV()
B('현재까지 v1.6까지의 개선이 완료되었으며, 아래 항목이 다음 개선 대상입니다.',size=9.5,before=4,after=6)

t=new_tbl([2.5,15.0])
TH(t,['구분','주요 개선 내용'],bg='6C3483')
future=[
    ('단기\n(UI/UX)',
     '• 수집 트렌드 기간 선택 토글 (7일/14일/30일)\n'
     '• 지역별 현황 → SVG 한국 지도 시각화 전환 검토\n'
     '• KPI 카드 전일 대비 증감 화살표 고도화\n'
     '• 기사 드로어 내 연관 기사 추천 표시'),
    ('중기\n(크롤러)',
     '• 크롤링 실패 시 재시도 로직 (exponential backoff)\n'
     '• 구글뉴스 쿼리 추가 (온열질환·이주노동자·ESG안전)\n'
     '• 중복 기사 탐지 알고리즘 개선 (퍼지 매칭)\n'
     '• Playwright 기반 JS 렌더링 페이지 수집 지원'),
    ('장기\n(고도화)',
     '• LLM 기반 자동 요약·위험도 평가 모듈\n'
     '• 이메일·슬랙 알림 (중대재해 발생 시 실시간 Push)\n'
     '• 주간 리포트 자동 생성 (PDF 이메일 발송)\n'
     '• 사용자 권한 관리 및 인증 체계 도입'),
]
for i,(period,tasks) in enumerate(future):
    bg='F5EEF8' if i==0 else ('EBF5FB' if i==1 else 'FEF9E7')
    TR(t,[period,tasks],bgs=[bg,bg],
       aligns=[WD_ALIGN_PARAGRAPH.CENTER,WD_ALIGN_PARAGRAPH.LEFT],
       bold_cols=[0],size=9)

doc.add_paragraph()
B(f'※ 본 문서는 2026년 9월 16일 기준 시스템 v1.6 상태를 기준으로 작성되었습니다.',
  size=9,before=8,after=2)

out='/home/user/webapp/KOSHA_시스템_업데이트_노트_v2.docx'
doc.save(out); print(f'✅ 업데이트 노트 v2 저장: {out}')
