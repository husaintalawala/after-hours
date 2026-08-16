# Building a 3D Globe Travel Portfolio

*A Technical Guide to after-hours.app*

Interactive scrollytelling with Next.js, Three.js, Cloudflare R2, and Vercel.

**Live site:** [after-hours.app](https://after-hours.app)

> **Scope.** This guide covers the globe site only — `src/app/page.tsx`, `src/components/Globe.tsx`, `src/data/journey.ts`, and the media pipeline behind them. The same repo also hosts the Drift logged-in web app (`src/app/app/`, `src/app/auth/`, served on `drift.after-hours.app`), which is a different product with its own auth, database, and routes. That half is documented in [TECHNICAL.md](./TECHNICAL.md); the split is done by hostname in `src/middleware.ts`.

---

## What You're Building

A full-screen 3D globe website that showcases a multi-country travel journey. As users scroll, the globe rotates to each destination, chapter cards appear with photos/videos loaded dynamically from a CDN, and an interactive timeline tracks progress. Think Apple product page meets travel journal.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 16, App Router | React + RSC; runs on a server runtime, not a static export |
| UI runtime | React 19 | Required by React Three Fiber 9 |
| 3D Globe | Three.js 0.170 + React Three Fiber 9 + Drei 10 | WebGL globe with NASA textures |
| Styling | Tailwind CSS 3.4 | Apple-inspired dark UI |
| Media CDN | Cloudflare R2 | S3-compatible, zero egress fees |
| Media API | Cloudflare Workers | Serverless API to list R2 contents |
| Hosting | Vercel | Builds `main` as production |
| DNS | Cloudflare | `after-hours.app`, `drift.after-hours.app` |
| Fonts | Google Fonts | Playfair Display, IBM Plex Mono, Inter |

## Prerequisites

```bash
# Node.js — Next 16 requires >= 20.9.0; this repo is developed on v22
node --version    # v22.x here

# Video processing
brew install ffmpeg

# Cloudflare CLI — every `wrangler` command in Steps 5c and 6 needs it,
# and it is not installed by this repo (not a dependency, not global here)
npm install -g wrangler

# Verify
ffmpeg -version   # should print version info
git --version     # should print version info
wrangler --version
```

You also need a free [Cloudflare account](https://dash.cloudflare.com) (R2 + Workers + DNS) and a [Vercel account](https://vercel.com) for hosting.

---

## Step 1: Initialize the Project

```bash
# Create Next.js app with TypeScript and Tailwind
npx create-next-app@latest after-hours --typescript --tailwind --app --src-dir
cd after-hours

# Install 3D rendering dependencies (versions this repo runs)
npm install three@^0.170.0 @react-three/fiber@^9.7.0 @react-three/drei@^10.7.8
npm install --save-dev @types/three@^0.160.0
# three              — Core WebGL 3D library
# @react-three/fiber — React bindings for Three.js (write 3D as JSX)
# @react-three/drei  — Helper components (orbit controls, loaders)
```

`create-next-app@latest` now scaffolds Tailwind v4. This repo runs `tailwindcss@^3.4.0` with a `tailwind.config.ts` and a `postcss.config.js` that v4 does not use, so pin Tailwind 3.4 if you want the setup the rest of this guide describes.

React Three Fiber 9 peer-depends on `react >=19 <19.3`, and Drei 10 on `@react-three/fiber ^9`. Those three move together — bumping one without the others is how you get `ReactCurrentOwner` errors.

## Step 2: Configure Next.js

**There is no static export.** The app ships response headers, `next/image` remote patterns, route handlers, and middleware — all of which need a server runtime. `next.config.js` has no `output`, no `basePath`, and no `assetPrefix`:

```js
// next.config.js — the parts that matter for the globe
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.mapbox.com" },
      { protocol: "https", hostname: "d309w7wk5bnk1z.cloudfront.net" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: [/* HSTS, nosniff, frame-ancestors, … */] }]
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}
module.exports = nextConfig
```

> **`ignoreBuildErrors` is a trap.** The build will not fail on a type error, so run `npx tsc --noEmit` yourself before pushing. `Globe.tsx` opts out entirely with `// @ts-nocheck` on line 1 — the R3F JSX elements (`<mesh>`, `<sphereGeometry>`) fight the type checker more than they help.

Scripts in `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "deploy": "vercel --prod",
  "lint": "next lint"
}
```

Two of those are dead on this tree. `next lint` was removed in Next 16 (this repo runs 16.3.1 — `npx next lint --help` lists no `lint` command), so `npm run lint` errors out. And `deploy` needs a Vercel CLI that is not installed here — see Step 8.

## Step 3: Create the Journey Data File

`src/data/journey.ts` is the single source of truth for all travel data. Define TypeScript interfaces, then export chapters with coordinates, dates, descriptions, and media references.

```ts
// src/data/journey.ts
export const MEDIA_BASE = 'https://media.after-hours.app'

export type TagCategory = 'food' | 'culture' | 'nature' | 'adventure' | 'transit' | 'rest' | 'peak' | 'family'

export interface DayEntry {
  day: number
  date: string
  summary: string
  tags: TagCategory[]
  transit?: Transit
  elevation?: number
  highlight?: string
  places?: Place[]
}

export interface Chapter {
  id: number
  title: string
  subtitle: string
  dates: string
  coordinates: { lat: number; lng: number }
  color?: string
  photos: string[]                              // R2 paths: 'london/bridge.jpg'
  videos: { src: string; start?: number; end?: number; caption?: string }[]   // R2 paths: 'london/timelapse.mp4'
  highlights: string[]
  description?: string
  stats?: { label: string; value: string }[]
  isPeak?: boolean
  peakLabel?: string
  days?: DayEntry[]
}

export const journey: JourneyConfig = {
  title: "SIDE QUEST",
  subtitle: "'25–26",
  dateRange: "October 31, 2025 — January 27, 2026",
  stats: [
    { label: "Days", value: "89" },
    { label: "Countries", value: "10" },
    { label: "Miles", value: "40K+" },
    { label: "Highest", value: "17,598 ft" },
  ],
  chapters: [
    // 20 chapters: New York, London, Kathmandu, Everest Base Camp, …
  ],
}

// Origin point (New York) — the globe draws its first arc from here.
export const origin = { lat: 40.7128, lng: -74.006 }
```

In practice every `photos: []` array is empty — the Filmstrip discovers photos at runtime from the Worker (Step 5c). A few chapters still list `videos` by hand, but that list is a fallback, not a supplement: when the Worker returns any files the Filmstrip replaces the whole array with them (`if (items.length > 0) setMediaItems(items)`) and re-derives captions from the R2 key. The hand-written captions only ever render for a chapter whose R2 folder comes back empty.

## Step 4: Build the 3D Globe Component

The globe uses NASA Blue Marble textures with a custom day/night GLSL shader, plus an atmosphere shell, quadratic-Bezier route arcs, and pulsing city markers.

**Critical rules:**

1. **Host textures locally** — put them in `public/textures/`. CDN textures fail with CORS errors in `useLoader(TextureLoader, url)`. Ours are `earth-day.jpg` (452 KB) and `earth-night.jpg` (249 KB); compress the NASA originals to that range or first paint takes seconds.

2. **Always use dynamic import with `ssr: false`** — WebGL doesn't exist during server-side rendering:

```tsx
// src/app/page.tsx
import dynamic from 'next/dynamic'

const Globe = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="text-[#86868b] font-mono text-sm tracking-wider animate-pulse">loading</div>
    </div>
  ),
})
```

3. **Canvas `alpha: false`** — setting `alpha: true` with additive blending shows the page background through the globe (white x-ray effect). Use `alpha: false`, an explicit dark clear color, and a `<color attach="background">` inside the Canvas:

```tsx
<Canvas camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]} style={{ background: '#0a0a0f' }}>
  <color attach="background" args={['#0a0a0f']} />
  <Suspense fallback={<GlobeLoader />}>…</Suspense>
</Canvas>
```

4. **The canvas is fixed, the content scrolls over it.** One CSS rule does it — `.globe-canvas { position: fixed !important; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1; }` in `src/styles/globals.css` — and every chapter section sits in a `z-10` stack above it.

5. **Cap `dpr`.** `dpr={[1, 1.5]}` keeps a 3× retina phone from rendering nine times the pixels for a sphere nobody inspects that closely.

## Step 5: Set Up Cloudflare R2 for Media

R2 is S3-compatible object storage with **zero egress fees** — perfect for serving photos and videos.

### 5a. Create R2 Bucket

Cloudflare dashboard → R2 Object Storage → Create Bucket (e.g., `after-hours-media`). Under Settings, enable a custom domain like `media.after-hours.app`. That hostname becomes `MEDIA_BASE` in `journey.ts`.

### 5b. Set CORS Policy

Bucket Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": ["https://after-hours.app", "http://localhost:3000"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"]
  }
]
```

Each entry has to be a concrete `scheme://host[:port]` origin — a wildcard port like `http://localhost:*` is not a supported form, so list each dev port you actually use. Nothing in this repo pins the bucket's policy; it lives in the Cloudflare dashboard only.

