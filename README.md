# after-hours

Side quests. Personal builds. Things made off the clock.

One Next.js app serves two products, split by hostname in `src/middleware.ts`:

| Host | Serves |
| --- | --- |
| [after-hours.app](https://after-hours.app) | **Side Quest** — the scroll-driven 3D globe |
| [drift.after-hours.app](https://drift.after-hours.app) | **Drift** — static landing page at `/`, logged-in web app under `/app` |

Only the marketing rewrite is host-gated (`src/middleware.ts:75`). Several carve-outs return before that check, so they serve on every host — `after-hours.app` and `localhost` included:

- `/.well-known/apple-app-site-association` — plain `next()`, no session work; Apple fetches it unauthenticated and negative-caches a 404 for about a day
- `/i/<slug>` — the public guide. Plain `next()`: it reads no cookies and renders identically signed in or out, and share links are hit by crawlers that should not cost an auth round trip
- `/app`, `/auth`, `/trip`, `/join` — routed through `updateSession`. `/join` is public but branches on whether a session already exists, and its route handlers read and write auth cookies

---

## What's Here

### Side Quest

A scroll-driven 3D interactive globe visualizing 89 days of travel across 10 countries — from New York to Everest Base Camp to the Amalfi Coast and back. Built with Three.js, React Three Fiber, and Next.js.

- Day/night earth shaded in custom GLSL — terminator blend, fresnel rim, atmosphere shell
- Animated arcs between consecutive chapters that draw as you scroll
- Pulsing city markers with glow effects for key destinations
- Chapter cards with a day-by-day itinerary that expands inline, plus a photo/video filmstrip
- Scroll-linked progress bar and a frosted-glass timeline scrubber

`src/app/page.tsx`, `src/components/Globe.tsx`; journey content in `src/data/journey.ts`.

### Drift Web App

The logged-in web port of the Drift iOS app — trips, discover, inspire, chats, people, countries, settings — plus a public share page at `/trip/[id]` and a public guide page at `/i/[slug]`. (Activity still exists at `/app/activity`; as of 2026-09-05 it is commented out of `AppNav` and `AppRail` to de-congest the nav, pending a decision on where it belongs.)

- Routes live in `src/app/app/` (the `(protected)` group sits behind a Supabase auth gate) and `src/app/auth/`
- Sessions are `@supabase/ssr` cookies. Middleware still RUNS on every `/app`, `/auth`, `/trip` and `/join` request, but since 2026-09-05 it only **refreshes** when the access token is within 120s of expiry — it decodes `exp` from the cookie locally and returns early otherwise. `getUser()` is a round trip to Supabase's auth server, and it sat in front of every navigation AND every `<Link>` prefetch, delaying even the `loading.tsx` skeleton. Every shape it cannot read (missing, chunked, `base64-` encoded, malformed) falls through to refreshing exactly as before
- Login is magic link + Google/Apple/X OAuth, behind a Cloudflare Turnstile captcha; an allow-list of demo accounts (`PASSWORD_DEMO_EMAILS`) gets a password field instead
- `src/app/api/drift/*` are authenticated route handlers that read the caller's access token server-side from the session cookie (`src/lib/drift/server.ts`) rather than taking it from the request, then forward to Supabase Edge Functions. `itinerary-pdf` is the exception — it queries Supabase itself and renders the PDF locally with `@react-pdf/renderer`
- Drift's own marketing landing page is hand-written static HTML in `public/drift/`
- Every section returns immediately and streams its data behind a `<Suspense>` boundary whose fallback is that section's own
  `loading.tsx` (home, chats, countries, discover, inspire, `trips/[id]`). The `(protected)` layout no longer awaits a profiles
  lookup either — the nav rail takes an `avatar` slot and `RailAvatar` streams behind its own boundary. A `loading.tsx` wraps a
  layout's children, never the layout's own awaits, which is why that one mattered
- `trips/[id]` checks the trip exists BEFORE its boundary. `notFound()` only sets a 404 while the status is still the server's to
  set; from inside a streamed child it renders the not-found view with a 200
- The chat composer's send button becomes a STOP button while an answer streams, aborting the real request. The abort must be
  distinguishable from the internal watchdog's, or `askDrift`'s blocking retry fires a second request the moment the user asks
  for none

---

## Quick Start

```bash
git clone git@github.com:husaintalawala/after-hours.git
cd after-hours
npm install
npm run dev
```

- [localhost:3000](http://localhost:3000) — the globe
- [localhost:3000/app](http://localhost:3000/app) — the Drift app (needs the env vars below)
- [localhost:3000/drift/index.html](http://localhost:3000/drift/index.html) — Drift's static landing page; the clean-URL rewrite only fires on the `drift.after-hours.app` host

## Environment

`.env.local`. The vars in the table are the Drift half — the globe needs none of them:

| Var | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project (the same one the Drift iOS app uses) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server Supabase clients |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | maps and the app globe — on Vercel this is set as `MAPBOX_PUBLIC_TOKEN` and re-exported in `next.config.js` |

`NEXT_PUBLIC_META_PIXEL_ID` turns on the Meta pixel (`src/lib/analytics.ts`). Unset, no script loads and
no request is made — it is inert, not merely quiet. It is scoped to the Drift halves of the app: `drift.*`
hosts and the `/app`, `/auth`, `/trip`, `/join`, `/i` carve-out, so the Side Quest portfolio on
`after-hours.app` never loads an ad tracker. Advanced matching is explicitly off and no email, name or user
id is passed. Only `signup` (as Meta's `CompleteRegistration`), `create_trip` and `trip_activated` are
mirrored, plus PageView on client navigation.

It is **gated on geography**, because an ad pixel is not strictly necessary for the site to work and the
EEA and UK require consent before it loads — which this app has no banner for. `/api/geo` resolves the
country from `x-vercel-ip-country` at the edge and answers yes or no.

`src/lib/adRegion.ts` is an **allow-list**: US, CA, AU, NZ, plus IN and AE — the last two with hard expiry
dates, because both are "legal today, not legal on a known date". India's DPDP Act consent provisions
commence **2027-05-13**; the UAE's federal PDPL requires compliance by **2027-01-01**. Each entry carries
that date and blocks itself when it arrives, so the deadline cannot be forgotten in a comment.

⚠️ **The UAE entry is knowingly risky.** DIFC (Data Protection Law No. 5 of 2020, GDPR-aligned) and ADGM
have been enforceable since 2020 and a country IP lookup returns `AE` for the whole federation — a visitor
inside DIFC is indistinguishable here from one anywhere else in Dubai. Allowing `AE` allows those zones
too. A consent banner resolves it; nothing in this file can. It was briefly a deny-list of
consent-required countries, which fails OPEN for every code nobody thought of — it let the pixel load for
Réunion, Guadeloupe, Martinique, French Guiana, Mayotte, Saint-Martin and Åland, all EU territory with
their own ISO codes, which MaxMind reports as `RE` and `AX` rather than `FR` and `FI`. Enumerating
territories harder would not fix the shape; defaulting to no does. A second guard blocks the EEA/UK/CH
codes outright, so adding `FR` to the allow-list by mistake still cannot switch tracking on there.

**Adding a market is a deliberate act** — check that country's consent law first. The UAE and India are
left out on purpose despite being plausible ad markets: both have consent regimes worth reading properly.

**It fails closed.** Unknown country, unlisted country, failed request, malformed answer: no pixel. That
includes local dev, where there is no geo header at all — so the pixel does not fire on `localhost` by
design. Vercel supplies the header on preview and production, so test it there.

**Only the denial is cached** (`sessionStorage`), never the permission. A cached yes outlived the IP that
produced it, survived tab restore, and sat somewhere any script on the origin could plant it. A stale no
merely under-tracks.

That is a geography gate, **not consent**. It keeps the pixel away from people whose law requires asking;
it does not ask anybody. Running ads into the EEA or UK needs a real consent banner first, and then that
list becomes "regions we have not yet been given consent for".

`SUPABASE_SERVICE_ROLE_KEY` is read by the guide-pickup path (`claimPendingGuide`), the guide-remembering path, and the invite page's cover lookup. **It is not set in Vercel production**, and all three degrade silently without it — which is why the invite unfurl now falls back to the anon `preview_trip_invite` RPC rather than depending on it.

Optional: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Drift only); `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` cover both halves — `PostHogProvider` is mounted in the root layout, and `/api/ph` loads PostHog for the static marketing pages.

## Deploy

Vercel builds `main` as production — push and it ships. Other branches get preview deployments. None of that is configured in the repo: there is no `vercel.json`, no `.vercel/`, and no CI workflow, so the production branch, build settings, and env vars all live in the Vercel dashboard.

```bash
git push origin main
```

There is no manual deploy script. One existed (`"deploy": "vercel --prod"`) but the Vercel CLI was never a dependency here, so it only ever ran for someone who had installed it globally — it has been removed rather than left as a trap.

gh-pages is retired, and as of 2026-08-16 its leftovers are gone too — the `gh-pages` branch, `public/CNAME`, the `gh-pages` devDependency, `out/` in `.gitignore`, and a stray `public/public/` duplicate. The deploy section of DEVLOG.md describes that old static-export setup — this app has middleware, route handlers, and response headers, so it can no longer be statically exported.

---

## Stack

- **Framework**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **3D**: Three.js + React Three Fiber + Drei (Side Quest only)
- **App**: Supabase (auth, Postgres, edge functions), Mapbox GL JS
- **Fonts**: Playfair Display, IBM Plex Mono, Inter (Side Quest); Fraunces, Inter (Drift)
- **Hosting**: Vercel + Cloudflare — DNS, plus R2 for the journey photos and videos. The bytes are served straight from the bucket's own domain (`MEDIA_BASE` in `src/data/journey.ts`); the Worker at `after-hours-api.after-hours-media.workers.dev` does one job, listing a folder's contents so `Filmstrip` can discover media at runtime
- **Domains**: after-hours.app, drift.after-hours.app, media.after-hours.app

---

## Older Notes

[DEVLOG.md](./DEVLOG.md) records how the globe site was originally built, on Next 14 / React 18 and a gh-pages static export — read its deploy and React-version sections as history, not instructions.

The current references are [TECHNICAL.md](./TECHNICAL.md), which covers this repo's architecture, deployment, and troubleshooting, and [TECHNICAL_GUIDE.md](./TECHNICAL_GUIDE.md), a build-it-yourself walkthrough of the globe and its R2 media pipeline.
