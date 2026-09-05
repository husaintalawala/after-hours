import { createClient } from "@/lib/supabase/server"

// The avatar in the nav rail, and the ONLY reason the logged-in layout used to
// need a database round trip.
//
// It sat above every loading boundary: a loading.tsx wraps a layout's children,
// never the layout's own awaits, so on a hard load the browser got zero bytes
// until a profiles lookup came back — to decide one letter and one image URL.
// Now the layout renders the shell immediately and this streams in behind a
// Suspense boundary, so the rail, the nav and the page skeleton are all on
// screen while the avatar is still resolving.

/** The circle with nothing in it yet: exact size and shape of the real one, so
 *  nothing moves when it arrives. */
export function RailAvatarFallback() {
  return (
    <span
      aria-hidden
      className="block h-9 w-9 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.85)]"
      style={{ background: "linear-gradient(135deg,#37D6C4,#6B5CFF)" }}
    />
  )
}

export default async function RailAvatar({ userId }: { userId: string }) {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,username,avatar_url")
    .eq("id", userId)
    .maybeSingle<{
      display_name: string | null
      username: string | null
      avatar_url: string | null
    }>()

  const avatarUrl = profile?.avatar_url ?? null
  const initial = (profile?.display_name || profile?.username || "T").slice(0, 1).toUpperCase()

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="h-9 w-9 rounded-full object-cover shadow-[0_0_0_2px_rgba(255,255,255,0.85)]"
      />
    )
  }
  return (
    <span
      className="flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-bold text-white shadow-[0_0_0_2px_rgba(255,255,255,0.85)]"
      style={{ background: "linear-gradient(135deg,#37D6C4,#6B5CFF)" }}
    >
      {initial}
    </span>
  )
}
