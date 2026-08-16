# Technical Reference

Architecture, maintenance, deployment, and troubleshooting for after-hours.

Verified against `origin/main` @ `dd77f79`.

---

## What Lives in This Repo

One Next.js app (App Router) serves three things, split by hostname in `src/middleware.ts`:

| Surface | Host | Served from |
|---------|------|-------------|
| **Side Quest** — scroll-driven 3D globe travel portfolio | `after-hours.app` | `src/app/page.tsx` + `src/components/Globe.tsx` |
| **Drift marketing landing** — hand-written static HTML | `drift.after-hours.app` (all paths not carved out below) | `public/drift/` via middleware rewrite |
| **Drift web app** — logged-in product, Supabase-backed | `drift.after-hours.app/app`, `/auth`, `/trip` — the path carve-out is checked before the host, so these paths serve on every host | `src/app/app`, `src/app/auth`, `src/app/trip`, `src/app/api/drift` |

---

## Architecture Overview

```
Browser Request
    ↓
Cloudflare DNS (after-hours.app / drift.after-hours.app)
    ↓
Vercel (Next.js 16 server + edge)
    ↓
src/middleware.ts — host + path routing
    ├── /app, /auth, /trip  → updateSession() → React routes (all hosts)
    ├── host ≠ drift.*      → Side Quest globe (React + Three.js)
    └── host = drift.*      → rewrite to /public/drift/*.html (static)

/api/drift/* (server-only) → Supabase Edge Functions → Google / Viator /
                             Stay22 / Ticketmaster / Gemini / Plaid
```

The site is **not** a static export. `next.config.js` uses `headers()`, `images.remotePatterns`, and route handlers — all of which need a server runtime. There is no `output: 'export'` and no `basePath`.

### Middleware order (`src/middleware.ts`)

The handler runs top to bottom; the first match wins.

1. Path is `/app`, `/auth`, or `/trip` (exact or prefixed) → `updateSession(req)` (Supabase cookie refresh) and return. Runs on **every** host, including localhost. `/trip/[id]` is carved out here because it is the public share page — without the carve-out the marketing rewrite would turn it into `/drift/trip/<id>.html` and 404.
2. Path is `/drift-logo.png`, `/drift-icon.svg`, or `/favicon.svg` → `NextResponse.next()`. These are app brand assets at the root and must not be swallowed by the rewrite.
3. Host is not `drift.after-hours.app` → `NextResponse.next()` (Side Quest).
4. Otherwise rewrite into `public/drift/`: `/` → `/drift/index.html`, extensionless → `/drift/<path>.html`, anything else → `/drift/<path>`.

Matcher: `["/((?!_next/|api/|_vercel/).*)"]`. **API routes get no session refresh from middleware** — each handler revalidates for itself (see `src/lib/drift/server.ts`).

---

## Local Development

### Prerequisites
- Node.js 22 (`node -v` → v22.23.1 on this machine)
- npm
- Git with an SSH key registered on GitHub

### Setup
```bash
git clone git@github.com:husaintalawala/after-hours.git
cd after-hours
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). `npm install` resolves cleanly — `--legacy-peer-deps` is no longer needed (that was a React 18 / fiber 8 workaround).

`.claude/launch.json` defines the same server as `drift-web` (`npm run dev`, port 3000).

### Local verification before pushing

`next.config.js` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`, so **a broken type never fails the Vercel build**. Check locally:

```bash
npx tsc --noEmit
npm run build
```

Note that `npm run build` clobbers `.next/`, which kills a `next dev` server running in the same directory — restart dev afterwards.

### Environment (`.env.local`, git-ignored)

| Variable | Used by |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server Supabase clients, `getDriftUpstream()` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same |
| `SUPABASE_SERVICE_ROLE_KEY` | dev-only preview-login route |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | all Mapbox GL maps + static map URLs |
| `DRIFT_DEV_PREVIEW` | gates `/api/dev/preview-login` (`"1"` to enable) |

Also read from the environment in code: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. `next.config.js` re-exports the Vercel project var `MAPBOX_PUBLIC_TOKEN` as `NEXT_PUBLIC_MAPBOX_TOKEN`.

---

## Deployment

**Vercel, from the `main` branch.** Push to `main` and Vercel builds and promotes it; pushes to any other branch produce a preview deployment only.

```bash
git add .
git commit -m "description"
git push origin main
```

There is no `vercel.json`, no `.vercelignore`, and no `.github/` workflow in the repo — build settings, environment variables, and the production branch all live in the Vercel dashboard.

