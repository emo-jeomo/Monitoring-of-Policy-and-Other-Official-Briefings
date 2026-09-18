"""
KOSHA 언론모니터링 - 카테고리 키워드 분류 체계 문서 생성 v3
시스템 v1.6 기준 업데이트 반영 (KPI 수치 통일 버그 수정 포함)
"""
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

doc = Document()

# ── 페이지 여백 ──────────────────────────────────────────────
section = doc.sections[0]
section.page_width    = Cm(21)
section.page_height   = Cm(29.7)
section.left_margin   = Cm(2.5)
section.right_margin  = Cm(2.5)
section.top_margin    = Cm(2.5)
section.bottom_margin = Cm(2.5)

# ── 헬퍼 함수 ────────────────────────────────────────────────
def sf(run, bold=False, size=10, color=None, italic=False):
    run.bold   = bold
    run.italic = italic
    run.font.size = Pt(size)
    run.font.name = '맑은 고딕'
    run._r.rPr.rFonts.set(qn('w:eastAsia'), '맑은 고딕')
    if color:
        run.font.color.rgb = RGBColor(*color)

def ps(p, before=0, after=0, line=None):
    pf = p.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after  = Pt(after)
    if line:
        pf.line_spacing = Pt(line)

def cell_bg(cell, hex_color):
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd  = OxmlElement('w:shd')
    shd.set(qn('w:val'),   'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'),  hex_color)
    tcPr.append(shd)

def heading(text, level=1, color=(27,79,114)):
    p = doc.add_paragraph()
    sizes = {1:16, 2:13, 3:11.5, 4:10.5}
    ps(p, before=14, after=5)
    run = p.add_run(text)
    sf(run, bold=True, size=sizes.get(level,11), color=color)
    return p

def body(text, indent=0, bold=False, color=None, size=9.5, before=2, after=2):
    p = doc.add_paragraph()
    ps(p, before=before, after=after, line=14)
    if indent:
        p.paragraph_format.left_indent = Cm(indent)
    run = p.add_run(text)
    sf(run, bold=bold, size=size, color=color)
    return p

def divider(color='2874A6'):
    p = doc.add_paragraph()
    ps(p, before=0, after=4)
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'),   'single')
    bottom.set(qn('w:sz'),    '4')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), color)
    pBdr.append(bottom)
    pPr.append(pBdr)

def tbl_header(table, headers, bg='1B4F72', fg=(255,255,255), sizes=None):
    row = table.rows[0]
    for i, h in enumerate(headers):
        c = row.cells[i]
        cell_bg(c, bg)
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        ps(p, before=4, after=4)
        run = p.add_run(h)
        sz = sizes[i] if sizes else 9.5
        sf(run, bold=True, size=sz, color=fg)

def tbl_row(table, values, bgs=None, aligns=None, bold_cols=None, size=9):
    row = table.add_row()
    for i, v in enumerate(values):
        c = row.cells[i]
        if bgs and i < len(bgs) and bgs[i]:
            cell_bg(c, bgs[i])
        p = c.paragraphs[0]
        align = (aligns[i] if aligns and i < len(aligns) else None) or WD_ALIGN_PARAGRAPH.LEFT
        p.alignment = align
        ps(p, before=3, after=3, line=13)
        bld = bool(bold_cols and i in bold_cols)
        run = p.add_run(str(v))
        sf(run, bold=bld, size=size)

# ════════════════════════════════════════════════════════════
# 표지
# ════════════════════════════════════════════════════════════
p_title = doc.add_paragraph()
ps(p_title, before=60, after=8)
p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p_title.add_run('KOSHA 언론모니터링 시스템')
sf(r, bold=True, size=22, color=(27,79,114))

p_sub = doc.add_paragraph()
ps(p_sub, before=4, after=6)
p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
r2 = p_sub.add_run('카테고리 키워드 분류 체계')
sf(r2, bold=True, size=16, color=(40,116,166))

p_ver = doc.add_paragraph()
ps(p_ver, before=6, after=4)
p_ver.alignment = WD_ALIGN_PARAGRAPH.CENTER
r3 = p_ver.add_run('기술 문서 v3.0  |  2026년 9월 16일 (시스템 v1.6 기준)')
sf(r3, bold=False, size=10.5, color=(100,100,100))

p_chg = doc.add_paragraph()
ps(p_chg, before=2, after=60)
p_chg.alignment = WD_ALIGN_PARAGRAPH.CENTER
r4 = p_chg.add_run('v2 대비 변경: DB 통계 갱신 (3,566→3,617건) / v1.6 KPI 날짜 기준 통일 반영 / crawled_at 기준 명시')
sf(r4, bold=False, size=9, color=(120,120,120), italic=True)

p_line = doc.add_paragraph()
p_line.alignment = WD_ALIGN_PARAGRAPH.CENTER
ps(p_line, before=0, after=0)
r5 = p_line.add_run('─' * 44)
sf(r5, bold=False, size=10, color=(189,195,199))

doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 목차
# ════════════════════════════════════════════════════════════
heading('목  차', level=1, color=(27,79,114))
divider()

toc = [
    ('1.', '개요 — 시스템 구성 및 데이터 흐름'),
    ('2.', '3단계 분류 작동 원리'),
    ('3.', '1단계: 수집 진입 필터 키워드'),
    ('   3-1.', '필수 포함 키워드 (REQUIRED_KEYWORDS) — 46개 ★확장'),
    ('   3-2.', '차단 키워드 (EXCLUDE_KEYWORDS)'),
    ('   3-3.', '사고유형 단독+컨텍스트 복합 체크'),
    ('   3-4.', '긴급 키워드 (URGENT_KEYWORDS)'),
    ('4.', '2단계: 검색 쿼리별 기본 카테고리 (구글뉴스 RSS) — 32개 ★확장'),
    ('5.', '3단계: 최종 분류 정규식 — 6개 카테고리 상세'),
    ('   5-1.', '중대재해'),
    ('   5-2.', '산업재해·안전'),
    ('   5-3.', '법령·제도'),
    ('   5-4.', '직업보건·화학'),
    ('   5-5.', '정책·브리핑'),
    ('   5-6.', '기관동향'),
    ('6.', '전체 분류 흐름도'),
    ('7.', '실제 DB 통계 (2026년 9월 16일 기준)'),
    ('   7-3.', 'v1.6 날짜 기준 통일 — crawled_at vs published_at'),
    ('8.', '분류 우선순위 및 주의사항'),
    ('9.', '크롤러별 수집 출처 목록 ★확장'),
]
for num, title in toc:
    p = doc.add_paragraph()
    ps(p, before=2, after=2)
    r_n = p.add_run(f'{num}  ')
    sf(r_n, bold=True, size=9.5, color=(40,116,166))
    r_t = p.add_run(title)
    sf(r_t, bold=False, size=9.5)

doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 1. 개요
# ════════════════════════════════════════════════════════════
heading('1.  개요 — 시스템 구성 및 데이터 흐름', level=1, color=(27,79,114))
divider()
body('KOSHA 언론모니터링 시스템은 산업안전보건 관련 뉴스·법령·정책 보도자료를 자동 수집·분류하여 '
     '6개 카테고리로 구조화하는 크롤러 기반 모니터링 플랫폼입니다. '
     '총 4종의 크롤러가 30분 주기로 실행되며 SQLite DB에 누적 저장합니다.', size=9.5, before=4, after=6)

t_ov = doc.add_table(rows=1, cols=3)
t_ov.style = 'Table Grid'
t_ov.alignment = WD_TABLE_ALIGNMENT.CENTER
t_ov.columns[0].width = Cm(3.5)
t_ov.columns[1].width = Cm(5.0)
t_ov.columns[2].width = Cm(9.0)
tbl_header(t_ov, ['크롤러 파일', '수집 방식', '주요 수집 대상'], bg='1B4F72')
ov_rows = [
    ('naverNews.js',      '구글뉴스 RSS\n+ 전문지 RSS 직접',
     '32개 검색쿼리(구글뉴스) + 안전저널·안전신문·매일노동뉴스·이로운넷·세이프티퍼스트·노동과세계·한국경제 등 7개 전문지 RSS'),
    ('policyBriefing.js', '정부기관 RSS',
     '고용노동부·안전보건공단·정책브리핑·환경부·국토안전관리원·화학물질안전원'),
    ('legislation.js',    '법제처 Open API\n+ 법령 RSS',
     '산업안전보건·중대재해처벌·산업재해보상·화학물질관리 법령\n한국법제연구원·고용노동부 법령 RSS'),
    ('sampleData.js',     '초기 시드',
     '첫 실행 시 기존 데이터 없을 경우에만 샘플 기사 삽입'),
]
for i, r in enumerate(ov_rows):
    bg = 'EBF5FB' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_ov, list(r), bgs=[bg]*3,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[0], size=9)

doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 2. 3단계 분류 원리
# ════════════════════════════════════════════════════════════
heading('2.  3단계 분류 작동 원리', level=1, color=(27,79,114))
divider()
body('기사 한 건이 수집되어 최종 카테고리가 결정되기까지 아래 3단계를 순서대로 거칩니다.', size=9.5, before=4, after=6)

t_flow = doc.add_table(rows=1, cols=4)
t_flow.style = 'Table Grid'
t_flow.alignment = WD_TABLE_ALIGNMENT.CENTER
t_flow.columns[0].width = Cm(1.5)
t_flow.columns[1].width = Cm(3.5)
t_flow.columns[2].width = Cm(5.5)
t_flow.columns[3].width = Cm(7.0)
tbl_header(t_flow, ['단계', '처리 위치', '판단 기준', '결과'], bg='1B4F72')
flow_rows = [
    ('1단계', 'isRelevant()\n(naverNews.js)', 
     '① EXCLUDE_KEYWORDS 체크 (제목)\n② REQUIRED_KEYWORDS 체크 (제목+본문)\n③ 사고유형 단독 + 컨텍스트 복합 체크',
     'false → 즉시 폐기\ntrue → 2단계 진행'),
    ('2단계', 'SEARCH_QUERIES\ncat 필드',
     '구글뉴스 RSS 검색쿼리 실행 시\n각 쿼리에 미리 지정된 기본 cat 값',
     '기본 카테고리 임시 할당\n(3단계에서 덮어쓸 수 있음)'),
    ('3단계', 'extractCategory()\ncategorize()',
     '제목+본문에 대해 정규식 순서 적용\n중대재해→산업재해→화학→법령→정책→기관',
     '최종 카테고리 확정\nDB 저장'),
]
for i, r in enumerate(flow_rows):
    bg = 'EBF5FB' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_flow, list(r), bgs=[bg]*4,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER]*2 + [WD_ALIGN_PARAGRAPH.LEFT]*2,
            bold_cols=[0], size=9)

doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 3. 1단계: 수집 진입 필터
# ════════════════════════════════════════════════════════════
heading('3.  1단계: 수집 진입 필터 키워드', level=1, color=(27,79,114))
divider()

# 3-1 필수 포함 키워드
heading('3-1.  필수 포함 키워드 (REQUIRED_KEYWORDS) — 46개', level=2, color=(31,97,141))
body('아래 46개 키워드 중 최소 1개가 제목 또는 본문에 포함되어야 DB에 저장됩니다.\n'
     '단 하나도 없는 기사는 카테고리 판단 없이 즉시 폐기됩니다.',
     size=9.5, before=2, after=4)

# v1.0 대비 v2.0 추가된 키워드 표시
t_req = doc.add_table(rows=1, cols=4)
t_req.style = 'Table Grid'
t_req.alignment = WD_TABLE_ALIGNMENT.CENTER
t_req.columns[0].width = Cm(1.5)
t_req.columns[1].width = Cm(4.5)
t_req.columns[2].width = Cm(4.5)
t_req.columns[3].width = Cm(7.0)
tbl_header(t_req, ['#', '키워드', '그룹', '비고'], bg='1B4F72')

