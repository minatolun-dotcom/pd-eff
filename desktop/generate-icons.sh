#!/bin/bash
# Generate icons for pd-eff Electron app
set -e

cd "$(dirname "$0")"

echo "=== pd-eff Icon Generator ==="

# Create icons directory
mkdir -p icons

# Check if we have ImageMagick or can use a fallback
if command -v convert &>/dev/null; then
    echo "Using ImageMagick to generate icons..."

    # Create a simple 🔐 icon-based SVG first, then convert
    cat > /tmp/pd-eff-icon.svg << 'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#0f3460"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <text x="256" y="300" font-size="200" text-anchor="middle" fill="white">🔐</text>
  <text x="256" y="420" font-size="48" font-family="Arial, sans-serif" font-weight="bold" text-anchor="middle" fill="#60a5fa">pd-eff</text>
</svg>
SVG

    # Generate PNG icons at different sizes
    convert /tmp/pd-eff-icon.svg -resize 16x16 icons/16x16.png 2>/dev/null || true
    convert /tmp/pd-eff-icon.svg -resize 32x32 icons/32x32.png 2>/dev/null || true
    convert /tmp/pd-eff-icon.svg -resize 48x48 icons/48x48.png 2>/dev/null || true
    convert /tmp/pd-eff-icon.svg -resize 64x64 icons/64x64.png 2>/dev/null || true
    convert /tmp/pd-eff-icon.svg -resize 128x128 icons/128x128.png 2>/dev/null || true
    convert /tmp/pd-eff-icon.svg -resize 256x256 icons/256x256.png 2>/dev/null || true
    convert /tmp/pd-eff-icon.svg -resize 512x512 icons/512x512.png 2>/dev/null || true
    convert /tmp/pd-eff-icon.svg -resize 1024x1024 icons/1024x1024.png 2>/dev/null || true

    # Main icon
    convert /tmp/pd-eff-icon.svg -resize 512x512 icon.png

    echo "✅ PNG icons generated"
else
    echo "ImageMagick not found, creating placeholder icons..."

    # Create minimal 1x1 PNG as placeholder (will be replaced with real icons)
    python3 -c "
import struct, zlib

def create_png(width, height, r, g, b):
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc

    header = b'\\x89PNG\\r\\n\\x1a\\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))

    raw = b''
    for y in range(height):
        raw += b'\\x00'  # filter none
        for x in range(width):
            raw += bytes([r, g, b])

    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

for size in [16, 32, 48, 64, 128, 256, 512, 1024]:
    png = create_png(size, size, 0x0f, 0x34, 0x60)
    with open(f'icons/{size}x{size}.png', 'wb') as f:
        f.write(png)

# Main icon
png = create_png(512, 512, 0x0f, 0x34, 0x60)
with open('icon.png', 'wb') as f:
    f.write(png)

print('✅ Placeholder icons created')
"

    # Also create icon.ico using ImageMagick if available, or use the PNG
    if command -v convert &>/dev/null; then
        convert icon.png icon.ico
    fi
fi

echo ""
echo "Icons generated in: icons/"
ls -la icons/ 2>/dev/null
echo ""
echo "Main icon: icon.png"
ls -la icon.png 2>/dev/null
