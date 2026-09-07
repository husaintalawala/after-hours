// Where the ad pixel may load without asking first.
//
// An ad pixel is not strictly necessary for the site to work, so under GDPR and
// the ePrivacy Directive it needs prior consent in the EEA and the UK — and this
// app has no consent banner. Until it does, the honest position is not to load
// the pixel for those visitors at all. That is what this file decides.
//
// FAIL CLOSED. An unknown country means NO pixel. The whole point is to avoid
// tracking someone we are not allowed to track, and "we could not tell where
// they are" is not a reason to assume we may. This is why the pixel does not
// fire on localhost: there is no geo header in local dev. Vercel supplies one on
// preview and production deployments, so it works everywhere it matters.
//
// This is a geography gate, NOT a consent mechanism. It keeps the pixel away
// from people whose law requires asking; it does not ask anybody. If Drift later
// wants EEA/UK ad traffic, the answer is a consent banner, and then this list
// becomes "regions where we have not yet been given consent".

/** ISO 3166-1 alpha-2 codes where prior consent is required before an ad pixel
 *  may load. EU 27, the three non-EU EEA states, the UK and its Crown
 *  dependencies, Switzerland, and Gibraltar. */
export const CONSENT_REQUIRED_COUNTRIES: ReadonlySet<string> = new Set([
  // EU 27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // EEA, non-EU
  "IS", "LI", "NO",
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
 * Anything unrecognised is treated as unknown, and unknown means no.
 */
export function adsAllowedIn(country: string | null | undefined): boolean {
  if (typeof country !== "string") return false
  const code = country.trim().toUpperCase()
  // Exactly two letters, or we do not know what we are looking at. Vercel sends
  // "XX" for unknown, which fails this and would fail the set check anyway.
  if (!/^[A-Z]{2}$/.test(code)) return false
  if (code === "XX") return false
  return !CONSENT_REQUIRED_COUNTRIES.has(code)
}
