import { createClient } from "@/lib/supabase/client"

// Trip Files (Media) — documents/attachments stored in the trip_files table,
// uploaded to S3/CloudFront via the shared generate-upload-url pipeline. Separate
// from Track's photo/moments library (the media table).

export interface TripFile {
  id: string
  filename: string
  mime_type: string | null
  size_bytes: number | null
  url: string
  source: string
  created_at: string
}

const COLS = "id,filename,mime_type,size_bytes,url,source,created_at"

export async function listTripFiles(tripId: string): Promise<TripFile[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any
  const { data } = await db
    .from("trip_files")
    .select(COLS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
  return (data as TripFile[] | null) ?? []
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "file"
}

/** Pick → presigned S3 URL → PUT bytes → insert trip_files row. Returns the new
 *  row, or null on any failure (caller surfaces a friendly error). */
export async function uploadTripFile(
  tripId: string,
  file: File,
  source: TripFile["source"] = "upload"
): Promise<TripFile | null> {
  const contentType = file.type || "application/octet-stream"
  const uid =
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  const key = `${uid}-${safeName(file.name)}` // unique S3 key; display name kept below

  const res = await fetch("/api/drift/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: key, contentType }),
  })
  if (!res.ok) return null
  const { presignedUrl, cdnUrl } = (await res.json()) as {
    presignedUrl?: string
    cdnUrl?: string
  }
  if (!presignedUrl || !cdnUrl) return null

  const put = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  })
  if (!put.ok) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any
  const { data: userRes } = await db.auth.getUser()
  const userId = userRes?.user?.id
  if (!userId) return null

  const { data, error } = await db
    .from("trip_files")
    .insert({
      trip_id: tripId,
      user_id: userId,
      url: cdnUrl,
      filename: file.name,
      mime_type: contentType,
      size_bytes: file.size,
      source,
    })
    .select(COLS)
    .single()
  if (error) return null
  return data as TripFile
}

export async function deleteTripFile(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any
  await db.from("trip_files").delete().eq("id", id)
}

export function formatBytes(n: number | null): string {
  if (!n || n <= 0) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
