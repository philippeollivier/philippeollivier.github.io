# Design Decisions

## Theme
- **Solarized Light** color palette
- Background: `#fdf6e3`
- Background highlights: `#eee8d5`
- Body text: `#657b83`
- Emphasis text: `#586e75`
- Comments/secondary: `#93a1a1`
- Button outlines: `#586e75`

## Home Page Layout
- Animated GIF centered on the page
- GIF is 2x upscaled using nearest-neighbor / point scaling (CSS `image-rendering: pixelated`) — no anti-aliasing or blurring
- Source GIF: `public/images/hero.gif`

### Left-side Buttons
- 3 buttons: "Home", "Gallery", "Other"
- Each button is 100x40 pixels with a 1px solid outline
- Buttons are horizontally centered at 20% of the viewport width
- Buttons are vertically stacked, centered on the page, with a gap equal to half the button height (20px)
- Button text uses Solarized body text color

## Typography
- Clean, minimal — system font stack or similar

## Responsive
- Mobile-first approach using Tailwind CSS utility classes