req_kws = [
    # 산업안전보건 핵심 (기존)
    (1,  '산업안전',         '핵심',     ''),
    (2,  '안전보건',         '핵심',     ''),
    (3,  '산업재해',         '핵심',     ''),
    (4,  '중대재해',         '핵심',     ''),
    (5,  '직업병',           '직업보건', ''),
    (6,  '직업성',           '직업보건', ''),
    (7,  '화학물질',         '화학',     ''),
    (8,  '유해물질',         '화학',     ''),
    (9,  '작업환경',         '환경',     ''),
    (10, '노출기준',         '환경',     ''),
    (11, '안전보건공단',     '기관',     ''),
    (12, 'KOSHA',            '기관',     ''),
    (13, '고용노동부',       '기관',     ''),
    (14, '근로감독',         '행정',     ''),
    (15, '위험성평가',       '관리',     ''),
    (16, '보건관리',         '관리',     ''),
    (17, '안전관리자',       '관리',     ''),
    (18, '중대산업',         '핵심',     ''),
    (19, '사업장 안전',      '핵심',     ''),
    (20, '근로자 사망',      '사고',     ''),
    (21, '추락사망',         '사고유형', ''),
    (22, '산재',             '핵심',     ''),
    (23, '산업보건',         '핵심',     ''),
    (24, '근골격계',         '직업보건', ''),
    (25, '직업성질환',       '직업보건', ''),
    (26, '화학사고',         '화학',     ''),
    (27, '유해위험',         '환경',     ''),
    (28, '안전교육',         '관리',     ''),
    (29, '안전불감',         '관리',     ''),
    (30, '산재보험',         '보상',     ''),
    (31, '작업중지',         '행정',     ''),
    # 사고유형 복합 (v2 확장)
    (32, '추락 사망',        '사고유형', '★v2 추가'),
    (33, '추락해 숨',        '사고유형', '★v2 추가'),
    (34, '추락사고',         '사고유형', '★v2 추가'),
    (35, '끼임 사망',        '사고유형', '★v2 추가'),
    (36, '끼임사고',         '사고유형', '★v2 추가'),
    (37, '감전 사망',        '사고유형', '★v2 추가'),
    (38, '감전사고',         '사고유형', '★v2 추가'),
    (39, '질식 사망',        '사고유형', '★v2 추가'),
    (40, '질식사고',         '사고유형', '★v2 추가'),
    (41, '폭발사고',         '사고유형', '★v2 추가'),
    (42, '사망사고',         '사고',     '★v2 추가'),
    # 업무상 질병 (v2 확장)
    (43, '업무상질병',       '직업보건', '★v2 추가'),
    (44, '업무상재해',       '직업보건', '★v2 추가'),
    (45, '특수건강검진',     '직업보건', '★v2 추가'),
    (46, '이주노동자 안전',  '외국인',   '★v2 추가'),
]

grp_colors = {
    '핵심':    'FDFEFE',
    '직업보건':'F5EEF8',
    '화학':    'FDFEFE',
    '환경':    'FDFEFE',
    '기관':    'EBF5FB',
    '행정':    'FDFEFE',
    '관리':    'FDFEFE',
    '사고':    'FDEDEC',
    '사고유형':'FDEDEC',
    '보상':    'FDFEFE',
    '외국인':  'FEF9E7',
}
for num, kw, grp, note in req_kws:
    bg = grp_colors.get(grp, 'FFFFFF')
    note_bg = 'FEF9E7' if note else bg
    is_new = bool(note)
    tbl_row(t_req, [str(num), kw, grp, note],
            bgs=[bg, bg, bg, note_bg],
            aligns=[WD_ALIGN_PARAGRAPH.CENTER]*3 + [WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[1] if is_new else [],
            size=9)

doc.add_paragraph()

# 3-2 차단 키워드
heading('3-2.  차단 키워드 (EXCLUDE_KEYWORDS) — 제목 기준 적용', level=2, color=(31,97,141))
body('아래 키워드 중 하나라도 기사 제목에 포함되면 내용 무관하게 즉시 수집에서 제외됩니다.\n'
     '필수 키워드 포함 여부보다 차단 키워드 체크가 먼저 실행됩니다.',
     size=9.5, before=2, after=4)

t_exc = doc.add_table(rows=1, cols=3)
t_exc.style = 'Table Grid'
t_exc.alignment = WD_TABLE_ALIGNMENT.CENTER
t_exc.columns[0].width = Cm(3.5)
t_exc.columns[1].width = Cm(10.0)
t_exc.columns[2].width = Cm(4.0)
tbl_header(t_exc, ['분류', '차단 키워드', '차단 이유'], bg='922B21', fg=(255,255,255))

exc_groups = [
    ('사회면 잡보',
     '교통사고, 음주운전, 자살, 살인, 강도, 절도',
     '무관 범죄·사고'),
    ('연예·문화',
     '연예, 스포츠, 날씨, 영화, 공연, 맛집, 레시피, 캠핑, 여행',
     '무관 분야'),
    ('금융·부동산',
     '증시, 주식, 부동산, 아파트, 카드포인트, 연금',
     '무관 분야'),
    ('교육·정치',
     '대학입시, 수능, 교육청, 민생회복, 선거, 외교, 국방',
     '무관 정책'),
    ('경제 일반',
     '스타트업, 벤처, 의료보험, 건강보험, 코로나, 독감',
     '산업안전 무관'),
    ('비리·비위',
     '사기, 횡령, 뇌물, 비리, 부패, 양육비',
     '무관 범죄'),
    ('비산업 추락/사고\n(노이즈 제거)',
     '놀이동산, 롤러코스터, 스키장, 등산, 낙상,\n번지점프, 항공기, 산악, 익스트림',
     '★v2 추가\n비산업 추락 노이즈'),
]
for i, (grp, kws, reason) in enumerate(exc_groups):
    bg = 'FDEDEC' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_exc, [grp, kws, reason], bgs=[bg]*3,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[0], size=9)

doc.add_paragraph()

# 3-3 사고유형 컨텍스트
heading('3-3.  사고유형 단독 키워드 + 컨텍스트 복합 체크 ★v2 신규', level=2, color=(31,97,141))
body('"추락", "끼임", "감전", "질식" 등 사고 유형 단독 키워드는 필수 키워드 표에 포함되나,\n'
     '사업장 컨텍스트 키워드와 함께 등장해야만 수집 대상으로 인정합니다.\n'
     '(예: "스키장 추락" → 차단, "공사현장 추락 사망" → 수집)',
     size=9.5, before=2, after=4)

t_ctx = doc.add_table(rows=1, cols=2)
t_ctx.style = 'Table Grid'
t_ctx.alignment = WD_TABLE_ALIGNMENT.CENTER
t_ctx.columns[0].width = Cm(5.0)
t_ctx.columns[1].width = Cm(12.5)
tbl_header(t_ctx, ['구분', '키워드 목록'], bg='117A65')
ctx_rows = [
    ('사고유형 단독 키워드\n(4종)',
     '추락 / 끼임 / 감전 / 질식'),
    ('사업장 컨텍스트 키워드\n(AND 조건 필요)',
     '사업장, 공사, 현장, 근로자, 작업자, 노동자, 공장, 건설,\n'
     '작업, 숨져, 숨졌, 숨진, 산업현장, 작업장, 제조, 조선소, 항만, 물류센터'),
]
for i, r in enumerate(ctx_rows):
    bg = 'EAFAF1' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_ctx, list(r), bgs=[bg, bg],
            aligns=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[0], size=9)

doc.add_paragraph()

