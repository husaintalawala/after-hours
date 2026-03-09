# Technical Reference

Architecture, maintenance, deployment, and troubleshooting for after-hours.

---

## Architecture Overview

```
Browser Request
    ↓
Cloudflare DNS (after-hours.app)
    ↓
GitHub Pages (gh-pages branch)
    ↓
Static HTML/JS/CSS (Next.js export)
    ↓
Client-side React + Three.js renders 3D globe
```

The site is fully static — no server, no API, no database. Next.js builds HTML + JS bundles, GitHub Pages serves them, Cloudflare handles DNS and SSL.

---

## Local Development

### Prerequisites
- Node.js 18+
- npm
- Git with SSH key configured for GitHub

### Setup
```bash
git clone git@github.com:husaintalawala/after-hours.git
cd after-hours
npm install --legacy-peer-deps
```

### Run Dev Server
```bash
npx next dev
```
Always use `npx next dev` (not `npm run dev`) to ensure the local Next.js 14 runs instead of any globally installed version.

Open [localhost:3000](http://localhost:3000).

### Important: React Version
This project uses **React 18**. Do not upgrade to React 19 — it will break React Three Fiber 8.x. If you see `ReactCurrentOwner` errors, a React version mismatch is the cause.

---

## Deployment

### Standard Deploy
```bash
npm run deploy
```
This runs `next build` → creates static files in `out/` → pushes to the `gh-pages` branch via the `gh-pages` npm package.

### What Happens
1. Next.js builds and exports static HTML/JS/CSS to `out/`
2. A `.nojekyll` file is created (tells GitHub Pages not to process with Jekyll)
3. The `CNAME` file in `public/` is included (preserves custom domain setting)
4. Everything in `out/` is force-pushed to the `gh-pages` branch
5. GitHub Pages automatically deploys from `gh-pages`

### Deploy Checklist
- [ ] `public/CNAME` contains `after-hours.app`
- [ ] `next.config.js` has `basePath: ''` and `assetPrefix: ''`
- [ ] No TypeScript errors (or `// @ts-nocheck` is at top of Globe.tsx)
- [ ] `npm run deploy` completes without errors

### Pushing Code vs Deploying
These are separate actions:
- `git push` → updates source code on the `main` branch (doesn't change the live site)
- `npm run deploy` → builds and pushes to `gh-pages` (updates the live site)

Always do both when making changes:
```bash
git add .
git commit -m "description"
git push
npm run deploy
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/components/Globe.tsx` | 3D globe, shaders, markers, arcs — the core visual |
| `src/data/journey.ts` | All travel data — edit this to add/change destinations |
| `src/app/page.tsx` | Main page layout, hero section, chapter sections, outro |
| `src/components/ChapterCard.tsx` | Individual chapter overlay cards |
| `src/hooks/useScrollProgress.ts` | Tracks scroll position, maps to active chapter |
| `src/styles/globals.css` | Global styles, glass card effect, scrollbar, animations |
| `next.config.js` | Build config, basePath, static export |
| `public/CNAME` | Custom domain for GitHub Pages |

---

## Editing Travel Data

All journey content lives in `src/data/journey.ts`. To add a new destination:

```typescript
{
  id: 18,
  title: "City Name",
  subtitle: "Neighborhoods · Highlights",
  dates: "Jan 28–30",
  coordinates: { lat: 40.7128, lng: -74.006 },
  photos: [],
  videos: [],
  highlights: ["Place 1", "Place 2"],
  description: "Optional description text.",
  // Optional:
  isPeak: true,           // Gold marker + peak badge
  peakLabel: "⛺ Label",  // Custom peak badge text
  stats: [{ label: "Elevation", value: "10,000 ft" }],
}
```

After editing, run locally to verify, then deploy.

---

## Domain & DNS

### Current Setup
- **Registrar**: Cloudflare
- **Domain**: after-hours.app
- **DNS**: Cloudflare (proxy OFF for all records)
- **SSL**: GitHub Pages automatic certificate

### DNS Records

| Type  | Name  | Content                    | Proxy |
|-------|-------|----------------------------|-------|
| A     | @     | 185.199.108.153            | Off   |
| A     | @     | 185.199.109.153            | Off   |
| A     | @     | 185.199.110.153            | Off   |
| A     | @     | 185.199.111.153            | Off   |
| CNAME | www   | husaintalawala.github.io   | Off   |

### If the Domain Stops Working
1. Check DNS records haven't changed on Cloudflare
2. Check GitHub Pages settings still show `after-hours.app` as custom domain
3. Check `public/CNAME` still contains `after-hours.app` (deploys can overwrite this)
4. Check "Enforce HTTPS" is still enabled in GitHub Pages settings
5. SSL certificates auto-renew — if HTTPS breaks, wait 30 min or re-save the custom domain in GitHub settings

---

## SSH & Git Authentication

### Current Setup
- SSH key: `~/.ssh/gh_afterhours` (no passphrase)
- SSH config (`~/.ssh/config`):
  ```
  Host github.com
    IdentityFile ~/.ssh/gh_afterhours
    IdentitiesOnly yes
  ```

### If Push Fails
```bash
# Test SSH connection
ssh -T git@github.com

# If permission denied, check the key is loaded
ssh-add ~/.ssh/gh_afterhours

# Verify remote URL is SSH (not HTTPS)
git remote -v
# Should show: git@github.com:husaintalawala/after-hours.git
```

---

## Troubleshooting

### "Initializing..." on deployed site
JS bundles aren't loading. Check:
- `next.config.js` basePath matches the URL path (empty string for root domain)
- Run `npm run deploy` to rebuild
- Hard refresh with Cmd + Shift + R

### "ReactCurrentOwner" error
React version mismatch. Fix:
```bash
rm -rf node_modules .next package-lock.json
npm install --legacy-peer-deps
npx next dev
```

### TypeScript "geometry" error on `<line>`
Three.js `<line>` conflicts with SVG `<line>`. Ensure `// @ts-nocheck` is at the top of `Globe.tsx`.

### Globe renders black / no continents
The procedural shader generates landmasses with simplex noise. If the globe is solid black:
- Check browser WebGL support (chrome://gpu)
- Check console for shader compilation errors
- The shaders require WebGL 2.0

### Deploy says "published" but site doesn't update
- GitHub Pages can take 1-2 minutes to propagate
- Hard refresh: Cmd + Shift + R
- Check the `gh-pages` branch on GitHub to confirm new files are there
- Check GitHub repo → Settings → Pages → ensure source is `gh-pages`

### iCloud offloading project files
If files in `~/Documents` show cloud icons in Finder, macOS has offloaded them to iCloud. The dev server can't read them. Force download:
```bash
brctl download ~/Documents/after-hours/path/to/file
```
Or click the file in Finder to trigger download.

---

## Version Pinning

These versions are known to work together. Don't upgrade without testing:

| Package | Version | Notes |
|---------|---------|-------|
| next | 14.1.0 | Do not upgrade to 15+ (React 19 conflict) |
| react | 18.2.x | Do not upgrade to 19 |
| react-dom | 18.2.x | Must match react |
| @react-three/fiber | 8.17.10 | Last version supporting React 18 |
| @react-three/drei | 9.117.3 | Must match fiber version |
| three | 0.170.0 | Stable with fiber 8.x |
| gh-pages | 6.3.0 | Deploy tool |

### If You Want to Upgrade to React 19 Eventually
You would need:
- `next@15+`
- `react@19` + `react-dom@19`
- `@react-three/fiber@9+`
- `@react-three/drei@10+`
- Test everything — shader materials and line geometries may need updates

---

## Adding Future Projects

This repo is called `after-hours` and can host multiple projects. To add a new project:

1. Create a new route in `src/app/` (e.g., `src/app/project-name/page.tsx`)
2. Or create a separate branch/subdirectory
3. Update the README to list the new project
4. Deploy as usual with `npm run deploy`
