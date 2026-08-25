"use client"

import { useEffect, useRef, useState } from "react"

/**
 * The Unsplash credit on a cover photo.
 *
 * It used to be the whole string — "Photo by Willian Justen de Vasconcellos on
 * Unsplash" — as a black bar pinned bottom-right at max-w-[85%], which on a
 * phone reached far enough left to sit on top of the hero's chip row. It was
 * also `pointer-events-none` plain text, so the ONE thing the API Terms
 * actually require of it, the link back to the photographer, did not exist.
 *
 * Why it is not just deleted, and why it is not a bare ⓘ either. Two documents
 * govern, and they say different things. The Unsplash LICENSE covers a photo
 * you downloaded by hand and asks for nothing ("No permission needed (though
 * attribution is appreciated!)"). Our covers do not come from there — they come
 * through the API, which adds a contract: API Terms §9 binds the duty to the
 * display event, requiring attribution "each time ... your Developer App
 * displays an Image", with a link back to the photographer's profile. §4
 * separately bars mixing API content with other content such that users
 * "cannot attribute the Content to Unsplash" — which is exactly a travel app
 * mixing stock heros with user photos. A bare ⓘ carries no attribution on its
 * face, so it satisfies neither clause, and Production API access is granted by
 * a human reviewing screenshots of your attribution.
 *
 * So: collapsed, it is a small chip that still says "Unsplash" — the word does
 * the §4 work in about 80px instead of 300. Tapped, it expands to the full
 * credit with both links, UTM'd as the guidelines specify. The photographer's
 * name is never more than one tap away and the full string rides in aria-label
 * for anything reading the page rather than looking at it.
 */
export default function CoverCredit({
  text,
  href,
  // "corner" floats it over the photo, which is right for a plain cover. The
  // trip hero draws its own title, buddies and chips along the bottom, so a
  // floated credit lands ON them however small it is — shrinking the bar from
  // 246px to 77px moved the overlap, it did not remove it. "inline" puts the
  // credit in that same flex column instead, under the chips, exactly where
  // iOS stacks it, where flex layout makes an overlap impossible.
  placement = "corner",
}: {
  text: string
  href: string | null
  placement?: "corner" | "inline"
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Collapse on an outside tap. Without this the expanded credit sits over the
  // hero until the page navigates.
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", away)
    return () => document.removeEventListener("mousedown", away)
  }, [open])

  // "Photo by X on Unsplash" is written by our own unsplash-search function, so
  // this shape is ours, not Unsplash's — but fall back to the whole string
  // rather than rendering an empty byline if that ever changes.
  const photographer = /^Photo by (.+?) on Unsplash$/.exec(text)?.[1] ?? null

  // WHICH SERVICE, derived — never assumed. This component used to hardcode
  // "Unsplash", which is why the Inspire shelf refused to use it: 23 of its 38
  // heros are Wikimedia Commons, and crediting them to Unsplash is worse than
  // the bare source chip it printed instead.
  //
  // Commons is not a second Unsplash. There is no photographer profile to link,
  // and the LICENCE is part of the credit — CC BY-SA is not CC0 and must not be
  // displayed as though it were. So its whole string ("Author / CC BY-SA 4.0 ·
  // Wikimedia Commons") is the byline, linked to the file's description page,
  // which carries author, licence and source together.
  const isCommons = !photographer && /wikimedia|wikipedia/i.test(text)
  const service = photographer ? "Unsplash" : isCommons ? "Wikimedia" : "Photo"

  const UNSPLASH = "https://unsplash.com/?utm_source=drift&utm_medium=referral"
  const chip =
    "flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] leading-none text-white/85 backdrop-blur-sm " +
    (placement === "corner"
      ? "pointer-events-auto absolute bottom-1.5 right-1.5 z-10"
      : "relative mt-2.5 w-fit")

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          // The cover is usually inside a link or a card button.
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={`${text}. Show photo credit.`}
        className={`${chip} transition-colors hover:bg-black/65`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 8.5h3.2L8.8 6h6.4l1.6 2.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
          <circle cx="12" cy="13.2" r="3.1" />
        </svg>
        {service}
      </button>
    )
  }

  // Non-Unsplash credits carry their own complete wording, including the
  // licence, so they are rendered verbatim rather than forced into "Photo by X
  // on Y" — a shape that would drop the licence and invent a byline.
  if (!photographer) {
    return (
      <div ref={box} className={`${chip} max-w-[92%] flex-wrap`}>
        <span className="truncate">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="underline underline-offset-2"
            >
              {text}
            </a>
          ) : (
            text
          )}
        </span>
      </div>
    )
  }

  return (
    <div ref={box} className={`${chip} max-w-[92%] flex-wrap`}>
      <span className="truncate">
        Photo by{" "}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="underline underline-offset-2"
          >
            {photographer ?? "the photographer"}
          </a>
        ) : (
          (photographer ?? "the photographer")
        )}{" "}
        on{" "}
        <a
          href={UNSPLASH}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className="underline underline-offset-2"
        >
          Unsplash
        </a>
      </span>
    </div>
  )
}
