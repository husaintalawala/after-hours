# Development Log

How this project went from zero to live at [after-hours.app](https://after-hours.app).

---

## Phase 1: Initial Setup

Started with a Next.js 14 project using React Three Fiber for a 3D globe visualization. The original codebase was called `sabbatical-globe` and used external texture images from the `three-globe` library hosted on unpkg.com.

### Original Stack
- Next.js 14.1.0 with TypeScript
- React 18 + React Three Fiber 8.x + Drei 9.x
- Three.js 0.160
- Tailwind CSS 3.4
- GSAP + Lenis (smooth scroll)

### Project Structure
```
after-hours/
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Fonts, metadata, global layout
│   │   └── page.tsx          # Main page with Globe + ChapterCards
│   ├── components/
│   │   ├── Globe.tsx         # 3D earth, markers, arcs, scene
│   │   └── ChapterCard.tsx   # Scroll-triggered chapter overlays
│   ├── data/
│   │   └── journey.ts        # All travel data (cities, coords, dates)
│   ├── hooks/
│   │   └── useScrollProgress.ts  # Scroll position tracking
│   └── styles/
│       └── globals.css       # Custom styles, scrollbar, card glass effect
├── public/
│   └── CNAME                 # Custom domain for GitHub Pages
├── next.config.js
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

---

## Phase 2: Texture Loading Issues

### Problem
The `Globe.tsx` component loaded four earth texture images from `unpkg.com/three-globe@2.31.0/example/img/`:
- `earth-blue-marble.jpg`
- `earth-topology.png`
- `earth-water.png`
- `earth-clouds.png`

The CDN was unreliable. `earth-clouds.png` repeatedly failed to load (returned a 59-byte error page instead of the actual image), crashing the entire `useTexture` hook.

### Attempted Fixes
1. **Local textures** — Downloaded images to `public/images/` and changed paths to `/images/...`. Three of four downloaded correctly, but `earth-clouds.png` consistently downloaded as a corrupt 59-byte file.
2. **Alternative CDN** — Tried GitHub raw URLs (`raw.githubusercontent.com/vasturiano/three-globe/...`). Same result for the clouds file.
3. **iCloud sync issue** — Files in `~/Documents` were synced to iCloud and offloaded. Had to force local download with `brctl download` before the dev server could serve them.

### Solution
Removed all external texture dependencies entirely. Rewrote the Earth component using **custom GLSL shaders** that procedurally generate:
- Continent shapes via multi-octave simplex noise
- Ocean depth variation
- Subtle lat/lng grid lines in gold
- Fresnel-based atmosphere glow
- Specular highlights on water

This eliminated the texture loading problem permanently and gave the globe a more stylized, editorial look.

---

## Phase 3: React Version Conflicts

### Problem
A globally installed Next.js 16 (React 19) was being picked up instead of the project's local Next.js 14 (React 18). This caused:
```
Cannot read properties of undefined (reading 'ReactCurrentOwner')
```
React Three Fiber 8.x requires React 18 and is incompatible with React 19.

### Fix
1. Pinned Next.js 14 locally: `npm install next@14.1.0 --save`
2. Used `npx next dev` instead of `npm run dev` to run the local version
3. Cleaned stale caches: `rm -rf node_modules .next package-lock.json`
4. Installed with `--legacy-peer-deps` to resolve peer dependency conflicts

### TypeScript Build Error
The Three.js `<line>` JSX element conflicted with the SVG `<line>` type:
```
Type '{ children: Element; geometry: BufferGeometry }' is not assignable to type 'SVGLineElementAttributes'
```
Fixed by adding `// @ts-nocheck` at the top of `Globe.tsx`.

---

## Phase 4: GitHub Setup

### Repository
Created `husaintalawala/after-hours` on GitHub (public repo).

### SSH Authentication
GitHub no longer supports password authentication for git operations. Setup process:
1. Generated an ED25519 SSH key: `ssh-keygen -t ed25519 -f ~/.ssh/gh_afterhours -N ""`
2. Added the public key to GitHub at Settings → SSH Keys
3. Set the remote URL to SSH: `git remote set-url origin git@github.com:husaintalawala/after-hours.git`
4. For the custom key, used: `GIT_SSH_COMMAND="ssh -i ~/.ssh/gh_afterhours" git push`
5. Added SSH config for convenience:
   ```
   Host github.com
     IdentityFile ~/.ssh/gh_afterhours
     IdentitiesOnly yes
   ```

### Git Workflow
```bash
git add .
git commit -m "description of change"
git push
```

---

## Phase 5: Deployment

### Static Export via GitHub Pages
1. Installed `gh-pages`: `npm install gh-pages --save-dev --legacy-peer-deps`
2. Added deploy script to `package.json`:
   ```json
   "deploy": "npm run export && gh-pages -d out --dotfiles"
   ```
3. `npm run deploy` builds the static site and pushes to the `gh-pages` branch
4. GitHub Pages Settings → Source: `gh-pages` branch, `/ (root)`

### Initial basePath Issue
The `next.config.js` had `basePath: '/sabbatical-globe'` from the old project name. The site loaded but showed "Initializing..." because JS bundles 404'd. Fixed by updating to `basePath: ''` after setting up the custom domain.

---

## Phase 6: Custom Domain

### Domain Registration
Purchased `after-hours.app` on Cloudflare Registrar.

### DNS Configuration (Cloudflare)
Added five DNS records (all with proxy OFF / DNS only):

| Type  | Name  | Content                    |
|-------|-------|----------------------------|
| A     | @     | 185.199.108.153            |
| A     | @     | 185.199.109.153            |
| A     | @     | 185.199.110.153            |
| A     | @     | 185.199.111.153            |
| CNAME | www   | husaintalawala.github.io   |

### GitHub Pages Configuration
- Settings → Pages → Custom domain: `after-hours.app`
- Waited for DNS check to pass
- Waited for SSL certificate provisioning (~30 min)
- Enabled "Enforce HTTPS"

### CNAME Persistence
Created `public/CNAME` containing `after-hours.app` so the custom domain setting survives each `gh-pages` deploy.

### Config Update
Set `basePath` and `assetPrefix` to empty strings since the site is served from a root domain:
```js
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: '',
  assetPrefix: '',
}
```

---

## Timeline

| Date       | Milestone                              |
|------------|----------------------------------------|
| Mar 8, 2026 | Initial project setup and texture debugging |
| Mar 8, 2026 | Rewrote Globe with procedural shaders  |
| Mar 8, 2026 | Resolved React version conflicts       |
| Mar 8, 2026 | Pushed to GitHub, deployed to Pages    |
| Mar 8, 2026 | Custom domain live at after-hours.app  |
