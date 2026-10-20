"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ringOffset, type Targets, type Totals } from "@/lib/today";

const RINGS = [
  ["Protein", "protein_g", "protein_target_g", 72, "stroke-macro-protein", "bg-macro-protein"],
  ["Carbs", "carbs_g", "carbs_target_g", 53, "stroke-macro-carbs", "bg-macro-carbs"],
  ["Fat", "fat_g", "fat_target_g", 34, "stroke-macro-fat", "bg-macro-fat"],
] as const;

// Eases from the currently shown value to the new one; the first render shows the final value.
function useCountUp(value: number, ms = 900): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
    let raf = 0,
      t0 = -1;
    const tick = (t: number) => {
      if (t0 < 0) t0 = t;
      const p = dur ? Math.min(1, (t - t0) / dur) : 1;
      const v = start + (value - start) * (1 - (1 - p) ** 3);
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return Math.round(shown);
}

function Legend({ name, value, target, bg }: { name: string; value: number; target: number | null; bg: string }) {
  const shown = useCountUp(value);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`size-2 rounded-full ${bg}`} />
        <span className="text-sm font-medium">{name}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-1">
        <span className="text-[26px] font-semibold leading-none tabular-nums">{shown}</span>
        <span className="text-sm text-muted">{target === null ? "g" : `/ ${target} g`}</span>
      </div>
    </div>
  );
}

export function MacroRings({ totals, targets }: { totals: Totals; targets: Targets | null }) {
  const kcal = Math.round(totals.calories);
  const rows = RINGS.map(([name, key, tkey, r, stroke, bg]) => ({
    name, r, stroke, bg,
    eaten: totals[key],
    value: Math.round(totals[key]),
    target: targets ? targets[tkey] : null,
  }));
  const [p, c, f] = rows;
  const summary = targets
    ? `${kcal} kcal. Protein ${p.value} of ${p.target} g, Carbs ${c.value} of ${c.target} g, Fat ${f.value} of ${f.target} g`
    : `${kcal} kcal. Protein ${p.value} g, Carbs ${c.value} g, Fat ${f.value} g. No targets set`;
  const left = targets ? targets.calorie_target - kcal : 0;

  return (
    <section className="flex flex-wrap items-center justify-center gap-4 rounded-3xl bg-surface p-5">
      <div role="img" aria-label={summary} className="relative size-40 shrink-0">
        <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true" className="-rotate-90">
          {rows.map((row) => {
            const off = row.target === null ? 1 : ringOffset(row.eaten, row.target);
            return (
              <g key={row.name}>
                <circle cx="80" cy="80" r={row.r} fill="none" strokeWidth="15" className={`${row.stroke} opacity-20`} />
                {row.target !== null && (
                  <circle
                    data-ring="progress"
                    cx="80"
                    cy="80"
                    r={row.r}
                    fill="none"
                    strokeWidth="15"
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray="1"
                    style={{ strokeDashoffset: off }}
                    className={`${row.stroke} transition-[stroke-dashoffset] duration-[1100ms] ease-fluid motion-reduce:duration-200 ${off === 1 ? "opacity-0" : ""}`}
                  />
                )}
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-lg font-bold leading-none tabular-nums">{kcal}</span>
          <span className="text-xs leading-none text-muted">kcal</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 basis-[120px] flex-col gap-2">
        {rows.map((row) => (
          <Legend key={row.name} name={row.name} value={row.value} target={row.target} bg={row.bg} />
        ))}
        {targets ? (
          <p className="text-sm text-muted tabular-nums">
            {Math.abs(left)} kcal {left >= 0 ? "left" : "over"}
          </p>
        ) : (
          <Link href="/settings" className="text-sm font-medium underline">
            Set your daily targets
          </Link>
        )}
      </div>
    </section>
  );
}
