"use client"

import { useEffect, useRef, useState } from "react"
import type { PlaceCandidate } from "@/lib/drift/chat"
import { cityContext } from "@/lib/drift/daybreakPresentation"
import { Cta, Question, Skip } from "./DaybreakSteps"

export default function DaybreakOrigin({ query, onQuery, onSearch, searching, saving, results, chosen, context, error, onPick, onNext, onSkip }: {
  query: string; onQuery: (value: string) => void; onSearch: () => void
  searching: boolean; saving: boolean; results: PlaceCandidate[]
  chosen: string | null; context: string | null; error: string | null
  onPick: (city: PlaceCandidate) => Promise<boolean>; onNext: () => void; onSkip: () => void
}) {
  const [editing, setEditing] = useState(!chosen)
  const input = useRef<HTMLInputElement>(null)
  const selected = useRef<HTMLElement>(null)
  const changed = useRef(false)
  useEffect(() => {
    if (!changed.current) return
    if (editing) input.current?.focus()
    else selected.current?.focus({ preventScroll: true })
  }, [editing])
  async function pick(city: PlaceCandidate) {
    if (await onPick(city)) { changed.current = true; setEditing(false) }
  }
  return <div className="db-origin">
    <Question title={editing ? "Where do you set out from?" : "Every escape starts somewhere."} />
    {editing ? <>
      <form className="db-city-search" onSubmit={event => { event.preventDefault(); onSearch() }}>
        <label htmlFor="daybreak-home-city">Home city</label>
        <input ref={input} id="daybreak-home-city" value={query} onChange={event => onQuery(event.target.value)} placeholder="Your city" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" aria-controls="daybreak-city-results" aria-describedby={error ? "daybreak-city-error" : undefined} />
        {searching && <p role="status">Searching cities…</p>}
      </form>
      <div id="daybreak-city-results" className="db-city-results" role="group" aria-label="Matching cities" aria-busy={searching || saving}>
        {results.map(city => <button key={city.id} type="button" disabled={saving || searching} onClick={() => void pick(city)}>
          <span><strong>{city.name}</strong>{cityContext(city.name, city.address) && <small>{cityContext(city.name, city.address)}</small>}</span><span aria-hidden="true">→</span>
        </button>)}
      </div>
      {saving && <p role="status" className="db-city-status">Saving your starting point…</p>}
    </> : <section className="db-city-selected" ref={selected} tabIndex={-1} aria-label={`Starting point: ${chosen}`}>
      <div className="db-city-change"><span>From</span><button type="button" onClick={() => { changed.current = true; onQuery(chosen ?? ""); setEditing(true) }}>Change</button></div>
      <h2>{chosen}</h2>{context && <p>{cityContext(chosen ?? "", context)}</p>}
      <div className="db-city-outro">And from here, anywhere.</div>
    </section>}
    {error && <p role="alert" id="daybreak-city-error" className="db-city-status">{error}</p>}
    <div className="db-footer"><Cta label="Continue" disabled={editing || saving || !chosen} onClick={onNext} /><Skip label="Skip for now" onClick={onSkip} /></div>
  </div>
}
