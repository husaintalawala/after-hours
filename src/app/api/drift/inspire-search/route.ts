import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { placeSearchText } from "@/lib/drift/inspireBrowse"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { data, error } = await supabase.from("inspire_trips")
    .select("trip_id,items:snapshot->items").eq("is_active", true)
  if (error) return NextResponse.json({ error: "search_unavailable" }, { status: 503 })
  const index = Object.fromEntries((data ?? []).map((row) => [row.trip_id, placeSearchText(row.items)]))
  return NextResponse.json(index, { headers: { "Cache-Control": "private, no-store" } })
}
