import Link from "next/link";
import { fmt, sumItems, type MealItem } from "@/lib/nutrition";
import { getToday, requireUser } from "@/lib/supabase/server";

export default async function TodayPage() {
  const { supabase } = await requireUser();
  const { date, timeZone } = await getToday();
  const [meals, targets] = await Promise.all([
    supabase.from("meals").select("id, logged_at, items").eq("eaten_on", date).order("logged_at"),
    supabase
      .from("daily_targets")
      .select("calorie_target, protein_target_g, carbs_target_g, fat_target_g")
      .maybeSingle(),
  ]);
  if (meals.error || targets.error) throw new Error("Failed to load today");

  const rows = meals.data as { id: string; logged_at: string; items: MealItem[] }[];
  const total = sumItems(rows.flatMap((m) => m.items));
  const t = targets.data;
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const left = t ? t.calorie_target - Math.round(total.calories) : 0;
  const macros = [
    ["Protein", total.protein_g, t?.protein_target_g],
    ["Carbs", total.carbs_g, t?.carbs_target_g],
    ["Fat", total.fat_g, t?.fat_target_g],
  ] as const;

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Today</h1>
        <Link href="/log" className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
          Snap meal
        </Link>
      </div>

      <section className="mb-6">
        {t ? (
          <>
            <p className="text-xl">{fmt(total.calories)} / {t.calorie_target} kcal</p>
            <p>{left >= 0 ? `${left} kcal left` : `${-left} kcal over`}</p>
          </>
        ) : (
          <>
            <p className="text-xl">{fmt(total.calories)} kcal</p>
            <Link href="/settings" className="underline">Set your daily targets</Link>
          </>
        )}
      </section>

      <section className="mb-6 flex flex-col gap-3">
        {macros.map(([label, eaten, target]) => (
          <div key={label}>
            <div className="flex justify-between">
              <span>{label}</span>
              <span>{target === undefined ? `${fmt(eaten)} g` : `${fmt(eaten)} / ${target} g`}</span>
            </div>
            {target !== undefined && (
              // shortcut: max=0 (a 0 g target) is clamped to 1, since <progress max=0> is invalid.
              <progress aria-label={`${label} progress`} value={eaten} max={target || 1} className="w-full" />
            )}
          </div>
        ))}
      </section>

      {rows.length === 0 ? (
        <p>No meals logged today.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((m) => (
            <li key={m.id} className="[overflow-wrap:anywhere]">
              <span className="tabular-nums">{time.format(new Date(m.logged_at))}</span>{" "}
              {m.items.map((i) => i.name).join(", ")}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
