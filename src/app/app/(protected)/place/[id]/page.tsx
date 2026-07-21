import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { fetchPlaceDetails, placesPhotoUrl } from "@/lib/drift/placeDetails"
import { staticMapUrl } from "@/lib/drift/staticMap"
import type { TripRow } from "@/lib/db-types"
import BackLink from "@/components/app/BackLink"
import OptimizedImg from "@/components/app/OptimizedImg"

// Place detail — cinematic hero, About / Hours / Reviews, and a sticky action
// card with mini-map + "Ask Drift about this" (prefills the featured trip's
// docked chat via ?ask=).

export default async function PlacePage({
  params,
}: {
  params: { id: string }
}) {
  const place = await fetchPlaceDetails(decodeURIComponent(params.id))
  if (!place) notFound()

  // Featured trip → the Ask-Drift hand-off target.
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  let askHref: string | null = null
  if (session?.user) {
    const { data: tripsRaw } = await supabase
      .from("trips")
      .select("id,title,start_date,is_active")
      .eq("user_id", session.user.id)
      .returns<Pick<TripRow, "id" | "title" | "start_date" | "is_active">[]>()
    const trips = (tripsRaw ?? []).sort((a, b) =>
      (b.start_date ?? "").localeCompare(a.start_date ?? "")
    )
    const today = new Date().toISOString().slice(0, 10)
    const featured =
      trips.find((t) => t.is_active) ??
      trips
        .filter((t) => (t.start_date ?? "") > today)
        .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""))[0] ??
      trips[0]
    if (featured) {
      askHref = `/app/trips/${featured.id}?ask=${encodeURIComponent(
        `Tell me about ${place.name} — is it worth adding to this trip?`
      )}`
    }
  }

  const hero = place.photoNames[0] ? placesPhotoUrl(place.photoNames[0], 1600) : null
  const thumbs = place.photoNames.slice(1, 5)
  const map = place.lat != null && place.lng != null ? staticMapUrl(place.lat, place.lng) : null

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-4 lg:max-w-[1400px] lg:px-8 lg:pt-6">
      {/* Hero */}
      <div className="relative mt-3 h-[240px] overflow-hidden rounded-[26px] shadow-[0_24px_60px_-24px_rgba(31,31,36,0.35)] md:h-[330px] lg:mt-0">
        <div className="absolute left-4 top-4 z-10">
          <BackLink href="/app/discover" label="Discover" />
        </div>
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg,#E0563B,rgb(140,82,0))" }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(12,10,9,.72) 0%, rgba(12,10,9,.18) 45%, rgba(12,10,9,.10) 100%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
          {place.typeLabel && (
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">
              {place.typeLabel}
            </p>
          )}
          <h1 className="mt-1 font-drift-display text-[36px] font-semibold leading-[1.05] tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.35)] md:text-[52px]">
            {place.name}
          </h1>
          <p className="mt-1.5 text-[14px] text-white/90">
            {[
              place.rating != null && place.rating > 0
                ? `★ ${place.rating.toFixed(1)}${place.ratingCount ? ` (${place.ratingCount.toLocaleString()})` : ""}`
                : null,
              place.openNow == null ? null : place.openNow ? "Open now" : "Closed",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {/* Photo strip */}
      {thumbs.length > 0 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {thumbs.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p}
              src={placesPhotoUrl(p, 480)}
              alt=""
              loading="lazy"
              className="h-28 w-40 shrink-0 rounded-2xl object-cover"
            />
          ))}
        </div>
      )}

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-7">
        <div className="space-y-7">
          {place.summary && (
            <section>
              <h2 className="font-drift-display text-[22px] font-semibold">About</h2>
              <p className="mt-2 text-[15px] leading-[1.65] text-drift-ink">{place.summary}</p>
            </section>
          )}

          {place.hours.length > 0 && (
            <section>
              <h2 className="font-drift-display text-[22px] font-semibold">Hours</h2>
              <ul className="mt-2 space-y-1">
                {place.hours.map((h) => (
                  <li key={h} className="text-[14px] text-drift-muted">
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {place.reviews.length > 0 && (
            <section>
              <h2 className="font-drift-display text-[22px] font-semibold">
                What travelers say
              </h2>
              <div className="mt-3 space-y-3">
                {place.reviews.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-[#EBE7E1] bg-white p-4"
                  >
                    <p className="text-[13px] font-semibold">
                      {r.author}
                      <span className="ml-2 font-normal text-drift-text-tertiary">
                        {r.when}
                      </span>
                      {r.rating != null && (
                        <span className="ml-2 text-drift-coral">★ {r.rating}</span>
                      )}
                    </p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-drift-muted">
                      {r.text.length > 220 ? `${r.text.slice(0, 220)}…` : r.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sticky action card */}
        <aside className="mt-8 lg:sticky lg:top-[76px] lg:mt-0">
          <div className="overflow-hidden rounded-[22px] border border-[#EBE7E1] bg-white shadow-[0_24px_60px_-30px_rgba(31,31,36,0.25)]">
            {map && (
              <OptimizedImg
                src={map}
                width={600}
                height={280}
                sizes="(max-width: 1024px) 100vw, 400px"
                className="h-[170px] w-full object-cover"
              />
            )}
            <div className="p-5">
              {place.address && (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-drift-text-tertiary">
                    Where
                  </p>
                  <p className="mt-1 text-[14.5px] leading-snug">{place.address}</p>
                </>
              )}
              {place.phone && (
                <p className="mt-3 text-[14px] text-drift-muted">{place.phone}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {place.mapsUri && (
                  <a
                    href={place.mapsUri}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[#EBE7E1] px-4 py-2 text-[13px] font-medium"
                  >
                    Directions
                  </a>
                )}
                {place.website && (
                  <a
                    href={place.website}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[#EBE7E1] px-4 py-2 text-[13px] font-medium"
                  >
                    Website
                  </a>
                )}
              </div>

              {askHref && (
                <Link
                  href={askHref}
                  className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-drift-coral text-[14.5px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(224,86,59,0.65)]"
                >
                  ✦ Ask Drift about this
                </Link>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
