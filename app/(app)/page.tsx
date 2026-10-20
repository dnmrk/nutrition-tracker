import { buildWeek } from "@/lib/nutrition";
import { getToday, requireUser } from "@/lib/supabase/server";
import { lastSevenDays } from "@/lib/today";
import { TodayScreen } from "./today-screen";

export default async function TodayPage() {
  const { supabase, email } = await requireUser();
  const { date, timeZone } = await getToday();
  const [meals, targets] = await Promise.all([
    supabase
      .from("meals")
      .select("id, eaten_on, logged_at, items")
      .gte("eaten_on", lastSevenDays(date)[0])
      .lte("eaten_on", date)
      .order("logged_at"),
    supabase
      .from("daily_targets")
      .select("calorie_target, protein_target_g, carbs_target_g, fat_target_g")
      .maybeSingle(),
  ]);
  if (meals.error || targets.error) throw new Error("Failed to load today");

  const rows = meals.data as Parameters<typeof buildWeek>[0];
  const days = buildWeek(rows, date, timeZone, targets.data?.calorie_target ?? null);
  return <TodayScreen email={email} days={days} targets={targets.data} />;
}
