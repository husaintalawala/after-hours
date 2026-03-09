// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY DATA — Edit this file to update your sabbatical content
// ═══════════════════════════════════════════════════════════════════════════

export interface Chapter {
  id: number
  title: string
  subtitle: string
  dates: string
  coordinates: { lat: number; lng: number }
  color?: string
  photos: string[]
  videos: { src: string; start?: number; end?: number; caption?: string }[]
  highlights: string[]
  description?: string
  stats?: { label: string; value: string }[]
  isPeak?: boolean
  peakLabel?: string
}

export interface JourneyConfig {
  title: string
  subtitle: string
  dateRange: string
  stats: { label: string; value: string }[]
  chapters: Chapter[]
}

// ═══════════════════════════════════════════════════════════════════════════
// YOUR JOURNEY — Edit the chapters array below
// ═══════════════════════════════════════════════════════════════════════════

export const journey: JourneyConfig = {
  title: "SABBATICAL",
  subtitle: "'25–26",
  dateRange: "October 31, 2025 — January 27, 2026",
  
  stats: [
    { label: "Days", value: "89" },
    { label: "Countries", value: "10" },
    { label: "Miles", value: "40K+" },
    { label: "Highest", value: "17,598 ft" },
  ],

  chapters: [
    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER I: LONDON
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 1,
      title: "London",
      subtitle: "Kensington · Notting Hill · Leavesden",
      dates: "Oct 31 – Nov 6",
      coordinates: { lat: 51.5074, lng: -0.1278 },
      photos: [
        // Add your photo filenames here
        // "london-borough-market.jpg",
        // "london-warner-bros.jpg",
      ],
      videos: [
        // { src: "YOUTUBE_VIDEO_ID", start: 0, end: 3, caption: "Walking through Borough Market" },
      ],
      highlights: [
        "Borough Market",
        "Warner Bros. Studio",
        "Wimbledon",
        "Portobello Road",
      ],
      description: "Arrives Heathrow 2:03 PM. First stop: Kensington.",
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER II: KATHMANDU
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 2,
      title: "Kathmandu",
      subtitle: "Thamel · Gear up · Lukla",
      dates: "Nov 7–9",
      coordinates: { lat: 27.7172, lng: 85.324 },
      photos: [],
      videos: [],
      highlights: [
        "Garden of Dreams",
        "Thamel gear shops",
        "Tenzing-Hillary Airport",
      ],
      description: "4:53 AM departure. Runway ends at a cliff.",
      stats: [
        { label: "Elevation", value: "9,383 ft" },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER III: EVEREST BASE CAMP (PEAK MOMENT)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 3,
      title: "Everest Base Camp",
      subtitle: "Khumbu Icefall · 17,598 ft",
      dates: "Nov 10–16",
      coordinates: { lat: 28.0025, lng: 86.8528 },
      isPeak: true,
      peakLabel: "⛺ Highest Point",
      photos: [],
      videos: [
        // { src: "VIDEO_ID", start: 19, end: 22, caption: "Walking through Namche" },
      ],
      highlights: [
        "Namche Bazaar",
        "Tengboche Monastery",
        "Khumbu Glacier",
        "Helicopter out",
      ],
      description: "7 days trekking. Lukla → Namche → Tengboche → Dingboche → Lobuche → EBC.",
      stats: [
        { label: "Summit", value: "17,598 ft" },
        { label: "Oxygen", value: "~60%" },
        { label: "Trek Days", value: "7" },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER IV: COMING DOWN
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 4,
      title: "Coming Down",
      subtitle: "Lukla → Kathmandu → Mumbai",
      dates: "Nov 17–18",
      coordinates: { lat: 27.7172, lng: 85.324 },
      photos: [],
      videos: [],
      highlights: [
        "Swayambhunath (Monkey Temple)",
        "Flight to Delhi",
        "Onward to Mumbai",
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER V: MUMBAI
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 5,
      title: "Mumbai",
      subtitle: "Fort, South Mumbai",
      dates: "Nov 18–21",
      coordinates: { lat: 18.9388, lng: 72.8354 },
      photos: [],
      videos: [],
      highlights: [
        "Gover Mansion",
        "Mint Road",
        "Family home",
      ],
      description: "First stay. Family time in South Mumbai.",
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER VI: HONG KONG
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 6,
      title: "Hong Kong",
      subtitle: "Kowloon · Victoria Peak · Lantau",
      dates: "Nov 21–24",
      coordinates: { lat: 22.3193, lng: 114.1694 },
      photos: [],
      videos: [],
      highlights: [
        "Victoria Peak",
        "Kowloon",
        "Lantau Island",
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER VII: JAPAN
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 7,
      title: "Japan",
      subtitle: "Tokyo · Kyoto · Kanazawa · Osaka · Hiroshima",
      dates: "Nov 24 – Dec 9",
      coordinates: { lat: 35.6762, lng: 139.6503 },
      photos: [],
      videos: [],
      highlights: [
        "Shibuya Crossing",
        "Fushimi-Inari Taisha",
        "Kenroku-en",
        "Peace Memorial",
      ],
      description: "Two weeks across Japan. Shinkansen adventures.",
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER VIII: HAKUBA (PEAK MOMENT)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 8,
      title: "Hakuba",
      subtitle: "Happo-One · Japan Alps",
      dates: "Dec 6–7",
      coordinates: { lat: 36.6983, lng: 137.8619 },
      isPeak: true,
      peakLabel: "🏔 Snowboarding",
      photos: [],
      videos: [],
      highlights: [
        "Happo-One Resort",
        "Japan Alps",
        "Powder days",
      ],
      description: "Two days on the mountain. Nagano Prefecture.",
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER IX: THAILAND
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 9,
      title: "Thailand",
      subtitle: "Bangkok · Phuket",
      dates: "Dec 10–15",
      coordinates: { lat: 13.7563, lng: 100.5018 },
      photos: [],
      videos: [],
      highlights: [
        "Grand Palace",
        "Chatuchak Market",
        "Phi Phi Islands",
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER X: KUALA LUMPUR
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 10,
      title: "Kuala Lumpur",
      subtitle: "Petronas · Batu Caves",
      dates: "Dec 16–18",
      coordinates: { lat: 3.139, lng: 101.6869 },
      photos: [],
      videos: [],
      highlights: [
        "Petronas Towers",
        "Batu Caves",
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER XI: INDIA RETURN
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 11,
      title: "India",
      subtitle: "Mumbai · Mandsaur · Neemuch · Lonavala",
      dates: "Dec 19–30",
      coordinates: { lat: 18.9388, lng: 72.8354 },
      photos: [],
      videos: [],
      highlights: [
        "Family visits",
        "Mandsaur",
        "Neemuch",
        "Lonavala",
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER XII: BALI
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 12,
      title: "Bali",
      subtitle: "Ubud · Seminyak · New Year's Eve",
      dates: "Dec 31 – Jan 7",
      coordinates: { lat: -8.4095, lng: 115.1889 },
      photos: [],
      videos: [],
      highlights: [
        "New Year's Eve",
        "Ubud",
        "Seminyak",
      ],
      description: "Then the longest flight: 8,167 miles to Madrid.",
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER XIII: SPAIN
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 13,
      title: "Spain",
      subtitle: "Madrid · Sevilla · Málaga · Ronda · Granada",
      dates: "Jan 8–16",
      coordinates: { lat: 40.4168, lng: -3.7038 },
      photos: [],
      videos: [],
      highlights: [
        "Museo del Prado",
        "Catedral de Sevilla",
        "Ronda",
        "Alhambra",
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER XIV: POSITANO (PEAK MOMENT)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 14,
      title: "Positano",
      subtitle: "Amalfi Coast",
      dates: "Jan 18–20",
      coordinates: { lat: 40.6281, lng: 14.485 },
      isPeak: true,
      peakLabel: "🌊 Amalfi Coast",
      photos: [],
      videos: [],
      highlights: [
        "Positano",
        "Sorrento",
        "No roads worth speaking of",
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER XV: POMPEII
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 15,
      title: "Pompeii",
      subtitle: "Villa dei Misteri · 79 CE",
      dates: "Jan 21",
      coordinates: { lat: 40.7462, lng: 14.4989 },
      isPeak: true,
      peakLabel: "🏛 Ancient Ruins",
      photos: [],
      videos: [],
      highlights: [
        "Pompeii Scavi",
        "Villa dei Misteri",
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER XVI: ROMA
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 16,
      title: "Roma",
      subtitle: "Baths of Caracalla",
      dates: "Jan 22",
      coordinates: { lat: 41.9028, lng: 12.4964 },
      photos: [],
      videos: [],
      highlights: [
        "Baths of Caracalla",
        "Caffè Antica Roma",
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // CHAPTER XVII: HOME
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 17,
      title: "London → New York",
      subtitle: "Temple · South Kensington · JFK · home",
      dates: "Jan 24–27",
      coordinates: { lat: 40.7128, lng: -74.006 },
      photos: [],
      videos: [],
      highlights: [
        "Hamilton House",
        "South Kensington",
        "LHR → JFK",
        "Day 89",
      ],
      description: "Sabbatical ends. Home.",
    },
  ],
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE CONFIGURATION — Flight paths between cities
// ═══════════════════════════════════════════════════════════════════════════

export const flights = [
  { from: "New York", to: "London", miles: 3453 },
  { from: "London", to: "Kathmandu", miles: 4570 },
  { from: "Mumbai", to: "Hong Kong", miles: 1785 },
  { from: "Hong Kong", to: "Tokyo", miles: 1805 },
  { from: "Okinawa", to: "Bangkok", miles: 2880 },
  { from: "Kuala Lumpur", to: "Bali", miles: 1200 },
  { from: "Bali", to: "Madrid", miles: 8167 },
  { from: "Madrid", to: "Naples", miles: 897 },
  { from: "Rome", to: "London", miles: 890 },
  { from: "London", to: "New York", miles: 3453 },
]

// Origin point (New York)
export const origin = { lat: 40.7128, lng: -74.006 }