# 3-4 긴급 키워드
heading('3-4.  긴급 키워드 (URGENT_KEYWORDS) — is_urgent 플래그 부여', level=2, color=(31,97,141))
body('아래 키워드가 제목 또는 본문에 포함된 기사에는 is_urgent=1 플래그가 부여되어 '
     '"긴급 모니터링" 카드에 우선 표시됩니다.', size=9.5, before=2, after=4)

t_urg = doc.add_table(rows=1, cols=2)
t_urg.style = 'Table Grid'
t_urg.alignment = WD_TABLE_ALIGNMENT.CENTER
t_urg.columns[0].width = Cm(8.0)
t_urg.columns[1].width = Cm(9.5)
tbl_header(t_urg, ['긴급 키워드', '의미'], bg='C0392B', fg=(255,255,255))
urg_rows = [
    ('명 사망', '복수 사망자 발생'),
    ('사망자', '사망자 언급'),
    ('수십 명', '대규모 피해'),
    ('다수 사망', '다수 인명 피해'),
    ('대규모', '대규모 사고'),
    ('연속 사망', '반복·연속 사고'),
    ('올해만', '올해 누적 사고 강조'),
    ('또 사망', '반복 사고 패턴'),
    ('반복 사망', '구조적 반복 사고'),
    ('처음', '최초 사례 (첫 구속·첫 선고 등)'),
    ('첫 구속', '중대재해 첫 구속'),
]
for i, (kw, meaning) in enumerate(urg_rows):
    bg = 'FDEDEC' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_urg, [kw, meaning], bgs=[bg]*2,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[0], size=9)

doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 4. 2단계: 검색 쿼리 (v2: 32개)
# ════════════════════════════════════════════════════════════
heading('4.  2단계: 검색 쿼리별 기본 카테고리 (구글뉴스 RSS) — 32개', level=1, color=(27,79,114))
divider()
body('구글뉴스 크롤러(naverNews.js)는 아래 32개 검색 쿼리로 RSS를 수집합니다.\n'
     '각 쿼리에는 기본 카테고리(cat)와 우선순위 가중치(weight)가 부여되며, '
     '3단계 extractCategory()에 의해 최종 분류가 확정됩니다.\n'
     '★ v1.0 대비 15→32개로 확장. 사고유형 세분화·외국인 노동자·수사·압수수색 쿼리 신규 추가.',
     size=9.5, before=4, after=6)

t_q = doc.add_table(rows=1, cols=4)
t_q.style = 'Table Grid'
t_q.alignment = WD_TABLE_ALIGNMENT.CENTER
t_q.columns[0].width = Cm(1.5)
t_q.columns[1].width = Cm(6.5)
t_q.columns[2].width = Cm(3.5)
t_q.columns[3].width = Cm(6.0)
tbl_header(t_q, ['#', '검색 쿼리 (q)', '기본 카테고리', '비고'], bg='1B4F72')

queries = [
    # 중대재해
    (1,  '중대재해처벌법',              '중대재해',       'weight:10'),
    (2,  '중대재해 사망 기소',           '중대재해',       'weight:10'),
    (3,  '중대재해 구속 입건',           '중대재해',       'weight:9'),
    (4,  '중대재해처벌 판결 선고',        '중대재해',       'weight:9'),
    (5,  '중대재해 수사 압수수색',        '중대재해',       'weight:8 ★신규'),
    # 법령·제도
    (6,  '산업안전보건법 개정',          '법령·제도',      'weight:9'),
    (7,  '안전보건 고시 시행규칙',        '법령·제도',      'weight:8'),
    (8,  '산업재해보상보험법',           '법령·제도',      'weight:7'),
    (9,  '위험기계 안전인증 고시',        '법령·제도',      'weight:6'),
    # 산업재해·안전
    (10, '산업재해 사망 근로자',         '산업재해·안전',  'weight:9'),
    (11, '공사현장 추락 사망',           '산업재해·안전',  'weight:9 ★신규'),
    (12, '건설현장 추락 사망',           '산업재해·안전',  'weight:8 ★신규'),
    (13, '사업장 사망사고 노동자',        '산업재해·안전',  'weight:8 ★신규'),
    (14, '끼임 사망 중대재해',           '산업재해·안전',  'weight:8 ★신규'),
    (15, '감전 사망 산업재해',           '산업재해·안전',  'weight:7 ★신규'),
    (16, '질식 사망 밀폐공간',           '산업재해·안전',  'weight:7 ★신규'),
    (17, '폭발사고 사업장 사망',         '산업재해·안전',  'weight:7 ★신규'),
    (18, '외국인 근로자 사망 산재',       '산업재해·안전',  'weight:7 ★신규'),
    (19, '이주노동자 산업재해 사망',      '산업재해·안전',  'weight:7 ★신규'),
    (20, '근로자 안전사고 작업중지',      '산업재해·안전',  'weight:6 ★신규'),
    (21, '위험성평가 안전보건',          '산업재해·안전',  'weight:6 ★신규'),
    # 직업보건·화학
    (22, '직업병 인정 산업보건',         '직업보건·화학',  'weight:8'),
    (23, '화학물질 사고 사업장',         '직업보건·화학',  'weight:7'),
    (24, '작업환경 유해물질 노출',        '직업보건·화학',  'weight:7'),
    (25, '석면 직업성암 소송',           '직업보건·화학',  'weight:6'),
    (26, '소음성난청 직업병 인정',        '직업보건·화학',  'weight:6'),
    (27, '근골격계 질환 업무상질병',      '직업보건·화학',  'weight:6'),
    (28, '유해화학물질 누출 사고',        '직업보건·화학',  'weight:7 ★신규'),
    (29, '작업환경측정 특수건강검진',     '직업보건·화학',  'weight:5'),
    # 기관·정책
    (30, '안전보건공단 KOSHA',           '기관동향',       'weight:8'),
    (31, '고용노동부 산업안전 정책',      '정책·브리핑',    'weight:8'),
    (32, '고용노동부 근로감독 특별',      '정책·브리핑',    'weight:7'),
]

cat_bg = {
    '중대재해':    'FDEDEC',
    '법령·제도':   'EBF5FB',
    '산업재해·안전':'FEF9E7',
    '직업보건·화학':'F5EEF8',
    '기관동향':    'EAFAF1',
    '정책·브리핑': 'FDF2F8',
}
for num, q, cat, note in queries:
    bg = cat_bg.get(cat, 'FFFFFF')
    is_new = '★신규' in note
    tbl_row(t_q, [str(num), q, cat, note],
            bgs=[bg]*4,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER]*3 + [WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[1] if is_new else [],
            size=8.5)

doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 5. 3단계: 최종 분류 정규식
# ════════════════════════════════════════════════════════════
heading('5.  3단계: 최종 분류 정규식 — 6개 카테고리 상세', level=1, color=(27,79,114))
divider()
body('extractCategory() 함수(naverNews.js) 및 categorize() 함수(policyBriefing.js)가\n'
     '기사 제목+본문에 대해 아래 정규식을 순서대로 적용하여 최종 카테고리를 확정합니다.\n'
     '우선순위: 중대재해 → 산업재해·안전 → 직업보건·화학 → 법령·제도 → 정책·브리핑 → 기관동향',
     size=9.5, before=4, after=6)

# 각 카테고리 상세 테이블
cat_details = [
    ('5-1', '중대재해', '1B4F72', '938건', 'FDEDEC',
     '중대재해처벌|중대재해',
     [
         ('중대재해처벌', '중대재해처벌법 관련 모든 기사'),
         ('중대재해',     '"중대재해"가 포함된 모든 기사 → 1순위 덮어쓰기'),
     ]),
    ('5-2', '산업재해·안전', '117A65', '1,081건', 'FEF9E7',
     '산업재해|재해예방|재해사고|추락사|추락해|추락 사망|추락사고\n|끼임|끼임사고|끼임 사망|감전사|감전사고|감전 사망\n|질식사고|질식 사망|건설현장|공사현장|사업장 사망|사망사고\n|이주노동자|외국인 근로자',
     [
         ('산업재해|재해예방|재해사고', '산업재해 총칭'),
         ('추락사|추락해|추락 사망|추락사고', '추락 사고 전 유형'),
         ('끼임|끼임사고|끼임 사망', '협착·끼임 사고 ★v2 추가'),
         ('감전사|감전사고|감전 사망', '감전 사고 ★v2 추가'),
         ('질식사고|질식 사망', '질식 사고 ★v2 추가'),
         ('건설현장|공사현장|사업장 사망|사망사고', '현장 사망사고'),
         ('이주노동자|외국인 근로자', '외국인 노동자 사고 ★v2 추가'),
     ]),
    ('5-3', '법령·제도', '1F618D', '459건', 'EBF5FB',
     '법령|고시|시행령|시행규칙|개정|입법|법안|규칙|자율안전확인|안전인증',
     [
         ('법령|고시|시행령|시행규칙', '법령 제·개정 전반'),
         ('개정|입법|법안|규칙', '입법 절차 관련'),
         ('자율안전확인|안전인증', '인증 제도'),
     ]),
    ('5-4', '직업보건·화학', '6C3483', '481건', 'F5EEF8',
     '화학물질|유해물질|화학사고|화학안전|직업병|직업성\n|석면|소음성|근골격|작업환경|유해환경\n|MSDS|허용기준|업무상질병|진폐|과로사|뇌심혈관',
     [
         ('화학물질|유해물질|화학사고|화학안전', '화학 관련 사고·안전'),
         ('직업병|직업성', '직업성 질환'),
         ('석면|소음성|근골격', '세부 직업병 유형'),
         ('작업환경|유해환경', '작업장 환경'),
         ('MSDS|허용기준', '화학물질 관리 기준'),
         ('업무상질병|진폐|과로사|뇌심혈관', '업무상 질병 전반'),
     ]),
    ('5-5', '정책·브리핑', '1E8449', '379건', 'EAFAF1',
     '정책|계획|추진|발표|브리핑|지원사업|보도자료|예산|국정감사',
     [
         ('정책|계획|추진|발표', '정책 발표·추진'),
         ('브리핑|보도자료', '정부 공식 발표'),
         ('지원사업|예산', '예산·지원'),
         ('국정감사', '국회 감사 관련'),
     ]),
    ('5-6', '기관동향', '7D6608', '228건', 'FEF9E7',
     '안전보건공단|KOSHA',
     [
         ('안전보건공단|KOSHA', 'KOSHA 보도자료·공지사항·활동 전반'),
     ]),
]

for num, cat_name, color_hex, cnt, bg_hex, regex, items in cat_details:
    r, g, b = int(color_hex[:2],16), int(color_hex[2:4],16), int(color_hex[4:],16)
    heading(f'{num}.  {cat_name}  ({cnt} 수집 · 우선순위 {num[-1]}위)', level=2, color=(r,g,b))

    # 정규식 표시
    p_rx = doc.add_paragraph()
    ps(p_rx, before=2, after=2)
    p_rx.paragraph_format.left_indent = Cm(0.5)
    r_label = p_rx.add_run('정규식: ')
    sf(r_label, bold=True, size=9, color=(80,80,80))
    r_rx = p_rx.add_run(regex)
    sf(r_rx, bold=False, size=8.5, color=(100,40,40), italic=True)

    t_cat = doc.add_table(rows=1, cols=2)
    t_cat.style = 'Table Grid'
    t_cat.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_cat.columns[0].width = Cm(7.0)
    t_cat.columns[1].width = Cm(10.5)
    tbl_header(t_cat, ['패턴', '의미'], bg=color_hex)

    for i, (pattern, meaning) in enumerate(items):
        tbg = bg_hex if i % 2 == 0 else 'FFFFFF'
        tbl_row(t_cat, [pattern, meaning], bgs=[tbg]*2,
                aligns=[WD_ALIGN_PARAGRAPH.LEFT]*2,
                bold_cols=[], size=9)
    doc.add_paragraph()

doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 6. 분류 흐름도
# ════════════════════════════════════════════════════════════
heading('6.  전체 분류 흐름도', level=1, color=(27,79,114))
divider()
body('아래 흐름도는 기사 한 건이 입력되었을 때 최종 카테고리가 결정되는 전 과정을 도식화한 것입니다.',
     size=9.5, before=4, after=6)

