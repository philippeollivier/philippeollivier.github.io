# Design Spec

## Theme
Solarized Light — background `#fdf6e3`, body text `#657b83`

## Fonts
- **Title:** Redaction 50 Bold Italic (`/fonts/redaction-50-latin-700-italic.woff2`) — rendered with `-webkit-font-smoothing: none` for sharp/pixelated appearance
- **UI elements:** Alte Haas Grotesk Regular (`/fonts/AlteHaasGroteskRegular.ttf`)

## Pages
- `/` — Home: title, orbiting hexagons, center GIF
- `/gallery` — Fashion brand style masonry image gallery (placeholder images)
- `/contact` — Contact info (placeholder)
- `/explore` — Empty placeholder page

## Layout

### Title (Home)
- Text: "Philippe Ollivier"
- Position: centered horizontally, fixed at top (top: 2rem)
- Color: black (#000000)
- Font: Redaction 50, bold italic, base 1.875rem scaled 3x via CSS transform
- Rendering: sharp (no anti-aliasing via -webkit-font-smoothing: none)

### Orbiting Hexagons
- 3 hexagons orbiting around the center GIF
- Each hexagon: ~48px diameter (24px radius), 1px black outline, filled with BG color (#fdf6e3)
- Orbit radius: 200px from center
- 3D visual orbiting on multiple tilted planes (size does not change)
- Initial velocity: medium/high, with strong damping (0.95/frame), settles in ~1s
- Minimum velocity: 0.003 rad/frame (perpetual slow drift)
- 1px black line connects each hexagon center to GIF center
- Z-order: lines (back, z:1) → GIF (middle, z:2) → hexagons (front, z:3)
- Clickable: each hexagon navigates to a page

### Page Transitions
- On hexagon click: hexagon expands from its position to fill entire viewport (1000ms, ease-out cubic)
- Hexagon outline (1px black stroke) stays visible and expands with the fill throughout the animation
- Fill color: #fdf6e3 (matches background for seamless wipe)
- **Overlapping transition:** At 400ms (600ms before expand finishes), Astro View Transitions `navigate()` is triggered. The new page fades in over 600ms while the old page snapshot (nearly-covered by expanded hexagon) holds. This creates a seamless overlap where the new content appears while the hexagon is still expanding.
- Uses Astro `<ClientRouter />` for SPA-mode navigation with View Transitions API
- Custom transition animations: `pageHold` (old page stays at opacity 1) + `pageFadeIn` (new page fades in from opacity 0 to 1)
- Transition overlay canvas at z-index: 100
- **Prefetching:** All destination pages are prefetched in the background after the homepage loads using `requestIdleCallback` (falls back to `setTimeout`). Pages are already cached when clicked, eliminating load delay.

### Hero GIF
- Source: `/images/hero.gif`
- Size: 0.5x original (scaled down via CSS transform)
- Rendering: `image-rendering: pixelated` (no anti-aliasing)
- Position: centered on page (50% x 50%)

### Gallery Page
- Fashion brand inspired masonry layout using CSS columns
- Unevenly sized placeholder cards (varying aspect ratios: 3/4, 1/1, 2/3, 4/5, 3/2)
- Responsive: 2 columns mobile, 3 tablet, 4 desktop
- Back link to home

## Color Tokens (Tailwind)
All Solarized colors available as `sol-*` (e.g., `bg-sol-base3`, `text-sol-base00`)

## Animation Architecture
- Three canvases layered with z-index
  - `#orbit-lines` (z:1) — connecting lines, behind GIF
  - `#orbit-hexagons` (z:3) — hexagon outlines, in front of GIF, receives click events
  - `#transition-overlay` (z:100) — expanding hexagon transition, hidden until triggered
- GIF at z:2 between line and hexagon canvases
- `requestAnimationFrame` loop for orbit animation
- Separate `requestAnimationFrame` loop for transition animation
- Each orbit: { angle, velocity, tiltX, tiltY }
- 3D projection: rotate around X then Y axis, no perspective scaling
