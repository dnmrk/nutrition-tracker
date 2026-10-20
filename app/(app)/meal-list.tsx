"use client";

import Link from "next/link";
import type { DayMeal } from "@/lib/today";

export function MealList({ meals }: { meals: DayMeal[] }) {
  return (
    <section aria-labelledby="meals-h" className="flex flex-col gap-3">
      <h2 id="meals-h" className="text-lg font-semibold">Meals</h2>
      {meals.length === 0 ? (
        <>
          <p>No meals logged on this day.</p>
          <Link href="/log" className="inline-flex self-start rounded-full bg-accent px-4 py-2 font-medium text-on-accent">
            Snap meal
          </Link>
        </>
      ) : (
        <ul className="flex flex-col gap-3">
          {meals.map((m, i) => (
            <li
              key={m.id}
              className="flex animate-meal-in items-start gap-3 rounded-2xl bg-surface p-3 motion-reduce:animate-none"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span aria-hidden className="grid size-[46px] shrink-0 place-items-center rounded-xl bg-track font-semibold">
                {m.initial}
              </span>
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <p className="font-medium">{m.names}</p>
                <p className="text-sm text-muted tabular-nums">
                  {m.itemCount === 1 ? "1 item" : `${m.itemCount} items`} · {m.kcal} kcal
                </p>
              </div>
              <span className="shrink-0 text-sm text-muted tabular-nums">{m.time}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