`package.json` has `"deploy": "vercel --prod"`, but the Vercel CLI is not installed on this machine and the repo is not linked (`.vercel/` does not exist). Git push is the deploy path.

### gh-pages is retired

The site used to be a static export force-pushed to the `gh-pages` branch. **That is no longer how anything ships.** Leftovers you may trip over:

- `gh-pages@^6.3.0` still in `devDependencies` — no script invokes it.
- `public/CNAME` (`after-hours.app`) and a duplicated `public/public/` tree — GitHub Pages mechanisms, inert on Vercel.
- `out/` still listed in `.gitignore`.
- The `origin/gh-pages` branch still exists, last commit `592a4f5`, holding a stale export.

`DEVLOG.md` still documents the gh-pages flow (its "Installed `gh-pages`" / `public/CNAME` steps) — read that section as history, not instructions.

### Worktrees

`git worktree list` shows five checkouts of this repo (`after-hours`, `-analytics`, `-app`, `-backnav`, `-fixes`). `.env.local` is git-ignored, so a fresh worktree needs it copied in or the Supabase/Mapbox clients get `undefined`.

---

## Key Files

### Side Quest (marketing globe)

| File | Purpose |
|------|---------|
| `src/components/Globe.tsx` | R3F canvas: earth shader, atmosphere, route arcs, city markers, scroll camera. `// @ts-nocheck` at the top |
| `src/data/journey.ts` | All travel data — chapters, days, transits, places; `MEDIA_BASE` CDN root |
| `src/app/page.tsx` | Scroll-driven page: globe behind, `CityReveal` + `ChapterCard` per chapter, `TimelineScrubber` |
| `src/components/ChapterCard.tsx` | Chapter overlay card (dynamically imports `Filmstrip.tsx`) |
| `src/components/Filmstrip.tsx` | Photo/video strip; media index from the Cloudflare Worker `after-hours-api.after-hours-media.workers.dev` |
| `src/hooks/useScrollProgress.ts` | Scroll position → progress + active chapter |
| `src/app/layout.tsx` | Root layout, Google Fonts, PostHog provider, Vercel Analytics/Speed Insights, Travelpayouts script |
| `src/styles/globals.css` | Global styles, glass card effect, scrollbar, animations |
| `public/textures/earth-day.jpg`, `earth-night.jpg` | Globe surface textures |

### Drift web app

| File | Purpose |
|------|---------|
| `src/middleware.ts` | Host/path routing + Supabase session refresh (see above) |
| `src/app/app/(protected)/layout.tsx` | Server auth gate: no session → `/app/login`; loads the profile; mounts nav rail/dock |
| `src/app/app/login/page.tsx` | Magic link, OAuth (Google/Apple/X), password path for two allow-listed demo emails, Cloudflare Turnstile |
| `src/app/app/(protected)/trips/[id]/page.tsx` + `src/components/app/trip/TripTabs.tsx` | Trip detail — the largest surface in the app |
| `src/app/trip/[id]/page.tsx` | **Public** share page, anon-key reads, no auth gate |
| `src/lib/supabase/{client,server,middleware}.ts` | The three Supabase client entry points; `cookie-options.ts` alongside them exports the shared `AUTH_COOKIE_OPTIONS` |
| `src/lib/drift/server.ts` | `getDriftUpstream()` — resolves the functions base URL + caller token server-side |
| `src/lib/db-types.ts` / `src/lib/database.types.ts` | Row aliases off the generated types / the generated schema types |
| `src/components/app/AppNav.tsx`, `AppRail.tsx` | Mobile dock (Profile, Discover, Chats, Activity + new-trip FAB) and the ≥lg left rail |
| `src/components/app/OptimizedImg.tsx` | Host allow-list guard — non-listed URLs fall back to a plain `<img>` |
| `src/lib/pdf/` | `@react-pdf` itinerary export + bundled TTFs |
| `public/drift/` | The static Drift landing page (`index.html`, `privacy.html`, `terms.html`, `styles.css`, `assets/`, `drift-logo.png`, `robots.txt`, `sitemap.xml`) |
| `src/app/robots.ts` | Allows `/`, disallows `/app/` and `/api/`. Does not serve on `drift.after-hours.app` — `/robots.txt` has an extension and no carve-out, so the marketing rewrite hands it `public/drift/robots.txt` (`Allow: /`) instead. `/app` also carries `robots: {index:false}` in `src/app/app/layout.tsx` |
| `next.config.js` | Security headers, `next/image` host allow-list, PDF font tracing, Mapbox token re-export |

---

## Supabase & Auth

Project ref `ykueoalpqeuqmhfbontz` — the same Supabase project the Drift iOS app uses.

