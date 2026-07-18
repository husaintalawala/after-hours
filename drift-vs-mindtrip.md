# Drift vs. Mindtrip — detailed UI comparison

Measured **2026-07-18** via live computed styles (`getComputedStyle`) at a **1440px desktop viewport**.
Mindtrip = mindtrip.ai (production). Drift = drift.after-hours.app (current live build).
All values are actual rendered values, not source declarations, unless noted.

---

## 0. The headline gap (objective counts)

| Metric | Mindtrip | Drift | Drift as % of Mindtrip |
|---|---:|---:|---:|
| Major sections / heading blocks | ~14 (h2 count) | 9 | **64%** |
| Total images in DOM | **45** | **9** | **20%** |
| — responsive `srcset` images | 32 (webp) | 0 | — |
| — SVG assets | 10 | 8 (logos) | — |
| Body copy words (`<p>`) | **609** | **214** | **35%** |
| Total visible words | 802 | 506 | 63% |
| Heading words | 95 | 35 | 37% |
| CTA buttons / pills | ~8 | 3 | **38%** |
| Distinct feature callouts | ~20 (across 4 feature clusters) | ~10 (4 product cards + 6-tile grid) | ~50% |
| Page height @1440 | ~14,970px | ~7,300px | **49%** |

**Verdict on the "it's thinner" instinct: confirmed and quantifiable.** Drift is roughly **half the page**, **one-fifth the imagery**, and **one-third the body copy**. The single biggest raw gap is imagery (45 → 9) and body copy depth (609 → 214 words).

---

## 1. Typography

| Dimension | Mindtrip | Drift | Gap / change |
|---|---|---|---|
| Display family | **Inter** (sans) | **Fraunces** (serif) | Fundamental identity difference — Mindtrip is all-sans; Drift is serif-display |
| Body family | Inter | Inter | match |
| h1 size | **128px** | 124px | ~match |
| h1 weight | **700** | 600 | Drift is one weight lighter |
| h1 line-height | 128px (1.0) | 124px (1.0) | match |
| h1 letter-spacing | −3.2px (−0.025em) | −3.97px (−0.032em) | Drift slightly tighter |
| h2 size | **60px** (some 72px) | **74px** | Drift's h2 is *larger* |
| h2 weight | 700 | 600 | Drift lighter |
| h2 line-height | 75px (1.25) | 74px (1.0) | Drift much tighter leading |
| Body `<p>` | **20px** / 400 / lh 28px (1.4) | 25px lede, 16px base / 400 | Drift lede bigger; base smaller |
| Eyebrow | (small caps, tracked) | 13px / 600 / +0.16em / uppercase / coral | Drift adds a colored eyebrow Mindtrip mostly doesn't use |
| CTA text | 18px / 500 | 14–16px / 600 | Drift CTA text smaller |

**Takeaways:** Mindtrip's punch comes from **Inter 700** (heavier) and pure-black on pure-white (max contrast). Drift matches the *scale* but uses **serif at 600** in a **warm** palette, so it reads more editorial/soft, less "bold product." If we want Mindtrip's exact energy we'd go heavier weight + higher contrast; if we keep Drift's identity, the serif is the deliberate divergence.

---

## 2. Color

| Surface | Mindtrip | Drift | Gap |
|---|---|---|---|
| Page background | `oklch(1 0 0)` = **pure #FFFFFF** | `rgb(251,249,245)` = **#FBF9F5** (warm white) | Drift is warmer/creamier, lower contrast |
| Body text | `oklch(0 0 0)` = **pure #000000** | `rgb(28,23,18)` = **#1C1712** (warm near-black) | Drift slightly softer contrast |
| Accent | **none** — monochrome; CTAs are **black** | **coral #C9603F** (CTAs) + `#A8482B` (eyebrow) | Drift has a brand color; Mindtrip is black/white + photo color |
| Primary CTA | black pill, white text | coral pill, white text | different accent strategy |
| Section tint | 1 dark section (iOS), rest pure white | 1 dark box (final CTA), rest warm white | similar rhythm, 1 dark moment each |

**Takeaway:** Mindtrip is a **monochrome** system (black/white) that lets colorful photography and app screenshots carry all the color. Drift injects **coral** as a persistent brand accent. Neither is "wrong," but Mindtrip's white is cleaner/cooler and its contrast is higher.

---

## 3. Spacing, rhythm & container

| Dimension | Mindtrip | Drift | Gap |
|---|---|---|---|
| Container max-width | **1566px** | **1200px** | Drift is **366px narrower** — content column feels tighter/less expansive |
| Gutter @1440 | ~55px | 56px | match |
| Section vertical padding | ~144px (top) | ~150px (moment top) | **match** — rhythm is close |
| Heading→media gap | large, airy | large, airy | comparable |

**Takeaway:** Vertical rhythm is basically matched. The real spatial gap is **container width** — Mindtrip breathes wider (1566 vs 1200), which combined with more/larger imagery makes each section feel more substantial.

