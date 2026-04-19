from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUTPUT = "c:/Users/ATHRV/Desktop/hackathon/ISL_Synthesis_Summary.pdf"

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=1.8*cm, leftMargin=1.8*cm,
    topMargin=1.5*cm, bottomMargin=1.5*cm,
)

styles = getSampleStyleSheet()

INDIGO = colors.HexColor("#3730A3")
INDIGO_LIGHT = colors.HexColor("#EEF2FF")
SLATE = colors.HexColor("#1E293B")
MUTED = colors.HexColor("#64748B")
WHITE = colors.white
AMBER = colors.HexColor("#F59E0B")

title_style = ParagraphStyle(
    "Title", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=17,
    textColor=WHITE, leading=22, alignment=TA_CENTER,
    spaceAfter=2,
)
subtitle_style = ParagraphStyle(
    "Subtitle", parent=styles["Normal"],
    fontName="Helvetica", fontSize=9,
    textColor=colors.HexColor("#C7D2FE"), leading=13, alignment=TA_CENTER,
)
section_style = ParagraphStyle(
    "Section", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=10,
    textColor=INDIGO, leading=14, spaceBefore=8, spaceAfter=3,
)
body_style = ParagraphStyle(
    "Body", parent=styles["Normal"],
    fontName="Helvetica", fontSize=8.5,
    textColor=SLATE, leading=13, spaceAfter=1,
)
bullet_style = ParagraphStyle(
    "Bullet", parent=styles["Normal"],
    fontName="Helvetica", fontSize=8.5,
    textColor=SLATE, leading=13, leftIndent=10, spaceAfter=2,
    bulletIndent=0,
)
tag_style = ParagraphStyle(
    "Tag", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=7.5,
    textColor=INDIGO, alignment=TA_CENTER,
)
arch_label = ParagraphStyle(
    "ArchLabel", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=8,
    textColor=WHITE, alignment=TA_CENTER, leading=10,
)
arch_sub = ParagraphStyle(
    "ArchSub", parent=styles["Normal"],
    fontName="Helvetica", fontSize=6.5,
    textColor=colors.HexColor("#C7D2FE"), alignment=TA_CENTER, leading=9,
)

def bullet(text):
    return Paragraph(f"&#8226;&nbsp;&nbsp;{text}", bullet_style)

def section(text):
    return Paragraph(text.upper(), section_style)

def hr():
    return HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#E2E8F0"), spaceAfter=4, spaceBefore=0)

story = []

# ── HEADER BANNER (table trick) ──────────────────────────────────────────────
header_data = [[
    Paragraph("Real-Time Sign Language Synthesis<br/>from Natural Speech", title_style),
]]
header_table = Table(header_data, colWidths=[17.4*cm])
header_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), INDIGO),
    ("ROUNDEDCORNERS", [8]),
    ("TOPPADDING",  (0,0), (-1,-1), 10),
    ("BOTTOMPADDING",(0,0),(-1,-1), 6),
    ("LEFTPADDING", (0,0), (-1,-1), 14),
    ("RIGHTPADDING",(0,0), (-1,-1), 14),
]))
story.append(header_table)

# Tag row
tags = ["Hindi → ISL", "English → ISL", "3D Avatar", "NLP Grammar Reorder", "Hackathon 2026"]
tag_cells = [[Paragraph(t, tag_style) for t in tags]]
tag_table = Table(tag_cells, colWidths=[3.3*cm]*5)
tag_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), INDIGO_LIGHT),
    ("TOPPADDING",  (0,0), (-1,-1), 4),
    ("BOTTOMPADDING",(0,0),(-1,-1), 4),
    ("LEFTPADDING", (0,0), (-1,-1), 4),
    ("RIGHTPADDING",(0,0), (-1,-1), 4),
]))
story.append(tag_table)
story.append(Spacer(1, 8))

# ── TWO-COLUMN LAYOUT ────────────────────────────────────────────────────────
left = []
right = []

# LEFT — What it is
left.append(section("What It Is"))
left.append(hr())
left.append(Paragraph(
    "An AI-powered pipeline that converts <b>continuous spoken Hindi or English</b> into "
    "<b>Indian Sign Language (ISL) gesture sequences</b> rendered on a real-time 3D avatar — "
    "going beyond word-for-word lookup to handle ISL's unique grammar and spatial structure.",
    body_style))
left.append(Spacer(1, 6))

# LEFT — Who it's for
left.append(section("Who It's For"))
left.append(hr())
for b in [
    "<b>Deaf & hard-of-hearing individuals</b> in India who use ISL",
    "<b>Educators & interpreters</b> in ISL classrooms",
    "<b>Public service channels</b> (government, healthcare, transport)",
    "<b>Developers</b> building accessibility tooling for Bharat",
]:
    left.append(bullet(b))
left.append(Spacer(1, 6))

# LEFT — Key Features
left.append(section("Key Features"))
left.append(hr())
for b in [
    "Real-time speech recognition for <b>Hindi &amp; English</b>",
    "<b>ISL grammar reordering</b> — topic-comment, SOV structure",
    "Non-manual marker synthesis (facial expressions, head tilt)",
    "<b>3D avatar</b> with smooth, blended gesture animation",
    "Low-latency streaming pipeline (&lt; 500 ms target)",
    "Handles continuous speech, not just isolated words",
    "Offline-capable ISL lexicon for common domains",
]:
    left.append(bullet(b))

