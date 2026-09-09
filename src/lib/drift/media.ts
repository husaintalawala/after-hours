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
  const db = createClient()
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

  const db = createClient()
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

/** Upload an image and return its CDN URL, WITHOUT creating a trip_files row.
 *
 *  Trip Settings' cover photo is not an attachment — it is a column on the trip
 *  (`trips.cover_url`), so it must not appear in the Files tab. This shares the
 *  exact presign → PUT path as uploadTripFile above, so it works precisely when
 *  file upload does; if the S3 bucket's CORS is not configured for the browser
 *  origin, both fail together and this is not the place that broke.
 *  Returns null on any failure; the caller shows the message. */
export async function uploadImageToCDN(file: File): Promise<string | null> {
  const contentType = file.type || "application/octet-stream"
  const uid =
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  const key = `${uid}-${safeName(file.name)}`

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
  return cdnUrl
}

/**
 * Why an avatar upload did not land, or the fact that it half did.
 *
 * `uploadedButNotLinked` is its own case on purpose, and it is the one that
 * matters: the bytes DID reach the CDN, so a caller must be able to say "saved,
 * but it may not stick" rather than "failed". That exact half-failure is
 * already on record on iOS — the S3 object landing while `profiles.avatar_url`
 * still pointed at the old one, so the photo reverted on the next load while
 * the log said it had worked.
 */
export type AvatarUploadResult =
  | { ok: true; url: string }
  | { ok: false; reason: "unreadable" | "notSignedIn" | "uploadFailed" | "uploadedButNotLinked" }

/**
 * Resize → JPEG → S3 → `profiles.avatar_url`. The web half of iOS's
 * `AvatarUpload`, sharing the presign → PUT path every other browser upload
 * here uses, so it works precisely when trip files and trip covers do.
 */
export async function uploadAvatar(file: File): Promise<AvatarUploadResult> {
  if (!file.type.startsWith("image/")) return { ok: false, reason: "unreadable" }

  const db = createClient()
  const { data: userRes } = await db.auth.getUser()
  const userId = userRes?.user?.id
  if (!userId) return { ok: false, reason: "notSignedIn" }

  const upload = await uploadImageToCDN(await downscaleForAvatar(file))
  if (!upload) return { ok: false, reason: "uploadFailed" }

  // `.select()` so a write RLS filtered to zero rows is not read as a success.
  // This is the second half that gets forgotten, and forgetting it is invisible
  // until the next page load puts the old picture back.
  const { data: rows, error } = await db
    .from("profiles")
    .update({ avatar_url: upload })
    .eq("id", userId)
    .select("id")
  if (error || !rows || rows.length === 0) return { ok: false, reason: "uploadedButNotLinked" }

  return { ok: true, url: upload }
}

/**
 * Downscale BEFORE encoding, to the largest size this is ever drawn at.
 *
 * A camera-roll pick is 4–6k pixels on the long edge — one real profile on iOS
 * is 5712×4284 at 7.0 MB — and every viewer then downloads all of it to draw a
 * 44px circle. `imageOrientation: "from-image"` keeps EXIF rotation, which is
 * otherwise lost the moment a photo goes through a canvas: portrait phone
 * photos would upload on their side.
 *
 * Best effort by design. Any failure returns the ORIGINAL file, so the worst
 * case is a large avatar rather than no avatar — the resize is an optimisation
 * and must never be the reason an upload fails.
 */
async function downscaleForAvatar(file: File, max = 512): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    if (scale >= 1) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8)
    )
    if (!blob) return file
    return new File([blob], "avatar.jpg", { type: "image/jpeg" })
  } catch {
    return file
  }
}

/** Throws if the row was not deleted. postgrest-js resolves with { error } rather
 *  than rejecting, so this used to return normally on an RLS denial and the caller
 *  had no way to know the file still existed. */
export async function deleteTripFile(id: string): Promise<void> {
  const db = createClient()
  await db.from("trip_files").delete().eq("id", id).throwOnError()
}

export function formatBytes(n: number | null): string {
  if (!n || n <= 0) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
