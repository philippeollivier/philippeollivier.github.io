# Project Architecture

## Stack
- **Astro** — Static site generator (zero JS by default)
- **Tailwind CSS v4** — Utility-first CSS via `@tailwindcss/vite` plugin
- **GitHub Pages** — Hosting via GitHub Actions (`withastro/action@v3`)

## Directory Structure
```
src/
  layouts/
    BaseLayout.astro    — Shared HTML shell, imports global.css
  pages/
    index.astro         — Home page
  styles/
    global.css          — Tailwind import + custom CSS
public/
  images/
    hero.gif            — Animated GIF for home page (point-scaled 2x)
.github/
  workflows/
    deploy.yml          — Auto-deploy to GitHub Pages on push to main
```

## Deployment
- Push to `main` triggers GitHub Actions
- Astro builds static output
- `actions/deploy-pages@v4` publishes to GitHub Pages
- Live at: https://philippeollivier.github.io

## Configuration
- `astro.config.mjs` — site URL + Tailwind vite plugin
- `tsconfig.json` — Strict TypeScript
