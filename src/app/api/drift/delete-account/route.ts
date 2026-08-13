import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

// Proxy to the delete-account edge function.
//
// The web previously did its own soft delete client-side — it set
// profiles.deleted_at and removed the eight tables RLS let the browser see,
// leaving the auth user, the profile row, every Gmail/Calendar-derived row,
// and all S3 media behind, while telling the user everything was gone. A
// browser can never do this correctly: deleting the auth user needs the
// service role, and ~24 user-scoped tables are not reachable under RLS.
//
// The edge function identifies the account to delete from the JWT alone —
// there is no user id in the body — so this route cannot be tricked into
// deleting somebody else's account. maxDuration is generous because the
// function also sweeps the user's S3 prefix.
export async function POST() {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const upstream = await fetch(`${up.functionsBase}/delete-account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify({ confirm: "DELETE" }),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
