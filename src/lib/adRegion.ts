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
 * ISO 3166-1 alpha-2 codes where the ad pixel may load.
 *
 * Deliberately short. These are markets with no prior-consent requirement for
 * advertising cookies, and they are the ones ads would actually be bought in.
 * Everything not named here — including every country not yet considered — is
 * blocked by default.
 *
 * Not included on purpose, despite being plausible ad markets: the UAE (PDPL)
 * and India (DPDP Act) both have consent regimes worth reading properly before
 * a pixel is pointed at them. Add them if you have checked; do not add them
 * because a campaign is waiting.
 */
export const AD_ALLOWED_COUNTRIES: ReadonlySet<string> = new Set([
  "US", // United States
  "CA", // Canada
  "AU", // Australia
  "NZ", // New Zealand
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
export function adsAllowedIn(country: string | null | undefined): boolean {
  if (typeof country !== "string") return false
  const code = country.trim().toUpperCase()
  // Exactly two letters, or we do not know what we are looking at. Vercel sends
  // "XX" for unknown, which fails the allow-list below in any case.
  if (!/^[A-Z]{2}$/.test(code)) return false
  if (!AD_ALLOWED_COUNTRIES.has(code)) return false
  return !CONSENT_REQUIRED_COUNTRIES.has(code)
}
