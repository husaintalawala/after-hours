import { NextResponse } from "next/server"

// PostHog loader for the STATIC marketing pages (index/privacy/terms). Those are
// plain HTML served via the middleware rewrite, so they can't read NEXT_PUBLIC_*
// at runtime — this route reads the key from server env and hands back the
// loader, keeping the key in ONE place (Vercel env) rather than hardcoded into
// three HTML files. A phc_ key is a *public* client key; shipping it in
// client-served JS is by design. Same domain as /app → the distinct_id carries
// straight into the React app, so landing→app is one connected funnel.
//
// The React app initialises PostHog separately (components/PostHogProvider); the
// two never load together (marketing HTML has no React bundle, /app never loads
// /api/ph), so there is no double-init.
export const dynamic = "force-dynamic"

// Canonical PostHog browser snippet (stub + async loader of /static/array.js).
const SNIPPET =
  `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);`

export function GET() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
  const headers = {
    "content-type": "application/javascript; charset=utf-8",
    // Short edge cache to shield PostHog under a traffic spike; a redeploy
    // (required to pick up new env anyway) busts it immediately.
    "cache-control": "public, max-age=300, s-maxage=300",
  }
  if (!key) {
    return new NextResponse(
      "/* PostHog not configured — set NEXT_PUBLIC_POSTHOG_KEY in Vercel env + redeploy. */",
      { headers }
    )
  }
  const body =
    SNIPPET +
    `\nposthog.init(${JSON.stringify(key)},{api_host:${JSON.stringify(host)},person_profiles:'identified_only',capture_pageview:true,capture_pageleave:true});` +
    // Landing → app: any anchor into the web app is the "open the web app"/login CTA.
    `\ndocument.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href^="/app"],a[data-ph-cta]');if(a){try{posthog.capture('landing_cta_click',{href:a.getAttribute('href'),label:(a.textContent||'').trim().slice(0,40)});}catch(_){}}},true);`
  return new NextResponse(body, { headers })
}
