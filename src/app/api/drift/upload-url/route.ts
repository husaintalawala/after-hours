import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Presigned-S3 URL for a trip-file upload. Proxies generate-upload-url (the same
// content-type-agnostic edge fn iOS uses) with the caller's token attached
// server-side. Returns { presignedUrl, cdnUrl } — the client PUTs the bytes to
// presignedUrl (with Content-Type) and stores cdnUrl in trip_files.
export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.filename || !body?.contentType) {
    return NextResponse.json({ error: "filename and contentType required" }, { status: 400 })
  }

  const upstream = await fetch(`${up.functionsBase}/generate-upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${up.token}`,
      apikey: up.anonKey,
    },
    body: JSON.stringify({ filename: body.filename, contentType: body.contentType }),
  })
  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
