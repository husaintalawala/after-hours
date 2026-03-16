# Building a 3D Globe Travel Portfolio

*A Technical Guide to after-hours.app*

Interactive scrollytelling with Next.js, Three.js, Cloudflare R2, and GitHub Pages.

**Live site:** [after-hours.app](https://after-hours.app)

---

## What You're Building

A full-screen 3D globe website that showcases a multi-country travel journey. As users scroll, the globe rotates to each destination, chapter cards appear with photos/videos loaded dynamically from a CDN, and an interactive timeline tracks progress. Think Apple product page meets travel journal.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14 (static export) | React + SSG for GitHub Pages |
| 3D Globe | Three.js + React Three Fiber | WebGL globe with NASA textures |
| Styling | Tailwind CSS | Apple-inspired dark UI |
| Media CDN | Cloudflare R2 | S3-compatible, zero egress fees |
| Media API | Cloudflare Workers | Serverless API to list R2 contents |
| Hosting | GitHub Pages | Free, custom domain support |
| Fonts | Google Fonts | Playfair Display, IBM Plex Mono, Inter |

## Prerequisites

```bash
# Node.js (use nvm for version management)
brew install nvm
nvm install 25
nvm alias default 25

# Video processing
brew install ffmpeg

# Verify
node --version    # v25.x
ffmpeg -version   # should print version info
git --version     # should print version info
```

You also need a free [Cloudflare account](https://dash.cloudflare.com) and a [GitHub account](https://github.com).

---

## Step 1: Initialize the Project

```bash
# Create Next.js app with TypeScript and Tailwind
npx create-next-app@latest after-hours --typescript --tailwind --app --src-dir
cd after-hours

# Install 3D rendering dependencies
npm install three @types/three @react-three/fiber @react-three/drei
# three              — Core WebGL 3D library
# @react-three/fiber — React bindings for Three.js (write 3D as JSX)
# @react-three/drei  — Helper components (orbit controls, loaders)

# Install deployment tool
npm install --save-dev gh-pages
# gh-pages — Pushes static files to a gh-pages branch on GitHub
```

## Step 2: Configure for Static Export

Next.js needs to output static HTML instead of running a server.

```js
// next.config.js
const nextConfig = {
  output: 'export',              // Generate static HTML files
  images: { unoptimized: true }, // No image optimization server needed
  basePath: '',                  // Root path (custom domain)
  assetPrefix: '',               // Same
  staticPageGenerationTimeout: 300,
  productionBrowserSourceMaps: true, // Helps debug production errors
}
module.exports = nextConfig
```

Add deploy scripts to `package.json`:

```json
"scripts": {
  "build": "next build",
  "export": "next build && touch out/.nojekyll",
  "deploy": "npm run export && gh-pages -d out --dotfiles"
}
```

> **Why `.nojekyll`?** GitHub Pages uses Jekyll by default, which ignores folders starting with `_`. Your built files live in `_next/`, so without `.nojekyll`, they won't be served.

## Step 3: Create the Journey Data File

`src/data/journey.ts` is the single source of truth for all travel data. Define TypeScript interfaces, then export chapters with coordinates, dates, descriptions, and media references.

```ts
// src/data/journey.ts
export const MEDIA_BASE = 'https://media.your-domain.app'

export type TagCategory = 'food' | 'culture' | 'nature' | 'adventure' | 'transit' | 'rest' | 'peak' | 'family'

export interface DayEntry {
  day: number
  date: string
  highlight?: string
  summary?: string
  tags: TagCategory[]
}

export interface Chapter {
  id: string
  title: string
  subtitle: string
  coordinates: { lat: number; lng: number }
  dates: string
  description?: string
  photos: string[]                              // R2 paths: 'london/bridge.jpg'
  videos: { src: string; caption?: string }[]   // R2 paths: 'london/timelapse.mp4'
  days: DayEntry[]
  highlights: string[]
  stats?: { value: string; label: string }[]
  isPeak?: boolean
  peakLabel?: string
}

export const journey = {
  title: 'Side Quest',
  subtitle: "'25–26",
  dateRange: 'October 31, 2025 — January 27, 2026',
  stats: [
    { value: '89', label: 'Days' },
    { value: '10', label: 'Countries' },
    { value: '40,000+', label: 'Miles' },
  ],
  chapters: [
    // Your chapters here...
  ] as Chapter[],
}
```

## Step 4: Build the 3D Globe Component

The globe uses NASA Blue Marble textures with a custom day/night GLSL shader.

**Critical rules:**

1. **Host textures locally** — Put in `public/textures/`. CDN textures fail with CORS errors in `useLoader(TextureLoader, url)`.

2. **Always use dynamic import with `ssr: false`** — WebGL doesn't exist during server-side rendering:

```tsx
// src/app/page.tsx
import dynamic from 'next/dynamic'

const Globe = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="animate-pulse">loading</div>
    </div>
  ),
})
```

3. **Canvas `alpha: false`** — Setting `alpha: true` with additive blending shows the page background through the globe (white x-ray effect). Use `alpha: false` with an explicit dark background color.

## Step 5: Set Up Cloudflare R2 for Media

R2 is S3-compatible object storage with **zero egress fees** — perfect for serving photos and videos.

### 5a. Create R2 Bucket

Cloudflare dashboard → R2 Object Storage → Create Bucket (e.g., `after-hours-media`). Under Settings, enable a custom domain like `media.after-hours.app`.

### 5b. Set CORS Policy

Bucket Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": ["https://after-hours.app", "http://localhost:*"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"]
  }
]
```

### 5c. Create a Worker API

A Cloudflare Worker lists bucket contents so your Filmstrip component can dynamically discover all photos/videos without hardcoding filenames.

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
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300',
        },
      })
    }

    return new Response('Not found', { status: 404 })
  },
}
```

