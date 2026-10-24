import zlib
import struct
import math
import os

def create_png(width, height, pixel_shader):
    """
    Creates a standard valid PNG binary from a pixel_shader(x, y, width, height) -> (r, g, b, a).
    Uses uncompressed/deflated raw RGBA scanlines with filter byte 0.
    """
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0: None
        for x in range(width):
            r, g, b, a = pixel_shader(x, y, width, height)
            # clamp to 0-255
            raw.append(max(0, min(255, int(r))))
            raw.append(max(0, min(255, int(g))))
            raw.append(max(0, min(255, int(b))))
            raw.append(max(0, min(255, int(a))))

    def make_chunk(tag, data):
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    idat_data = zlib.compress(bytes(raw), 9)

    return header + make_chunk(b'IHDR', ihdr_data) + make_chunk(b'IDAT', idat_data) + make_chunk(b'IEND', b'')


# Signed Distance Functions (SDF) for 2D shapes
def sd_box(px, py, bx, by):
    dx = abs(px) - bx
    dy = abs(py) - by
    return math.hypot(max(dx, 0.0), max(dy, 0.0)) + min(max(dx, dy), 0.0)

def sd_rounded_box(px, py, bx, by, r):
    return sd_box(px, py, bx - r, by - r) - r

def sd_segment(px, py, ax, ay, bx, by):
    pax, pay = px - ax, py - ay
    bax, bay = bx - ax, by - ay
    h = max(0.0, min(1.0, (pax * bax + pay * bay) / (bax * bax + bay * bay)))
    return math.hypot(pax - bax * h, pay - bay * h)

def sd_arc(px, py, cx, cy, radius, stroke):
    dist = math.hypot(px - cx, py - cy)
    # only right half (px >= cx)
    if px < cx:
        # distance to endpoints at (cx, cy - radius) and (cx, cy + radius)
        d1 = math.hypot(px - cx, py - (cy - radius))
        d2 = math.hypot(px - cx, py - (cy + radius))
        return min(d1, d2) - stroke * 0.5
    return abs(dist - radius) - stroke * 0.5

def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def render_paisatrack_icon(x, y, w, h, is_maskable=False):
    # Normalize coordinates to [-1.0, 1.0]
    nx = (x / (w - 1)) * 2.0 - 1.0
    ny = (y / (h - 1)) * 2.0 - 1.0

    # Scale factor for maskable icons (safe zone is central 80%)
    scale = 0.72 if is_maskable else 0.88
    sx = nx / scale
    sy = ny / scale

    # 1. Background
    # Dark navy theme background: #0f141c
    bg_r, bg_g, bg_b = 15, 20, 28

    # Rounded Badge for non-maskable icons
    badge_dist = sd_rounded_box(sx, sy, 0.96, 0.96, 0.28)
    badge_alpha = 1.0 - smoothstep(-0.02, 0.01, badge_dist)

    if is_maskable:
        # Full bleed background
        cur_r, cur_g, cur_b, cur_a = bg_r, bg_g, bg_b, 255
    else:
        # Squircle badge with subtle dark gradient #1e293b -> #111827
        grad_t = (sy + 1.0) * 0.5
        sur_r = int(30 * (1 - grad_t) + 17 * grad_t)
        sur_g = int(41 * (1 - grad_t) + 24 * grad_t)
        sur_b = int(59 * (1 - grad_t) + 39 * grad_t)
        cur_r = int(bg_r * (1 - badge_alpha) + sur_r * badge_alpha)
        cur_g = int(bg_g * (1 - badge_alpha) + sur_g * badge_alpha)
        cur_b = int(bg_b * (1 - badge_alpha) + sur_b * badge_alpha)
        cur_a = int(255 * badge_alpha) if not is_maskable else 255

    # 2. Border for badge
    if not is_maskable and badge_alpha > 0.01:
        border_dist = abs(badge_dist)
        border_factor = 1.0 - smoothstep(0.0, 0.03, border_dist)
        # Cyan-emerald border accent
        cur_r = int(cur_r * (1 - border_factor * 0.5) + 56 * (border_factor * 0.5))
        cur_g = int(cur_g * (1 - border_factor * 0.5) + 189 * (border_factor * 0.5))
        cur_b = int(cur_b * (1 - border_factor * 0.5) + 248 * (border_factor * 0.5))

    # 3. Rupee Glyph Elements (coordinates relative to badge center)
    # Shift slightly left to balance visual weight
    gx = sx + 0.06
    gy = sy - 0.02

    # Top Bar 1
    d_bar1 = sd_rounded_box(gx - 0.02, gy + 0.46, 0.44, 0.065, 0.04)
    # Top Bar 2
    d_bar2 = sd_rounded_box(gx - 0.08, gy + 0.24, 0.38, 0.065, 0.04)
    # Vertical Stem
    d_stem = sd_rounded_box(gx + 0.22, gy - 0.04, 0.065, 0.54, 0.04)
    # Upper Loop (arc centered at -0.22, -0.01)
    d_loop = sd_arc(gx, gy, -0.22, -0.01, 0.25, 0.13)
    # Diagonal Leg
    d_leg = sd_segment(gx, gy, -0.05, 0.02, 0.32, -0.48) - 0.065

    # Growth spark / arrow in top right
    d_spark = math.hypot(sx - 0.52, sy + 0.52) - 0.09

    # Combine glyph SDF (min of all shapes)
    glyph_d = min(d_bar1, d_bar2, d_stem, d_loop, d_leg, d_spark)

    # Antialiased blend of glyph
    glyph_alpha = 1.0 - smoothstep(-0.015, 0.015, glyph_d)

    if glyph_alpha > 0.001:
        # Radiant gradient: Cyan (#38bdf8) -> Emerald (#10b981)
        sym_t = max(0.0, min(1.0, (sx + sy + 1.0) * 0.5))
        sym_r = int(56 * (1 - sym_t) + 16 * sym_t)
        sym_g = int(189 * (1 - sym_t) + 185 * sym_t)
        sym_b = int(248 * (1 - sym_t) + 129 * sym_t)

        cur_r = int(cur_r * (1 - glyph_alpha) + sym_r * glyph_alpha)
        cur_g = int(cur_g * (1 - glyph_alpha) + sym_g * glyph_alpha)
        cur_b = int(cur_b * (1 - glyph_alpha) + sym_b * glyph_alpha)
        cur_a = max(cur_a, int(255 * glyph_alpha))

    return cur_r, cur_g, cur_b, cur_a


