"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

function useBrowseState() {
  const [category, setCategory] = useState<string | null>(null)
  const [monthKey, setMonthKey] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  return { category, setCategory, monthKey, setMonthKey, query, setQuery }
}
const Context = createContext<ReturnType<typeof useBrowseState> | null>(null)

// Only small selections survive navigation. Maps, images and guide bodies
// still unmount. The authenticated layout keys this provider by account.
export default function InspireBrowseState({ children }: { children: ReactNode }) {
  const state = useBrowseState()
  return <Context.Provider value={state}>{children}</Context.Provider>
}

export function useInspireBrowseState() {
  const state = useContext(Context)
  if (!state) throw new Error("Inspire requires its signed-in browse state")
  return state
}
