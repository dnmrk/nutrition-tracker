import { fmt, groupByDay, type MealItem } from "@/lib/nutrition";
import { addDays } from "@/lib/dates";
import { getToday, requireUser } from "@/lib/supabase/server";

export default async function HistoryPage() {
  const { supabase } = await requireUser();
  const { date, timeZone } = await getToday();
  // shortcut: fixed 30-day window, no pagination; add range paging when users exceed ~1000 meals/30d
  const { data, error } = await supabase
    .from("meals")
    .select("id, eaten_on, logged_at, items")
    .gte("eaten_on", addDays(date, -29))
    .lte("eaten_on", date) // same local "today" as the Today page; hides future-dated rows
    .order("eaten_on", { ascending: false })
    .order("logged_at", { ascending: false });
  if (error) throw new Error("Failed to load history");

  const days = groupByDay(data as { id: string; eaten_on: string; logged_at: string; items: MealItem[] }[]);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  // eaten_on is a calendar date, so format it as UTC to avoid shifting it.
  const dayLabel = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold">History</h1>
      {days.length === 0 ? (
        <p>No meals in the last 30 days.</p>
      ) : (
        days.map((d) => (
          <section key={d.date} className="mb-6">
            <h2 className="text-lg font-semibold">{dayLabel.format(new Date(`${d.date}T00:00:00Z`))}</h2>
            <p>
              <span className="tabular-nums">{fmt(d.totals.calories)}</span> kcal · P{" "}
              <span className="tabular-nums">{fmt(d.totals.protein_g)}</span> g · C{" "}
              <span className="tabular-nums">{fmt(d.totals.carbs_g)}</span> g · F{" "}
              <span className="tabular-nums">{fmt(d.totals.fat_g)}</span> g
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {d.meals.map((m) => (
                <li key={m.id} className="[overflow-wrap:anywhere]">
                  <span className="tabular-nums">{time.format(new Date(m.logged_at))}</span>{" "}
                  {m.items.map((i) => i.name).join(", ")}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
