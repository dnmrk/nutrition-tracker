"use client";

import { useActionState } from "react";
import { TARGET_LIMITS } from "@/lib/nutrition";
import { saveTargets, type TargetsState } from "./actions";

type Targets = Record<keyof typeof TARGET_LIMITS, number>;

const FIELDS = [
  ["calorie_target", "Calories"],
  ["protein_target_g", "Protein (g)"],
  ["carbs_target_g", "Carbs (g)"],
  ["fat_target_g", "Fat (g)"],
] as const;

export function TargetsForm({ initial }: { initial: Targets | null }) {
  const [state, action, pending] = useActionState<TargetsState, FormData>(
    saveTargets,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {FIELDS.map(([name, label]) => (
        <label key={name} className="flex flex-col gap-1">
          {label}
          <input
            name={name}
            type="number"
            inputMode="numeric"
            step="1"
            required
            min={TARGET_LIMITS[name][0]}
            max={TARGET_LIMITS[name][1]}
            defaultValue={state?.values[name] ?? initial?.[name]}
            className="rounded border px-3 py-2"
          />
        </label>
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        Save targets
      </button>
      {/* Hidden while pending so a message never survives the next submit. */}
      {!pending && state && "ok" in state && <p role="status">Targets saved.</p>}
      {!pending && state && "error" in state && <p role="alert">{state.error}</p>}
    </form>
  );
}
