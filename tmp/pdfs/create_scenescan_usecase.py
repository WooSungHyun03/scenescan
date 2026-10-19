from __future__ import annotations

from math import atan2, cos, sin
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "scenescan-use-case-diagram.pdf"
GITHUB_URL = "https://github.com/WooSungHyun03/scenescan"

PAGE_W, PAGE_H = landscape(A3)

NAVY = colors.HexColor("#15243A")
INK = colors.HexColor("#243247")
MUTED = colors.HexColor("#637083")
LINE = colors.HexColor("#9AA7B7")
SOFT_LINE = colors.HexColor("#CAD2DD")
BG = colors.HexColor("#F4F7FB")
SURFACE = colors.white
BLUE = colors.HexColor("#E8F1FF")
BLUE_EDGE = colors.HexColor("#4F7DBD")
GREEN = colors.HexColor("#E9F7F0")
GREEN_EDGE = colors.HexColor("#43866A")
AMBER = colors.HexColor("#FFF3DB")
AMBER_EDGE = colors.HexColor("#A97525")
PURPLE = colors.HexColor("#F1EAFE")
PURPLE_EDGE = colors.HexColor("#7251A5")


def register_fonts() -> tuple[str, str]:
    regular_candidates = [
        Path(r"C:\Windows\Fonts\malgun.ttf"),
        Path(r"C:\Windows\Fonts\NotoSansKR-Regular.ttf"),
    ]
    bold_candidates = [
        Path(r"C:\Windows\Fonts\malgunbd.ttf"),
        Path(r"C:\Windows\Fonts\NotoSansKR-Bold.ttf"),
    ]
    regular = next((path for path in regular_candidates if path.exists()), None)
    bold = next((path for path in bold_candidates if path.exists()), None)
    if regular is None or bold is None:
        raise FileNotFoundError("A Korean TrueType font is required to render this diagram")
    pdfmetrics.registerFont(TTFont("SceneSans", str(regular)))
    pdfmetrics.registerFont(TTFont("SceneSans-Bold", str(bold)))
    return "SceneSans", "SceneSans-Bold"


REGULAR, BOLD = register_fonts()


def set_dash(c: canvas.Canvas, dashed: bool) -> None:
    c.setDash(5, 4) if dashed else c.setDash()


def draw_arrow_head(
    c: canvas.Canvas,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    *,
    color: colors.Color,
    size: float = 7,
    hollow: bool = False,
) -> None:
    angle = atan2(y2 - y1, x2 - x1)
    left = (
        x2 - size * cos(angle) + size * 0.62 * sin(angle),
        y2 - size * sin(angle) - size * 0.62 * cos(angle),
    )
    right = (
        x2 - size * cos(angle) - size * 0.62 * sin(angle),
        y2 - size * sin(angle) + size * 0.62 * cos(angle),
    )
    path = c.beginPath()
    path.moveTo(x2, y2)
    path.lineTo(*left)
    path.lineTo(*right)
    path.close()
    c.setStrokeColor(color)
    c.setFillColor(SURFACE if hollow else color)
    c.drawPath(path, fill=1, stroke=1)


def line(
    c: canvas.Canvas,
    start: tuple[float, float],
    end: tuple[float, float],
    *,
    color: colors.Color = LINE,
    width: float = 1.1,
    dashed: bool = False,
    arrow: bool = False,
    hollow_arrow: bool = False,
) -> None:
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(width)
    set_dash(c, dashed)
    c.line(start[0], start[1], end[0], end[1])
    if arrow:
        draw_arrow_head(c, *start, *end, color=color, hollow=hollow_arrow)
    c.restoreState()


def polyline(
    c: canvas.Canvas,
    points: list[tuple[float, float]],
    *,
    color: colors.Color = LINE,
    width: float = 1.1,
    dashed: bool = False,
    arrow: bool = False,
) -> None:
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(width)
    set_dash(c, dashed)
    path = c.beginPath()
    path.moveTo(*points[0])
    for point in points[1:]:
        path.lineTo(*point)
    c.drawPath(path, fill=0, stroke=1)
    if arrow:
        draw_arrow_head(c, *points[-2], *points[-1], color=color)
    c.restoreState()


