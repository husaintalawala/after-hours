# Drift scroll-control production correction — 2026-09-20

## Pre-release production snapshot

- Production domain: `https://drift.after-hours.app/`
- Vercel deployment ID: `dpl_G9Px5e4FyD5R2W2R3sioPCQ3d68c`
- Immutable deployment URL: `https://after-hours-523jq95i1-husaintalawalas-projects.vercel.app/`
- Source branch: `main`
- Source commit: `4a4543b46a55a18a1c2fdec02b44a2d932680b52`
- Vercel state before this correction: `READY`, Production.

## Fast rollback

The previous ready deployment must remain retained. In Vercel, open:

`https://vercel.com/husaintalawalas-projects/after-hours/G9Px5e4FyD5R2W2R3sioPCQ3d68c`

Choose **Deployment Actions → Promote to Production**. This restores the autoplay artifact and its domain aliases without rebuilding it.

Authenticated CLI equivalent from the linked `after-hours` project:

```sh
vercel rollback after-hours-523jq95i1-husaintalawalas-projects.vercel.app --scope husaintalawalas-projects
```

After an emergency alias rollback, revert the correction commit on `main` and push the revert so Git again matches production.

## Correction source

- Correction commit: `8bb954f694106ba2aab487e480efb98e408818c0`
- Intended scope: the Drift marketing root's scroll interaction, three seekable native recordings, their three authentic first-frame posters, and this rollback record.
