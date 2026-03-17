// ═══════════════════════════════════════════════════════════════════════════
// JOURNEY DATA — Edit this file to update your sabbatical content
// ═══════════════════════════════════════════════════════════════════════════

export type TagCategory = 'food' | 'culture' | 'nature' | 'adventure' | 'transit' | 'rest' | 'peak' | 'family'

export interface Transit {
  mode: 'flight' | 'train' | 'bus' | 'car' | 'ferry' | 'helicopter' | 'walk'
  from: string
  to: string
  duration?: string
  detail?: string
}

export interface DayEntry {
  day: number
  date: string
  summary: string
  tags: TagCategory[]
  transit?: Transit
  elevation?: number
  highlight?: string
}

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
  days?: DayEntry[]
}

export interface JourneyConfig {
  title: string
  subtitle: string
  dateRange: string
  stats: { label: string; value: string }[]
  chapters: Chapter[]
}

// ═══════════════════════════════════════════════════════════════════════════
// YOUR JOURNEY
// ═══════════════════════════════════════════════════════════════════════════

// Media CDN base URL — all photos and videos load from here
export const MEDIA_BASE = 'https://media.after-hours.app'

export const journey: JourneyConfig = {
  title: "SIDE QUEST",
  subtitle: "'25–26",
  dateRange: "October 31, 2025 — January 27, 2026",
  
  stats: [
    { label: "Days", value: "89" },
    { label: "Countries", value: "10" },
    { label: "Miles", value: "40K+" },
    { label: "Highest", value: "17,598 ft" },
  ],

  chapters: [
    // ── CHAPTER 01: LONDON ──
    {
      id: 1,
      title: "London",
      subtitle: "Kensington · Notting Hill · Leavesden",
      dates: "OCT 31 – NOV 6",
      coordinates: { lat: 51.4942, lng: -0.1880 },
      photos: [
      ],
      videos: [
        { src: "london/bigben_bagpipe.mp4", caption: "Big Ben · bagpipes" },
        { src: "london/bijli.mp4", caption: "Bijli" },
        { src: "london/buckingham.mp4", caption: "Buckingham Palace" },
        { src: "london/export.mp4", caption: "London" },
        { src: "london/spice_of_life.mp4", caption: "Spice of Life" },
        { src: "london/wimbledon_husain_reaction.mp4", caption: "Wimbledon reaction" },
        { src: "london/wimbledon_rashida_reaction.mp4", caption: "Wimbledon · Rashida" },
      ],
      highlights: ["Borough Market", "Warner Bros. Studio", "Wimbledon", "Portobello Road"],
      description: "Heathrow, 2:03 PM. Seven days from Kensington to Portobello Road.",
      days: [
        { day: 1, date: "Oct 31", summary: "Arrives Heathrow 2:03 PM · Kensington", tags: ["culture", "food"] },
        { day: 2, date: "Nov 1", summary: "Battersea → St James's Park → Leicester Square", tags: ["food", "culture"] },
        { day: 4, date: "Nov 3", summary: "Buckingham Palace → Mayfair", tags: ["culture", "food"] },
        { day: 5, date: "Nov 4", summary: "Warner Bros. Studio Tour · Leavesden", tags: ["culture"] },
        { day: 6, date: "Nov 5", summary: "Wimbledon → Covent Garden", tags: ["culture"] },
        { day: 7, date: "Nov 6", summary: "Portobello Road · overnight train out", tags: ["culture", "food", "transit"], transit: { mode: "train", from: "Overnight", to: "Kathmandu" } }
      ],
    },

    // ── CHAPTER 02: KATHMANDU ──
    {
      id: 2,
      title: "Kathmandu",
      subtitle: "Thamel · Gear up · Lukla",
      dates: "NOV 7–9",
      coordinates: { lat: 27.7172, lng: 85.324 },
      photos: [],
      videos: [],
      highlights: ["Garden of Dreams", "Thamel gear shops", "Tenzing-Hillary Airport"],
      description: "4:53 AM departure. The runway ends at a cliff.",
      stats: [{ label: "Elevation", value: "9,383 ft" }],
      days: [
        { day: 8, date: "Nov 7", summary: "Arrives Kathmandu", tags: ["culture"] },
        { day: 9, date: "Nov 8", summary: "Gear day · Thamel", tags: ["food", "culture"] },
        { day: 10, date: "Nov 9", summary: "4:53 AM → Lukla", tags: ["transit", "culture", "adventure"], transit: { mode: "car", from: "—", to: "—", duration: "2 hr 57 min" }, elevation: 9383 }
      ],
    },

    // ── CHAPTER 03: EVEREST BASE CAMP ──
    {
      id: 3,
      title: "Everest Base Camp",
      subtitle: "Khumbu Icefall · 17,598 ft",
      dates: "NOV 10–16",
      coordinates: { lat: 28.0025, lng: 86.8528 },
      photos: [],
      videos: [],
      highlights: ["Namche Bazaar", "Tengboche Monastery", "Khumbu Glacier", "Helicopter out"],
      description: "7 days trekking. Lukla → Namche → Tengboche → Dingboche → Lobuche → EBC.",
      stats: [{ label: "Summit", value: "17,598 ft" }, { label: "Oxygen", value: "~60%" }, { label: "Trek Days", value: "7" }],
      isPeak: true,
      peakLabel: "⛺ Highest Point",
      days: [
        { day: 11, date: "Nov 10", summary: "Lukla → Phakding → Namche Bazaar · 11,286 ft", tags: ["culture", "food"], elevation: 11286 },
        { day: 12, date: "Nov 11", summary: "Namche Bazaar · acclimatisation rest day", tags: ["adventure", "rest"], elevation: 11286 },
        { day: 13, date: "Nov 12–13", summary: "Namche → Tengboche → Dingboche · 14,470 ft", tags: ["culture"], elevation: 14470 },
        { day: 15, date: "Nov 14", summary: "Dingboche · second acclimatisation day", tags: ["food", "adventure", "rest"], elevation: 14470 },
        { day: 16, date: "Nov 15", summary: "Dingboche → Lobuche · Khumbu Glacier moraine · 16,175 ft", tags: ["adventure", "culture"], elevation: 16175 },
        { day: 17, date: "Nov 16", summary: "🏔 Lobuche → Gorakshep → Everest Base Camp · 17,598 ft", tags: ["culture", "peak", "transit", "adventure"], transit: { mode: "helicopter", from: "Gorakshep", to: "Lukla" }, elevation: 17598, highlight: "Peak" }
      ],
    },

    // ── CHAPTER 04: COMING DOWN ──
    {
      id: 4,
      title: "Coming Down",
      subtitle: "Lukla → Kathmandu → Mumbai",
      dates: "NOV 17–18",
      coordinates: { lat: 27.7172, lng: 85.324 },
      photos: [],
      videos: [],
      highlights: ["Swayambhunath", "Flight to Delhi", "Onward to Mumbai"],
      days: [
        { day: 18, date: "Nov 17", summary: "Morning flight to Kathmandu · Arya Hotel · Swayambhunath", tags: ["transit", "culture"], transit: { mode: "flight", from: "Lukla", to: "Tribhuvan Intl" } },
        { day: 19, date: "Nov 18", summary: "KTM → Delhi → Mumbai", tags: ["transit", "culture"], transit: { mode: "flight", from: "Delhi", to: "Mumbai", duration: "7 hr 6 min" } }
      ],
    },

    // ── CHAPTER 05: MUMBAI ──
    {
      id: 5,
      title: "Mumbai",
      subtitle: "Fort, South Mumbai",
      dates: "NOV 18–21",
      coordinates: { lat: 18.9340, lng: 72.8372 },
      photos: [],
      videos: [],
      highlights: ["Gover Mansion", "Mint Road", "Family home"],
      days: [
        { day: 19, date: "Nov 18–20", summary: "Gover Mansion · family home · Fort", tags: ["culture", "family"] },
        { day: 22, date: "Nov 21", summary: "Home → Mumbai Airport · straight from Gover Mansion", tags: ["culture", "transit", "family"], transit: { mode: "flight", from: "—", to: "—" } }
      ],
    },

    // ── CHAPTER 06: HONG KONG ──
    {
      id: 6,
      title: "Hong Kong",
      subtitle: "24 hours · Central → TST",
      dates: "NOV 22",
      coordinates: { lat: 22.2988, lng: 114.1722 },
      photos: [],
      videos: [],
      highlights: ["Victoria Peak", "Star Ferry", "Tsim Sha Tsui"],
      days: [
        { day: 23, date: "Nov 22", summary: "Central → Tsim Sha Tsui → Victoria Peak", tags: ["culture"] }
      ],
    },

    // ── CHAPTER 07: TOKYO ──
    {
      id: 7,
      title: "Tokyo",
      subtitle: "Komagome · Shibuya · Mt. Fuji",
      dates: "NOV 23–27",
      coordinates: { lat: 35.7364, lng: 139.7468 },
      photos: [],
      videos: [],
      highlights: ["Komagome", "Shibuya", "Lake Kawaguchi", "Mt. Fuji"],
      description: "Five days. Ramen at midnight, shrines at dawn, Fuji by bicycle.",
      days: [
        { day: 24, date: "Nov 23", summary: "Haneda → Komagome · base", tags: ["culture", "food"] },
        { day: 25, date: "Nov 24", summary: "Harajuku → Shibuya", tags: ["food"] },
        { day: 26, date: "Nov 25", summary: "Tsukiji → Azabu-Juban", tags: ["culture", "food"] },
        { day: 27, date: "Nov 26", summary: "Lake Kawaguchi · Mt. Fuji · cycling", tags: ["transit", "culture", "adventure", "nature"], transit: { mode: "train", from: "Shinjuku", to: "Kawaguchiko Station" }, elevation: 3041 },
        { day: 28, date: "Nov 27", summary: "Shibuya → overnight to Kyoto", tags: ["food", "transit"], transit: { mode: "train", from: "5 hr 48 min overnight", to: "Kyoto", duration: "5 hr 48 min" } }
      ],
    },

    // ── CHAPTER 08: KYOTO + KANAZAWA ──
    {
      id: 8,
      title: "Kyoto + Kanazawa",
      subtitle: "Fushimi Inari · Pontocho · Omicho Market",
      dates: "NOV 28–30",
      coordinates: { lat: 34.9671, lng: 135.7727 },
      photos: [],
      videos: [],
      highlights: ["Fushimi Inari", "Pontocho", "Omicho Market"],
      days: [
        { day: 29, date: "Nov 28", summary: "Arrives 1:24 AM · Fushimi Inari → Pontocho", tags: ["culture"] },
        { day: 30, date: "Nov 29", summary: "Kyoto → Kanazawa", tags: ["food", "transit", "culture"], transit: { mode: "train", from: "2 hr 43 min", to: "Kanazawa", duration: "2 hr 43 min" } },
        { day: 31, date: "Nov 30", summary: "Kanazawa → Osaka", tags: ["culture", "transit"], transit: { mode: "train", from: "2 hr 52 min", to: "Osaka", duration: "2 hr 52 min" } }
      ],
    },

    // ── CHAPTER 09: OSAKA + HIROSHIMA ──
    {
      id: 9,
      title: "Osaka + Hiroshima",
      subtitle: "Shinsaibashi · Miyakojima · Hakuba",
      dates: "DEC 1–7",
      coordinates: { lat: 34.6723, lng: 135.5023 },
      photos: [],
      videos: [],
      highlights: ["Hiroshima Peace Memorial", "Miyakojima", "Hakuba Happo-One"],
      isPeak: true,
      peakLabel: "🏔 Snowboarding",
      days: [
        { day: 32, date: "Dec 1", summary: "Osaka · Shinsaibashi", tags: ["food"] },
        { day: 33, date: "Dec 2", summary: "Hiroshima", tags: ["transit", "culture"], transit: { mode: "train", from: "—", to: "—" } },
        { day: 35, date: "Dec 4–5", summary: "Miyakojima · Okinawa · coral coast", tags: ["culture", "nature"] },
        { day: 37, date: "Dec 6–7", summary: "Miyako → Hakuba · snowboarding · onsen", tags: ["transit", "culture", "food", "adventure"], transit: { mode: "flight", from: "Miyako", to: "Osaka" } }
      ],
    },

    // ── CHAPTER 10: BANGKOK · PHUKET · KL ──
    {
      id: 10,
      title: "Bangkok · Phuket · KL",
      subtitle: "Sathorn · Asiatique · Kata Beach · KL Eco City",
      dates: "DEC 8–15",
      coordinates: { lat: 13.7225, lng: 100.5290 },
      photos: [],
      videos: [],
      highlights: ["Asiatique", "Kata Beach", "Kuala Lumpur"],
      days: [
        { day: 39, date: "Dec 8–10", summary: "Bangkok · Sathorn · Khlong Toei · Asiatique", tags: ["culture", "food"] },
        { day: 42, date: "Dec 11–12", summary: "Phuket · Kata Beach · Karon", tags: ["culture", "food", "nature"] },
        { day: 44, date: "Dec 13–15", summary: "Kuala Lumpur", tags: ["transit", "culture"], transit: { mode: "flight", from: "KUL", to: "Mumbai", duration: "15 hr 25 min" } }
      ],
    },

    // ── CHAPTER 11: MUMBAI ──
    {
      id: 11,
      title: "Mumbai II",
      subtitle: "Fort · Kala Ghoda · Lonavala",
      dates: "DEC 16–31",
      coordinates: { lat: 18.9388, lng: 72.8354 },
      photos: [],
      videos: [],
      highlights: ["Gover Mansion", "Kala Ghoda", "Lonavala"],
      days: [
        { day: 47, date: "Dec 16", summary: "12:09 AM arrival · home at Gover Mansion · Fort", tags: ["culture", "food", "family"] },
        { day: 54, date: "Dec 23", summary: "Kala Ghoda afternoon", tags: ["food", "culture"] },
        { day: 59, date: "Dec 28–29", summary: "Lonavala · cousins weekend · Sahyadri hills", tags: ["transit", "adventure", "culture", "peak", "family"], transit: { mode: "bus", from: "Mumbai", to: "Lonavala" }, elevation: 2041 },
        { day: 62, date: "Dec 31", summary: "New Year's Eve · home at Fort", tags: ["culture", "family"] }
      ],
    },

    // ── CHAPTER 12: THE MP RUN ──
    {
      id: 12,
      title: "The MP Run",
      subtitle: "Indore → Mandsaur → Neemuch → Ratlam",
      dates: "DEC 24–27",
      coordinates: { lat: 24.0723, lng: 75.3975 },
      photos: [],
      videos: [],
      highlights: ["Mandsaur", "Neemuch", "Rajdhani Express"],
      days: [
        { day: 56, date: "Dec 25", summary: "Mandsaur · Mama's family · close cousin", tags: ["culture", "family"] },
        { day: 57, date: "Dec 26", summary: "Mandsaur → Neemuch · Chacha's family · then the overnight train home", tags: ["transit", "culture", "food", "family"], transit: { mode: "train", from: "Cab Neemuch", to: "Ratlam" } },
        { day: 58, date: "Dec 27", summary: "Back in Mumbai · Rajdhani arrives · CSMT evening", tags: ["transit", "culture"], transit: { mode: "train", from: "—", to: "—" } }
      ],
    },

    // ── CHAPTER 13: BALI ──
    {
      id: 13,
      title: "Bali",
      subtitle: "Ubud · Tegallalang · Uluwatu · Lovina",
      dates: "JAN 2–7",
      coordinates: { lat: -8.5069, lng: 115.2625 },
      photos: [],
      videos: [],
      highlights: ["Monkey Forest", "Tegallalang", "Uluwatu", "Lovina"],
      description: "Rice terraces, cliff temples, coral reefs. Then the longest flight\u20148,167 miles to Madrid.",
      days: [
        { day: 64, date: "Jan 2", summary: "Arrives Bali · Ubud · Monkey Forest", tags: ["food", "culture", "nature"] },
        { day: 65, date: "Jan 3", summary: "Full Ubud day · 12 visits", tags: ["food", "culture"] },
        { day: 66, date: "Jan 4", summary: "Tegallalang · rice terraces · coffee · swing", tags: ["culture", "food"] },
        { day: 67, date: "Jan 5", summary: "Pura Tirta Empul → Uluwatu coast", tags: ["culture", "food", "nature"] },
        { day: 68, date: "Jan 6–7", summary: "North Bali → departure", tags: ["culture", "transit"], transit: { mode: "flight", from: "—", to: "—", duration: "34 min" } }
      ],
    },

    // ── CHAPTER 14: ESPAÑA ──
    {
      id: 14,
      title: "Spain",
      subtitle: "Madrid · Sevilla · Málaga · Ronda · Granada",
      dates: "JAN 8–16",
      coordinates: { lat: 40.4169, lng: -3.7035 },
      photos: [],
      videos: [],
      highlights: ["Museo del Prado", "Catedral de Sevilla", "Ronda", "Alhambra"],
      days: [
        { day: 70, date: "Jan 8", summary: "Touchdown — Barajas T4 into Centro", tags: ["transit", "culture", "food"], transit: { mode: "bus", from: "Bus T4", to: "Centro", duration: "33 min" } },
        { day: 71, date: "Jan 9", summary: "Madrid on foot — Gran Vía to the Prado · then the AVE south", tags: ["transit", "food", "culture", "peak"], transit: { mode: "train", from: "AVE Madrid", to: "Sevilla", duration: "2 hr 50 min" }, highlight: "Museo Nacional del Prado" },
        { day: 72, date: "Jan 10", summary: "Slow Saturday · Casco Antiguo", tags: ["food"] },
        { day: 73, date: "Jan 11", summary: "La Catedral · La Giralda · overnight transit south", tags: ["transit", "peak"], transit: { mode: "train", from: "—", to: "—", duration: "16 hr 25 min" }, highlight: "La Giralda" },
        { day: 74, date: "Jan 12", summary: "Arriving Málaga · Merced Premium base", tags: ["transit", "food", "culture"], transit: { mode: "train", from: "—", to: "—" } },
        { day: 75, date: "Jan 13", summary: "Day trip to Ronda · the gorge · the old bridge", tags: ["peak", "food", "nature"], highlight: "Puente Viejo · Ronda" },
        { day: 76, date: "Jan 14", summary: "Málaga — waterfront · Alcazaba rooftop at night", tags: ["culture", "peak", "food"], highlight: "Alcazaba Premium Hotel" },
        { day: 77, date: "Jan 15", summary: "Málaga → Granada · foot of the Alhambra", tags: ["transit", "culture", "food"], transit: { mode: "car", from: "—", to: "—", duration: "1 hr 22 min" } },
        { day: 78, date: "Jan 16", summary: "Granada morning · AVE back to Madrid", tags: ["transit", "food", "culture"], transit: { mode: "train", from: "a Zambrano", to: "Atocha", duration: "2 hr 43 min" } }
      ],
    },

    // ── CHAPTER 15: POSITANO ──
    {
      id: 15,
      title: "Positano",
      subtitle: "Amalfi Coast",
      dates: "JAN 17–20",
      coordinates: { lat: 40.6281, lng: 14.4840 },
      photos: [],
      videos: [],
      highlights: ["Positano", "Amalfi Coast", "Circumvesuviana"],
      isPeak: true,
      peakLabel: "🌊 Amalfi Coast",
      days: [
        { day: 79, date: "Jan 17", summary: "Late Madrid · late-night Napoli", tags: ["transit", "food", "culture"], transit: { mode: "flight", from: "MAD", to: "NAP" } },
        { day: 80, date: "Jan 18", summary: "Train down to the Amalfi Coast", tags: ["transit", "peak", "food", "nature"], transit: { mode: "train", from: "—", to: "—", duration: "6 hr 18 min" }, highlight: "Positano (Chiesa Nuova)" },
        { day: 81, date: "Jan 19", summary: "Positano · all walking · nowhere to drive", tags: ["food", "culture"] },
        { day: 82, date: "Jan 20", summary: "Last morning in Positano", tags: ["culture", "food"] }
      ],
    },

    // ── CHAPTER 16: ROMA ──
    {
      id: 16,
      title: "Roma",
      subtitle: "Pompei · Sorrento · Baths of Caracalla",
      dates: "JAN 21–22",
      coordinates: { lat: 41.8792, lng: 12.4924 },
      photos: [],
      videos: [],
      highlights: ["Pompei Scavi", "Baths of Caracalla", "Sorrento"],
      isPeak: true,
      peakLabel: "🏛 Ancient Ruins",
      days: [
        { day: 83, date: "Jan 21", summary: "Positano → Sorrento → Pompei · then into Roma", tags: ["transit", "peak", "food"], transit: { mode: "train", from: "Train Pompei", to: "Roma", duration: "4 hr 12 min" }, highlight: "Pompei Scavi Villa dei Misteri" },
        { day: 84, date: "Jan 22", summary: "Roma morning · Baths of Caracalla · back to Madrid", tags: ["transit", "food", "peak", "culture"], transit: { mode: "train", from: "Roma", to: "Madrid Barajas", duration: "4 hr 13 min" }, highlight: "Baths of Caracalla" },
        { day: 85, date: "Jan 23", summary: "Last Madrid afternoon · Sol · overnight to London", tags: ["transit", "food", "culture"], transit: { mode: "train", from: "—", to: "—", duration: "5 hr 45 min" } }
      ],
    },

    // ── CHAPTER 17: LONDON → NEW YORK ──
    {
      id: 17,
      title: "London → New York",
      subtitle: "Temple · South Kensington · JFK · home",
      dates: "JAN 24–27",
      coordinates: { lat: 40.7484, lng: -73.9856 },
      photos: [],
      videos: [],
      highlights: ["Hamilton House", "South Kensington", "LHR → JFK", "Day 89"],
      description: "Eighty-nine days. Ten countries. Home.",
      days: [
        { day: 86, date: "Jan 24", summary: "Arrives London 12:27 AM · Hamilton House, Temple EC4Y", tags: ["transit", "culture"], transit: { mode: "train", from: "—", to: "—", duration: "2 hr 12 min" } },
        { day: 87, date: "Jan 25", summary: "South Kensington · sister-in-law's family · Sakurado", tags: ["culture", "food", "family"] },
        { day: 88, date: "Jan 26", summary: "South Kensington · Bentley Hotel", tags: ["transit", "culture"], transit: { mode: "train", from: "—", to: "—", duration: "1 hr 6 min" } },
        { day: 89, date: "Jan 27", summary: "🏠 Departure · LHR → JFK · New York · home", tags: ["transit", "culture", "food", "family"], transit: { mode: "train", from: "Subway JFK", to: "Manhattan", duration: "1 hr 58 min" }, highlight: "Home" }
      ],
    },

  ],
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE CONFIGURATION — Flight paths between cities
// ═══════════════════════════════════════════════════════════════════════════

export const flights = [
  { from: "New York", to: "London", miles: 3453 },
  { from: "London", to: "Kathmandu", miles: 4570 },
  { from: "Mumbai", to: "Hong Kong", miles: 2655 },
  { from: "Hong Kong", to: "Tokyo", miles: 1792 },
  { from: "Okinawa", to: "Bangkok", miles: 2880 },
  { from: "Kuala Lumpur", to: "Mumbai", miles: 2241 },
  { from: "Mumbai", to: "Bali", miles: 3463 },
  { from: "Bali", to: "Madrid", miles: 8167 },
  { from: "Madrid", to: "Naples", miles: 897 },
  { from: "Rome", to: "London", miles: 890 },
  { from: "London", to: "New York", miles: 3453 },
]

// Origin point (New York)
export const origin = { lat: 40.7128, lng: -74.006 }
