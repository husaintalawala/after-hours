import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Proxy to plaid-link-token. No body — the caller is identified by their JWT.
// Returns {link_token, expires_at, env} or 403 when profiles.plaid_enabled is
// false for the caller (single-user gate).
export async function POST() {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const upstream = await fetch(`${up.functionsBase}/plaid-link-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: "{}",
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
