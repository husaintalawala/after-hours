import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { GUIDE_COOKIE, isGuideSlug } from "@/lib/drift/inspire"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// "Remember which guide I was reading" — the half of the hand-off that survives
// changing device.
//
// GUIDE_COOKIE already carries the destination through a sign-in, and for the
// common case that is enough. It cannot cross devices: it is httpOnly and
// per-browser, so someone who reads a guide on their phone and opens the magic
// link on a laptop arrives with nothing and lands on the generic home, one step
// short of the trip they were promised.
//
// The destination cannot ride `?next=` instead — Supabase matches redirectTo
// against an allow-list and a query-param variant can silently fall back to the
// Site URL (the previously-diagnosed "stuck login"). That allow-list is
// dashboard config, so a design depending on it is a design that can be quietly
// broken. This one does not touch it: the note is keyed to the EMAIL, which is
// the one thing both devices share.
//
// THE CLIENT NEVER SUPPLIES THE SLUG. It is read from GUIDE_COOKIE, which only a
// browser that actually opened a guide has. So the worst anyone can do is submit
// somebody else's address from a guide they opened themselves, and send that
// person's next sign-in to a PUBLIC curated trip — a page anybody can already
// read. No access, no data, and never an open redirect, because the slug is
// checked against an active inspire_trips row before it is stored.
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  // Missing config must not break sign-in: this is an enhancement to the
  // hand-off, and the cookie still covers the same-device path.
  if (!url || !serviceRole) return NextResponse.json({ ok: true, stored: false })

  const jar = await cookies()
  const slug = jar.get(GUIDE_COOKIE)?.value
  if (!isGuideSlug(slug)) return NextResponse.json({ ok: true, stored: false })

  const body = await request.json().catch(() => null)
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  // Cheap shape check only. This address is a lookup key, never a recipient —
  // nothing is ever sent to it from here.
  if (!email || email.length > 320 || !email.includes("@")) {
    return NextResponse.json({ ok: true, stored: false })
  }

  const admin = createAdminClient(url, serviceRole, { auth: { persistSession: false } })

  // The slug must name a guide that actually exists and is live, so a stored
  // note can only ever point somewhere the recipient could already go.
  const { data: guide } = await admin
    .from("inspire_trips")
    .select("slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle()
  if (!guide) return NextResponse.json({ ok: true, stored: false })

  // Upsert on the email primary key: one note per address, never a growing pile.
  const { error } = await admin
    .from("pending_guide_intent")
    .upsert({ email, slug, created_at: new Date().toISOString() }, { onConflict: "email" })

  if (error) {
    // Never fail the sign-in over this.
    console.error("[remember-guide] upsert failed", error.message)
    return NextResponse.json({ ok: true, stored: false })
  }

  return NextResponse.json({ ok: true, stored: true })
}
