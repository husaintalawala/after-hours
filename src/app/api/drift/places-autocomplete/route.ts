import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Proxy to the places-autocomplete edge function — Google Places Autocomplete
 * (New), session-billed.
 *
 * WHY THIS ROUTE HAD TO EXIST. Web had no path to this function at all, so the
 * onboarding's "Where do you set out from?" field type-ahead went to
 * /api/drift/resolve-place instead. resolve-place is a RESOLVER, not a prefix
 * predictor: measured against the live service it answers "Lis" with Li's
 * Chinese Kitchen, "Lisb" with two wadis in Oman and "Kyo" with a sushi bar in
 * Salem — and takes 1.9s to 5.7s to do it. The screen then filters to
 * cities-only while typing, which turns those wrong answers into NO answers.
 * Spinner, then an empty list. iOS has used this function via
 * PlacesAutocompleteService the whole time.
 *
 * THE SESSION TOKEN IS THE BILLING MODEL, not an implementation detail. N
 * `suggest` calls sharing one token are free when the session is terminated by
 * a `select` carrying that same token; terminate wrongly or never and Google
 * re-bills every one of them at the per-request rate, silently. So the client
 * MUST hold the token across keystrokes and spend it on the pick — see
 * suggestPlaces/selectPlace, which is the only pair that should call this.
 *
 * Body is passed through verbatim rather than reshaped: the two verbs have
 * different required fields and this proxy has no business knowing which.
 */
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const verb = body?.verb
  if (verb !== "suggest" && verb !== "select") {
    return NextResponse.json({ ok: false, error: "verb must be suggest or select" }, { status: 400 })
  }

  const upstream = await fetch(`${up.functionsBase}/places-autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify(body),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
