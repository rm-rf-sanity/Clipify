"""Render Clipify's code-native brand mark into Windows icon assets."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "assets"
image = Image.new("RGBA", (1024, 1024))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((32, 32, 992, 992), radius=260, fill="#b6a0ff")
for x, y, width, height in [(53, 95, 17, 66), (86, 61, 17, 134), (119, 83, 17, 90), (152, 48, 17, 160), (185, 101, 17, 54)]:
    draw.rounded_rectangle((x * 4, y * 4, (x + width) * 4, (y + height) * 4), radius=34, fill="#231b35")
image = image.resize((256, 256), Image.Resampling.LANCZOS)
image.save(root / "icon.png")
image.save(root / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
