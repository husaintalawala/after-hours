"use client"

import { WALK_THROUGH, isEscape, type PlanningMode } from "@/lib/drift/chatPlanning"

/**
 * QUICK OR GUIDED, CHOSEN BEFORE THE FIRST PLAN.
 *
 * Quick is selected, so the person who wants a plan with no decisions taps
 * nothing here; the person who wants to choose taps once and the plan's
 * questions come one at a time. Shared by the trip chat and the general chat so
 * the choice reads identically wherever it is offered.
 */
export function PlanningModePicker({
  mode,
  onChange,
}: {
  mode: PlanningMode
  onChange: (mode: PlanningMode) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <ModePill label="Draft it now" selected={mode === "quick"} onClick={() => onChange("quick")} />
        <ModePill label={WALK_THROUGH} selected={mode === "guided"} onClick={() => onChange("guided")} />
      </div>
      <p className="text-[12px] text-drift-text-tertiary">
        {mode === "quick"
          ? "Plans arrive drafted from your saved preferences."
          : "For plans, I'll ask a few quick questions first."}
      </p>
    </div>
  )
}

function ModePill({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
        selected
          ? "bg-drift-coral text-white"
          : "border border-aurora-border bg-aurora-glass2 text-aurora-ink2 hover:text-aurora-ink"
      }`}
    >
      {label}
    </button>
  )
}

/**
 * Tappable ANSWER options for the question just asked — filled coral rows,
 * deliberately unlike the muted "you might want to ask" list, so they read as
 * "tap to answer" rather than as suggestions.
 *
 * The way out ("Just draft it" / "Just show me") is NOT an answer, so it sits
 * under them as a quiet link rather than as one more option.
 */
export function ReplyChips({ chips, onPick }: { chips: string[]; onPick: (chip: string) => void }) {
  const escape = chips.find(isEscape)
  const answers = chips.filter((c) => !isEscape(c)).slice(0, 6)
  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex flex-wrap gap-2">
        {answers.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onPick(chip)}
            className="rounded-full bg-drift-coral px-3 py-1.5 text-[13px] font-medium text-white"
          >
            {chip}
          </button>
        ))}
      </div>
      {escape && (
        <button
          type="button"
          onClick={() => onPick(escape)}
          className="text-[13px] font-semibold text-drift-text-tertiary hover:text-aurora-ink"
        >
          {escape} &rarr;
        </button>
      )}
    </div>
  )
}
