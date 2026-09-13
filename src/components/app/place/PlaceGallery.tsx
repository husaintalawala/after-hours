"use client"
import { useEffect, useRef, useState } from "react"

type Photo = { src: string; credits: { name: string; uri: string | null }[] }
export default function PlaceGallery({ name, photos }: { name: string; photos: Photo[] }) {
  const [selected, setSelected] = useState<number | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (selected !== null && !dialog.current?.open) dialog.current?.showModal()
    if (selected === null && dialog.current?.open) dialog.current.close()
  }, [selected])
  const credit = (photo: Photo) => photo.credits.length > 0 && <figcaption>{photo.credits.map((author, index) => author.uri ? <a key={index} href={author.uri} target="_blank" rel="noreferrer">{author.name}</a> : <span key={index}>{author.name}</span>)}</figcaption>
  if (!photos.length) return null
  return <>
    <section className="place-gallery" data-count={photos.length} aria-label={`Photos of ${name}`}>
      {photos.map((photo, index) => <figure key={photo.src} className={index === 0 ? "place-gallery-main" : ""}>
        <button type="button" onClick={() => setSelected(index)} aria-label={`Open photo ${index + 1} of ${name}`}>
          {/* Direct Google photo URLs; no optimizer, extra sizes, or prefetch. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.src} alt={`${name}, photo ${index + 1}`} loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" />
          {index === 0 && <span className="place-photo-label">View photos</span>}
        </button>{credit(photo)}
      </figure>)}
    </section>
    <dialog ref={dialog} className="place-lightbox" aria-label={`Photos of ${name}`} onCancel={() => setSelected(null)} onClose={() => setSelected(null)} onKeyDown={event => {
      if (selected === null) return
      if (event.key === 'ArrowRight') { event.preventDefault(); setSelected((selected + 1) % photos.length) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setSelected((selected + photos.length - 1) % photos.length) }
    }}>
      {selected !== null && <><header><span>{name} · {selected + 1} / {photos.length}</span><button type="button" onClick={() => setSelected(null)} aria-label="Close photos">×</button></header><figure>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[selected].src} alt={`${name}, photo ${selected + 1}`} />{credit(photos[selected])}
      </figure>{photos.length > 1 && <nav aria-label="Photo navigation"><button type="button" onClick={() => setSelected((selected + photos.length - 1) % photos.length)}>← Previous</button><button type="button" onClick={() => setSelected((selected + 1) % photos.length)}>Next →</button></nav>}</>}
    </dialog>
  </>
}
