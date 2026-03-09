# after-hours

Side quests. Personal builds. Things made off the clock.

**Live at** → [after-hours.app](https://after-hours.app)

---

## What's Here

### Sabbatical Globe

A scroll-driven 3D interactive globe visualizing 89 days of travel across 10 countries — from New York to Everest Base Camp to the Amalfi Coast and back. Built with Three.js, React Three Fiber, and Next.js.

- Procedural earth rendered with custom GLSL shaders (no texture dependencies)
- Animated flight arcs that draw as you scroll
- Pulsing city markers with glow effects for key destinations
- Chapter cards with a frosted-glass overlay
- Scroll-linked progress bar

---

## Development Log

Full account of how this project was built, from initial setup through deployment:

→ [DEVLOG.md](./DEVLOG.md)

## Technical Reference

Maintenance guide, common issues, deployment workflow, and project architecture:

→ [TECHNICAL.md](./TECHNICAL.md)

---

## Quick Start

```bash
git clone git@github.com:husaintalawala/after-hours.git
cd after-hours
npm install --legacy-peer-deps
npx next dev
```

Open [localhost:3000](http://localhost:3000).

## Deploy

```bash
npm run deploy
```

Pushes a static export to the `gh-pages` branch. GitHub Pages serves it at [after-hours.app](https://after-hours.app).

---

## Stack

- **Framework**: Next.js 14 (static export)
- **3D**: Three.js + React Three Fiber + Drei
- **Styling**: Tailwind CSS
- **Fonts**: Playfair Display, IBM Plex Mono, Inter
- **Hosting**: GitHub Pages + Cloudflare DNS
- **Domain**: after-hours.app
