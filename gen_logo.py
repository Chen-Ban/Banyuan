#!/usr/bin/env python3
"""Generate Banyuan logo as SVG with precise bezier curves for aerial roots."""

svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 560" width="500" height="560">
  <rect width="500" height="560" fill="white"/>

  <!-- Trunk: clean vertical line, flat top -->
  <line x1="250" y1="25" x2="250" y2="195"
        stroke="black" stroke-width="5.5" stroke-linecap="round"/>

  <!-- Aerial roots: all start at (250, 195), fan downward with generous curves -->
  <!-- Each uses cubic bezier: M start, C cp1, cp2, end -->
  <!-- The control points pull the curve strongly outward -->

  <!-- Outermost left: sweeps wide left -->
  <path d="M250,195 C230,240 155,280 90,330"
        stroke="black" stroke-width="3.5" stroke-linecap="round" fill="none"/>

  <!-- Inner left -->
  <path d="M250,195 C240,245 205,285 175,325"
        stroke="black" stroke-width="3.5" stroke-linecap="round" fill="none"/>

  <!-- Center: straight down -->
  <path d="M250,195 C250,245 250,285 250,330"
        stroke="black" stroke-width="3.5" stroke-linecap="round" fill="none"/>

  <!-- Inner right -->
  <path d="M250,195 C260,245 295,285 325,325"
        stroke="black" stroke-width="3.5" stroke-linecap="round" fill="none"/>

  <!-- Outermost right: sweeps wide right -->
  <path d="M250,195 C270,240 345,280 410,330"
        stroke="black" stroke-width="3.5" stroke-linecap="round" fill="none"/>

  <!-- Wordmark using SVG path-based text to avoid font rendering issues -->
  <!-- Using a web-safe approach: embed text with explicit letter-spacing -->
  <text
    x="250" y="460"
    font-family="'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif"
    font-size="80"
    font-style="italic"
    font-weight="400"
    text-anchor="middle"
    letter-spacing="1"
    fill="black">Banyuan</text>
</svg>'''

with open('banyuan_logo.svg', 'w') as f:
    f.write(svg)

print("SVG written.")
