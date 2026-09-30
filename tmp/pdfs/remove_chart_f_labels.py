import io
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

SOURCE = Path(r"C:\Users\Erick\Downloads\gbgs-login-page\output\pdf\Tiffany_TRUE_GAS_updated_dates.pdf")
OUTPUT = Path(r"C:\Users\Erick\Downloads\gbgs-login-page\output\pdf\Tiffany_TRUE_GAS_updated_dates_no_F.pdf")

reader = PdfReader(str(SOURCE))
page = reader.pages[0]
width = float(page.mediabox.width)
height = float(page.mediabox.height)

packet = io.BytesIO()
c = canvas.Canvas(packet, pagesize=(width, height))
c.setFillColorRGB(1, 1, 1)

# Remove only the first and last "F" month glyphs below the chart axis.
# The rectangles stay below the axis so the line and tick marks are untouched.
for x0, x1 in ((388.5, 397.0), (542.0, 550.5)):
    top, bottom = 319.5, 330.0
    c.rect(x0, height - bottom, x1 - x0, bottom - top, stroke=0, fill=1)

c.save()
packet.seek(0)
page.merge_page(PdfReader(packet).pages[0])

writer = PdfWriter()
writer.add_page(page)
writer.add_metadata(reader.metadata or {})
with OUTPUT.open("wb") as stream:
    writer.write(stream)

print(OUTPUT)