flow_lines = [
    ('┌─────────────────────────────────────────────┐', 'FDEDEC'),
    ('│            기사 수집 (RSS / API)              │', 'FDEDEC'),
    ('└───────────────────────┬─────────────────────┘', 'FDEDEC'),
    ('                        ▼', None),
    ('┌─────────────────────────────────────────────┐', 'FDEDEC'),
    ('│  1단계: EXCLUDE_KEYWORDS 체크 (제목)         │', 'FDEDEC'),
    ('│  → 차단 키워드 포함? ──YES──▶  폐기(저장X)  │', 'FDEDEC'),
    ('└───────────────────────┬─────────────────────┘', 'FDEDEC'),
    ('                   NO   ▼', None),
    ('┌─────────────────────────────────────────────┐', 'FEF9E7'),
    ('│  1단계: REQUIRED_KEYWORDS 체크 (제목+본문)   │', 'FEF9E7'),
    ('│  → 필수 키워드 없음? ──YES──▶  폐기(저장X) │', 'FEF9E7'),
    ('│  → 사고유형 단독 + 컨텍스트? ─YES──▶ 통과  │', 'FEF9E7'),
    ('└───────────────────────┬─────────────────────┘', 'FEF9E7'),
    ('                   통과  ▼', None),
    ('┌─────────────────────────────────────────────┐', 'EBF5FB'),
    ('│  2단계: 구글뉴스 검색쿼리 cat 임시 할당     │', 'EBF5FB'),
    ('└───────────────────────┬─────────────────────┘', 'EBF5FB'),
    ('                        ▼', None),
    ('┌─────────────────────────────────────────────┐', 'F5EEF8'),
    ('│  3단계: extractCategory() 정규식 적용       │', 'F5EEF8'),
    ('│  ① 중대재해 → ② 산업재해·안전              │', 'F5EEF8'),
    ('│  → ③ 직업보건·화학 → ④ 법령·제도          │', 'F5EEF8'),
    ('│  → ⑤ 정책·브리핑 → ⑥ 기관동향            │', 'F5EEF8'),
    ('│  → 매칭 없음: 기본값 "산업재해·안전"        │', 'F5EEF8'),
    ('└───────────────────────┬─────────────────────┘', 'F5EEF8'),
    ('                        ▼', None),
    ('┌─────────────────────────────────────────────┐', 'EAFAF1'),
    ('│     SQLite DB 저장 (articles 테이블)         │', 'EAFAF1'),
    ('└─────────────────────────────────────────────┘', 'EAFAF1'),
]

for line, bg_hex in flow_lines:
    p = doc.add_paragraph()
    ps(p, before=0, after=0, line=13)
    p.paragraph_format.left_indent = Cm(1.5)
    run = p.add_run(line)
    sf(run, bold=False, size=9, color=(40,40,40))
    if bg_hex:
        pass  # 배경색 없이 텍스트 기반 다이어그램

doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 7. DB 통계
# ════════════════════════════════════════════════════════════
heading('7.  실제 DB 통계 (2026년 9월 16일 기준)', level=1, color=(27,79,114))
divider()

heading('7-1.  카테고리별 수집 기사 수 (누적 3,617건)', level=2, color=(31,97,141))

t_stat = doc.add_table(rows=1, cols=5)
t_stat.style = 'Table Grid'
t_stat.alignment = WD_TABLE_ALIGNMENT.CENTER
t_stat.columns[0].width = Cm(1.8)
t_stat.columns[1].width = Cm(4.0)
t_stat.columns[2].width = Cm(2.5)
t_stat.columns[3].width = Cm(2.5)
t_stat.columns[4].width = Cm(6.7)
tbl_header(t_stat, ['순위', '카테고리', '기사 수', '점유율', '비고'], bg='1B4F72')

stat_rows = [
    ('1', '산업재해·안전', '1,100', '29.6%', 'fallback 기본값 포함, 가장 광범위'),
    ('2', '중대재해',      '944',   '25.4%', '중대재해처벌법 관련, 1순위 우선'),
    ('3', '직업보건·화학', '494',   '13.3%', '직업병·화학물질·작업환경'),
    ('4', '법령·제도',     '462',   '12.4%', '법제처 API + 법령 RSS'),
    ('5', '정책·브리핑',   '386',   '10.4%', '정부기관 보도자료'),
    ('6', '기관동향',      '231',   '6.2%',  'KOSHA 보도자료·공지사항'),
    ('합계', '─',         '3,617', '97.3%', '★오늘(37건) 포함, 2026-09-16 기준 누적'),
]
for i, r in enumerate(stat_rows):
    is_total = r[0] == '합계'
    bg = 'D6EAF8' if is_total else ('EBF5FB' if i % 2 == 0 else 'FFFFFF')
    tbl_row(t_stat, list(r), bgs=[bg]*5,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER]*4 + [WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[0,1,2] if is_total else [0], size=9)

doc.add_paragraph()

heading('7-2.  실제 DB 키워드 빈도 상위 8위', level=2, color=(31,97,141))
body('articles 테이블의 keywords 컬럼 값을 집계한 실제 분포입니다.', size=9.5, before=2, after=4)

t_kw = doc.add_table(rows=1, cols=3)
t_kw.style = 'Table Grid'
t_kw.alignment = WD_TABLE_ALIGNMENT.CENTER
t_kw.columns[0].width = Cm(2.0)
t_kw.columns[1].width = Cm(4.5)
t_kw.columns[2].width = Cm(11.0)
tbl_header(t_kw, ['순위', '키워드', '빈도 (건)'], bg='2874A6')
kw_rows = [
    ('1', '중대재해',    '55 (-10 ★집계 기준 정확화)'),
    ('2', '안전보건',    '40 (+5)'),
    ('3', '끼임',        '35 (+4, ★v2 쿼리 확장 효과)'),
    ('4', '산업안전',    '28 (-2)'),
    ('5', '산재',        '27 (+1)'),
    ('6', '사망사고',    '25 (+1)'),
    ('7', '끼임 사망',   '22 (+2, ★v2 쿼리 확장 효과)'),
    ('8', '산업재해',    '20 (+1)'),
]
for i, r in enumerate(kw_rows):
    bg = 'EBF5FB' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_kw, list(r), bgs=[bg]*3,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER]*3,
            bold_cols=[0,1], size=9)

doc.add_paragraph()

# ════════════════════════════════════════════════════════════
# 7-3. v1.6 날짜 기준 통일 (crawled_at)  ★ 신규
# ════════════════════════════════════════════════════════════
heading('7-3.  v1.6 KPI 날짜 기준 통일 — crawled_at vs published_at', level=2, color=(31,97,141))
body('시스템 v1.6에서 해결된 핵심 버그: 사이드바(dashboard) KPI와 메인 KPI 카드 수치 불일치.', size=9.5, before=4, after=6)

t_kpi = doc.add_table(rows=1, cols=3)
t_kpi.style = 'Table Grid'
t_kpi.alignment = WD_TABLE_ALIGNMENT.CENTER
t_kpi.columns[0].width = Cm(3.5)
t_kpi.columns[1].width = Cm(5.5)
t_kpi.columns[2].width = Cm(8.5)
tbl_header(t_kpi, ['구분', '수정 전 (v1.5)', '수정 후 (v1.6)'], bg='922B21')

