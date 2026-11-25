# Лицевая сторона paperback 6×9" с вылетом под обрез: обложка электронной книги (1600×2560, соотношение 1:1.6)
# вписывается по высоте обреза, а поля вокруг заполняются тем же фоном с плавным переходом, без видимого шва.
# Выход: cover/en/front-print.png (6.125×9.25", ~284 dpi). Запуск: python cover/en/make-front.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).parent
src = Image.open(HERE / "cover-ebook.jpg").convert("RGB")
W0, H0 = src.size                      # 1600×2560 = обрез по высоте 9"
dpi = H0 / 9.0
W, H = round(6.125 * dpi), round(9.25 * dpi)   # обрез 6" + вылет 0.125" справа, сверху и снизу
ox, oy = round((6.0 * dpi - W0) / 2), round(0.125 * dpi)

# фон: средний цвет узких полос у краёв исходника
strips = [src.crop((0, 0, 12, H0)), src.crop((W0 - 12, 0, W0, H0)), src.crop((0, H0 - 12, W0, H0)), src.crop((0, 0, W0, 12))]
px = [p for s in strips for p in s.get_flattened_data()]
bg = tuple(sum(c[i] for c in px) // len(px) for i in range(3))

out = Image.new("RGB", (W, H), bg)
# маска: исходник непрозрачен внутри и плавно растворяется на последних 60 px к краям
feather = 60
mask = Image.new("L", (W0, H0), 0)
ImageDraw.Draw(mask).rectangle((feather, feather, W0 - feather, H0 - feather), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(feather / 2.5))
out.paste(src, (ox, oy), mask)
out.save(HERE / "front-print.png", dpi=(dpi, dpi))
print("front-print.png", out.size, "bg", "#%02X%02X%02X" % bg, f"{dpi:.0f} dpi")