---

## 4. Layout & image strategy

| Dimension | Mindtrip | Drift | Gap |
|---|---|---|---|
| Product presentation | **Real app screenshots as images**, layered/floating; cutout landmark photos; 3D sticker images | **CSS-drawn UI cards** (no real screenshots) + emoji stickers | Mindtrip uses real, richer imagery; Drift recreates UI in CSS |
| Image format | **webp** via CloudFront resize CDN | raw **jpg**, unoptimized | Drift not next-gen, not responsive |
| Responsive srcset | Yes — `image-resize/format=webp,w={256,640,750,828,1080,1200,1920,3840}` + `sizes="100vw"` | **None** | Drift ships one fixed jpg per slot |
| Image bleed | mix: full-bleed hero pieces + contained rounded cards | contained rounded cards + one montage collage | comparable structure, far fewer assets |
| Sections use `<section>` | No (divs, 0 `<section>`) | Yes (9 `<section>`) | cosmetic |

**Takeaways:**
- **Image volume is the #1 gap (45 vs 9).** Mindtrip layers many product screenshots + photo cards + stickers per section; Drift shows one CSS card per section.
- **Image delivery:** Mindtrip serves responsive webp from a CDN (`d3fphkxyf5o5bm.cloudfront.net/image-resize/format=webp,w=…`) at 6–8 widths; Drift serves raw jpgs with no `srcset`/webp — a real performance + polish gap.

---

## 5. Motion / experience

| Dimension | Mindtrip | Drift | Gap |
|---|---|---|---|
| Hero | floating cutout landmarks + UI cards, parallax/float loops, typing caret | floating photo card + UI chips + float loops + caret | **comparable** |
| Product cards | layered, some parallax | cascade-in on scroll + count-up + hover lift | Drift's card motion is arguably richer here |
| Video | "Play video" (modal) | none | Drift has no video moment |
| Per-feature CTA | "Try it Now" on each new feature | none per feature | Mindtrip has many more in-page conversion prompts |
| Reveal | scroll reveals | scroll reveals + rAF/timeout failsafe | match |

**Takeaway:** Motion is the **closest** dimension — Drift is competitive here. The gap is not "how it animates" but "how much there is to animate" (fewer assets/sections).

---

## 6. Content architecture (why Mindtrip feels deep)

**Mindtrip section flow (~14 blocks):**
1. Hero (rotating word + collage)
2. How it Works — **4 sub-steps** (Start chatting, Popular itineraries, Personalized recs, Plan with crew) each with its own screenshot cluster
3. Upload/organize receipts
4. 🎉 New at Mindtrip — **4 features** (Events, Google Pins, Collections, Start Anywhere) each with a "Try it Now"
5. Mindtrip for iOS (dark section)
6. Everything you need — **5 features** (Photos/maps/reviews, Tailored recs, Custom plans, Collaboration, Popular itineraries)
7. Organize it all — **6 verticals** (Hotels, Car, Flights, Restaurants, Experiences, Tours)
8. Get inspired (destinations)
9. Create·Inspire·Earn (creator program)
10. Social hashtags
11. **As featured in** — 6 press outlets
12. Footer (large, multi-column)

**Drift section flow (9 blocks):**
1. Hero
2. Ask Drift (chat card)
3. Stays compare (card)
4. Split (card)
5. Plan/itinerary (card)
6. Everything a trip needs — 6-tile grid
7. Trust logos
8. Montage (8 photos)
9. Final CTA
+ Footer (single row)

**Gap:** Mindtrip has **4 rich feature clusters** (How-it-works, New, Everything, Organize) totaling ~20 feature callouts, plus **social proof** (press "As featured in", creator program, hashtags) and a **big footer**. Drift has 4 product cards + a 6-tile grid and **no social proof / no press / no "how it works" step flow / thin footer.**

---

## 7. Prioritized gap list (what to change in a rebuild)

Ranked by impact on closing the "thin vs Mindtrip" feel:

1. **Imagery volume & delivery (biggest):** go from 9 → ~30+ assets. Layer real app screenshots (multiple per section), photo cards, and stickers. Serve **responsive webp** (add a build step or an image CDN) with `srcset` at ~5 widths.
2. **Body copy depth:** ~214 → ~500+ words. Every product moment needs a real supporting paragraph + sub-points; add a "How it works" 3–4 step flow.
3. **More sections / social proof:** add a "How it works" step sequence, a press/"as seen in" strip, and a richer multi-column footer. Target ~12–13 blocks.
4. **Container width:** widen 1200 → ~1500px so sections breathe like Mindtrip.
5. **More in-page CTAs:** add per-section "Try it / See it" prompts (3 → ~8).
6. **Typographic contrast (optional, identity call):** if matching Mindtrip's punch, go heavier (700) and higher contrast (pure #000/#fff). If keeping Drift's identity, retain Fraunces serif + coral but consider bumping display weight.

*Rhythm/section-padding and hero/card motion are already close — do not over-invest there.*