kpi_fix_rows = [
    ('기준 필드',        'published_at (게재일, KST)',            'crawled_at (수집일, UTC→KST 변환)'),
    ('문제 증상',        '사이드바 오늘 37건 / KPI 카드 13건\n→ 동일 DB, 다른 수치',
                        '사이드바·KPI 카드 모두 37건\n→ 일치'),
    ('원인',             '어제 게재된 오늘 수집 기사가\nKPI 카드에서 제외됨',
                        'crawled_at 기준으로 오늘 수집분\n전체 정확히 집계'),
    ('날짜 변환 함수',   '없음 (단순 DATE() 비교)',               'getUTCRangeForKSTDay(0)\nKST 00:00 = UTC 전날 15:00 변환'),
    ('적용 API',         '/api/stats/today-summary',              '/api/stats/today-summary (재작성)\n/api/stats/dashboard (기준값 유지)'),
]
for i, r in enumerate(kpi_fix_rows):
    bg = 'FDEDEC' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_kpi, list(r), bgs=[bg]*3,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[0], size=9)

body('※ crawled_at은 ISO 8601 UTC 형식으로 저장되므로, KST 하루 범위는 UTC 기준 전날 15:00:00 ~ 당일 14:59:59로 조회해야 합니다.',
     size=9, before=6, after=4)

doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 8. 우선순위 및 주의사항
# ════════════════════════════════════════════════════════════
heading('8.  분류 우선순위 및 주의사항', level=1, color=(27,79,114))
divider()

heading('8-1.  카테고리 우선순위 요약표', level=2, color=(31,97,141))

t_pri = doc.add_table(rows=1, cols=4)
t_pri.style = 'Table Grid'
t_pri.alignment = WD_TABLE_ALIGNMENT.CENTER
t_pri.columns[0].width = Cm(1.5)
t_pri.columns[1].width = Cm(4.0)
t_pri.columns[2].width = Cm(3.5)
t_pri.columns[3].width = Cm(8.5)
tbl_header(t_pri, ['우선순위', '카테고리', '기사 수', '분류 판단 기준 패턴'], bg='1B4F72')
pri_rows = [
    ('1', '중대재해',      '944건',  '/중대재해처벌|중대재해/ → 무조건 1순위'),
    ('2', '산업재해·안전', '1,100건', '/산업재해|추락|끼임|감전|질식|건설현장|사망사고|이주노동자/ 등'),
    ('3', '직업보건·화학', '494건',   '/화학물질|직업병|석면|근골격|MSDS|업무상질병/ 등'),
    ('4', '법령·제도',     '462건',   '/법령|고시|시행령|개정|안전인증/'),
    ('5', '정책·브리핑',   '386건',   '/정책|발표|브리핑|보도자료|예산/'),
    ('6', '기관동향',      '231건',   '/안전보건공단|KOSHA/ — 최후 매칭'),
    ('—', '산업재해·안전\n(기본값)', '(포함)', '위 6개 정규식 중 하나도 매칭되지 않을 경우'),
]
for i, r in enumerate(pri_rows):
    bg = 'EBF5FB' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_pri, list(r), bgs=[bg]*4,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER]*3 + [WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[0,1], size=9)

doc.add_paragraph()

heading('8-2.  주요 주의사항', level=2, color=(31,97,141))

notes = [
    ('① 중대재해 1순위 덮어쓰기',
     '"중대재해"가 1순위이므로 "안전보건공단이 중대재해 예방 활동 발표"처럼 KOSHA 소식이어도 '
     '제목에 "중대재해"가 포함되면 기관동향이 아닌 중대재해로 분류됩니다.'),
    ('② 산업재해·안전이 기본값',
     '6개 정규식 규칙 중 하나도 매칭되지 않는 기사는 모두 산업재해·안전으로 분류됩니다. '
     '이로 인해 산업재해·안전 카테고리에는 다소 이질적인 기사가 포함될 수 있습니다.'),
    ('③ 차단 키워드가 필수 키워드보다 우선',
     '제목에 차단 키워드(교통사고, 자살 등)가 있으면 본문에 산업안전 내용이 있어도 수집되지 않습니다.'),
    ('④ 구글뉴스 URL 형태',
     '수집된 기사 URL은 news.google.com/articles/... 형태이며 원문 접근 시 리디렉션됩니다. '
     '/rss/articles/ → /articles/ 로 자동 변환하여 저장합니다.'),
    ('⑤ 환경부 카테고리 주의 (기지정 버그)',
     'policyBriefing.js의 crawlMOE() 함수에서 환경부 기사 category를 "화학안전"으로 저장하나 '
     '앱의 6개 공식 카테고리에 "화학안전"이 없어 필터에서 제외됩니다. '
     '차후 "직업보건·화학"으로 통일 예정.'),
    ('⑥ 사고유형 컨텍스트 체크 ★v2 추가',
     '"추락", "끼임", "감전", "질식" 단독 키워드는 사업장 컨텍스트 없이 사용 시 수집 제외. '
     '예: "스키장 추락" → 폐기, "공사현장 추락 사망" → 수집.'),
]

for title, content in notes:
    p_t = doc.add_paragraph()
    ps(p_t, before=5, after=1)
    r_t = p_t.add_run(title)
    sf(r_t, bold=True, size=9.5, color=(31,97,141))

    p_c = doc.add_paragraph()
    ps(p_c, before=1, after=5, line=14)
    p_c.paragraph_format.left_indent = Cm(0.7)
    r_c = p_c.add_run(content)
    sf(r_c, size=9.5)

doc.add_page_break()

# ════════════════════════════════════════════════════════════
# 9. 크롤러별 수집 출처 목록
# ════════════════════════════════════════════════════════════
heading('9.  크롤러별 수집 출처 목록', level=1, color=(27,79,114))
divider()

heading('9-1.  구글뉴스 RSS (naverNews.js) — 언론사 분류', level=2, color=(31,97,141))
body('수집된 기사의 source_category 분류 기준입니다.', size=9.5, before=2, after=4)

t_media = doc.add_table(rows=1, cols=2)
t_media.style = 'Table Grid'
t_media.alignment = WD_TABLE_ALIGNMENT.CENTER
t_media.columns[0].width = Cm(3.0)
t_media.columns[1].width = Cm(14.5)
tbl_header(t_media, ['source_category', '해당 언론사'], bg='2874A6')
media_rows = [
    ('통신사',      '연합뉴스, 뉴시스, 뉴스1'),
    ('종합일간지',  '조선일보, 중앙일보, 동아일보, 한겨레, 경향신문, 한국일보,\n국민일보, 서울신문, 문화일보, 세계일보'),
    ('방송',        'KBS, MBC, SBS, YTN, JTBC'),
    ('경제지',      '매일경제, 한국경제, 서울경제'),
    ('전문지',      '매일노동뉴스, 안전저널, 안전신문, 이로운넷, 세이프티퍼스트닷뉴스,\n노동과세계, 아웃소싱타임스, 누리일보 ★v2: 7개 직접 RSS 추가'),
    ('언론(기타)',  'v.daum.net, 네이트, 법률신문, 안전정보, 국토일보,\n에너지데일리, 투데이에너지 등'),
]
for i, (cat, media) in enumerate(media_rows):
    bg = 'EBF5FB' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_media, [cat, media], bgs=[bg, bg],
            aligns=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[0], size=9)

