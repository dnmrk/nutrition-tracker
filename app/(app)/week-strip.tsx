"use client";

import { useRef } from "react";
import type { Day } from "@/lib/today";

export function WeekStrip({ days, index, onSelect }: { days: Day[]; index: number; onSelect: (date: string) => void }) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent) {
    const last = days.length - 1;
    const next =
      e.key === "ArrowLeft" ? Math.max(0, index - 1)
      : e.key === "ArrowRight" ? Math.min(last, index + 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    onSelect(days[next].date);
    buttonRefs.current[next]?.focus();
  }

  return (
    <div role="group" aria-label="Last 7 days" className="relative grid grid-cols-7 overflow-hidden rounded-full bg-track p-1">
      <div
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc((100%-8px)/7)] rounded-full bg-linear-to-b from-accent to-accent-strong transition-transform duration-[590ms] ease-spring motion-reduce:duration-200 motion-reduce:ease-out"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {days.map((d, i) => {
        const selected = i === index;
        return (
          <button
            key={d.date}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            type="button"
            aria-pressed={selected}
            aria-label={d.label}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(d.date)}
            onKeyDown={onKeyDown}
            className={`relative z-10 flex h-[62px] flex-col items-center justify-center gap-1 rounded-full outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 ${
              selected ? "focus-visible:outline-on-accent" : "focus-visible:outline-foreground"
            }`}
          >
            <span className={`text-xs font-medium ${selected ? "text-on-accent" : "text-muted"}`}>{d.weekday}</span>
            <span className={`text-base font-semibold tabular-nums ${selected ? "text-on-accent" : "text-foreground"}`}>
              {d.dayNumber}
            </span>
            <span
              className={`size-[5px] rounded-full ${selected ? "bg-on-accent" : "bg-macro-protein"} ${d.goalMet ? "" : "invisible"}`}
            />
          </button>
        );
      })}
    </div>
  );
}