def generate_all():
    out_dir = r"E:\track\public"
    os.makedirs(out_dir, exist_ok=True)

    # 1. Favicon SVG
    svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="symGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#10b981" stop-opacity="0.3" />
    </linearGradient>
  </defs>

  <!-- Background Squircle -->
  <rect x="24" y="24" width="464" height="464" rx="120" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="12" />

  <!-- Rupee Symbol -->
  <g transform="translate(256, 256)">
    <!-- Top Bar 1 -->
    <rect x="-140" y="-130" width="260" height="38" rx="19" fill="url(#symGrad)" />
    <!-- Top Bar 2 -->
    <rect x="-140" y="-60" width="220" height="38" rx="19" fill="url(#symGrad)" />
    <!-- Vertical Stem -->
    <rect x="-140" y="-130" width="38" height="280" rx="19" fill="url(#symGrad)" />
    <!-- Semicircular Upper Loop -->
    <path d="M -135 -60 C 25 -60, 25 50, -135 50" fill="none" stroke="url(#symGrad)" stroke-width="38" stroke-linecap="round" />
    <!-- Diagonal Leg -->
    <path d="M -75 40 L 75 160" stroke="url(#symGrad)" stroke-width="38" stroke-linecap="round" />
    <!-- Growth Accent Spark -->
    <circle cx="150" cy="-140" r="28" fill="#10b981" />
    <path d="M 150 -178 L 158 -150 L 186 -140 L 158 -130 L 150 -102 L 142 -130 L 114 -140 L 142 -150 Z" fill="#38bdf8" />
  </g>
</svg>
'''
    with open(os.path.join(out_dir, "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(svg_content)
    print("Created public/favicon.svg")

    # 2. pwa-192x192.png
    pwa_192 = create_png(192, 192, lambda x, y, w, h: render_paisatrack_icon(x, y, w, h, is_maskable=False))
    with open(os.path.join(out_dir, "pwa-192x192.png"), "wb") as f:
        f.write(pwa_192)
    print("Created public/pwa-192x192.png")

    # 3. pwa-512x512.png
    pwa_512 = create_png(512, 512, lambda x, y, w, h: render_paisatrack_icon(x, y, w, h, is_maskable=False))
    with open(os.path.join(out_dir, "pwa-512x512.png"), "wb") as f:
        f.write(pwa_512)
    print("Created public/pwa-512x512.png")

    # 4. maskable-icon-512x512.png
    maskable_512 = create_png(512, 512, lambda x, y, w, h: render_paisatrack_icon(x, y, w, h, is_maskable=True))
    with open(os.path.join(out_dir, "maskable-icon-512x512.png"), "wb") as f:
        f.write(maskable_512)
    print("Created public/maskable-icon-512x512.png")

    # 5. apple-touch-icon.png (180x180)
    apple_180 = create_png(180, 180, lambda x, y, w, h: render_paisatrack_icon(x, y, w, h, is_maskable=False))
    with open(os.path.join(out_dir, "apple-touch-icon.png"), "wb") as f:
        f.write(apple_180)
    print("Created public/apple-touch-icon.png")

    # 6. favicon.ico (can be a 48x48 PNG embedded as ICO or 48x48 PNG)
    # A standard single-image ICO is a 6-byte header + 16-byte directory entry + PNG payload!
    ico_png = create_png(48, 48, lambda x, y, w, h: render_paisatrack_icon(x, y, w, h, is_maskable=False))
    ico_header = struct.pack('<HHH', 0, 1, 1)  # reserved=0, type=1 (ICO), count=1
    ico_entry = struct.pack('<BBBBHHII', 48, 48, 0, 0, 1, 32, len(ico_png), 22)
    with open(os.path.join(out_dir, "favicon.ico"), "wb") as f:
        f.write(ico_header + ico_entry + ico_png)
    print("Created public/favicon.ico")

if __name__ == "__main__":
    generate_all()
