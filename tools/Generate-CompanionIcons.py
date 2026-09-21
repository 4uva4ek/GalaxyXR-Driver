#!/usr/bin/env python3
"""Regenerate desktop icons from supplied artwork (optional Pillow tool).

Never used during a normal build: generated assets are committed. Each size is
rendered directly from the highest-resolution supplied image, not an upscaled
intermediate. This cannot recreate detail missing from the 100x64 source.
"""
from pathlib import Path
from io import BytesIO
import struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'GalaxyXRDriver/DriverFiles/resources/icons/galaxy_xr/headset_galaxy_xr_ready_2x.png'
DEST = ROOT / 'GalaxyXRDriverGUI/src-tauri/icons'
SIZES = (32, 16, 20, 24, 28, 40, 48, 56, 64, 80, 96, 128, 256)


def render(source: Image.Image, size: int) -> Image.Image:
    # Tight but nonzero margins keep the small titlebar silhouette legible.
    padding = max(1, round(size / 32))
    content = source.copy()
    scale = (size - 2 * padding) / max(content.size)
    content = content.resize((max(1, round(content.width * scale)), max(1, round(content.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(content, ((size - content.width) // 2, (size - content.height) // 2))
    return canvas


def write_ico(filename: Path, images: list[Image.Image]) -> None:
    # Tauri recommends a 32px first entry. Pillow's ordinary ICO writer sorts
    # entries, which previously put a 16px image first for dev-window selection.
    offset = 6 + 16 * len(images)
    entries, blobs = [], []
    for image in images:
        buffer = BytesIO(); image.save(buffer, format='PNG')
        data = buffer.getvalue(); size = image.width
        entries.append(struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(data), offset))
        blobs.append(data); offset += len(data)
    filename.write_bytes(struct.pack('<HHH', 0, 1, len(images)) + b''.join(entries) + b''.join(blobs))


def main() -> None:
    source = Image.open(SOURCE).convert('RGBA')
    bounds = source.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError('Source icon is entirely transparent')
    source = source.crop(bounds)
    DEST.mkdir(parents=True, exist_ok=True)
    write_ico(DEST / 'icon.ico', [render(source, size) for size in SIZES])
    for size in (16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 128, 256, 512):
        render(source, size).save(DEST / f'{size}x{size}.png')
    render(source, 256).save(DEST / '128x128@2x.png')
    render(source, 512).save(DEST / 'icon.png')
    render(source, 1024).save(DEST / 'icon.icns', format='ICNS')
    write_ico(ROOT / 'GalaxyXRDriverGUI/public/favicon.ico', [render(source, s) for s in (32, 16, 48, 64)])
    (ROOT / 'GalaxyXRDriverGUI/public/icons/favicon.ico').write_bytes((ROOT / 'GalaxyXRDriverGUI/public/favicon.ico').read_bytes())
    print(f'Generated {len(SIZES)} Windows ICO sizes; 32px is first. Source detail is limited to {SOURCE.name}.')


if __name__ == '__main__':
    main()