Deploy: `wrangler deploy`

### 5d. Organize R2 Folders

Create one folder per chapter, matching your journey data:

| Chapter | R2 Folder |
|---------|-----------|
| London | `london/` |
| Kathmandu | `kathmandu/` |
| Everest Base Camp | `everest-base-camp/` |
| Tokyo | `tokyo/` |
| Bali | `bali/` |
| Spain | `spain/` |
| Positano | `positano/` |
| Roma | `roma/` |

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
| `-vf "scale=720:-2"` | Scale to 720p height, auto-calculate width |
| `-c:v libx264` | H.264 codec (universal browser support) |
| `-crf 28` | Quality level (lower = better quality, 28 is good balance) |
| `-c:a aac -b:a 128k` | Keep audio track. **IMPORTANT:** `-an` strips audio entirely |
| `-movflags +faststart` | Move metadata to front so video plays before fully downloaded |

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

## Step 7: Build the Filmstrip Gallery (Avoiding Hydration Errors)

The Filmstrip is a horizontal-scrolling photo/video gallery with focus zoom. This component caused the most bugs due to **React hydration mismatches**.

### The Hydration Problem

Next.js pre-renders HTML at build time (server). When the browser loads, React "hydrates" — it attaches event listeners to the existing HTML. If the client renders **anything different** from the server HTML, React crashes with **Error #310: "Target container is not a DOM element."**

### The Fix: Client-Only Rendering

```tsx
export default function Filmstrip({ photos, videos, chapterTitle }) {
  // 1. Start with EMPTY state (server renders nothing)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])

  // 2. Return null during SSR (no HTML = no mismatch)
  if (mediaItems.length === 0) return null

  // 3. Populate ONLY in useEffect (runs on client only)
  useEffect(() => {
    // Set static media immediately
    const staticMedia = [
      ...photos.map(src => ({ src: `${MEDIA_BASE}/${src}`, type: 'photo' })),
      ...videos.map(v => ({ src: `${MEDIA_BASE}/${v.src}`, type: 'video' })),
    ]
    setMediaItems(staticMedia)

    // Then fetch dynamic media from R2 API
    const folder = chapterTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    fetch(`${API_BASE}/api/media?prefix=${folder}/`)
      .then(r => r.json())
      .then(data => {
        if (data.files?.length > 0) {
          setMediaItems(data.files.map(f => ({
            src: `${MEDIA_BASE}/${f.key}`,
            type: f.type,
          })))
        }
      })
      .catch(() => {}) // Fail silently, static media still works
  }, [chapterTitle])

  return <div>{/* Gallery UI */}</div>
}
```

### Things That BREAK Hydration

| Pattern | Why it breaks |
|---------|--------------|
| `typeof window !== 'undefined'` | Server = `false`, client = `true` → different render |
| `let x = false` at module level + `useState(x)` | Module-level var can change between SSR and hydration |
| `new Date()` in render | Server time ≠ client time |
| `Math.random()` in render | Different values on server vs client |
| `window.innerWidth` in render | Doesn't exist on server |

**Rule of thumb:** If it touches browser APIs, put it in `useEffect`.

## Step 8: Deploy to GitHub Pages

```bash
# Full deploy command sequence:
rm -rf .next out                                    # Clean previous build
NODE_OPTIONS="--max-old-space-size=4096" npx next build  # Build static files
touch out/.nojekyll                                 # Tell GitHub to serve _next/
cp public/CNAME out/CNAME                           # Custom domain file
npx gh-pages -d out --dotfiles --no-history         # Push to gh-pages branch
```

**What each command does:**