### 5c. Create a Worker API

A Cloudflare Worker lists bucket contents so your Filmstrip component can dynamically discover all photos/videos without hardcoding filenames. Ours is deployed at `https://after-hours-api.after-hours-media.workers.dev` (see `src/components/Filmstrip.tsx`).

**The Worker's source is not in this repo** — there is no worker directory and no `wrangler.toml`/`wrangler.jsonc` anywhere in it, so nothing here can be deployed with `wrangler deploy`. The block below is a sketch of the endpoint's shape, not the deployed code — the live Worker answers with `access-control-allow-origin: https://after-hours.app` plus `access-control-allow-headers` and `access-control-allow-methods`, so treat its exact headers as something to check against the running service rather than read off this page.

```js
// worker: src/index.js
// Endpoint: GET /api/media?prefix=london/
// Returns: { files: [{ key: "london/bridge.jpg", size: 352333, type: "photo" }] }

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/media') {
      const prefix = url.searchParams.get('prefix') || ''
      const listed = await env.BUCKET.list({ prefix, limit: 200 })
      const files = listed.objects.map(obj => ({
        key: obj.key,
        size: obj.size,
        type: obj.key.match(/\.(mp4|mov)$/i) ? 'video' : 'photo',
      }))
      return new Response(JSON.stringify({ files }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://after-hours.app',
          'Cache-Control': 'public, max-age=300',
        },
      })
    }

    return new Response('Not found', { status: 404 })
  },
}
```

