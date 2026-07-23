import { NextResponse } from "next/server"
import { getDriftUpstream } from "@/lib/drift/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Structured, glanceable "destination facts" for the Overview guide — the web
// mirror of iOS DestinationFactsService. There is NO dedicated facts edge
// function: iOS builds a prompt and posts it to the shared `gemini-complete`
// proxy (Gemini key lives only in that edge fn), then parses the JSON. We do the
// same here — forward {city, country} → build the prompt → gemini-complete →
// parse — so the client just receives a clean, typed facts object (or null).
//
// gemini-complete shape: POST { model, payload } → { ok, text } (extracted
// first-candidate text). Keep the model in sync with iOS GeminiProxy.model.
const GEMINI_MODEL = "gemini-3.1-flash-lite"

function buildPrompt(city: string, country: string): string {
  return `You are a precise travel-facts compiler. For the city "${city}" in "${country}", return JSON with EXACTLY these fields. Use null for anything you are not confident about — never guess or use placeholders.
{
  "currency": "symbol + ISO, e.g. 'kr · ISK'",
  "language": "main language, e.g. 'Icelandic'",
  "plug": "socket type letter(s), e.g. 'Type F'",
  "voltage": "e.g. '230V'",
  "safety": "2-3 word read, e.g. 'Very safe'",
  "tap_water": "2-3 words, e.g. 'Safe to drink' or 'Bottled only'",
  "walkable": "2-3 words, e.g. 'Very walkable'",
  "monthly_high_c": [12 numbers: average daily-high °C for Jan..Dec],
  "seasonality": [12 strings each one of "off","shoulder","peak" for Jan..Dec tourist season],
  "budget_level": 1,
  "budget_why": "<=6 words, e.g. 'Pricey — Nordic prices'",
  "neighborhoods": [ { "name": "area name", "character": "<=8 word character line" } ],
  "emergency": "emergency phone number, e.g. '112'",
  "tipping": "<=5 words, e.g. 'Not expected'",
  "connectivity": "<=6 words, e.g. 'eSIM widely available'"
}
budget_level: 1 = cheap, 2 = moderate, 3 = pricey. Give exactly 3 neighborhoods. seasonality reflects crowds/prices, not weather.
Return ONLY valid JSON. No markdown, no code blocks, no explanation.`
}

export async function POST(request: Request) {
  const up = await getDriftUpstream()
  if (!up) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const city = typeof body?.city === "string" ? body.city.trim() : ""
  const country = typeof body?.country === "string" ? body.country.trim() : ""
  if (!city) {
    return NextResponse.json({ ok: false, error: "missing city" }, { status: 400 })
  }

  const payload = {
    contents: [{ parts: [{ text: buildPrompt(city, country) }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  }

  try {
    const upstream = await fetch(`${up.functionsBase}/gemini-complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${up.token}`,
        apikey: up.anonKey,
      },
      body: JSON.stringify({ model: GEMINI_MODEL, payload }),
    })

    const data = (await upstream.json().catch(() => null)) as
      | { ok?: boolean; text?: string; error?: string }
      | null

    const text = data?.ok ? data.text ?? "" : ""
    if (!text) {
      // Fail-open: the client renders nothing when facts are null.
      return NextResponse.json({ ok: true, facts: null })
    }

    const jsonString = text
      .trim()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim()

    let facts: unknown = null
    try {
      facts = JSON.parse(jsonString)
    } catch {
      facts = null
    }

    return NextResponse.json({ ok: true, facts })
  } catch {
    return NextResponse.json({ ok: true, facts: null })
  }
}
