"use client"

import { type ReactNode } from "react"

// ---- Rich text renderer for assistant messages ----
// The model emits markdown-ish text: **bold**, [label](places:?q=...) place
// links (plus occasional http links), and block structure — headings (##/###),
// unordered lists (- / *) and ordered lists (1.). Render bold as <strong>,
// place links as coral tappable spans (tap → prefill "Tell me about {label}"),
// http links as real anchors. Consecutive bullet/number lines group into one
// <ul>/<ol>; other text splits into paragraphs on blank lines.
// Shared by the trip chat and the destination "Curious" Q&A.

export function renderRich(text: string): ReactNode {
  const lines = text.replace(/\r/g, "").split("\n")
  const blocks: ReactNode[] = []
  let para: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let key = 0
  const gap = () => (blocks.length ? "mt-2.5" : "")

  const flushPara = () => {
    if (!para.length) return
    blocks.push(
      <p key={`p${key++}`} className={gap() || undefined}>
        {renderInline(para.join("\n"))}
      </p>
    )
    para = []
  }
  const flushList = () => {
    if (!list) return
    const { ordered, items } = list
    const rows = items.map((it, i) => (
      <li key={i} className="pl-1 leading-[1.55] marker:text-drift-text-tertiary">
        {renderInline(it)}
      </li>
    ))
    const cls = `${gap()} space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`
    blocks.push(
      ordered ? (
        <ol key={`l${key++}`} className={cls}>
          {rows}
        </ol>
      ) : (
        <ul key={`l${key++}`} className={cls}>
          {rows}
        </ul>
      )
    )
    list = null
  }

  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed) {
      flushPara()
      flushList()
      continue
    }
    // Heading: #, ##, ### … → a small bold heading.
    const h = /^#{1,6}\s+(.*)$/.exec(trimmed)
    if (h) {
      flushPara()
      flushList()
      blocks.push(
        <p
          key={`h${key++}`}
          className={`${blocks.length ? "mt-3.5" : ""} text-[14px] font-semibold text-drift-ink`}
        >
          {renderInline(h[1])}
        </p>
      )
      continue
    }
    // Ordered list item: "1. " / "2) ".
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (ol) {
      flushPara()
      if (!list || !list.ordered) {
        flushList()
        list = { ordered: true, items: [] }
      }
      list.items.push(ol[1])
      continue
    }
    // Unordered list item: "- " / "* " / "• ".
    const ul = /^[-*•]\s+(.*)$/.exec(trimmed)
    if (ul) {
      flushPara()
      if (!list || list.ordered) {
        flushList()
        list = { ordered: false, items: [] }
      }
      list.items.push(ul[1])
      continue
    }
    // Plain paragraph line (a stray non-list line closes any open list).
    flushList()
    para.push(raw)
  }
  flushPara()
  flushList()
  return blocks
}

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  // Tokenize links first, then bold within the remaining text.
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  const pushText = (t: string) => {
    // Bold segments within plain text.
    const parts = t.split(/\*\*([^*]+)\*\*/g)
    parts.forEach((part, i) => {
      if (!part) return
      if (i % 2 === 1) out.push(<strong key={`b${key++}`}>{part}</strong>)
      else
        part.split("\n").forEach((line, li, arr) => {
          out.push(<span key={`t${key++}`}>{line}</span>)
          if (li < arr.length - 1) out.push(<br key={`br${key++}`} />)
        })
    })
  }
  while ((m = linkRe.exec(text))) {
    pushText(text.slice(last, m.index))
    const [, label, href] = m
    if (href.startsWith("http")) {
      out.push(
        <a
          key={`l${key++}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-drift-coral underline decoration-drift-coral/50 underline-offset-2"
        >
          {label}
        </a>
      )
    } else {
      // places:?q=… (or any app link): coral tappable → ask Drift about it.
      out.push(
        <button
          key={`p${key++}`}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("drift:ask-about", { detail: `Tell me about ${label}` })
            )
          }
          className="font-semibold text-drift-coral [border-bottom:1.5px_dotted_rgba(224,86,59,0.5)]"
        >
          {label}
        </button>
      )
    }
    last = m.index + m[0].length
  }
  pushText(text.slice(last))
  return out
}
