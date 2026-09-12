// THE LIVE SHELF, FROZEN — 90 active guides as of 2026-09-12, in shelf order
// (rank DESC, trip_id ASC), which is the ranker's final tie-break.
//
// WHY A FIXTURE AND NOT A QUERY. The golden set below it asserts that a reader
// who picks "Islands & beaches" is never shown a Highland rail journey. That
// assertion is worthless if it depends on a network call, and worse than
// worthless if it silently passes when the query fails.
//
// WHY IT IS FROZEN RATHER THAN REGENERATED. This corpus grew from 38 rows to 90
// with no code change, and the answer to every survey question changed with it —
// that growth is exactly how the reported bug arrived, since the two guides that
// caused it both came from the 50-guide batch seeded on 2026-09-10. A fixture
// that regenerates itself would have moved silently in the same way.
//
// REFRESH IT DELIBERATELY, as its own commit, when the corpus changes — and read
// the golden-set diff as the review, because that diff is the recommender's
// behaviour changing.

export const SHELF_FIXTURE = [
  {
    "slug": "argentina-north-to-south",
    "title": "Argentina North to South",
    "tags": [
      "wild",
      "high",
      "eat"
    ],
    "interests": [
      "road_trip",
      "nature_wildlife",
      "mountains_hiking",
      "food_drink"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "food_local"
    ],
    "setting": [
      "mountains",
      "desert",
      "countryside"
    ],
    "cityCount": 6,
    "bestMonths": [
      3,
      11,
      12,
      1,
      2
    ],
    "party": "couple",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 16
  },
  {
    "slug": "alaska-railroad-with-teenagers",
    "title": "Alaska by Rail with Teenagers",
    "tags": [
      "wild",
      "drive",
      "islands"
    ],
    "interests": [
      "nature_wildlife",
      "mountains_hiking",
      "road_trip",
      "islands_beaches"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "must_sees"
    ],
    "setting": [
      "mountains",
      "arctic"
    ],
    "cityCount": 7,
    "bestMonths": [
      6,
      7,
      8
    ],
    "party": "family",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 14
  },
  {
    "slug": "big-island-belt-road-with-kids",
    "title": "Big Island Belt Road with Kids",
    "tags": [
      "islands",
      "wild",
      "drive"
    ],
    "interests": [
      "islands_beaches",
      "nature_wildlife",
      "road_trip"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "beach_relax"
    ],
    "setting": [
      "islands",
      "beach",
      "mountains"
    ],
    "cityCount": 3,
    "bestMonths": [
      2,
      3,
      4,
      5,
      9,
      10
    ],
    "party": "family",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 8
  },
  {
    "slug": "tetons-yellowstone-with-kids",
    "title": "Tetons and Yellowstone with Kids",
    "tags": [
      "wild",
      "high",
      "drive"
    ],
    "interests": [
      "nature_wildlife",
      "mountains_hiking",
      "road_trip",
      "wildlife_safari"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "must_sees"
    ],
    "setting": [
      "mountains",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      6,
      7,
      8,
      9
    ],
    "party": "family",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 8
  },
  {
    "slug": "canadian-rockies-lodge-to-lodge",
    "title": "Canadian Rockies, Lodge to Lodge",
    "tags": [
      "stay",
      "high",
      "wild"
    ],
    "interests": [
      "mountains_hiking",
      "nature_wildlife",
      "one_base_slow"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "soft_luxury"
    ],
    "setting": [
      "mountains",
      "lakes",
      "countryside"
    ],
    "cityCount": 4,
    "bestMonths": [
      9,
      6,
      7
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "splurge",
    "days": 8
  },
  {
    "slug": "galapagos-small-ship-quito",
    "title": "Gal\u00e1pagos by Small Ship, via Quito",
    "tags": [
      "wild",
      "islands",
      "stay"
    ],
    "interests": [
      "wildlife_safari",
      "nature_wildlife",
      "islands_beaches"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "soft_luxury"
    ],
    "setting": [
      "islands",
      "beach"
    ],
    "cityCount": 2,
    "bestMonths": [
      12,
      1,
      2,
      3,
      4,
      5
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "splurge",
    "days": 10
  },
  {
    "slug": "bolivia-la-paz-uyuni-sucre",
    "title": "Bolivia High and Dry: La Paz, Uyuni, Sucre",
    "tags": [
      "wild",
      "high",
      "stones"
    ],
    "interests": [
      "nature_wildlife",
      "road_trip",
      "history_ruins",
      "cities_culture"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "culture_history"
    ],
    "setting": [
      "desert",
      "mountains"
    ],
    "cityCount": 3,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9
    ],
    "party": "solo",
    "pace": "full_days",
    "budget": "save",
    "days": 9
  },
  {
    "slug": "belize-caye-caulker-san-ignacio",
    "title": "Belize: Reef Days, Cave Days",
    "tags": [
      "islands",
      "stones",
      "wild"
    ],
    "interests": [
      "islands_beaches",
      "nature_wildlife",
      "history_ruins",
      "mountains_hiking"
    ],
    "optimizeFor": [
      "adventure",
      "beach_relax",
      "nature_views"
    ],
    "setting": [
      "islands",
      "beach",
      "jungle"
    ],
    "cityCount": 2,
    "bestMonths": [
      2,
      3,
      4,
      5
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 7
  },
  {
    "slug": "uruguay-coast-colonia-jose-ignacio",
    "title": "Uruguay's Coast: Colonia to Jos\u00e9 Ignacio",
    "tags": [
      "eat",
      "islands",
      "drive"
    ],
    "interests": [
      "islands_beaches",
      "food_drink",
      "road_trip",
      "one_base_slow"
    ],
    "optimizeFor": [
      "beach_relax",
      "food_local",
      "soft_luxury"
    ],
    "setting": [
      "beach",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      3,
      11,
      12,
      2
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 6
  },
  {
    "slug": "panama-city-guna-yala",
    "title": "Panama City and the Guna Yala Islands",
    "tags": [
      "islands",
      "stones",
      "wild"
    ],
    "interests": [
      "islands_beaches",
      "cities_culture",
      "nature_wildlife"
    ],
    "optimizeFor": [
      "beach_relax",
      "culture_history",
      "nature_views"
    ],
    "setting": [
      "city",
      "islands",
      "beach"
    ],
    "cityCount": 2,
    "bestMonths": [
      12,
      1,
      2,
      3,
      4
    ],
    "party": "solo",
    "pace": "balanced",
    "budget": "save",
    "days": 5
  },
  {
    "slug": "antigua-lake-atitlan-five-days",
    "title": "Antigua and Lake Atitl\u00e1n in Five Days",
    "tags": [
      "stones",
      "wild",
      "eat"
    ],
    "interests": [
      "history_ruins",
      "nature_wildlife",
      "cities_culture",
      "mountains_hiking"
    ],
    "optimizeFor": [
      "culture_history",
      "nature_views",
      "must_sees"
    ],
    "setting": [
      "city",
      "lakes",
      "mountains"
    ],
    "cityCount": 2,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "save",
    "days": 5
  },
  {
    "slug": "montreal-quebec-city-by-train",
    "title": "Montr\u00e9al to Qu\u00e9bec City by Train",
    "tags": [
      "stones",
      "eat",
      "drive"
    ],
    "interests": [
      "cities_culture",
      "history_ruins",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "food_local",
      "must_sees"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 2,
    "bestMonths": [
      6,
      9,
      10
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 5
  },
  {
    "slug": "new-orleans-four-days",
    "title": "New Orleans: Four Days of Brass and Long Lunches",
    "tags": [
      "eat",
      "stones"
    ],
    "interests": [
      "food_drink",
      "cities_culture",
      "history_ruins"
    ],
    "optimizeFor": [
      "food_local",
      "nightlife",
      "culture_history"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 1,
    "bestMonths": [
      3,
      4,
      10,
      11
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 4
  },
  {
    "slug": "mongolia-naadam-to-the-gobi",
    "title": "Naadam, Then South to the Gobi",
    "tags": [
      "wild",
      "drive",
      "stay"
    ],
    "interests": [
      "nature_wildlife",
      "road_trip",
      "cities_culture",
      "history_ruins"
    ],
    "optimizeFor": [
      "adventure",
      "nature_views",
      "culture_history"
    ],
    "setting": [
      "desert",
      "countryside",
      "mountains"
    ],
    "cityCount": 7,
    "bestMonths": [
      7,
      8
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 16
  },
  {
    "slug": "uzbekistan-silk-road-fifteen-days",
    "title": "Fifteen Days on the Uzbek Silk Road",
    "tags": [
      "stones",
      "eat",
      "drive"
    ],
    "interests": [
      "history_ruins",
      "cities_culture",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "must_sees",
      "food_local"
    ],
    "setting": [
      "city",
      "desert"
    ],
    "cityCount": 6,
    "bestMonths": [
      4,
      5,
      9,
      10
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 15
  },
  {
    "slug": "oman-coast-sands-and-the-jebel",
    "title": "Oman: The Coast, the Sands, and the Jebel",
    "tags": [
      "drive",
      "wild",
      "high"
    ],
    "interests": [
      "road_trip",
      "nature_wildlife",
      "mountains_hiking",
      "history_ruins"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "culture_history"
    ],
    "setting": [
      "desert",
      "mountains",
      "beach"
    ],
    "cityCount": 6,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 11
  },
  {
    "slug": "laos-mekong-slow-boat-to-the-railway",
    "title": "Laos by River, Then by Rail",
    "tags": [
      "drive",
      "stones",
      "wild"
    ],
    "interests": [
      "nature_wildlife",
      "history_ruins",
      "food_drink",
      "one_base_slow"
    ],
    "optimizeFor": [
      "nature_views",
      "culture_history",
      "food_local"
    ],
    "setting": [
      "jungle",
      "city"
    ],
    "cityCount": 6,
    "bestMonths": [
      11,
      12,
      1,
      2
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "save",
    "days": 11
  },
  {
    "slug": "azerbaijan-caucasus-silk-and-stone",
    "title": "Azerbaijan: Silk, Copper and the Caucasus Wall",
    "tags": [
      "stones",
      "high",
      "eat"
    ],
    "interests": [
      "history_ruins",
      "mountains_hiking",
      "cities_culture",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "must_sees",
      "food_local"
    ],
    "setting": [
      "city",
      "mountains",
      "countryside"
    ],
    "cityCount": 4,
    "bestMonths": [
      5,
      6,
      9,
      10
    ],
    "party": "solo",
    "pace": "balanced",
    "budget": "save",
    "days": 9
  },
  {
    "slug": "bohol-siquijor-with-three-kids",
    "title": "Bohol and Siquijor with Three Kids",
    "tags": [
      "islands",
      "wild",
      "stay"
    ],
    "interests": [
      "islands_beaches",
      "nature_wildlife",
      "wellness"
    ],
    "optimizeFor": [
      "beach_relax",
      "nature_views",
      "adventure"
    ],
    "setting": [
      "islands",
      "beach"
    ],
    "cityCount": 2,
    "bestMonths": [
      12,
      1,
      2,
      3,
      4
    ],
    "party": "family",
    "pace": "easy",
    "budget": "save",
    "days": 7
  },
  {
    "slug": "maldives-baa-atoll-manta-season",
    "title": "Baa Atoll in Manta Season",
    "tags": [
      "islands",
      "wild",
      "stay"
    ],
    "interests": [
      "islands_beaches",
      "wellness",
      "nature_wildlife"
    ],
    "optimizeFor": [
      "beach_relax",
      "soft_luxury",
      "nature_views"
    ],
    "setting": [
      "islands",
      "beach"
    ],
    "cityCount": 2,
    "bestMonths": [
      7,
      8,
      9,
      10,
      11
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "splurge",
    "days": 7
  },
  {
    "slug": "bhutan-black-necked-crane-november",
    "title": "Bhutan in Crane Season: Thimphu, Punakha, Phobjikha and Paro",
    "tags": [
      "stones",
      "high",
      "wild"
    ],
    "interests": [
      "mountains_hiking",
      "nature_wildlife",
      "history_ruins",
      "cities_culture"
    ],
    "optimizeFor": [
      "culture_history",
      "nature_views",
      "adventure"
    ],
    "setting": [
      "mountains",
      "countryside"
    ],
    "cityCount": 4,
    "bestMonths": [
      11,
      3,
      4,
      10
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "splurge",
    "days": 8
  },
  {
    "slug": "dubai-abu-dhabi-five-day-design-run",
    "title": "Dubai and Abu Dhabi in Five Days, for the Buildings",
    "tags": [
      "stones",
      "drive",
      "eat"
    ],
    "interests": [
      "cities_culture",
      "food_drink",
      "history_ruins"
    ],
    "optimizeFor": [
      "must_sees",
      "soft_luxury",
      "nightlife"
    ],
    "setting": [
      "city",
      "desert"
    ],
    "cityCount": 2,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "splurge",
    "days": 5
  },
  {
    "slug": "singapore-four-days-with-small-children",
    "title": "Four Days in Singapore, Built Around Naps",
    "tags": [
      "stones",
      "eat",
      "wild"
    ],
    "interests": [
      "cities_culture",
      "food_drink",
      "one_base_slow"
    ],
    "optimizeFor": [
      "food_local",
      "must_sees",
      "neighborhood"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 1,
    "bestMonths": [
      2,
      3,
      4,
      6,
      7
    ],
    "party": "family",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 4
  },
  {
    "slug": "dakar-saint-louis-saloum",
    "title": "Dakar to Saint-Louis and the Saloum Delta",
    "tags": [
      "stones",
      "islands",
      "wild"
    ],
    "interests": [
      "history_ruins",
      "nature_wildlife",
      "cities_culture",
      "islands_beaches"
    ],
    "optimizeFor": [
      "culture_history",
      "nature_views",
      "food_local"
    ],
    "setting": [
      "city",
      "beach"
    ],
    "cityCount": 3,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3
    ],
    "party": "solo",
    "pace": "balanced",
    "budget": "save",
    "days": 7
  },
  {
    "slug": "tunis-carthage-dougga-weekend",
    "title": "Tunis, Carthage and Dougga in a Long Weekend",
    "tags": [
      "stones",
      "eat"
    ],
    "interests": [
      "history_ruins",
      "cities_culture",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "must_sees",
      "food_local"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 1,
    "bestMonths": [
      3,
      4,
      5,
      6,
      9,
      10,
      11
    ],
    "party": "solo",
    "pace": "balanced",
    "budget": "save",
    "days": 4
  },
  {
    "slug": "seychelles-three-islands-family",
    "title": "Three-Island Seychelles with Children",
    "tags": [
      "islands",
      "stay",
      "wild"
    ],
    "interests": [
      "islands_beaches",
      "wellness",
      "nature_wildlife"
    ],
    "optimizeFor": [
      "beach_relax",
      "soft_luxury",
      "nature_views"
    ],
    "setting": [
      "islands",
      "beach"
    ],
    "cityCount": 3,
    "bestMonths": [
      3,
      4,
      5,
      9,
      10,
      11
    ],
    "party": "family",
    "pace": "easy",
    "budget": "splurge",
    "days": 8
  },
  {
    "slug": "mauritius-five-days-family",
    "title": "Mauritius in Five Days with Kids",
    "tags": [
      "islands",
      "eat",
      "stay"
    ],
    "interests": [
      "islands_beaches",
      "wellness",
      "nature_wildlife"
    ],
    "optimizeFor": [
      "beach_relax",
      "soft_luxury",
      "nature_views"
    ],
    "setting": [
      "islands",
      "beach"
    ],
    "cityCount": 2,
    "bestMonths": [
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11
    ],
    "party": "family",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 5
  },
  {
    "slug": "rn7-madagascar-overland",
    "title": "RN7: Madagascar Overland from Tana to the Reef",
    "tags": [
      "drive",
      "wild",
      "islands"
    ],
    "interests": [
      "wildlife_safari",
      "nature_wildlife",
      "road_trip",
      "islands_beaches"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "culture_history"
    ],
    "setting": [
      "jungle",
      "beach",
      "countryside"
    ],
    "cityCount": 8,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9,
      10,
      11
    ],
    "party": "couple",
    "pace": "full_days",
    "budget": "save",
    "days": 14
  },
  {
    "slug": "accra-cape-coast-castles",
    "title": "Accra and the Castles of the Cape Coast",
    "tags": [
      "stones",
      "eat"
    ],
    "interests": [
      "history_ruins",
      "cities_culture",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "food_local",
      "must_sees"
    ],
    "setting": [
      "city",
      "beach"
    ],
    "cityCount": 2,
    "bestMonths": [
      1,
      2,
      3,
      8,
      11,
      12
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "save",
    "days": 5
  },
  {
    "slug": "zambezi-to-luangwa-on-foot",
    "title": "Zambezi to Luangwa, Mostly on Foot",
    "tags": [
      "wild",
      "stay"
    ],
    "interests": [
      "wildlife_safari",
      "nature_wildlife",
      "mountains_hiking"
    ],
    "optimizeFor": [
      "adventure",
      "nature_views",
      "must_sees"
    ],
    "setting": [
      "safari",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      6,
      7,
      8,
      9
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 11
  },
  {
    "slug": "okavango-mokoro-light-aircraft",
    "title": "Okavango by Mokoro and Light Aircraft",
    "tags": [
      "wild",
      "stay",
      "islands"
    ],
    "interests": [
      "wildlife_safari",
      "nature_wildlife",
      "one_base_slow"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "soft_luxury"
    ],
    "setting": [
      "safari",
      "jungle"
    ],
    "cityCount": 4,
    "bestMonths": [
      6,
      7,
      8,
      9,
      10
    ],
    "party": "friends",
    "pace": "easy",
    "budget": "splurge",
    "days": 8
  },
  {
    "slug": "kigali-to-entebbe-gorilla-overland",
    "title": "Two-Country Gorilla Overland: Kigali to Entebbe",
    "tags": [
      "wild",
      "high",
      "drive"
    ],
    "interests": [
      "wildlife_safari",
      "nature_wildlife",
      "mountains_hiking",
      "road_trip"
    ],
    "optimizeFor": [
      "adventure",
      "nature_views",
      "culture_history"
    ],
    "setting": [
      "jungle",
      "safari",
      "mountains"
    ],
    "cityCount": 7,
    "bestMonths": [
      1,
      2,
      6,
      7,
      8,
      9,
      12
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 14
  },
  {
    "slug": "namibia-self-drive-loop",
    "title": "Namibia by Hilux: Kalahari to Etosha and Back",
    "tags": [
      "drive",
      "wild",
      "stones"
    ],
    "interests": [
      "wildlife_safari",
      "road_trip",
      "nature_wildlife"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "must_sees"
    ],
    "setting": [
      "desert",
      "safari"
    ],
    "cityCount": 9,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9,
      10
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 16
  },
  {
    "slug": "serengeti-crossings-then-zanzibar",
    "title": "Serengeti River Crossings, then Zanzibar",
    "tags": [
      "wild",
      "stay",
      "islands"
    ],
    "interests": [
      "wildlife_safari",
      "nature_wildlife",
      "islands_beaches"
    ],
    "optimizeFor": [
      "adventure",
      "nature_views",
      "beach_relax"
    ],
    "setting": [
      "safari",
      "beach",
      "islands"
    ],
    "cityCount": 7,
    "bestMonths": [
      7,
      8,
      9,
      10
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "splurge",
    "days": 15
  },
  {
    "slug": "nz-north-island-loop",
    "title": "North Island, Top to Bottom: Bay of Islands, the Geothermal Belt and Tongariro",
    "tags": [
      "drive",
      "wild",
      "high"
    ],
    "interests": [
      "road_trip",
      "nature_wildlife",
      "mountains_hiking",
      "islands_beaches"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "culture_history"
    ],
    "setting": [
      "mountains",
      "beach",
      "countryside"
    ],
    "cityCount": 7,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3,
      4
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 17
  },
  {
    "slug": "wa-coral-coast-margaret-river-ningaloo",
    "title": "Western Australia's Coral Coast: Margaret River to Ningaloo",
    "tags": [
      "drive",
      "wild",
      "islands"
    ],
    "interests": [
      "road_trip",
      "nature_wildlife",
      "islands_beaches",
      "food_drink"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "food_local"
    ],
    "setting": [
      "beach",
      "countryside"
    ],
    "cityCount": 7,
    "bestMonths": [
      4,
      5,
      6,
      7,
      8,
      9
    ],
    "party": "solo",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 16
  },
  {
    "slug": "queensland-reef-daintree-whitsundays",
    "title": "Cairns to the Whitsundays with Kids: Reef, Daintree and Whitehaven",
    "tags": [
      "islands",
      "wild",
      "drive"
    ],
    "interests": [
      "islands_beaches",
      "nature_wildlife",
      "road_trip"
    ],
    "optimizeFor": [
      "nature_views",
      "beach_relax",
      "adventure"
    ],
    "setting": [
      "beach",
      "islands",
      "jungle"
    ],
    "cityCount": 5,
    "bestMonths": [
      6,
      7,
      8,
      9,
      10
    ],
    "party": "family",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 15
  },
  {
    "slug": "tahiti-moorea-bora-bora",
    "title": "Tahiti, Moorea and Bora Bora: Nine Days, Three Lagoons",
    "tags": [
      "islands",
      "stay",
      "eat"
    ],
    "interests": [
      "islands_beaches",
      "wellness",
      "one_base_slow",
      "nature_wildlife"
    ],
    "optimizeFor": [
      "beach_relax",
      "soft_luxury",
      "nature_views"
    ],
    "setting": [
      "islands",
      "beach"
    ],
    "cityCount": 3,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9,
      10
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "splurge",
    "days": 9
  },
  {
    "slug": "fiji-mamanucas-coral-coast-family",
    "title": "Fiji with Kids: the Mamanucas and the Coral Coast",
    "tags": [
      "islands",
      "stay"
    ],
    "interests": [
      "islands_beaches",
      "wellness",
      "nature_wildlife",
      "one_base_slow"
    ],
    "optimizeFor": [
      "beach_relax",
      "soft_luxury",
      "nature_views"
    ],
    "setting": [
      "islands",
      "beach"
    ],
    "cityCount": 3,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9,
      10
    ],
    "party": "family",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 8
  },
  {
    "slug": "red-centre-uluru-kings-canyon",
    "title": "Red Centre: Uluru, Kata Tjuta and Kings Canyon to Alice",
    "tags": [
      "stones",
      "stay",
      "wild"
    ],
    "interests": [
      "nature_wildlife",
      "road_trip",
      "history_ruins",
      "mountains_hiking"
    ],
    "optimizeFor": [
      "nature_views",
      "culture_history",
      "adventure"
    ],
    "setting": [
      "desert"
    ],
    "cityCount": 3,
    "bestMonths": [
      4,
      5,
      6,
      7,
      8,
      9
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "splurge",
    "days": 6
  },
  {
    "slug": "tasmania-east-coast-van",
    "title": "Tasmania's East Coast in a Van: Hobart, the Tasman Peninsula and Freycinet",
    "tags": [
      "drive",
      "wild",
      "eat"
    ],
    "interests": [
      "road_trip",
      "nature_wildlife",
      "islands_beaches"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "beach_relax"
    ],
    "setting": [
      "beach",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "save",
    "days": 5
  },
  {
    "slug": "prague-palava-budapest-by-rail",
    "title": "Prague, P\u00e1lava and Budapest: the Slow Way Down the Line",
    "tags": [
      "eat",
      "stones",
      "drive"
    ],
    "interests": [
      "history_ruins",
      "food_drink",
      "cities_culture"
    ],
    "optimizeFor": [
      "culture_history",
      "food_local",
      "must_sees"
    ],
    "setting": [
      "city",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      5,
      6,
      9
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 8
  },
  {
    "slug": "copenhagen-to-the-arctic-circle",
    "title": "North: Copenhagen to the Arctic Circle by Rail and Sea",
    "tags": [
      "wild",
      "stay",
      "eat"
    ],
    "interests": [
      "nature_wildlife",
      "road_trip",
      "mountains_hiking",
      "cities_culture"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "soft_luxury"
    ],
    "setting": [
      "arctic",
      "mountains",
      "city"
    ],
    "cityCount": 7,
    "bestMonths": [
      2,
      3
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "splurge",
    "days": 15
  },
  {
    "slug": "slovenia-bohinj-with-kids",
    "title": "Slovenia: Ljubljana, Bohinj and One Night on the Sea",
    "tags": [
      "high",
      "wild",
      "stones"
    ],
    "interests": [
      "mountains_hiking",
      "nature_wildlife",
      "cities_culture",
      "islands_beaches"
    ],
    "optimizeFor": [
      "nature_views",
      "culture_history",
      "adventure"
    ],
    "setting": [
      "mountains",
      "lakes",
      "city"
    ],
    "cityCount": 3,
    "bestMonths": [
      6,
      9
    ],
    "party": "family",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 7
  },
  {
    "slug": "poland-down-the-vistula",
    "title": "Poland: Down the Vistula, Gda\u0144sk to Krak\u00f3w",
    "tags": [
      "stones",
      "eat",
      "drive"
    ],
    "interests": [
      "history_ruins",
      "cities_culture",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "must_sees",
      "food_local"
    ],
    "setting": [
      "city",
      "countryside"
    ],
    "cityCount": 4,
    "bestMonths": [
      5,
      6,
      9
    ],
    "party": "solo",
    "pace": "balanced",
    "budget": "save",
    "days": 10
  },
  {
    "slug": "vienna-three-nights-at-the-opera",
    "title": "Vienna: Three Nights at the Opera",
    "tags": [
      "stones",
      "eat",
      "stay"
    ],
    "interests": [
      "cities_culture",
      "history_ruins",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "must_sees",
      "soft_luxury"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 1,
    "bestMonths": [
      1,
      2,
      3,
      11
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "splurge",
    "days": 4
  },
  {
    "slug": "amsterdam-haarlem-with-kids",
    "title": "Amsterdam and Haarlem by Bike, with Small Children",
    "tags": [
      "stones",
      "islands"
    ],
    "interests": [
      "cities_culture",
      "history_ruins",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "must_sees",
      "neighborhood"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 2,
    "bestMonths": [
      5,
      6,
      9
    ],
    "party": "family",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 5
  },
  {
    "slug": "berlin-four-days-fault-line",
    "title": "Berlin: Four Days on the Fault Line",
    "tags": [
      "stones",
      "eat"
    ],
    "interests": [
      "history_ruins",
      "cities_culture",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "nightlife",
      "must_sees"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 1,
    "bestMonths": [
      5,
      6,
      9
    ],
    "party": "solo",
    "pace": "balanced",
    "budget": "save",
    "days": 4
  },
  {
    "slug": "wild-atlantic-way-dingle-to-achill",
    "title": "Ireland: the Wild Atlantic Way from Dingle to Achill",
    "tags": [
      "islands",
      "wild",
      "eat"
    ],
    "interests": [
      "road_trip",
      "nature_wildlife",
      "islands_beaches",
      "food_drink"
    ],
    "optimizeFor": [
      "nature_views",
      "food_local",
      "adventure"
    ],
    "setting": [
      "beach",
      "countryside",
      "islands"
    ],
    "cityCount": 5,
    "bestMonths": [
      5,
      6,
      9
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 11
  },
  {
    "slug": "scotland-west-highland-line",
    "title": "Scotland: Edinburgh, the West Highland Line and the Silver Sands",
    "tags": [
      "high",
      "islands",
      "stones"
    ],
    "interests": [
      "history_ruins",
      "road_trip",
      "mountains_hiking",
      "cities_culture"
    ],
    "optimizeFor": [
      "nature_views",
      "culture_history",
      "must_sees"
    ],
    "setting": [
      "mountains",
      "city",
      "beach"
    ],
    "cityCount": 5,
    "bestMonths": [
      6,
      9,
      10
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 9
  },
  {
    "slug": "amalfi-coast-girls-trip",
    "title": "Amalfi Coast \u2014 Girls' Trip",
    "tags": [
      "islands",
      "eat",
      "stay"
    ],
    "interests": [
      "islands_beaches",
      "food_drink",
      "one_base_slow"
    ],
    "optimizeFor": [
      "beach_relax",
      "soft_luxury",
      "food_local"
    ],
    "setting": [
      "beach",
      "city",
      "islands"
    ],
    "cityCount": 3,
    "bestMonths": [
      5,
      6,
      9,
      10
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "splurge",
    "days": 11
  },
  {
    "slug": "japan-with-a-little-one",
    "title": "Japan with a Little One \u2014 Tokyo, Kyoto & Osaka",
    "tags": [
      "eat",
      "stones",
      "stay"
    ],
    "interests": [
      "cities_culture",
      "food_drink",
      "history_ruins"
    ],
    "optimizeFor": [
      "food_local",
      "must_sees",
      "culture_history"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 3,
    "bestMonths": [
      3,
      4,
      5,
      9,
      10,
      11
    ],
    "party": "family",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 11
  },
  {
    "slug": "japan-tokyo-kyoto",
    "title": "Japan: Tokyo & Kyoto",
    "tags": [
      "eat"
    ],
    "interests": [
      "food_drink",
      "cities_culture",
      "history_ruins"
    ],
    "optimizeFor": [
      "food_local",
      "culture_history",
      "must_sees"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 4,
    "bestMonths": [
      3,
      4,
      10,
      11
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 13
  },
  {
    "slug": "iceland-the-ring-road",
    "title": "Iceland: The Ring Road",
    "tags": [
      "drive",
      "wild"
    ],
    "interests": [
      "nature_wildlife",
      "road_trip",
      "mountains_hiking"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "must_sees"
    ],
    "setting": [
      "mountains",
      "countryside"
    ],
    "cityCount": 5,
    "bestMonths": [
      6,
      7,
      8
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 10
  },
  {
    "slug": "paris-the-loire-valley",
    "title": "Paris & the Loire Valley",
    "tags": [
      "eat",
      "stones"
    ],
    "interests": [
      "history_ruins",
      "food_drink",
      "cities_culture"
    ],
    "optimizeFor": [
      "culture_history",
      "food_local",
      "must_sees"
    ],
    "setting": [
      "city",
      "countryside"
    ],
    "cityCount": 2,
    "bestMonths": [
      5,
      6,
      9
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 10
  },
  {
    "slug": "mexico-city-oaxaca",
    "title": "Mexico City & Oaxaca",
    "tags": [
      "eat"
    ],
    "interests": [
      "food_drink",
      "cities_culture",
      "history_ruins"
    ],
    "optimizeFor": [
      "food_local",
      "culture_history",
      "nightlife"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 2,
    "bestMonths": [
      10,
      11,
      12,
      1,
      2,
      3,
      4
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 10
  },
  {
    "slug": "thailand-bangkok-to-chiang-mai",
    "title": "Thailand: Bangkok to Chiang Mai",
    "tags": [
      "eat"
    ],
    "interests": [
      "food_drink",
      "cities_culture",
      "history_ruins",
      "nature_wildlife"
    ],
    "optimizeFor": [
      "food_local",
      "culture_history",
      "must_sees"
    ],
    "setting": [
      "city",
      "jungle"
    ],
    "cityCount": 2,
    "bestMonths": [
      11,
      12,
      1,
      2
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 12
  },
  {
    "slug": "egypt-cairo-the-nile",
    "title": "Egypt: Cairo & the Nile",
    "tags": [
      "stones"
    ],
    "interests": [
      "history_ruins",
      "cities_culture",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "must_sees"
    ],
    "setting": [
      "city",
      "desert"
    ],
    "cityCount": 3,
    "bestMonths": [
      10,
      11,
      12,
      1,
      2,
      3,
      4
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "splurge",
    "days": 10
  },
  {
    "slug": "costa-rica-cloud-forest-to-coast",
    "title": "Costa Rica: Cloud Forest to Coast",
    "tags": [
      "wild"
    ],
    "interests": [
      "nature_wildlife",
      "mountains_hiking",
      "islands_beaches"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "beach_relax"
    ],
    "setting": [
      "jungle",
      "beach",
      "mountains"
    ],
    "cityCount": 4,
    "bestMonths": [
      12,
      1,
      2,
      3,
      4
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "splurge",
    "days": 11
  },
  {
    "slug": "portugal-lisbon-the-douro",
    "title": "Portugal: Lisbon & the Douro",
    "tags": [
      "eat"
    ],
    "interests": [
      "food_drink",
      "cities_culture",
      "one_base_slow",
      "history_ruins"
    ],
    "optimizeFor": [
      "food_local",
      "culture_history",
      "nature_views"
    ],
    "setting": [
      "city",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      4,
      5,
      6,
      9,
      10
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 10
  },
  {
    "slug": "bali-ubud-sidemen-nusa-penida",
    "title": "Bali: Ubud, Sidemen & Nusa Penida",
    "tags": [
      "islands"
    ],
    "interests": [
      "islands_beaches",
      "wellness",
      "nature_wildlife",
      "food_drink"
    ],
    "optimizeFor": [
      "nature_views",
      "soft_luxury",
      "beach_relax"
    ],
    "setting": [
      "islands",
      "jungle",
      "beach"
    ],
    "cityCount": 3,
    "bestMonths": [
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 12
  },
  {
    "slug": "rio-de-janeiro-ilha-grande",
    "title": "Rio de Janeiro & Ilha Grande",
    "tags": [
      "islands"
    ],
    "interests": [
      "islands_beaches",
      "nature_wildlife",
      "cities_culture"
    ],
    "optimizeFor": [
      "beach_relax",
      "nature_views",
      "nightlife"
    ],
    "setting": [
      "city",
      "beach",
      "islands"
    ],
    "cityCount": 2,
    "bestMonths": [
      12,
      1,
      2,
      3
    ],
    "party": "couple",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 11
  },
  {
    "slug": "new-zealand-queenstown-fiordland",
    "title": "New Zealand: Queenstown & Fiordland",
    "tags": [
      "wild",
      "high"
    ],
    "interests": [
      "mountains_hiking",
      "nature_wildlife",
      "road_trip"
    ],
    "optimizeFor": [
      "adventure",
      "nature_views",
      "must_sees"
    ],
    "setting": [
      "mountains",
      "lakes",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 13
  },
  {
    "slug": "jordan-petra-wadi-rum",
    "title": "Jordan: Petra & Wadi Rum",
    "tags": [
      "stones"
    ],
    "interests": [
      "history_ruins",
      "nature_wildlife",
      "road_trip",
      "mountains_hiking"
    ],
    "optimizeFor": [
      "culture_history",
      "must_sees",
      "adventure"
    ],
    "setting": [
      "desert"
    ],
    "cityCount": 4,
    "bestMonths": [
      3,
      4,
      5,
      9,
      10,
      11
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 9
  },
  {
    "slug": "malaysia-penang-langkawi",
    "title": "Malaysia: Penang & Langkawi",
    "tags": [
      "islands",
      "eat"
    ],
    "interests": [
      "food_drink",
      "islands_beaches",
      "cities_culture"
    ],
    "optimizeFor": [
      "food_local",
      "beach_relax",
      "nature_views"
    ],
    "setting": [
      "islands",
      "beach",
      "city"
    ],
    "cityCount": 3,
    "bestMonths": [
      12,
      1,
      2,
      3
    ],
    "party": "solo",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 10
  },
  {
    "slug": "the-southwest-loop-utah-arizona",
    "title": "The Southwest Loop: Utah & Arizona",
    "tags": [
      "drive",
      "wild"
    ],
    "interests": [
      "road_trip",
      "nature_wildlife",
      "mountains_hiking"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "must_sees"
    ],
    "setting": [
      "desert",
      "mountains",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      4,
      5,
      9,
      10
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "splurge",
    "days": 11
  },
  {
    "slug": "china-beijing-chengdu",
    "title": "China: Beijing & Chengdu",
    "tags": [
      "stones",
      "eat"
    ],
    "interests": [
      "history_ruins",
      "food_drink",
      "cities_culture",
      "nature_wildlife"
    ],
    "optimizeFor": [
      "culture_history",
      "food_local",
      "must_sees"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 3,
    "bestMonths": [
      4,
      5,
      9,
      10
    ],
    "party": "solo",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 11
  },
  {
    "slug": "australia-sydney-the-great-ocean-road",
    "title": "Australia: Sydney & the Great Ocean Road",
    "tags": [
      "drive"
    ],
    "interests": [
      "road_trip",
      "nature_wildlife",
      "cities_culture",
      "islands_beaches"
    ],
    "optimizeFor": [
      "nature_views",
      "must_sees",
      "adventure"
    ],
    "setting": [
      "city",
      "beach",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3
    ],
    "party": "friends",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 13
  },
  {
    "slug": "barcelona-long-weekend",
    "title": "Barcelona Long Weekend",
    "tags": [
      "stay"
    ],
    "interests": [
      "cities_culture",
      "food_drink",
      "history_ruins"
    ],
    "optimizeFor": [
      "must_sees",
      "food_local",
      "nightlife"
    ],
    "setting": [
      "city",
      "beach"
    ],
    "cityCount": 1,
    "bestMonths": [
      4,
      5,
      6,
      9,
      10
    ],
    "party": "friends",
    "pace": "full_days",
    "budget": "splurge",
    "days": 5
  },
  {
    "slug": "cambodia-angkor-the-coast",
    "title": "Cambodia: Angkor & the Coast",
    "tags": [
      "stones"
    ],
    "interests": [
      "history_ruins",
      "islands_beaches",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "must_sees",
      "beach_relax"
    ],
    "setting": [
      "jungle",
      "beach",
      "islands"
    ],
    "cityCount": 3,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 10
  },
  {
    "slug": "istanbul-two-continents",
    "title": "Istanbul: Two Continents",
    "tags": [
      "stay",
      "stones"
    ],
    "interests": [
      "history_ruins",
      "cities_culture",
      "food_drink"
    ],
    "optimizeFor": [
      "culture_history",
      "food_local",
      "must_sees"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 1,
    "bestMonths": [
      4,
      5,
      9,
      10
    ],
    "party": "solo",
    "pace": "full_days",
    "budget": "smart_mix",
    "days": 7
  },
  {
    "slug": "peru-cusco-the-sacred-valley",
    "title": "Peru: Cusco & the Sacred Valley",
    "tags": [
      "stones",
      "high"
    ],
    "interests": [
      "history_ruins",
      "mountains_hiking",
      "cities_culture"
    ],
    "optimizeFor": [
      "culture_history",
      "must_sees",
      "adventure"
    ],
    "setting": [
      "mountains",
      "city",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9
    ],
    "party": "solo",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 11
  },
  {
    "slug": "vietnam-hanoi-ha-long-bay",
    "title": "Vietnam: Hanoi & Ha Long Bay",
    "tags": [
      "eat"
    ],
    "interests": [
      "food_drink",
      "cities_culture",
      "islands_beaches",
      "nature_wildlife"
    ],
    "optimizeFor": [
      "food_local",
      "must_sees",
      "nature_views"
    ],
    "setting": [
      "city",
      "islands",
      "beach"
    ],
    "cityCount": 3,
    "bestMonths": [
      10,
      11,
      12,
      1,
      2,
      3,
      4
    ],
    "party": "solo",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 11
  },
  {
    "slug": "sri-lanka-hill-country-by-train",
    "title": "Sri Lanka: Hill Country by Train",
    "tags": [
      "drive",
      "high"
    ],
    "interests": [
      "nature_wildlife",
      "mountains_hiking",
      "food_drink",
      "history_ruins"
    ],
    "optimizeFor": [
      "nature_views",
      "culture_history",
      "food_local"
    ],
    "setting": [
      "mountains",
      "countryside",
      "jungle"
    ],
    "cityCount": 3,
    "bestMonths": [
      12,
      1,
      2,
      3
    ],
    "party": "solo",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 11
  },
  {
    "slug": "santorini-the-cyclades",
    "title": "Santorini & the Cyclades",
    "tags": [
      "islands"
    ],
    "interests": [
      "islands_beaches",
      "food_drink",
      "one_base_slow"
    ],
    "optimizeFor": [
      "beach_relax",
      "soft_luxury",
      "nightlife"
    ],
    "setting": [
      "islands",
      "beach"
    ],
    "cityCount": 2,
    "bestMonths": [
      5,
      6,
      9,
      10
    ],
    "party": "friends",
    "pace": "balanced",
    "budget": "save",
    "days": 8
  },
  {
    "slug": "croatia-split-hvar-dubrovnik",
    "title": "Croatia: Split, Hvar & Dubrovnik",
    "tags": [
      "islands"
    ],
    "interests": [
      "islands_beaches",
      "history_ruins",
      "cities_culture"
    ],
    "optimizeFor": [
      "beach_relax",
      "culture_history",
      "must_sees"
    ],
    "setting": [
      "city",
      "islands",
      "beach"
    ],
    "cityCount": 3,
    "bestMonths": [
      5,
      6,
      9
    ],
    "party": "solo",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 10
  },
  {
    "slug": "colombia-cartagena-tayrona",
    "title": "Colombia: Cartagena & Tayrona",
    "tags": [
      "wild"
    ],
    "interests": [
      "islands_beaches",
      "nature_wildlife",
      "cities_culture",
      "history_ruins"
    ],
    "optimizeFor": [
      "beach_relax",
      "culture_history",
      "nature_views"
    ],
    "setting": [
      "city",
      "beach",
      "jungle"
    ],
    "cityCount": 3,
    "bestMonths": [
      12,
      1,
      2,
      3,
      4
    ],
    "party": "solo",
    "pace": "balanced",
    "budget": "smart_mix",
    "days": 10
  },
  {
    "slug": "georgia-tbilisi-svaneti",
    "title": "Georgia: Tbilisi & Svaneti",
    "tags": [
      "high",
      "eat"
    ],
    "interests": [
      "mountains_hiking",
      "food_drink",
      "history_ruins",
      "cities_culture"
    ],
    "optimizeFor": [
      "culture_history",
      "food_local",
      "adventure"
    ],
    "setting": [
      "mountains",
      "city",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      6,
      7,
      8,
      9
    ],
    "party": "solo",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 10
  },
  {
    "slug": "nepal-kathmandu-the-annapurnas",
    "title": "Nepal: Kathmandu & the Annapurnas",
    "tags": [
      "high",
      "wild"
    ],
    "interests": [
      "mountains_hiking",
      "nature_wildlife",
      "history_ruins",
      "cities_culture"
    ],
    "optimizeFor": [
      "adventure",
      "nature_views",
      "culture_history"
    ],
    "setting": [
      "mountains",
      "city",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      10,
      11,
      3,
      4
    ],
    "party": "solo",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 13
  },
  {
    "slug": "kenya-masai-mara-amboseli",
    "title": "Kenya: Masai Mara & Amboseli",
    "tags": [
      "wild"
    ],
    "interests": [
      "wildlife_safari",
      "nature_wildlife",
      "road_trip"
    ],
    "optimizeFor": [
      "adventure",
      "nature_views",
      "must_sees"
    ],
    "setting": [
      "safari",
      "countryside"
    ],
    "cityCount": 3,
    "bestMonths": [
      7,
      8,
      9,
      10,
      1,
      2
    ],
    "party": "friends",
    "pace": "easy",
    "budget": "splurge",
    "days": 10
  },
  {
    "slug": "switzerland-the-berner-oberland",
    "title": "Switzerland: The Berner Oberland",
    "tags": [
      "high"
    ],
    "interests": [
      "mountains_hiking",
      "nature_wildlife",
      "one_base_slow"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "soft_luxury"
    ],
    "setting": [
      "mountains",
      "lakes",
      "countryside"
    ],
    "cityCount": 2,
    "bestMonths": [
      6,
      7,
      8,
      9
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "splurge",
    "days": 9
  },
  {
    "slug": "morocco-marrakech-the-atlas",
    "title": "Morocco: Marrakech & the Atlas",
    "tags": [
      "stones",
      "high"
    ],
    "interests": [
      "history_ruins",
      "mountains_hiking",
      "food_drink",
      "cities_culture"
    ],
    "optimizeFor": [
      "culture_history",
      "must_sees",
      "adventure"
    ],
    "setting": [
      "city",
      "mountains",
      "desert"
    ],
    "cityCount": 3,
    "bestMonths": [
      3,
      4,
      5,
      9,
      10,
      11
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "save",
    "days": 9
  },
  {
    "slug": "lofoten-by-ferry",
    "title": "Lofoten by ferry",
    "tags": [
      "islands",
      "wild"
    ],
    "interests": [
      "nature_wildlife",
      "islands_beaches",
      "mountains_hiking",
      "road_trip"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "neighborhood"
    ],
    "setting": [
      "islands",
      "mountains",
      "beach"
    ],
    "cityCount": 2,
    "bestMonths": [
      6,
      7,
      8
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "save",
    "days": 9
  },
  {
    "slug": "puglia-slowly",
    "title": "Puglia, slowly",
    "tags": [
      "eat"
    ],
    "interests": [
      "food_drink",
      "one_base_slow",
      "islands_beaches",
      "history_ruins"
    ],
    "optimizeFor": [
      "food_local",
      "neighborhood",
      "beach_relax"
    ],
    "setting": [
      "countryside",
      "beach",
      "city"
    ],
    "cityCount": 3,
    "bestMonths": [
      5,
      6,
      9,
      10
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "save",
    "days": 12
  },
  {
    "slug": "cape-town-the-garden-route",
    "title": "Cape Town & the Garden Route",
    "tags": [
      "drive",
      "wild"
    ],
    "interests": [
      "road_trip",
      "nature_wildlife",
      "food_drink"
    ],
    "optimizeFor": [
      "nature_views",
      "food_local",
      "adventure"
    ],
    "setting": [
      "city",
      "beach",
      "mountains"
    ],
    "cityCount": 2,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 11
  },
  {
    "slug": "faroe-islands-eight-days-of-weather",
    "title": "Faroe Islands: eight days of weather",
    "tags": [
      "wild",
      "islands"
    ],
    "interests": [
      "nature_wildlife",
      "islands_beaches",
      "mountains_hiking",
      "road_trip"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "neighborhood"
    ],
    "setting": [
      "islands",
      "mountains",
      "countryside"
    ],
    "cityCount": 2,
    "bestMonths": [
      5,
      6,
      7,
      8,
      9
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "save",
    "days": 9
  },
  {
    "slug": "kerala-backwaters-tea-country",
    "title": "Kerala backwaters & tea country",
    "tags": [
      "islands",
      "eat"
    ],
    "interests": [
      "nature_wildlife",
      "food_drink",
      "one_base_slow",
      "wellness"
    ],
    "optimizeFor": [
      "nature_views",
      "food_local",
      "soft_luxury"
    ],
    "setting": [
      "countryside",
      "jungle",
      "mountains"
    ],
    "cityCount": 3,
    "bestMonths": [
      10,
      11,
      12,
      1,
      2,
      3
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "smart_mix",
    "days": 10
  },
  {
    "slug": "taipei-the-mountain-towns",
    "title": "Taipei & the mountain towns",
    "tags": [
      "eat",
      "high"
    ],
    "interests": [
      "food_drink",
      "cities_culture",
      "mountains_hiking"
    ],
    "optimizeFor": [
      "food_local",
      "nature_views",
      "culture_history"
    ],
    "setting": [
      "city",
      "mountains"
    ],
    "cityCount": 2,
    "bestMonths": [
      10,
      11,
      12,
      1,
      2,
      3,
      4
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "save",
    "days": 8
  },
  {
    "slug": "patagonia-torres-del-paine",
    "title": "Patagonia: Torres del Paine",
    "tags": [
      "wild",
      "high"
    ],
    "interests": [
      "mountains_hiking",
      "nature_wildlife",
      "road_trip"
    ],
    "optimizeFor": [
      "nature_views",
      "adventure",
      "must_sees"
    ],
    "setting": [
      "mountains",
      "countryside",
      "lakes"
    ],
    "cityCount": 2,
    "bestMonths": [
      11,
      12,
      1,
      2,
      3
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "splurge",
    "days": 10
  },
  {
    "slug": "seoul-in-blossom-season",
    "title": "Seoul in blossom season",
    "tags": [
      "stay",
      "eat"
    ],
    "interests": [
      "cities_culture",
      "food_drink",
      "history_ruins"
    ],
    "optimizeFor": [
      "food_local",
      "must_sees",
      "culture_history"
    ],
    "setting": [
      "city"
    ],
    "cityCount": 1,
    "bestMonths": [
      4,
      10
    ],
    "party": "couple",
    "pace": "easy",
    "budget": "save",
    "days": 8
  }
] as const
