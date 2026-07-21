import Image from "next/image"

// Image wrapper that routes ONLY known-safe hosts through Vercel's optimizer
// (resize + WebP/AVIF + edge cache), and lets everything else fall through to
// a plain <img> — unoptimized and uncached.
//
// ToS-critical: Google Place Photos (served via the maps-photo proxy) and
// vendor photo URLs must never be re-hosted or cached (Google Places ToS
// §3.2.3, vendor terms). Those hosts are deliberately absent from the
// allow-list, so they always render as a raw <img>. The list mirrors
// next.config.js `images.remotePatterns` — the two must stay in sync (a host
// here but not there would 400 at the optimizer).
const OPTIMIZE_HOSTS = new Set([
  "api.mapbox.com", // Mapbox static maps
  "d309w7wk5bnk1z.cloudfront.net", // user-uploaded photos (S3 → CloudFront)
])

function optimizable(src: string): boolean {
  try {
    return OPTIMIZE_HOSTS.has(new URL(src).hostname)
  } catch {
    return false
  }
}

export default function OptimizedImg({
  src,
  alt = "",
  className,
  sizes,
  priority = false,
  fill = false,
  width = 800,
  height = 800,
}: {
  src: string
  alt?: string
  className?: string
  sizes?: string
  priority?: boolean
  fill?: boolean
  width?: number
  height?: number
}) {
  if (!optimizable(src)) {
    // Non-allow-listed host (Google Place Photos, vendor, unknown) — untouched.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={className}
        loading={priority ? undefined : "lazy"}
        decoding="async"
        {...(priority ? { fetchPriority: "high" as const } : {})}
      />
    )
  }
  if (fill) {
    return (
      <Image src={src} alt={alt} fill sizes={sizes} className={className} priority={priority} />
    )
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      className={className}
      priority={priority}
    />
  )
}
