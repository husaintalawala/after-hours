# Drift marketing production release — 2026-09-20

## Pre-release production snapshot

- Production domain: `https://drift.after-hours.app/`
- Vercel deployment ID: `dpl_EwtAsQm5gDid7ARTrvpbwFPQUdEo`
- Immutable deployment URL: `https://after-hours-1k5vs8a4o-husaintalawalas-projects.vercel.app/`
- Source branch: `main`
- Source commit: `498ed40a4743da8c884bbf07045564535f8187be`
- Production `/` HTML SHA-256: `d7d53b90f70b7c3a910363e335a132801a5176768f55a250c251557b2a1b23c7`
- Snapshot verification: the production HTML was byte-for-byte identical to `public/drift/index.html` at the source commit before this release.

## Fast rollback

The previous ready deployment is intentionally retained. In Vercel, open:

`https://vercel.com/husaintalawalas-projects/after-hours/EwtAsQm5gDid7ARTrvpbwFPQUdEo`

Choose **Deployment Actions → Promote to Production**. This immediately restores the previous artifact and its domain aliases without rebuilding it.

Authenticated CLI equivalent from the linked `after-hours` project:

```sh
vercel rollback after-hours-1k5vs8a4o-husaintalawalas-projects.vercel.app --scope husaintalawalas-projects
```

After an emergency alias rollback, revert the release commit on `main` and push the revert so the Git source again matches production. The release commit is recorded below after integration.

## Release source

- Release commit: `523721cfba79623669f76016158f82eb7185e0a3`
- Intended scope: the Drift marketing root HTML, three native app recordings, their three reduced-motion posters, and this release record.