Deploy it from wherever its source lives: `wrangler deploy`

### 5d. Organize R2 Folders

There is no folder table to maintain — the Filmstrip **derives** the prefix from the chapter title:

```ts
chapterTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
```

| Chapter title | R2 folder |
|---------------|-----------|
| London | `london/` |
| Everest Base Camp | `everest-base-camp/` |
| Kyoto + Kanazawa | `kyoto-kanazawa/` |
| Bangkok · Phuket | `bangkok-phuket/` |
| Mumbai II | `mumbai-ii/` |

Rename a chapter and its gallery silently empties. That coupling is the price of never hardcoding filenames.

## Step 6: Optimize and Upload Media

Raw phone photos are 5–15MB. Videos can be 100MB+. Always optimize before uploading.

### The Optimization Script

```bash
#!/bin/bash
# ~/Desktop/optimize.sh
# Usage: ./optimize.sh london bali positano    (specific folders)
#    or: ./optimize.sh                          (all folders)

SRC=~/Desktop/"Sabbatical Pics"
OUT=~/Desktop/"ready-to-upload"

if [ $# -gt 0 ]; then
  FOLDERS=("$@")
else
  FOLDERS=()
  for f in "$SRC"/*/; do FOLDERS+=("$(basename "$f")"); done
fi

for name in "${FOLDERS[@]}"; do
  folder="$SRC/$name"
  [ -d "$folder" ] || { echo "Not found: $name"; continue; }
  mkdir -p "$OUT/$name"
  echo "=== Processing: $name ==="

  # Optimize photos
  for img in "$folder"/*.{jpg,jpeg,png,heic,JPG,JPEG,PNG,HEIC}; do
    [ -f "$img" ] || continue
    base=$(echo "$(basename "${img%.*}")" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')
    out="$OUT/$name/${base}.jpg"
    if [ -f "$out" ]; then echo "  skip: $base.jpg"; continue; fi
    echo "  photo: $base.jpg"
    sips -s format jpeg -Z 1200 "$img" --out "$out" 2>/dev/null
  done

  # Optimize videos
  for vid in "$folder"/*.{mov,mp4,MOV,MP4}; do
    [ -f "$vid" ] || continue
    base=$(echo "$(basename "${vid%.*}")" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')
    out="$OUT/$name/${base}.mp4"
    if [ -f "$out" ]; then echo "  skip: $base.mp4"; continue; fi
    echo "  video: $base.mp4"
    ffmpeg -i "$vid" -t 8 -vf "scale=720:-2" -c:v libx264 -crf 28 \
      -c:a aac -b:a 128k -movflags +faststart -y "$out" 2>/dev/null
  done
done
echo "=== Done! ==="
```

