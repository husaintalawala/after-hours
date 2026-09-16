"use client"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ACTIVITY_CONSENT_KEY, activityAvailable, cleanupActivityStorage, connectActivity, flushActivity, flushActivityOnHide, foregroundActivity, recordActivity, refreshConsent, resetActivity, type Feature } from "@/lib/activity"

// NO TIMERS. The 5 s flush and the 60 s consent read ran in every open tab,
// hidden ones included, for every signed-in user whether or not they had opted
// in. Delivery now rides the moments that actually matter — the tab going away,
// coming back, or twenty events piling up — and consent rides the batch
// responses, so the only reads left are a wake-up behind a fifteen-minute floor.
export default function ActivityProvider({userId}: {userId:string}) {
  const pathname = usePathname()
  useEffect(() => {
    // Runs whether or not the flag is on: a build with activity off must leave
    // nothing behind from a build that had it on.
    if (!activityAvailable()) { cleanupActivityStorage(); return }
    void connectActivity(userId)
    const wake = () => { foregroundActivity(); void refreshConsent(userId); void flushActivity() }
    const visibility = () => { if (document.visibilityState === "visible") wake(); else void flushActivity() }
    const hide = () => flushActivityOnHide()
    document.addEventListener("visibilitychange",visibility); window.addEventListener("focus",wake); window.addEventListener("pagehide",hide)
    const {data:{subscription}} = createClient().auth.onAuthStateChange((_event,session) => { if(session?.user.id !== userId) resetActivity() })
    // ONE key, not the queue prefix. Reacting to queue writes is what turned a
    // single tab's poll into a preference read in every other open tab.
    const storage = (e: StorageEvent) => { if(e.key === ACTIVITY_CONSENT_KEY) void refreshConsent(userId,true) }
    window.addEventListener("storage", storage)
    return () => { subscription.unsubscribe(); document.removeEventListener("visibilitychange",visibility); window.removeEventListener("focus",wake); window.removeEventListener("pagehide",hide); window.removeEventListener("storage",storage) }
  },[userId])
  useEffect(() => {
    // Only classify known route segments, never transmit paths, IDs, or queries.
    // The mount effect above deliberately records no feature_viewed of its own:
    // this one already fires on mount, and both firing was one route view
    // counted twice. Events recorded before consent answers are buffered.
    const feature = featureForPath(pathname)
    if (feature) recordActivity("feature_viewed",feature)
  },[pathname])
  return null
}

function featureForPath(pathname:string): Feature | undefined {
  const segment = pathname.split("/")[2] || "trips"
  const map: Record<string,Feature> = {discover:"discover",inspire:"inspire",saved:"backpocket",backpocket:"backpocket",trip:"trips",trips:"trips",chat:"chat",chats:"chat",welcome:"onboarding",profile:"profile",settings:"settings"}
  return map[segment]
}
