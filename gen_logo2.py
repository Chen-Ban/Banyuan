"""
Banyuan logo — roots with horizontal outward bow only.
cp1 and cp2 are placed along the chord at 35% and 65%,
then pushed ONLY in the x direction (outward).
This bows the curve sideways without affecting the vertical drop.
"""

import math

def make_root(ox, oy, ex, ey, bow1=40, bow2=25):
    dx, dy = ex - ox, ey - oy
    chord = math.sqrt(dx*dx + dy*dy)
    sign = 1 if dx > 0 else -1  # outward direction

    # cp1 at 35% along chord, pushed outward in x only
    cp1x = ox + 0.35 * dx + sign * bow1
    cp1y = oy + 0.35 * dy

    # cp2 at 65% along chord, pushed outward in x only
    cp2x = ox + 0.65 * dx + sign * bow2
    cp2y = oy + 0.65 * dy

    return f"M{ox},{oy} C{cp1x:.1f},{cp1y:.1f} {cp2x:.1f},{cp2y:.1f} {ex},{ey}"

O = (250, 190)
ends = [
    (55,  375),
    (152, 375),
    (250, 375),
    (348, 375),
    (445, 375),
]

paths = []
for ex, ey in ends:
    if ex == 250:
        paths.append('<line x1="250" y1="190" x2="250" y2="375" stroke="black" stroke-width="3.5" stroke-linecap="round"/>')
    else:
        d = make_root(O[0], O[1], ex, ey)
        paths.append(f'<path d="{d}" stroke="black" stroke-width="3.5" stroke-linecap="round" fill="none"/>')
        print(f"  end=({ex},{ey}): {d}")

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 580" width="500" height="580">
  <rect width="500" height="580" fill="white"/>
  <line x1="250" y1="25" x2="250" y2="190" stroke="black" stroke-width="5.5" stroke-linecap="round"/>
  {"  ".join(paths)}
  <text x="250" y="490"
    font-family="'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif"
    font-size="80" font-style="italic" font-weight="400"
    text-anchor="middle" letter-spacing="1" fill="black">Banyuan</text>
</svg>'''

with open('banyuan_logo.svg', 'w') as f:
    f.write(svg)
print("Done.")