**ffmpeg flags explained:**

| Flag | What it does |
|------|-------------|
| `-t 8` | Limit to 8 seconds (fast load times) |
| `-vf "scale=720:-2"` | Scale to 720px **wide**, auto-calculate height (`scale` takes `width:height`; `-2` rounds to an even number) |
| `-c:v libx264` | H.264 codec (universal browser support) |
| `-crf 28` | Quality level (lower = better quality, 28 is good balance) |
| `-c:a aac -b:a 128k` | Keep audio track. **IMPORTANT:** `-an` strips audio entirely |
| `-movflags +faststart` | Move metadata to front so video plays before fully downloaded |

The filename becomes the caption for Worker-discovered videos (underscores and dashes turn into spaces), so name files like `wimbledon_husain_reaction.mp4`, not `IMG_4417.mp4`. The extension survives into the caption: the strip in `Filmstrip.tsx` is written `/\\.[^.]+$/`, which matches a literal backslash rather than a dot, so that file renders as "wimbledon husain reaction.mp4".

### Upload to R2

Via Cloudflare dashboard (drag and drop) or CLI:

```bash
# Single file
wrangler r2 object put "after-hours-media/london/bridge.jpg" --file ready-to-upload/london/bridge.jpg

# Bulk upload all folders
for folder in ~/Desktop/ready-to-upload/*/; do
  name=$(basename "$folder")
  for f in "$folder"*; do
    [ -f "$f" ] || continue
    wrangler r2 object put "after-hours-media/$name/$(basename "$f")" --file "$f"
  done
  echo "Uploaded: $name"
done
```

## Step 7: Build the Filmstrip Gallery (Avoiding Render Mismatches)

The Filmstrip is a horizontal-scrolling photo/video gallery with focus zoom. This component caused the most bugs.

### The Problem

Next.js pre-renders HTML on the server. When the browser loads, React "hydrates" — it attaches event listeners to the existing HTML. If the client's first render differs from the server HTML, React blows up during hydration and you lose the whole subtree.

`ChapterCard` takes the blunt way out — it imports the gallery client-side only:

```tsx
// src/components/ChapterCard.tsx
const Filmstrip = dynamic(() => import("./Filmstrip"), { ssr: false })
```

