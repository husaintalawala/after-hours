// Where the ad pixel may load without asking first.
//
// An ad pixel is not strictly necessary for the site to work, so under GDPR and
// the ePrivacy Directive it needs prior consent in the EEA and the UK — and this
// app has no consent banner. Until it does, the honest position is not to load
// the pixel for those visitors at all. That is what this file decides.
//
// AN ALLOW-LIST, NOT A DENY-LIST, and that shape is the whole point.
//
// This started as a deny-list of consent-required countries, which was wrong in
// a way that is worth recording. A deny-list over ~250 ISO codes fails OPEN for
// every code the author did not think of, which is the exact opposite of the
// fail-closed rule this file claims to follow. It let the pixel load for
// Réunion, Guadeloupe, Martinique, French Guiana, Mayotte, Saint-Martin and
// Åland — all EU territory where GDPR applies in full, and all of which carry
// their OWN ISO 3166-1 code rather than reporting as FR or FI. MaxMind, which is
// what Vercel's edge geo is derived from, returns "RE" for a Réunion IP, not
// "FR". Roughly 2.2 million EU residents, waved through by a gate built to stop
// exactly that.
//
// Enumerating territories more carefully would not have fixed the shape: the
// next unlisted code, or the next one ISO assigns, would fail open again. So the
// default is now NO, and a market becomes eligible only by being named here.
//
// ADDING A MARKET IS A DELIBERATE ACT. Check that country's law on prior consent
// for advertising cookies before adding it. "We want to advertise there" is not
// the same question as "may we load a pixel there without asking".
//
// FAIL CLOSED. An unknown, malformed or unlisted country means no pixel. This is
// why the pixel does not fire on localhost: there is no geo header in local dev.
// Vercel supplies one on preview and production deployments.
//
// This is a geography gate, NOT a consent mechanism. It keeps the pixel away
// from people whose law requires asking; it does not ask anybody. If Drift later
// wants EEA/UK ad traffic, the answer is a consent banner.

/**
 * ISO 3166-1 alpha-2 codes where the ad pixel may load, and until when.
 *
 * Deliberately short. Everything not named here — including every country not
 * yet considered — is blocked by default.
 *
 * `until` is a hard expiry in ISO date form: past it, the country blocks again.
 * It exists because "allowed today, illegal on a known future date" is a real
 * situation and a comment does not enforce itself. A market whose consent law
 * commences later belongs here with the commencement date, not in a TODO.
 */
export const AD_ALLOWED_COUNTRIES: ReadonlyMap<string, { until?: string; note: string }> =
  new Map([
    ["US", { note: "United States — no prior-consent requirement for ad cookies at federal level" }],
    ["CA", { note: "Canada" }],
    ["AU", { note: "Australia" }],
    ["NZ", { note: "New Zealand" }],

    // India — added 2026-09-06 on request, and it EXPIRES.
    //
    // The DPDP Act 2023's rules were notified on 2025-11-13, but the substantive
    // provisions — notice, consent, data-principal rights — commence on
    // 2026-05-13 + 18 months = 2027-05-13. Until then the consent obligation is
    // not yet in force, so loading the pixel is defensible today.
    //
    // On 2027-05-13 that stops being true, and this entry stops allowing it. If
    // India still matters then, the answer is a consent banner, not a later date.
    ["IN", { until: "2027-05-13", note: "India — DPDP Act consent provisions commence 2027-05-13" }],

    // UAE — added 2026-09-06 on request, KNOWINGLY, and it expires sooner.
    //
    // ⚠️ TWO LIVE RISKS, both accepted deliberately rather than overlooked:
    //
    // 1. DIFC AND ADGM ARE ALREADY ENFORCEABLE, AND GEO-IP CANNOT SEE THEM. The
    //    DIFC Data Protection Law No. 5 of 2020 has been enforceable since
    //    2020-10-01 and is GDPR-aligned; ADGM's regulations likewise. A country
    //    lookup returns "AE" for the whole federation, so a visitor sitting in
    //    DIFC is indistinguishable here from one in the rest of Dubai. Allowing
    //    AE therefore allows those zones too, and nothing in this file can
    //    separate them.
    // 2. The federal PDPL (Decree-Law 45/2021) requires compliance by
    //    2027-01-01, which is close.
    //
    // Expiry is set to the federal date. Revisit before then; a consent banner
    // resolves both risks at once.
    ["AE", { until: "2027-01-01", note: "UAE — federal PDPL compliance due 2027-01-01; DIFC/ADGM already enforceable and not distinguishable by IP" }],
  ])

/**
 * A second, independent guard: codes that must NEVER be allowed, whatever the
 * allow-list says.
 *
 * Redundant while the allow-list stays short, and kept anyway — it is what stops
 * a future edit that adds "FR" to the list above from quietly becoming a GDPR
 * incident. EU 27, the non-EU EEA states, the EU territories that carry their
 * own code, the UK and its Crown dependencies, Gibraltar, and Switzerland.
 */
export const CONSENT_REQUIRED_COUNTRIES: ReadonlySet<string> = new Set([
  // EU 27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // EU territory with its own ISO code — the gap that prompted the rewrite.
  // (The Canaries, Azores and Madeira need no entry: MaxMind reports them as
  // ES and PT, which are already above.)
  "AX",                                     // Åland — Finland
  "GF", "GP", "MQ", "RE", "YT", "MF",       // French outermost regions
  // EEA, non-EU
  "IS", "LI", "NO",
  "SJ",                                     // Svalbard — Norway's GDPR reaches it
  // UK, its Crown dependencies (own but equivalent regimes), and Gibraltar
  "GB", "JE", "GG", "IM", "GI",
  // Switzerland — nFADP, close enough that treating it as consent-required is
  // the cheap and safe call
  "CH",
])

/**
 * May the ad pixel load for a visitor in `country`?
 *
 * `country` is an ISO 3166-1 alpha-2 code, or null/undefined when unknown.
 * Both guards must agree, and anything unrecognised is a no.
 */
export function adsAllowedIn(
  country: string | null | undefined,
  /** Injectable so the expiry logic is testable without waiting for 2027. */
  now: Date = new Date()
): boolean {
  if (typeof country !== "string") return false
  const code = country.trim().toUpperCase()
  // Exactly two letters, or we do not know what we are looking at. Vercel sends
  // "XX" for unknown, which fails the allow-list below in any case.
  if (!/^[A-Z]{2}$/.test(code)) return false

  const entry = AD_ALLOWED_COUNTRIES.get(code)
  if (!entry) return false

  // A market whose permission has run out blocks again, with no edit required.
  if (entry.until) {
    const expiry = Date.parse(entry.until + "T00:00:00Z")
    // An unparseable date is treated as expired: a malformed expiry must not
    // become an unlimited permission.
    if (!Number.isFinite(expiry) || now.getTime() >= expiry) return false
  }

  return !CONSENT_REQUIRED_COUNTRIES.has(code)
}
