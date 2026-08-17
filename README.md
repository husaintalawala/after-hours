# after-hours

Side quests. Personal builds. Things made off the clock.

One Next.js app serves two products, split by hostname in `src/middleware.ts`:

| Host | Serves |
| --- | --- |
| [after-hours.app](https://after-hours.app) | **Side Quest** — the scroll-driven 3D globe |
| [drift.after-hours.app](https://drift.after-hours.app) | **Drift** — static landing page at `/`, logged-in web app under `/app` |

Only the marketing rewrite is host-gated. The `/app`, `/auth`, and `/trip` carve-out returns from `src/middleware.ts` before the host check, so those routes serve on every host — `after-hours.app` and `localhost` included.

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

The logged-in web port of the Drift iOS app — trips, discover, chats, activity, people, countries, settings — plus a public share page at `/trip/[id]`.

- Routes live in `src/app/app/` (the `(protected)` group sits behind a Supabase auth gate) and `src/app/auth/`
- Sessions are `@supabase/ssr` cookies, refreshed in middleware on every `/app`, `/auth`, `/trip` request
- Login is magic link + Google/Apple/X OAuth, behind a Cloudflare Turnstile captcha; an allow-list of demo accounts (`PASSWORD_DEMO_EMAILS`) gets a password field instead
- `src/app/api/drift/*` are authenticated route handlers that read the caller's access token server-side from the session cookie (`src/lib/drift/server.ts`) rather than taking it from the request, then forward to Supabase Edge Functions. `itinerary-pdf` is the exception — it queries Supabase itself and renders the PDF locally with `@react-pdf/renderer`
- Drift's own marketing landing page is hand-written static HTML in `public/drift/`

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