Sessions are cookie-based via `@supabase/ssr`. Cookie attributes are centralised in `src/lib/supabase/cookie-options.ts` (`sameSite: "lax"`, `path: "/"`, 400-day `maxAge`, `secure` in production) — every writer uses the same options, which is what fixed "logged out on every refresh" under Safari ITP.

### Sign-in flows

- **OAuth (Google / Apple / X)** — `?code=` lands on `src/app/auth/callback/route.ts`, which does the PKCE `exchangeCodeForSession` server-side and writes the cookies onto the redirect response.
- **Magic link / email OTP** — `?token_hash&type=` is **redirected to `/auth/confirm`** and verified in the browser. Mail scanners prefetch links but don't run JS, so the single-use token isn't burned before the real tap.
- The `next` parameter is filtered through `isSafeNext()`, which rejects `//`, `/\`, and control characters (open-redirect fix).
- Login is captcha-gated with Cloudflare Turnstile; the token is passed as `captchaToken` and reset after use because Turnstile tokens are single-use.

### Server-side session posture

`getDriftUpstream()` calls `getUser()` (network revalidation against the Auth server) **before** `getSession()`, because the middleware matcher excludes `api/` and would otherwise leave route handlers gated on an unvalidated cookie. The `(protected)` layout does the opposite on purpose — middleware already ran `getUser()` for that request, so the layout reads the cookie only, avoiding a second round-trip per navigation.

### API routes → Edge Functions

Everything under `src/app/api/drift/*` is a thin authenticated proxy (401 when there is no session). The access token never reaches the browser.

| Route | Edge function |
|-------|---------------|
| `apply-import` | `apply-import-batch` |
| `ask` | `discover-events`, then `ask-drift-chat` |
| `delete-account` | `delete-account` (also sweeps the user's S3 media prefix; `maxDuration = 120`) |
| `discover` | `discover-activities` / `discover-stays` / `discover-events` via a `kind` allow-list |
| `facts` | `gemini-complete` |
| `gmail-scan` | `gmail-scan` |
| `parse-text` | `parse-text` |
| `place-blurb` | `place-blurb` |
| `place-details` | `maps-proxy` |
| `plaid-link-token`, `plaid-exchange` | same names |
| `quick-op` | `apply-quick-op` |
| `resolve-place` | `resolve-place` |
| `upload-url` | `generate-upload-url` |
| `itinerary-pdf` | direct PostgREST reads + `place-blurb`, renders with `@react-pdf` |

Called directly from client code: `functions/v1/maps-photo` (streaming Google photo proxy), `functions/v1/submit-feedback`, `functions.invoke("derive-kit")`.

`src/app/api/ph/route.ts` is not a Drift proxy — it serves the PostHog browser snippet to the static marketing HTML, which cannot read `NEXT_PUBLIC_*`.

`src/app/api/dev/preview-login/route.ts` is git-excluded and gated on `NODE_ENV !== "production" && DRIFT_DEV_PREVIEW === "1"`. It mints a passwordless session for a test account so authed pages can be opened locally.

---

## Editing Travel Data

All Side Quest journey content lives in `src/data/journey.ts`. To add a destination, append to `journey.chapters`:

```typescript
{
  id: 21,
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
  days: [],               // Per-day entries (see the DayEntry type)
}
```

Chapters drive the globe route arcs and the camera path, in array order. Run locally to verify, then push.

---

## Domain & DNS

### Current Setup
- **DNS**: Cloudflare (nameservers `ben.ns.cloudflare.com`, `journey.ns.cloudflare.com`)
- **Domains**: `after-hours.app`, `drift.after-hours.app`
- **Hosting**: Vercel
- **SSL**: Let's Encrypt certificates, provisioned and renewed by Vercel

### DNS Records

| Type  | Name  | Content | Notes |
|-------|-------|---------|-------|
| A     | @     | `76.76.21.21` | Vercel apex |
| CNAME | www   | `cname.vercel-dns.com` | |
| CNAME | drift | `39417af65b0cb56d.vercel-dns-017.com` | Drift landing + web app |
| —     | media | resolves to Cloudflare-proxied IPs | `media.after-hours.app`, marketing photo/video CDN (`MEDIA_BASE`) |
| MX    | @     | `route1/2/3.mx.cloudflare.net` | Cloudflare Email Routing — do not remove |

The old GitHub Pages A records (`185.199.108–111.153`) are gone. Don't re-add them.

### If the Domain Stops Working
1. Check the records above on Cloudflare, particularly that the apex A and the `drift` CNAME still point at Vercel.
2. Check the Vercel project → Settings → Domains still lists both `after-hours.app` and `drift.after-hours.app` as verified.
3. Check the latest production deployment actually succeeded (Vercel → Deployments).
4. `public/CNAME` is inert now — it is not the cause of a domain problem either way.

---

## SSH & Git Authentication

- Remote: `git@github.com:husaintalawala/after-hours.git` (SSH)
- Key: the default `~/.ssh/id_ed25519`. There is no `~/.ssh/config` and no per-repo key.

### If Push Fails
```bash
# Test SSH connection — should print "Hi husaintalawala! ..."
ssh -T git@github.com

# Verify remote URL is SSH (not HTTPS)
git remote -v
# Should show: git@github.com:husaintalawala/after-hours.git
```

---

## Troubleshooting

### Side Quest shows "loading" and never renders
`Globe` is a `dynamic(..., { ssr: false })` import and the page renders a "loading" placeholder until `mounted` flips. If it sticks:
- Check the browser console for a Three.js / WebGL error.
- Check `/textures/earth-day.jpg` and `/textures/earth-night.jpg` return 200 — the earth shader samples both, and a failed texture load leaves the sphere black behind the fallback.
- Hard refresh with Cmd + Shift + R.

### Globe renders black
The earth material is a custom `ShaderMaterial` sampling the two textures above.
- Check WebGL support (`chrome://gpu`).
- Check the console for shader compilation errors.

### TypeScript "geometry" error on `<line>`
Three.js `<line>` conflicts with SVG `<line>`. Ensure `// @ts-nocheck` stays at the top of `Globe.tsx`.

### Stale or mismatched dependencies
```bash
rm -rf node_modules .next package-lock.json
npm install
npm run dev
```

### Clicks do nothing after running a build locally
`npm run build` overwrites `.next/`, so a `next dev` server started before it serves 404s for its own chunks — the page renders but never hydrates. Restart `npm run dev`.

### Deployed change isn't live
- Check Vercel → Deployments: the commit must be on `main` and the build must be green.
- A green build proves nothing about types — `ignoreBuildErrors` is on. Run `npx tsc --noEmit` locally.
- Hard refresh: Cmd + Shift + R.

### Drift app pages 404 on `drift.after-hours.app`
The marketing rewrite is the default branch of the middleware. Any new root-level path that should reach a React route or a `public/` asset needs an explicit carve-out in `src/middleware.ts` (items 1 and 2 in the middleware order above), or it becomes `/drift/<path>.html`.

### Logged out on every refresh
Session cookies are not surviving. Check that whatever wrote them used `AUTH_COOKIE_OPTIONS` from `src/lib/supabase/cookie-options.ts`, and that `Set-Cookie` is attached to the same response as the redirect (this is what `auth/callback` does).

### Magic link says "otp_expired"
The token was consumed before the user tapped it. `/auth/callback` deliberately hands `token_hash` to the client page `/auth/confirm` for exactly this reason — don't move `verifyOtp` back to the server.

---

## Version Pinning

Current versions (`package.json`):

| Package | Version | Notes |
|---------|---------|-------|
| next | ^16.3.1 | App Router, server runtime |
| react / react-dom | ^19.2.8 | |
| @react-three/fiber | ^9.7.0 | React 19-compatible line |
| @react-three/drei | ^10.7.8 | The line that pairs with fiber 9 (its peer dep is `@react-three/fiber: ^9.0.0`) |
| three | ^0.170.0 | |
| @supabase/ssr | ^0.5.2 | Cookie-based sessions |
| @supabase/supabase-js | ^2.45.4 | |
| mapbox-gl | ^3.26.0 | Drift app maps |
| @react-pdf/renderer | ^4.5.1 | Itinerary export |
| tailwindcss | ^3.4.0 | |
| typescript | ^5.3.0 | |
| gh-pages | ^6.3.0 | Dead — no script uses it |

The Next 14 → 16 and React 18 → 19 upgrade landed in `34ec68c`, taking `@react-three/fiber` to 9.x and `drei` to 10.x with it.

---

## Adding Another Surface to This Repo

The Drift app was added without disturbing Side Quest, and the same pattern applies:

1. Add the route under `src/app/`.
2. If it must be reachable on `drift.after-hours.app`, add a carve-out near the top of `src/middleware.ts` — otherwise the marketing rewrite claims the path.
3. If it needs its own tab title/favicon or `robots` directives, give the subtree its own `layout.tsx` (see `src/app/app/layout.tsx`).
4. Push to `main`; Vercel deploys it.
