import io
import json
from pathlib import Path

import pdfplumber
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

SOURCE = Path(r"C:\Users\Erick\Downloads\Tiffany  TRUE GAS (1)(1).pdf")
OUTPUT = Path(r"C:\Users\Erick\Downloads\gbgs-login-page\output\pdf\Tiffany_TRUE_GAS_updated_dates.pdf")


def centered_text(c, text, x0, x1, baseline, font="Helvetica-Bold", size=8.6):
    width = stringWidth(text, font, size)
    c.setFont(font, size)
    c.setFillColorRGB(0.08, 0.08, 0.08)
    c.drawString((x0 + x1 - width) / 2, baseline, text)


with pdfplumber.open(SOURCE) as pdf:
    page = pdf.pages[0]
    words = page.extract_words(x_tolerance=2, y_tolerance=2)
    Path(r"C:\Users\Erick\Downloads\gbgs-login-page\tmp\pdfs\words.json").write_text(
        json.dumps(words, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    for w in words:
        if "2026" in w["text"]:
            print(w)

reader = PdfReader(str(SOURCE))
source_page = reader.pages[0]
page_width = float(source_page.mediabox.width)
page_height = float(source_page.mediabox.height)

packet = io.BytesIO()
c = canvas.Canvas(packet, pagesize=(page_width, page_height))
c.setFillColorRGB(1, 1, 1)

# Cover only the original date values. Coordinates use PDF points from bottom-left.
fields = [
    # statement date
    (208, 200, 264, 214, "09/25/2026", 210.2, 8.6),
    # service from
    (132, 470, 184, 483, "08/25/2026", 479.5, 8.1),
    # service to
    (199, 470, 252, 483, "09/26/2026", 479.5, 8.1),
    # top due date
    (480, 200, 535, 214, "09/29/2026", 210.2, 8.6),
    # payment stub due date
    (502, 644, 554, 657, "09/29/2026", 647.0, 8.4),
    # payment stub past due after
    (502, 659, 554, 672, "09/29/2026", 662.0, 8.4),
]

for x0, top, x1, bottom, text, baseline, size in fields:
    y0 = page_height - bottom
    y1 = page_height - top
    c.setFillColorRGB(1, 1, 1)
    c.rect(x0, y0, x1 - x0, y1 - y0, stroke=0, fill=1)
    centered_text(c, text, x0, x1, page_height - baseline, size=size)

c.save()
packet.seek(0)
overlay_page = PdfReader(packet).pages[0]
source_page.merge_page(overlay_page)

writer = PdfWriter()
writer.add_page(source_page)
writer.add_metadata(reader.metadata or {})
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with OUTPUT.open("wb") as output_stream:
    writer.write(output_stream)

print(f"Wrote {OUTPUT}")
