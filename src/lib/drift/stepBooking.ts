// The membership-scoped half of a step: its booking reference and party size.
//
// `steps` rows are readable by any authenticated user the moment a trip is
// public — RLS is row-level, not column-level, so a public trip publishes
// every column of every step it owns. A confirmation code plus the surname on
// that same public trip is enough to view, change or cancel the booking on
// most airline and hotel sites. So the code and the party size live in
// `step_bookings`, whose own RLS is keyed on trip membership, and they reach
// the client as a PostgREST embed on the steps query.
//
// Two shapes have to be tolerated at once, because these readers run against
// the schema before AND after `steps.confirmation_number` is dropped:
//   - the embed, which PostgREST hands back as an object when it can prove the
//     foreign key is unique and as a one-element array when it cannot;
//   - the legacy column, still present until the drop migration lands.
// Absence of either is a `null` value, never a throw and never a failed query.

/** Embed clause to append to any `steps` select whose reader needs a booking
 *  reference. NOTE: never ask for `steps.confirmation_number` by name in an
 *  explicit column list — naming a dropped column 400s the whole query. */
export const STEP_BOOKING_EMBED = "step_bookings(confirmation_number, guest_count)"

type BookingFields = {
  confirmation_number?: string | null
  guest_count?: number | null
}

/** A step row as the readers see it: the embed, the legacy column, or neither. */
export type StepWithBooking = BookingFields & { step_bookings?: unknown }

function embedded(row: StepWithBooking | null | undefined): BookingFields | null {
  const raw = row?.step_bookings
  if (!raw) return null
  const one = Array.isArray(raw) ? raw[0] : raw
  return one && typeof one === "object" ? (one as BookingFields) : null
}

/** Booking reference for a step — embed first, legacy column as the fallback. */
export function stepConfirmationNumber(row: StepWithBooking | null | undefined): string | null {
  return embedded(row)?.confirmation_number ?? row?.confirmation_number ?? null
}

/** Party size for a step. Same two-schema rule as the confirmation number. */
export function stepGuestCount(row: StepWithBooking | null | undefined): number | null {
  return embedded(row)?.guest_count ?? row?.guest_count ?? null
}
