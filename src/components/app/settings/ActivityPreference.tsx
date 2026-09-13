"use client"
import { useEffect, useState } from "react"
import { activityAvailable, activityEnabled, activityHealth, setActivityEnabled } from "@/lib/activity"
export default function ActivityPreference() {
  const [enabled,setEnabled] = useState(false), [status,setStatus] = useState(""), [busy,setBusy] = useState(false)
  useEffect(() => { const sync = () => {setEnabled(activityEnabled());setStatus(activityHealth())}; sync(); window.addEventListener("drift-activity-change",sync); return () => window.removeEventListener("drift-activity-change",sync) },[])
  if (!activityAvailable()) return null
  return <section className="mt-6 rounded-2xl border border-aurora-border p-5">
    <label className="flex items-center justify-between gap-4"><span>Share usage to improve Drift</span><input type="checkbox" checked={enabled} disabled={busy} onChange={async e => {setBusy(true);try{await setActivityEnabled(e.target.checked)}catch{}finally{setBusy(false)}}} /></label>
    <p className="mt-2 text-sm opacity-70">Optional and off by default. Share which features you use, actions, outcomes, and timing, linked to your account. No chat or search text, locations, or URLs. History is kept for 90 days. Turning this off stops sharing and deletes this usage history. Your trips and chats are unaffected.</p>
    {status && <p role="status" className="mt-2 text-sm">{status}</p>}
  </section>
}
