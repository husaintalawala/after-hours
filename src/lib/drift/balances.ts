// Deterministic shared-ledger balances — verbatim port of the iOS
// Core/ExpenseBalances.swift pure functions. All money in USD minor units
// (cents), matching expense_splits.share_minor. Net across households always
// sums to zero (Σpaid = Σshare = trip total); recorded settlements shift the
// payer up / payee down; greedy largest-creditor-vs-largest-debtor reduction
// yields at most N−1 transfers with deterministic id tie-breaks.

export interface BalanceHousehold {
  id: string
  memberUserIds: Set<string>
}

export interface HouseholdBalance {
  householdId: string
  netMinor: number
}

export interface BalanceTransfer {
  fromHousehold: string
  toHousehold: string
  amountMinor: number
}

export function balances(
  households: BalanceHousehold[],
  paidByPayer: Array<{ payerUserId: string | null; amountMinor: number }>,
  splits: Array<{ householdId: string; shareMinor: number }>,
  settlements: Array<{ fromHousehold: string; toHousehold: string; amountMinor: number }> = []
): HouseholdBalance[] {
  const paid = new Map<string, number>()
  const share = new Map<string, number>()
  for (const h of households) {
    paid.set(h.id, 0)
    share.set(h.id, 0)
  }

  for (const e of paidByPayer) {
    if (!e.payerUserId) continue // unattributed / non-member payer → no balance
    const h = households.find((x) => x.memberUserIds.has(e.payerUserId!))
    if (!h) continue
    paid.set(h.id, (paid.get(h.id) ?? 0) + e.amountMinor)
  }
  for (const s of splits) {
    if (!share.has(s.householdId)) continue
    share.set(s.householdId, (share.get(s.householdId) ?? 0) + s.shareMinor)
  }
  // A recorded settlement is real cash: from-household paid that much more,
  // to-household that much less. Zero-sum holds.
  for (const st of settlements) {
    if (paid.has(st.fromHousehold))
      paid.set(st.fromHousehold, (paid.get(st.fromHousehold) ?? 0) + st.amountMinor)
    if (paid.has(st.toHousehold))
      paid.set(st.toHousehold, (paid.get(st.toHousehold) ?? 0) - st.amountMinor)
  }

  return [...households]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((h) => ({
      householdId: h.id,
      netMinor: (paid.get(h.id) ?? 0) - (share.get(h.id) ?? 0),
    }))
}

export function minimalTransfers(bals: HouseholdBalance[]): BalanceTransfer[] {
  const net = bals
    .filter((b) => b.netMinor !== 0)
    .map((b) => ({ id: b.householdId, amt: b.netMinor }))
  const transfers: BalanceTransfer[] = []

  for (;;) {
    const ci = extremeIndex(net, true)
    const di = extremeIndex(net, false)
    if (ci == null || di == null || net[ci].amt <= 0 || net[di].amt >= 0) break
    const pay = Math.min(net[ci].amt, -net[di].amt)
    transfers.push({ fromHousehold: net[di].id, toHousehold: net[ci].id, amountMinor: pay })
    net[ci].amt -= pay
    net[di].amt += pay
  }
  return transfers
}

function extremeIndex(
  net: Array<{ id: string; amt: number }>,
  pickHighest: boolean
): number | null {
  if (!net.length) return null
  let best = 0
  for (let i = 1; i < net.length; i++) {
    const better = pickHighest
      ? net[i].amt > net[best].amt ||
        (net[i].amt === net[best].amt && net[i].id < net[best].id)
      : net[i].amt < net[best].amt ||
        (net[i].amt === net[best].amt && net[i].id < net[best].id)
    if (better) best = i
  }
  return best
}
