"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function SignOutButton() {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut()
        router.push("/app/login")
        router.refresh()
      }}
      className="text-sm text-drift-muted hover:text-drift-ink"
    >
      Sign out
    </button>
  )
}
