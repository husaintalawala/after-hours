"use client"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { activityAvailable, connectActivity, flushActivity, foregroundActivity, recordActivity, resetActivity, type Feature } from "@/lib/activity"
export default function ActivityProvider({userId}: {userId:string}) {
  const pathname = usePathname()
  useEffect(() => {
    if (!activityAvailable()) return
    void connectActivity(userId).then(() => { recordActivity("session_started","app"); foregroundActivity() })
    const foreground = () => { foregroundActivity(); void flushActivity() }
    const timer = setInterval(() => { foregroundActivity(); void flushActivity() }, 5000)
    const consent = setInterval(() => { void connectActivity(userId) }, 60000)
    const {data:{subscription}} = createClient().auth.onAuthStateChange((_event,session) => { if(session?.user.id !== userId) resetActivity() })
    document.addEventListener("visibilitychange",foreground); window.addEventListener("focus",foreground)
    const storage = (e: StorageEvent) => { if(e.key?.startsWith("drift.privateActivity") && e.newValue === null) void connectActivity(userId) }
    window.addEventListener("storage", storage)
    return () => { clearInterval(timer); clearInterval(consent); subscription.unsubscribe(); document.removeEventListener("visibilitychange",foreground); window.removeEventListener("focus",foreground); window.removeEventListener("storage",storage) }
  },[userId])
  useEffect(() => {
    // Only classify known route segments, never transmit paths, IDs, or queries.
    const segment = pathname.split("/")[2] || "trips"
    const map: Record<string,Feature> = {discover:"discover",inspire:"inspire",saved:"backpocket",backpocket:"backpocket",trip:"trips",trips:"trips",chat:"chat",chats:"chat",welcome:"onboarding",profile:"profile",settings:"settings"}
    const feature = map[segment]
    if (feature) recordActivity("feature_viewed",feature)
  },[pathname])
  return null
}
