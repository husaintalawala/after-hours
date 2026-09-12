"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { DiscoverAnchor, DiscoverResult } from "@/lib/drift/discover"

/**
 * Places the reader hearted. Backed by `public.saved_places`, the same table
 * the phone writes.
 *
 * WHAT THIS REPLACES: nothing, which was the bug. The Save control existed in
 * two places on the web — the place sheet and every Discover result row — and
 * both were `onClick={() => setSaved((v) => !v)}`. The heart filled, no row was
 * ever written, and the state died on the next navigation. `saved_places`
 * appeared in the whole web codebase exactly once, in the generated
 * `database.types.ts`. So a web reader could save a place all day and find
 * nothing on the phone, and the phone's saves were invisible here.
 *
 * THE COLUMNS MATCH iOS DELIBERATELY (SavedPlacesService.save): a row written
 * here has to be readable there and vice versa, and a second opinion about
 * which columns a saved place has is how the two clients start disagreeing.
 * `photo_ref` is NULL on purpose, exactly as iOS leaves it — Google's Places
 * ToS forbids retaining a photo reference, and resolve-place re-derives one on
 * read for free.
 */

/** One shared set for the whole page. */
let cache: Set<string> | null = null
let inflight: Promise<Set<string>> | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/**
 * The ids this account has kept.
 *
 * CACHED ACROSS COMPONENTS, because Discover renders a row per result and a
 * per-row query would be one request per place on screen. iOS solves it the
 * same way with a single published `savedIDs` set.
 *
 * A FAILURE IS NOT AN EMPTY SET. It returns null and caches nothing, so the
 * hearts stay unfilled but the next mount asks again — caching `[]` from a
 * failed read is what makes "you have saved nothing" a lie that persists, and
 * this codebase has now fixed that exact shape three times.
 */
async function loadIds(): Promise<Set<string> | null> {
  const db = createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return new Set()

  const { data, error } = await db
    .from("saved_places")
    .select("place_id")
    .eq("user_id", user.id)
  if (error) return null

  return new Set(
    (data ?? []).map((r) => r.place_id).filter((id): id is string => !!id)
  )
}

/**
 * Write or remove one place, and REPORT WHETHER IT LANDED.
 *
 * AWAITED, not fired: supabase-js query builders are lazy, so an un-awaited
 * `.upsert()` never sends at all — a defect this codebase has shipped before.
 */
async function write(
  place: DiscoverResult,
  anchor: DiscoverAnchor | null,
  category: string,
  next: boolean
): Promise<boolean> {
  const db = createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return false

  if (!next) {
    const { error } = await db
      .from("saved_places")
      .delete()
      .eq("user_id", user.id)
      .eq("place_id", place.id)
    return !error
  }

  const { error } = await db.from("saved_places").upsert(
    {
      user_id: user.id,
      place_id: place.id,
      name: place.name,
      latitude: place.lat,
      longitude: place.lng,
      address: place.address,
      category,
      // Google's machine type, which this shape does not carry — `subtitle` is
      // a humanised label for display and writing it here would put prose in a
      // column the phone reads as a type.
      primary_type: null,
      // Never retained. See the note at the top of this file.
      photo_ref: null,
      rating: place.rating,
      price_level: null,
      source: place.source,
      destination_name: anchor?.label ?? null,
      country: anchor?.country ?? null,
      trip_id: null,
    },
    { onConflict: "user_id,place_id" }
  )
  return !error
}

/**
 * The heart, for any surface that shows a place.
 *
 * `toggle` flips optimistically and PUTS IT BACK when the write fails, which is
 * the rule the rest of this app follows: a control that reports success it did
 * not achieve is worse than one that is briefly slow.
 */
export function useSavedPlaces() {
  const [, bump] = useState(0)

  useEffect(() => {
    const listener = () => bump((n) => n + 1)
    listeners.add(listener)
    if (!cache && !inflight) {
      inflight = loadIds().then((s) => {
        // null = the read failed; leave the cache empty so a later mount retries.
        if (s) cache = s
        inflight = null
        emit()
        return s ?? new Set<string>()
      })
    }
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const isSaved = useCallback((id: string) => cache?.has(id) ?? false, [])

  const toggle = useCallback(
    async (
      place: DiscoverResult,
      anchor: DiscoverAnchor | null,
      category: string
    ): Promise<boolean> => {
      const was = cache?.has(place.id) ?? false
      const next = !was
      if (!cache) cache = new Set()
      if (next) cache.add(place.id)
      else cache.delete(place.id)
      emit()

      const ok = await write(place, anchor, category, next)
      if (!ok) {
        if (was) cache.add(place.id)
        else cache.delete(place.id)
        emit()
      }
      return ok
    },
    []
  )

  return { isSaved, toggle }
}
