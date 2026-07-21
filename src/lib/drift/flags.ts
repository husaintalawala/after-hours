// Country name → flag emoji (web analog of the iOS countryFlagEmoji helper).
// Compact map of names as they appear in trips.countries / steps.country;
// unknown names return null (card simply renders no flag).

const ISO: Record<string, string> = {
  "united states": "US", usa: "US", "united states of america": "US",
  "united kingdom": "GB", uk: "GB", england: "GB", scotland: "GB", wales: "GB",
  canada: "CA", mexico: "MX", brazil: "BR", argentina: "AR", chile: "CL",
  peru: "PE", colombia: "CO", ecuador: "EC", bolivia: "BO", uruguay: "UY",
  "costa rica": "CR", panama: "PA", guatemala: "GT", cuba: "CU", jamaica: "JM",
  "dominican republic": "DO", bahamas: "BS", iceland: "IS", ireland: "IE",
  france: "FR", spain: "ES", portugal: "PT", italy: "IT", germany: "DE",
  netherlands: "NL", belgium: "BE", luxembourg: "LU", switzerland: "CH",
  austria: "AT", denmark: "DK", norway: "NO", sweden: "SE", finland: "FI",
  poland: "PL", "czech republic": "CZ", czechia: "CZ", slovakia: "SK",
  hungary: "HU", romania: "RO", bulgaria: "BG", greece: "GR", croatia: "HR",
  slovenia: "SI", serbia: "RS", montenegro: "ME", albania: "AL",
  "bosnia and herzegovina": "BA", "north macedonia": "MK", estonia: "EE",
  latvia: "LV", lithuania: "LT", ukraine: "UA", turkey: "TR", türkiye: "TR",
  cyprus: "CY", malta: "MT", monaco: "MC", morocco: "MA", tunisia: "TN",
  egypt: "EG", kenya: "KE", tanzania: "TZ", "south africa": "ZA",
  ethiopia: "ET", ghana: "GH", nigeria: "NG", senegal: "SN", rwanda: "RW",
  uganda: "UG", namibia: "NA", botswana: "BW", zimbabwe: "ZW", zambia: "ZM",
  madagascar: "MG", mauritius: "MU", seychelles: "SC", israel: "IL",
  jordan: "JO", "saudi arabia": "SA", "united arab emirates": "AE", uae: "AE",
  qatar: "QA", oman: "OM", bahrain: "BH", kuwait: "KW", lebanon: "LB",
  india: "IN", pakistan: "PK", bangladesh: "BD", "sri lanka": "LK",
  nepal: "NP", bhutan: "BT", maldives: "MV", china: "CN", japan: "JP",
  "south korea": "KR", korea: "KR", taiwan: "TW", "hong kong": "HK",
  macau: "MO", mongolia: "MN", thailand: "TH", vietnam: "VN", cambodia: "KH",
  laos: "LA", myanmar: "MM", malaysia: "MY", singapore: "SG", indonesia: "ID",
  philippines: "PH", brunei: "BN", australia: "AU", "new zealand": "NZ",
  fiji: "FJ", "papua new guinea": "PG", russia: "RU", georgia: "GE",
  armenia: "AM", azerbaijan: "AZ", kazakhstan: "KZ", uzbekistan: "UZ",
  kyrgyzstan: "KG", tajikistan: "TJ",
}

export function countryFlagEmoji(country: string | null | undefined): string | null {
  if (!country) return null
  const code = ISO[country.trim().toLowerCase()]
  if (!code) return null
  // Regional indicator symbols: 'A' (65) → 0x1F1E6.
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65))
  )
}
