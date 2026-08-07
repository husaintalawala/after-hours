import fs from "node:fs"
import path from "node:path"
import { Font } from "@react-pdf/renderer"

// Brand faces for the itinerary PDF, registered once per lambda.
//
// The TTFs are vendored next to this file rather than served from `public/`
// because a route handler's filesystem on Vercel only contains what output
// file tracing put there — `next.config.js` has an `outputFileTracingIncludes`
// entry pinning this directory to the export route. If a font is somehow still
// missing we fall back to react-pdf's built-in Times/Helvetica rather than
// throwing: a plainer PDF beats a 500.
//
// Fraunces here is a STATIC 600 instance (Google Fonts), not the variable TTF
// the iOS bundle ships — fontkit renders a variable font at its default axis
// position, which would print the display face at Light.

export const SERIF = "Fraunces"
export const SANS = "Jakarta"

export interface ItineraryFonts {
  serif: string
  sans: string
}

let registered: ItineraryFonts | null = null

/** Register the brand faces and return the family names to draw with. Safe to
 *  call on every request — the work happens once per process. */
export function itineraryFonts(): ItineraryFonts {
  if (registered) return registered

  const dir = path.join(process.cwd(), "src", "lib", "pdf", "fonts")
  // react-pdf resolves a non-URL `src` through `fontkit.open`, i.e. a path on
  // disk — so hand it the absolute path, but only once we know it's there.
  const file = (name: string): string | null => {
    const p = path.join(dir, name)
    return fs.existsSync(p) ? p : null
  }

  const frauncesRoman = file("Fraunces-SemiBold.ttf")
  const frauncesItalic = file("Fraunces-SemiBoldItalic.ttf")
  const jakartaRegular = file("PlusJakartaSans-Regular.ttf")
  const jakartaBold = file("PlusJakartaSans-Bold.ttf")

  let serif = "Times-Roman"
  let sans = "Helvetica"

  try {
    if (frauncesRoman) {
      Font.register({
        family: SERIF,
        fonts: [
          { src: frauncesRoman, fontWeight: 600 },
          ...(frauncesItalic
            ? [{ src: frauncesItalic, fontWeight: 600, fontStyle: "italic" as const }]
            : []),
        ],
      })
      serif = SERIF
    }
    if (jakartaRegular) {
      Font.register({
        family: SANS,
        fonts: [
          { src: jakartaRegular, fontWeight: 400 },
          ...(jakartaBold ? [{ src: jakartaBold, fontWeight: 700 }] : []),
        ],
      })
      sans = SANS
    }
  } catch (e) {
    console.error("[itinerary-pdf] font registration failed, using built-ins", e)
    serif = "Times-Roman"
    sans = "Helvetica"
  }

  // Place names have no syllable structure worth guessing at — react-pdf's
  // default hyphenator would print "Ober-baum-brücke". Break on spaces only.
  Font.registerHyphenationCallback((word) => [word])

  registered = { serif, sans }
  return registered
}