### The Fix: Empty State, Then `useEffect`

```tsx
export default function Filmstrip({ photos, videos, chapterTitle }) {
  // 1. Start with EMPTY state — nothing to mismatch
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])

  // 2. Populate ONLY in useEffect (runs on the client)
  useEffect(() => {
    const staticMedia = [
      ...photos.map(src => ({ src: `${MEDIA_BASE}/${src}`, type: 'photo' })),
      ...videos.map(v => ({ src: `${MEDIA_BASE}/${v.src}`, type: 'video', caption: v.caption })),
    ]
    setMediaItems(staticMedia)

    // Then fetch dynamic media from the R2 Worker
    const folder = chapterTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    fetch(`${API_BASE}/api/media?prefix=${encodeURIComponent(folder)}/`)
      .then(r => r.json())
      .then(data => {
        if (data.files?.length > 0) {
          const items = data.files
            .filter(f => f.size > 0)          // R2 lists 0-byte folder markers
            .map(f => ({ src: `${MEDIA_BASE}/${f.key}`, type: f.type }))
          if (items.length > 0) setMediaItems(items)
        }
      })
      .catch(() => {}) // Fail silently, static media still works
  }, [chapterTitle, photos, videos])

  // 3. Bail out AFTER every hook has run — see below
  if (mediaItems.length === 0) return null

  return <div>{/* Gallery UI */}</div>
}
```

> **Put the early `return null` below the last hook.** An empty-state guard placed above `useEffect` skips a hook on the first render and adds it on the second — which is exactly React's minified **Error #310, "Rendered more hooks than during the previous render."** In `Filmstrip.tsx` the guard sits at line 102, below every hook call in the component.

### Things That BREAK Hydration

| Pattern | Why it breaks |
|---------|--------------|
| `typeof window !== 'undefined'` | Server = `false`, client = `true` → different render |
| `let x = false` at module level + `useState(x)` | Module-level var can change between SSR and hydration |
| `new Date()` in render | Server time ≠ client time |
| `Math.random()` in render | Different values on server vs client |
| `window.innerWidth` in render | Doesn't exist on server |

**Rule of thumb:** If it touches browser APIs, put it in `useEffect` — or import the component with `ssr: false`.

## Step 8: Deploy to Vercel

The site is a Vercel project. **Pushing to `main` is the deploy.**

```bash
git push origin main    # Vercel builds and promotes to production
```

Any other branch gets a preview deployment at its own URL. There is no working manual escape hatch: `package.json` carries `"deploy": "vercel --prod"`, but the Vercel CLI is not installed on this machine and the repo has no `.vercel/` link directory, so `npm run deploy` fails before it ships anything. Git push is the deploy path.

Before pushing, since `next.config.js` silences type and lint errors during the build:

```bash
npx tsc --noEmit        # the build will NOT catch these for you
npm run build           # catches everything else locally
```

There is no `vercel.json` and no GitHub Actions workflow in this repo — build settings, environment variables, and the production branch all live in the Vercel dashboard.

> **gh-pages is retired.** The site used to be a static export force-pushed to a `gh-pages` branch. Leftovers from that era are still lying around and mean nothing now: the `gh-pages` devDependency in `package.json`, `public/CNAME`, `out/` in `.gitignore`, and the `origin/gh-pages` branch itself. The deploy section of `DEVLOG.md` still describes that setup — read it as history, not instructions. `TECHNICAL.md` documents the current Vercel flow and carries its own note on the retirement.

## Step 9: Custom Domain

1. In the Vercel project, Settings → Domains, add `after-hours.app`.
2. In Cloudflare DNS, create the records Vercel gives you for the apex and `www`.
3. Vercel provisions the TLS certificate once the records resolve.

`public/CNAME` is not part of this — it was GitHub Pages' mechanism and is inert on Vercel.

---

## Key Lessons Learned

### Hooks Before Guards (React Error #310)