# RIGHT — How to Run
right.append(section("How to Run"))
right.append(hr())
right.append(Paragraph("<i>(Repo is empty — steps based on planned architecture)</i>",
    ParagraphStyle("italic", parent=body_style, textColor=MUTED, fontSize=7.5)))
right.append(Spacer(1,3))
steps = [
    ("1", "Clone the repo", "git clone &lt;repo-url&gt; &amp;&amp; cd isl-synthesis"),
    ("2", "Install deps", "pip install -r requirements.txt"),
    ("3", "Download ISL lexicon", "python scripts/download_lexicon.py"),
    ("4", "Start backend", "uvicorn app.main:app --reload"),
    ("5", "Launch avatar UI", "cd frontend &amp;&amp; npm install &amp;&amp; npm run dev"),
    ("6", "Open browser", "http://localhost:3000 — speak into mic"),
]
for num, label, cmd in steps:
    right.append(Paragraph(f"<b>{num}. {label}</b>",
        ParagraphStyle("step_label", parent=body_style, spaceBefore=3)))
    right.append(Paragraph(f"<font name='Courier' size='7.5' color='#3730A3'>{cmd}</font>",
        ParagraphStyle("cmd", parent=body_style, leftIndent=10, spaceAfter=1,
                       backColor=INDIGO_LIGHT)))
right.append(Spacer(1, 6))

# RIGHT — Repo Status
right.append(section("Repo Status"))
right.append(hr())
right.append(Paragraph("&#128994;&nbsp;<b>Idea defined</b> — architecture planned, no code committed yet.", body_style))
right.append(Paragraph("&#128308;&nbsp;Source files: <i>Not found in repo</i>", body_style))
right.append(Paragraph("&#128308;&nbsp;Tests / CI: <i>Not found in repo</i>", body_style))
right.append(Paragraph("&#128308;&nbsp;Requirements.txt: <i>Not found in repo</i>", body_style))

# Combine columns
col_table = Table([[left, right]], colWidths=[9*cm, 8.4*cm])
col_table.setStyle(TableStyle([
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING",  (0,0), (0,-1), 0),
    ("RIGHTPADDING", (0,0), (0,-1), 12),
    ("LEFTPADDING",  (1,0), (1,-1), 12),
    ("RIGHTPADDING", (1,0), (1,-1), 0),
    ("TOPPADDING",   (0,0), (-1,-1), 0),
    ("BOTTOMPADDING",(0,0), (-1,-1), 0),
    ("LINEAFTER",    (0,0), (0,-1), 0.5, colors.HexColor("#E2E8F0")),
]))
story.append(col_table)
story.append(Spacer(1, 8))

# ── ARCHITECTURE FLOW ─────────────────────────────────────────────────────────
story.append(section("Architecture Overview"))
story.append(hr())

boxes = [
    ("Mic / Audio\nInput", "Hindi or\nEnglish speech"),
    ("ASR Engine\n(Whisper / Wav2Vec)", "Speech → text\ntranscript"),
    ("NLP + ISL\nGrammar Layer", "Reorder to ISL\nSOV / topic-comment"),
    ("ISL Lexicon\nLookup", "Map morphemes\nto sign units"),
    ("Avatar\nRenderer", "Three.js / BVH\n3D animation"),
]

arrow = Paragraph("  ▶  ", ParagraphStyle("arrow", parent=styles["Normal"],
    fontName="Helvetica-Bold", fontSize=11, textColor=AMBER,
    alignment=TA_CENTER, leading=14))

row_content = []
col_widths = []
for i, (label, sub) in enumerate(boxes):
    cell = [Paragraph(label, arch_label), Paragraph(sub, arch_sub)]
    row_content.append(cell)
    col_widths.append(2.9*cm)
    if i < len(boxes) - 1:
        row_content.append([arrow])
        col_widths.append(0.55*cm)

arch_table = Table([row_content], colWidths=col_widths, rowHeights=[1.3*cm])
arch_table.setStyle(TableStyle([
    ("BACKGROUND",   (0,0), (0,-1), INDIGO),
    ("BACKGROUND",   (2,0), (2,-1), INDIGO),
    ("BACKGROUND",   (4,0), (4,-1), INDIGO),
    ("BACKGROUND",   (6,0), (6,-1), INDIGO),
    ("BACKGROUND",   (8,0), (8,-1), colors.HexColor("#059669")),
    ("ROUNDEDCORNERS", [6]),
    ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
    ("ALIGN",        (0,0), (-1,-1), "CENTER"),
    ("TOPPADDING",   (0,0), (-1,-1), 4),
    ("BOTTOMPADDING",(0,0), (-1,-1), 4),
    ("LEFTPADDING",  (0,0), (-1,-1), 3),
    ("RIGHTPADDING", (0,0), (-1,-1), 3),
]))
story.append(arch_table)
story.append(Spacer(1, 6))

# Footer
footer = Paragraph(
    "Hackathon 2026 &nbsp;|&nbsp; Real-Time ISL Synthesis &nbsp;|&nbsp; Built for accessibility in Bharat",
    ParagraphStyle("footer", parent=styles["Normal"], fontName="Helvetica",
                   fontSize=7, textColor=MUTED, alignment=TA_CENTER))
story.append(footer)

doc.build(story)
print(f"PDF generated: {OUTPUT}")