doc.add_paragraph()

heading('9-2.  산업안전 전문지 RSS 직접 수집 (naverNews.js) ★v2 신규', level=2, color=(31,97,141))
body('구글뉴스 RSS에 포착되지 않는 전문지 기사를 커버하기 위해 직접 RSS를 추가 수집합니다.', size=9.5, before=2, after=4)

t_spec = doc.add_table(rows=1, cols=4)
t_spec.style = 'Table Grid'
t_spec.alignment = WD_TABLE_ALIGNMENT.CENTER
t_spec.columns[0].width = Cm(4.0)
t_spec.columns[1].width = Cm(8.5)
t_spec.columns[2].width = Cm(2.0)
t_spec.columns[3].width = Cm(3.0)
tbl_header(t_spec, ['출처명', 'RSS URL', 'source_cat', '기본 카테고리'], bg='117A65')
spec_rows = [
    ('안전저널',           'safety.co.kr/rss/allArticle.xml',           '전문지', '산업재해·안전'),
    ('안전신문',           'safetynews.co.kr/rss/allArticle.xml',        '전문지', '산업재해·안전'),
    ('매일노동뉴스',       'labortoday.co.kr/rss/allArticle.xml',        '전문지', '산업재해·안전'),
    ('이로운넷',           'iloha.kr/rss/S1N10.xml',                    '전문지', '직업보건·화학'),
    ('세이프티퍼스트닷뉴스','safetykorea.kr/rss/allArticle.xml',          '전문지', '산업재해·안전'),
    ('노동과세계',         'nodong.or.kr/rss/allArticle.xml',            '전문지', '정책·브리핑'),
    ('한국경제',           'rss.hankyung.com/economy.xml',              '경제지', '정책·브리핑'),
]
for i, r in enumerate(spec_rows):
    bg = 'EAFAF1' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_spec, list(r), bgs=[bg]*4,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT,
                    WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER],
            bold_cols=[0], size=8.5)

doc.add_paragraph()

heading('9-3.  정부기관 RSS (policyBriefing.js)', level=2, color=(31,97,141))
t_gov = doc.add_table(rows=1, cols=4)
t_gov.style = 'Table Grid'
t_gov.alignment = WD_TABLE_ALIGNMENT.CENTER
t_gov.columns[0].width = Cm(4.0)
t_gov.columns[1].width = Cm(8.5)
t_gov.columns[2].width = Cm(2.0)
t_gov.columns[3].width = Cm(3.0)
tbl_header(t_gov, ['출처명', 'RSS URL', 'source_cat', '수집 조건'], bg='1E8449')
gov_rows = [
    ('고용노동부',        'moel.go.kr/rss/pressRss.xml',        '정부기관', 'isRelevant() 필터'),
    ('안전보건공단 보도자료','kosha.or.kr/kosha/rss/press.do',   '기관',     '전량 수집 (최대30건)'),
    ('안전보건공단 공지사항','kosha.or.kr/kosha/rss/notice.do',  '기관',     '전량 수집 (최대30건)'),
    ('정책브리핑 보도자료','korea.kr/rss/pressRelease.xml',      '정부기관', '고용노동부·안전보건 필터'),
    ('정책브리핑 뉴스',   'korea.kr/rss/news.xml',              '정부기관', 'isRelevant() 필터'),
    ('환경부',            'me.go.kr/home/rss/newsRss.jsp',      '정부기관', '화학물질 키워드 필터'),
    ('국토안전관리원',    '(직접수집)',                          '기관',     '건설안전 특화 ★v2'),
    ('화학물질안전원',    '(직접수집)',                          '기관',     '화학사고 특화 ★v2'),
]
for i, r in enumerate(gov_rows):
    bg = 'EAFAF1' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_gov, list(r), bgs=[bg]*4,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT,
                    WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[0], size=8.5)

doc.add_paragraph()

heading('9-4.  법령정보 크롤러 (legislation.js)', level=2, color=(31,97,141))
t_law = doc.add_table(rows=1, cols=4)
t_law.style = 'Table Grid'
t_law.alignment = WD_TABLE_ALIGNMENT.CENTER
t_law.columns[0].width = Cm(3.5)
t_law.columns[1].width = Cm(7.5)
t_law.columns[2].width = Cm(1.5)
t_law.columns[3].width = Cm(5.0)
tbl_header(t_law, ['출처명', 'API / RSS URL', '출처구분', '수집 조건'], bg='6C3483')
law_rows = [
    ('법제처 Open API',    'law.go.kr/DRF/lawSearch.do',   '법령', '산업안전보건/중대재해처벌/산업재해보상/화학물질관리 (최대15건씩)'),
    ('한국법제연구원 RSS',  'klri.re.kr/.../rss.do',        '법령', '안전·보건·재해·화학·근로·노동·위험·직업 포함만'),
    ('고용노동부 법령RSS',  'moel.go.kr/rss/lawRss.xml',    '법령', '전량 수집(입법예고·시행규칙), 카테고리 법령·제도 고정'),
]
for i, r in enumerate(law_rows):
    bg = 'F5EEF8' if i % 2 == 0 else 'FFFFFF'
    tbl_row(t_law, list(r), bgs=[bg]*4,
            aligns=[WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT,
                    WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT],
            bold_cols=[0], size=8.5)

doc.add_paragraph()
body('※ 본 문서는 2026년 9월 16일 기준 시스템 v1.6 상태를 반영한 v3.0입니다.',
     size=9, before=8, after=2)
body('※ v2.0 대비 주요 변경: DB 통계 갱신 (3,566→3,617건) / 카테고리별 수치 최신화 / '
     'v1.6 KPI 날짜 기준 통일(crawled_at) 반영 / crawled_at 기준 명시',
     size=9, before=2, after=4)

# ── 최종 저장 ────────────────────────────────────────────────
out_path = '/home/user/webapp/KOSHA_카테고리_키워드_분류체계_v3.docx'
doc.save(out_path)
print(f'✅ 분류체계 v3 저장 완료: {out_path}')
