import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Proxy to plaid-exchange. Body: {public_token, institution?}. Swaps the
// public_token for a permanent access_token server-side, inserts plaid_items/
// plaid_accounts, and kicks the initial transactions sync. Returns
// {item_id, accounts}.
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.public_token) {
    return NextResponse.json({ ok: false, error: "missing public_token" }, { status: 400 })
  }

  const payload: Record<string, unknown> = { public_token: String(body.public_token) }
  if (body.institution && typeof body.institution === "object") {
    payload.institution = {
      id: body.institution.id ? String(body.institution.id) : undefined,
      name: body.institution.name ? String(body.institution.name) : undefined,
    }
  }

  const upstream = await fetch(`${up.functionsBase}/plaid-exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify(payload),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