| Command | Purpose |
|---------|---------|
| `rm -rf .next out` | Clears cached builds. Stale cache causes mysterious errors. |
| `NODE_OPTIONS="--max-old-space-size=4096"` | Increases memory for builds with large 3D textures. |
| `touch out/.nojekyll` | Without this, GitHub's Jekyll processor ignores `_next/` folders. |
| `--dotfiles` | Includes `.nojekyll` (hidden file) in the push. |
| `--no-history` | Replaces gh-pages branch entirely. Avoids merge conflicts. |

### GitHub Setup

1. In repo **Settings → Pages**, set Source to "Deploy from a branch", Branch to `gh-pages` / `(root)`.
2. Create a [Personal Access Token](https://github.com/settings/tokens) (fine-grained) with **Contents: Read and write** permission.
3. Set the remote URL:

```bash
git remote set-url origin https://USERNAME:TOKEN@github.com/USERNAME/REPO.git
```

## Step 9: Custom Domain with Cloudflare

1. In Cloudflare DNS, add a CNAME record: `after-hours.app → husaintalawala.github.io`
2. Create `public/CNAME` containing just: `after-hours.app`
3. In GitHub Pages settings, enter your custom domain and check "Enforce HTTPS"

---

## Key Lessons Learned

### React Hydration (Error #310)

The #1 source of bugs. Static export pre-renders HTML at build time. If the client renders anything different, React crashes. **Fix:** Components with dynamic data should start with empty state, return `null` during SSR, and populate via `useEffect`.

### Node.js Version Matters

Node 25 (bleeding edge) causes module resolution errors with Next.js 14. `next dev` doesn't work on Node 25, but `next build` does. Use nvm:

```bash
brew install nvm

# Add to ~/.zshrc:
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"

nvm install 20          # Stable LTS (for next dev)
nvm install 25          # Latest (for next build)
nvm alias default 20    # Safe default
```

### Git Safety

Tag working versions before risky changes. Add `out/` to `.gitignore`.

```bash
git tag v1-working              # Before risky changes
git checkout v1-working         # Revert if broken

echo 'out/' >> .gitignore       # Don't commit build output

# If git corrupts (common with macOS):
cd ~/Documents
mv after-hours after-hours-backup
git clone https://github.com/USER/REPO.git
cp -r after-hours-backup/src after-hours/src
```

### Webpack Cache Corruption

If builds fail with cryptic errors, clear the cache:

```bash
rm -rf .next out node_modules/.cache
```

### Texture Loading

`useLoader(TextureLoader, url)` fails with CORS on cross-origin CDN textures. **Fix:** Host textures in `public/textures/` for same-origin loading. Compress NASA Blue Marble originals to under 500KB.

### Video Autoplay Policy

Browsers block autoplay with sound. Videos start muted. After the user interacts (taps any video), you can programmatically unmute the focused video via DOM refs.

---

## Project Structure

```
after-hours/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main page: Globe + scroll chapters
│   │   └── layout.tsx            # Root layout, fonts, metadata
│   ├── components/
│   │   ├── Globe.tsx             # 3D earth with day/night shader
│   │   ├── ChapterCard.tsx       # Chapter content card + itinerary
│   │   ├── Filmstrip.tsx         # Dynamic photo/video gallery
│   │   └── TimelineScrubber.tsx  # Bottom navigation timeline
│   ├── data/
│   │   └── journey.ts            # All chapter data (single source of truth)
│   ├── hooks/
│   │   └── useScrollProgress.ts  # Scroll position tracking
│   └── styles/
│       └── globals.css           # Tailwind config + custom styles
├── public/
│   ├── textures/                 # NASA globe textures (same-origin)
│   ├── favicon.svg
│   └── CNAME                     # Custom domain
├── next.config.js
├── tailwind.config.ts
└── package.json
```

---

## Quick Reference

```bash
# ── Build & Deploy ──
rm -rf .next out
NODE_OPTIONS="--max-old-space-size=4096" npx next build
touch out/.nojekyll && cp public/CNAME out/CNAME
npx gh-pages -d out --dotfiles --no-history

# ── Optimize Media ──
~/Desktop/optimize.sh london bali positano     # Specific folders
~/Desktop/optimize.sh                           # All folders

# ── Upload to R2 ──
wrangler r2 object put "bucket/folder/file.jpg" --file file.jpg

# ── Version Control ──
git tag v1-working              # Tag before changes
git checkout v1-working         # Revert to tag
git stash                       # Temporarily shelve changes

# ── Fix Corrupted Builds ──
rm -rf node_modules .next out
npm install --legacy-peer-deps

# ── Switch Node Versions ──
nvm use 20    # Stable (next dev)
nvm use 25    # Latest (next build)
```

---

*Built with Claude · March 2026*
