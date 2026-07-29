"use client"

import { Suspense, lazy, type ReactNode } from "react"
import { type Components } from "react-markdown"

// react-markdown is ~37 kB and only ever renders AFTER an async answer arrives,
// so it's a lazy chunk rather than weight on every trip page (/app/trips/[id]
// measured 207 kB → 244 kB when imported statically). React.lazy rather than
// next/dynamic because the fallback needs the text: while the chunk loads we
// show the answer with its markers STRIPPED, since a flash of raw "**" is the
// exact bug this file exists to fix.
const Markdown = lazy(() => import("react-markdown"))

// ---- Rich text renderer for assistant messages ----
// The model emits markdown: **bold**, *italic*, headings, ordered/unordered
// lists, and [label](places:?q=…) place links (plus the occasional http link).
// Shared by the trip chat, the Chats tab, and the destination "Curious" Q&A.
//
// This used to be a hand-rolled parser, and it had a bug worth remembering: it
// tokenized LINKS first and only then looked for **bold** inside each remaining
// text fragment. So a bold span that CONTAINED a link —
//   "**July 2 is a great time to visit [Reykjavík](places:?q=…): …**"
// which is how the model actually writes these answers — got split by the link
// into two fragments, each holding one orphaned "**" that matched nothing and
// rendered as literal asterisks. Nested inline markup is exactly what a real
// parser gets right for free, so the parsing is react-markdown's job now and
// this file only owns presentation.
//
// Raw HTML is NOT enabled (no rehype-raw), so model output can't inject markup —
// react-markdown escapes it, which is the sanitisation story here.

// Keep `places:` links alive. react-markdown's default urlTransform strips any
// scheme outside its safe list, which would silently kill every place link.
function urlTransform(url: string): string {
  return /^(https?:|mailto:|places:|#|\/|\.)/i.test(url) ? url : ""
}

// Typography: quiet and well-set rather than a markdown dump. Bold is semibold
// (600) — enough to lift a phrase without the clunky black of <strong>'s
// default — and paragraphs/lists share one rhythm so an over-bolded answer
// still reads calmly. Sizing/colour are inherited from the host card.
const components: Components = {
  p: ({ children }) => <p className="mt-2.5 leading-[1.6] first:mt-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mt-2.5 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-2.5 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="pl-1 leading-[1.55] marker:text-drift-text-tertiary">{children}</li>
  ),
  h1: ({ children }) => <Heading>{children}</Heading>,
  h2: ({ children }) => <Heading>{children}</Heading>,
  h3: ({ children }) => <Heading>{children}</Heading>,
  h4: ({ children }) => <Heading>{children}</Heading>,
  h5: ({ children }) => <Heading>{children}</Heading>,
  h6: ({ children }) => <Heading>{children}</Heading>,
  hr: () => <hr className="my-3 border-drift-divider" />,
  blockquote: ({ children }) => (
    <blockquote className="mt-2.5 border-l-2 border-drift-divider pl-3 text-drift-muted first:mt-0">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-black/10 px-1 py-0.5 text-[0.92em]">{children}</code>
  ),
  a: ({ href, children }) => {
    // Real links open out; places:?q=… stays in-app as a tappable coral chip
    // that asks Drift about it (unchanged behaviour — the chat listens for
    // "drift:ask-about").
    if (href && /^https?:/i.test(href)) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-drift-coral underline decoration-drift-coral/50 underline-offset-2"
        >
          {children}
        </a>
      )
    }
    const label = typeof children === "string" ? children : plainText(children)
    return (
      <button
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("drift:ask-about", { detail: `Tell me about ${label}` })
          )
        }
        className="font-semibold text-drift-coral [border-bottom:1.5px_dotted_rgba(224,86,59,0.5)]"
      >
        {children}
      </button>
    )
  },
}

function Heading({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-3.5 text-[14px] font-semibold text-drift-ink first:mt-0">{children}</p>
  )
}

// A link label is usually a plain string, but emphasis inside it ([**X**](…))
// arrives as elements — flatten for the "Tell me about {label}" prompt.
function plainText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(plainText).join("")
  const props = (node as { props?: { children?: ReactNode } }).props
  return props?.children ? plainText(props.children) : ""
}

// Readable text for the pre-load moment: drop the syntax rather than print it.
function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [label](url) → label
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, "$1$2") // italic (not list bullets)
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^\s*[-*•]\s+/gm, "• ") // bullets
    .replace(/`/g, "")
}

export function renderRich(text: string): ReactNode {
  return (
    <Suspense
      fallback={<p className="whitespace-pre-line leading-[1.6]">{stripMarkdown(text)}</p>}
    >
      <Markdown components={components} urlTransform={urlTransform}>
        {text}
      </Markdown>
    </Suspense>
  )
}