The #1 source of bugs in this codebase. React's minified **#310** is *"Rendered more hooks than during the previous render"* — a hook-order error, not a hydration error, and it's what you get from an early `return null` that sits above a `useEffect`. Components with dynamic data should start with empty state, populate via `useEffect`, and bail out only after every hook has been called.

### Node and React Versions Are Pinned By Dependencies

- **Node** — Next 16 declares `engines: { node: ">=20.9.0" }`. This repo develops on v22.
- **React** — React Three Fiber 9 peer-depends on `react >=19 <19.3`; Drei 10 on `@react-three/fiber ^9`. Bump the trio together or not at all.

`npm install` resolves cleanly on this tree — `--legacy-peer-deps` is no longer needed.

### Git Safety

Tag working versions before risky changes.

```bash
git tag v1-working              # Before risky changes
git checkout v1-working         # Revert if broken
```

### Build Cache Corruption

If builds fail with cryptic errors, clear the cache:

```bash
rm -rf .next node_modules/.cache
```

### Texture Loading

`useLoader(TextureLoader, url)` fails with CORS on cross-origin CDN textures. **Fix:** host textures in `public/textures/` for same-origin loading. Compress NASA Blue Marble originals to under 500KB.

### Video Autoplay Policy

Browsers block autoplay with sound. Videos start muted, `playsInline`, and `loop`. After the user taps a video you can unmute it via a DOM ref — the Filmstrip tracks which indexes the user unmuted so the state survives scrolling.

---

## Project Structure

```
after-hours/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Globe + scroll chapters (the globe site)
│   │   ├── layout.tsx            # Root layout, fonts, metadata, analytics
│   │   ├── app/  auth/  trip/    # Drift web app — see TECHNICAL.md
│   │   └── api/                  # Route handlers (Drift)
│   ├── components/
│   │   ├── Globe.tsx             # 3D earth, shaders, arcs, markers
│   │   ├── ChapterCard.tsx       # Chapter content card + itinerary
│   │   ├── CityReveal.tsx        # Full-bleed city title interstitial
│   │   ├── Filmstrip.tsx         # Dynamic photo/video gallery
│   │   ├── TimelineScrubber.tsx  # Bottom navigation timeline
│   │   ├── Handwrite.tsx         # Animated opening title
│   │   └── app/                  # Drift web app components
│   ├── data/
│   │   └── journey.ts            # All chapter data (single source of truth)
│   ├── hooks/
│   │   └── useScrollProgress.ts  # useScrollProgress + useActiveChapter
│   ├── lib/                      # Drift web app (supabase, drift, pdf)
│   ├── middleware.ts             # Hostname split: globe vs Drift
│   └── styles/
│       └── globals.css           # Global styles, .globe-canvas, glass cards
├── public/
│   ├── textures/                 # NASA globe textures (same-origin)
│   ├── drift/                    # Drift's static landing page
│   └── CNAME                     # Leftover from GitHub Pages — inert
├── next.config.js
├── tailwind.config.ts
└── package.json
```

---

## Quick Reference

```bash
# ── Develop ──
npm install
npm run dev                                     # localhost:3000

# ── Verify before shipping ──
npx tsc --noEmit                                # build ignores type errors
npm run build

# ── Deploy ──
git push origin main                            # Vercel builds production (the only deploy path)

# ── Optimize Media ──
~/Desktop/optimize.sh london bali positano      # Specific folders
~/Desktop/optimize.sh                           # All folders

# ── Upload to R2 ──
wrangler r2 object put "bucket/folder/file.jpg" --file file.jpg

# ── Version Control ──
git tag v1-working              # Tag before changes
git checkout v1-working         # Revert to tag
git stash                       # Temporarily shelve changes

# ── Fix Corrupted Builds ──
rm -rf node_modules .next node_modules/.cache
npm install
```

---

*Built with Claude · March 2026 · updated August 2026*
