import type { Database } from "./database.types"

// Row aliases derived from the live schema (src/lib/database.types.ts, generated
// from Supabase). Replaces the earlier hand-written guesses.
export type TripRow = Database["public"]["Tables"]["trips"]["Row"]
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
export type StepRow = Database["public"]["Tables"]["steps"]["Row"]
export type TripBuddyRow = Database["public"]["Tables"]["trip_buddies"]["Row"]
export type TransportBookingRow = Database["public"]["Tables"]["transport_bookings"]["Row"]
export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"]
export type KitItemRow = Database["public"]["Tables"]["kit_items"]["Row"]