def relation_label(c: canvas.Canvas, text: str, x: float, y: float) -> None:
    width = pdfmetrics.stringWidth(text, REGULAR, 8.4) + 10
    c.setFillColor(BG)
    c.roundRect(x - width / 2, y - 7, width, 14, 4, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont(REGULAR, 8.4)
    c.drawCentredString(x, y - 3, text)


def actor(c: canvas.Canvas, x: float, y: float, label: str, sublabel: str | None = None) -> None:
    c.saveState()
    c.setStrokeColor(INK)
    c.setLineWidth(1.8)
    c.circle(x, y + 45, 11, fill=0, stroke=1)
    c.line(x, y + 34, x, y + 3)
    c.line(x - 17, y + 24, x + 17, y + 24)
    c.line(x, y + 3, x - 15, y - 20)
    c.line(x, y + 3, x + 15, y - 20)
    c.setFillColor(INK)
    c.setFont(BOLD, 11)
    c.drawCentredString(x, y - 39, label)
    if sublabel:
        c.setFillColor(MUTED)
        c.setFont(REGULAR, 8)
        c.drawCentredString(x, y - 52, sublabel)
    c.restoreState()


def external_system(c: canvas.Canvas, x: float, y: float, title: str, detail: str) -> tuple[float, float, float, float]:
    w, h = 154, 58
    c.saveState()
    c.setFillColor(SURFACE)
    c.setStrokeColor(SOFT_LINE)
    c.setLineWidth(1.2)
    c.roundRect(x - w / 2, y - h / 2, w, h, 8, fill=1, stroke=1)
    c.setFillColor(MUTED)
    c.setFont(REGULAR, 7.5)
    c.drawCentredString(x, y + 14, "<<external system>>")
    c.setFillColor(INK)
    c.setFont(BOLD, 9.5)
    c.drawCentredString(x, y + 1, title)
    c.setFillColor(MUTED)
    c.setFont(REGULAR, 7.6)
    c.drawCentredString(x, y - 13, detail)
    c.restoreState()
    return x - w / 2, y - h / 2, x + w / 2, y + h / 2


def use_case(
    c: canvas.Canvas,
    x: float,
    y: float,
    title: str,
    detail: str,
    *,
    fill: colors.Color,
    edge: colors.Color,
) -> tuple[float, float]:
    w, h = 190, 57
    c.saveState()
    c.setFillColor(fill)
    c.setStrokeColor(edge)
    c.setLineWidth(1.25)
    c.ellipse(x - w / 2, y - h / 2, x + w / 2, y + h / 2, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont(BOLD, 10)
    c.drawCentredString(x, y + 3, title)
    c.setFillColor(MUTED)
    c.setFont(REGULAR, 7.6)
    c.drawCentredString(x, y - 12, detail)
    c.restoreState()
    return x, y


def node_edge(point: tuple[float, float], side: str) -> tuple[float, float]:
    x, y = point
    if side == "left":
        return x - 95, y
    if side == "right":
        return x + 95, y
    if side == "top":
        return x, y + 28.5
    return x, y - 28.5


def draw_diagram() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_W, PAGE_H))
    c.setTitle("SceneScan 유스케이스 다이어그램")
    c.setAuthor("SceneScan Team")
    c.setSubject("Requirements v1.2와 SceneScan 저장소를 기반으로 한 UML 유스케이스 다이어그램")

    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    c.setFillColor(NAVY)
    c.setFont(BOLD, 24)
    c.drawString(42, PAGE_H - 49, "SceneScan 유스케이스 다이어그램")
    c.setFillColor(MUTED)
    c.setFont(REGULAR, 10.5)
    c.drawString(43, PAGE_H - 70, "부산 촬영지 탐색 서비스 · 요구사항의 액터, 시스템 범위, 기능, 관계를 사용자 목표 중심으로 표현")

    url_width = pdfmetrics.stringWidth(GITHUB_URL, REGULAR, 9.2)
    url_x = PAGE_W - url_width - 42
    c.setFillColor(BLUE_EDGE)
    c.setFont(REGULAR, 9.2)
    c.drawString(url_x, PAGE_H - 48, GITHUB_URL)
    c.linkURL(GITHUB_URL, (url_x, PAGE_H - 52, PAGE_W - 42, PAGE_H - 39), relative=0)
    c.setFillColor(MUTED)
    c.setFont(REGULAR, 8)
    c.drawRightString(PAGE_W - 42, PAGE_H - 68, "GitHub 저장소 · 2026-10-19 기준")

    boundary_x, boundary_y, boundary_w, boundary_h = 180, 82, 835, 644
    c.setFillColor(SURFACE)
    c.setStrokeColor(NAVY)
    c.setLineWidth(1.7)
    c.roundRect(boundary_x, boundary_y, boundary_w, boundary_h, 12, fill=1, stroke=1)
    c.setFillColor(NAVY)
    c.setFont(BOLD, 12)
    c.drawString(boundary_x + 16, boundary_y + boundary_h - 24, "SceneScan 시스템 범위")

    x1, x2, x3 = 310, 570, 830
    ys = [645, 540, 435, 330, 225]

    upload = use_case(c, x1, ys[0], "참조 이미지 업로드", "drag & drop · file picker · 검증", fill=BLUE, edge=BLUE_EDGE)
    image_search = use_case(c, x1, ys[1], "이미지 기반 장소 검색", "브라우저 CLIP 임베딩 · Top 8", fill=BLUE, edge=BLUE_EDGE)
    text_search = use_case(c, x1, ys[2], "텍스트 기반 장소 검색", "규칙 기반 의도 분석 · 부산 범위", fill=BLUE, edge=BLUE_EDGE)
    filters = use_case(c, x1, ys[3], "검색 조건 적용", "구/군 · 공간 카테고리", fill=BLUE, edge=BLUE_EDGE)
    results = use_case(c, x1, ys[4], "검색 결과 비교", "카드 목록 · 지도 marker 연동", fill=BLUE, edge=BLUE_EDGE)

    detail = use_case(c, x2, ys[0], "장소 상세 확인", "갤러리 · 주소 · 출처 · 지도", fill=GREEN, edge=GREEN_EDGE)
    similar = use_case(c, x2, ys[1], "비슷한 장소 재탐색", "현재·이미 본 장소 제외", fill=GREEN, edge=GREEN_EDGE)
    shooting = use_case(c, x2, ys[2], "촬영 조건 확인", "태양 방향 · 날씨 · 카메라 heading", fill=GREEN, edge=GREEN_EDGE)
    field_info = use_case(c, x2, ys[3], "현장 운영 정보 확인", "허가 · 주차 · 소음원 · 문의처", fill=GREEN, edge=GREEN_EDGE)
    provenance = use_case(c, x2, ys[4], "데이터 출처 확인", "source · URL · 검증 시점", fill=GREEN, edge=GREEN_EDGE)

    shortlist = use_case(c, x3, ys[0], "관심 장소 저장·비교", "비회원 localStorage · 회원 DB", fill=AMBER, edge=AMBER_EDGE)
    auth = use_case(c, x3, ys[1], "회원가입·로그인·로그아웃", "이메일 확인 · 세션 보호", fill=AMBER, edge=AMBER_EDGE)
    recovery = use_case(c, x3, ys[2], "비밀번호 복구·변경", "만료 링크 · 재인증 · 전체 로그아웃", fill=AMBER, edge=AMBER_EDGE)
    migration = use_case(c, x3, ys[3], "비회원 목록 계정 이관", "사용자 동의 · 중복 없는 병합", fill=AMBER, edge=AMBER_EDGE)
    account = use_case(c, x3, ys[4], "계정 보안·회원탈퇴", "본인 재인증 · 개인 데이터 정리", fill=AMBER, edge=AMBER_EDGE)

    # UML include/extend relations. These are intentionally drawn behind the actor/system associations.
    line(c, node_edge(image_search, "top"), node_edge(upload, "bottom"), color=BLUE_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<include>>", 365, 593)

    line(c, node_edge(filters, "top"), node_edge(text_search, "bottom"), color=BLUE_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<extend>>", 360, 382)
    polyline(c, [node_edge(filters, "right"), (425, 330), (425, 540), node_edge(image_search, "right")], color=BLUE_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<extend>>", 430, 492)

    polyline(c, [node_edge(image_search, "bottom"), (260, 490), (260, 270), node_edge(results, "top")], color=BLUE_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<include>>", 260, 297)
    polyline(c, [node_edge(text_search, "bottom"), (355, 382), (355, 270), node_edge(results, "top")], color=BLUE_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<include>>", 358, 297)

    line(c, node_edge(similar, "top"), node_edge(detail, "bottom"), color=GREEN_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<extend>>", 625, 593)
    polyline(c, [node_edge(detail, "bottom"), (525, 600), (525, 463), node_edge(shooting, "top")], color=GREEN_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<include>>", 525, 505)
    polyline(c, [node_edge(detail, "bottom"), (615, 600), (615, 358), node_edge(field_info, "top")], color=GREEN_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<include>>", 615, 401)
    polyline(c, [node_edge(field_info, "bottom"), (570, 278), node_edge(provenance, "top")], color=GREEN_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<include>>", 625, 278)

    line(c, node_edge(recovery, "top"), node_edge(auth, "bottom"), color=AMBER_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<extend>>", 885, 488)
    line(c, node_edge(migration, "top"), node_edge(recovery, "bottom"), color=AMBER_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<extend>>", 885, 382)
    polyline(c, [node_edge(account, "top"), (790, 278), (790, 500), node_edge(auth, "bottom")], color=AMBER_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<include>>", 790, 297)

    # Human actors and their direct goals. External integrations are separated onto page 2
    # so this page remains a readable user-goal diagram.
    actor(c, 82, 500, "방문 사용자", "로그인 없이 탐색 가능")
    actor(c, 1110, 405, "회원 사용자", "방문 사용자 기능 포함")

    polyline(c, [(112, 518), (145, 518), (145, 645), node_edge(upload, "left")], color=INK)
    polyline(c, [(112, 502), (150, 502), (150, 435), node_edge(text_search, "left")], color=INK)
    polyline(c, [(112, 486), (155, 486), (155, 330), node_edge(filters, "left")], color=INK)
    polyline(c, [(112, 470), (160, 470), (160, 225), node_edge(results, "left")], color=INK)

    polyline(c, [(1080, 432), (1045, 432), (1045, 645), node_edge(shortlist, "right")], color=INK)
    polyline(c, [(1080, 416), (1050, 416), (1050, 540), node_edge(auth, "right")], color=INK)
    polyline(c, [(1080, 400), (1055, 400), (1055, 435), node_edge(recovery, "right")], color=INK)
    polyline(c, [(1080, 384), (1060, 384), (1060, 330), node_edge(migration, "right")], color=INK)
    polyline(c, [(1080, 368), (1065, 368), (1065, 225), node_edge(account, "right")], color=INK)

    line(c, node_edge(shortlist, "left"), node_edge(detail, "right"), color=AMBER_EDGE, dashed=True, arrow=True)
    relation_label(c, "<<extend>>", 700, 652)

    # Legend and traceability note.
    c.setFillColor(MUTED)
    c.setFont(REGULAR, 8.2)
    c.drawString(43, 49, "실선: 액터 연관    점선 화살표: <<include>> 필수 공통 기능 · <<extend>> 조건부/선택 기능")
    c.setFillColor(INK)
    c.setFont(REGULAR, 8.2)
    c.drawRightString(PAGE_W - 42, 49, "근거: Software Engineering Requirements v1.2 (유스케이스, pp.24-38) · SceneScan 구현 저장소")
    c.setFillColor(MUTED)
    c.setFont(REGULAR, 7.6)
    c.drawRightString(PAGE_W - 42, 33, "Mock mode에서는 외부 키 없이 공개 탐색 흐름을 검증하며, 외부 서비스 실패는 명시적 상태로 표시")

    c.showPage()

    # Page 2: implementation/context view derived from the repository.
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.setFont(BOLD, 24)
    c.drawString(42, PAGE_H - 49, "SceneScan 시스템 컨텍스트 및 데이터 흐름")
    c.setFillColor(MUTED)
    c.setFont(REGULAR, 10.5)
    c.drawString(43, PAGE_H - 70, "GitHub 구현 구조를 기준으로 브라우저, Next.js 서버, 외부 서비스의 책임과 보안 경계를 분리")
    c.setFillColor(BLUE_EDGE)
    c.setFont(REGULAR, 9.2)
    c.drawRightString(PAGE_W - 42, PAGE_H - 48, GITHUB_URL)
    c.linkURL(GITHUB_URL, (PAGE_W - 290, PAGE_H - 52, PAGE_W - 42, PAGE_H - 39), relative=0)

    def box(x: float, y: float, w: float, h: float, title: str, rows: list[str], fill: colors.Color, edge: colors.Color) -> None:
        c.setFillColor(fill)
        c.setStrokeColor(edge)
        c.setLineWidth(1.4)
        c.roundRect(x, y, w, h, 12, fill=1, stroke=1)
        c.setFillColor(INK)
        c.setFont(BOLD, 12)
        c.drawString(x + 16, y + h - 25, title)
        c.setFont(REGULAR, 8.7)
        c.setFillColor(MUTED)
        row_y = y + h - 48
        for row in rows:
            c.drawString(x + 17, row_y, f"• {row}")
            row_y -= 21

    browser = (55, 260, 260, 420)
    app = (410, 210, 330, 510)
    ext_x = 850
    box(*browser, "사용자 브라우저", [
        "Next.js UI · 반응형/접근성 화면",
        "이미지 업로드 · MIME/size 검증",
        "Web Worker CLIP 512D 임베딩",
        "Kakao JavaScript 지도 SDK",
        "비회원 관심 장소 localStorage",
        "Auth cookie는 브라우저가 자동 전달",
    ], BLUE, BLUE_EDGE)
    box(*app, "SceneScan Next.js App Router", [
        "공개 페이지: 홈 · 검색 · 상세 · 비교",
        "API: image/text search · locations",
        "API: similar · weather · parking · contacts",
        "계정 API: shortlist · account deletion",
        "Zod 계약 · 401/403/429 · no-store",
        "서버 secret과 admin client는 server-only",
        "Mock mode는 외부 키 없이 동작",
    ], GREEN, GREEN_EDGE)

    external_system(c, ext_x + 105, 650, "Hugging Face", "CLIP 모델 파일")
    external_system(c, ext_x + 105, 540, "Supabase", "Auth · Postgres · pgvector · Storage")
    external_system(c, ext_x + 105, 430, "Kakao", "Map JavaScript SDK · Local REST API")
    external_system(c, ext_x + 105, 320, "기상청 KMA", "관측 · 초단기 · 단기예보")
    external_system(c, ext_x + 105, 210, "NVIDIA API (선택)", "텍스트 의도 구조화 · 기본 OFF")

    # Clean, non-crossing high-level flows.
    polyline(c, [(315, 545), (365, 545), (365, 555), (410, 555)], color=NAVY, width=1.6, arrow=True)
    relation_label(c, "512D embedding · filters · cookie", 363, 575)
    polyline(c, [(410, 390), (365, 390), (365, 410), (315, 410)], color=GREEN_EDGE, width=1.4, arrow=True)
    relation_label(c, "Top 8 · 상세 · 오류 상태", 363, 430)

    polyline(c, [(315, 600), (785, 600), (785, 650), (878, 650)], color=PURPLE_EDGE, width=1.25, arrow=True)
    relation_label(c, "최초 모델 다운로드", 650, 612)
    polyline(c, [(740, 555), (795, 555), (795, 540), (878, 540)], color=PURPLE_EDGE, width=1.25, arrow=True)
    relation_label(c, "RLS · RPC · 객체 저장", 810, 570)
    polyline(c, [(315, 335), (805, 335), (805, 430), (878, 430)], color=PURPLE_EDGE, width=1.25, arrow=True)
    relation_label(c, "지도 SDK", 650, 347)
    polyline(c, [(740, 430), (820, 430), (820, 430), (878, 430)], color=PURPLE_EDGE, width=1.25, arrow=True)
    relation_label(c, "장소·주차·문의 후보", 810, 450)
    polyline(c, [(740, 350), (825, 350), (825, 320), (878, 320)], color=PURPLE_EDGE, width=1.25, arrow=True)
    relation_label(c, "촬영시점 날씨", 815, 370)
    polyline(c, [(740, 270), (830, 270), (830, 210), (878, 210)], color=PURPLE_EDGE, width=1.25, dashed=True, arrow=True)
    relation_label(c, "opt-in · 실패 시 rules fallback", 790, 230)

    # Deployment/source strip.
    c.setFillColor(PURPLE)
    c.setStrokeColor(PURPLE_EDGE)
    c.setLineWidth(1.2)
    c.roundRect(55, 95, 1075, 74, 10, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont(BOLD, 11)
    c.drawString(72, 140, "소스·검증·배포 경계")
    c.setFont(REGULAR, 8.7)
    c.setFillColor(MUTED)
    c.drawString(72, 119, "GitHub 저장소 → CI(lint · typecheck · unit · E2E · Docker · secret scan) → Vercel standalone build")
    c.drawString(620, 119, "실제 Supabase migration · SMTP · Production env · 실배포 smoke는 배포 담당자가 승인 후 실행")

    c.setFillColor(MUTED)
    c.setFont(REGULAR, 8.2)
    c.drawString(43, 49, "실선 화살표: 기본 데이터 흐름    점선 화살표: 선택적 외부 연동    브라우저 CLIP 처리로 원본 검색 이미지를 검색 API에 전송하지 않음")
    c.setFillColor(INK)
    c.drawRightString(PAGE_W - 42, 49, "근거: SceneScan README · architecture · API contracts · team ownership")

    c.showPage()
    c.save()


if __name__ == "__main__":
    draw_diagram()
    print(OUTPUT)
