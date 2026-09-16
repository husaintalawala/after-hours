"use client"

import { signOutAndForget } from "@/lib/drift/signOut"

export default function SignOutButton() {
  return (
    <button
      onClick={() => void signOutAndForget()}
      className="text-sm text-drift-muted hover:text-drift-ink"
    >
      Sign out
    </button>
  )
}
