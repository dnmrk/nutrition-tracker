"use client";

import { useState } from "react";
import type { Day, Targets } from "@/lib/today";
import { MealList } from "./meal-list";
import { WeekStrip } from "./week-strip";

// `targets` is consumed by MacroRings in Task 6.
export function TodayDays({ days }: { days: Day[]; targets: Targets | null }) {
  const [selected, setSelected] = useState(days[days.length - 1].date);
  const found = days.findIndex((d) => d.date === selected);
  const index = found === -1 ? days.length - 1 : found;
  const day = days[index];

  return (
    <>
      <WeekStrip days={days} index={index} onSelect={setSelected} />
      {/* MacroRings: Task 6 */}
      <MealList key={day.date} meals={day.meals} />
    </>
  );
}
