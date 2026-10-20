import { requireUser } from "@/lib/supabase/server";
import { TargetsForm } from "./targets-form";

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("daily_targets")
    .select("calorie_target, protein_target_g, carbs_target_g, fat_target_g")
    .maybeSingle();
  if (error) throw new Error("Failed to load targets"); // error.tsx; a blank form would look like "no targets"

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold">Daily targets</h1>
      <TargetsForm initial={data} />
      <form action="/auth/signout" method="post" className="mt-8">
        <button type="submit" className="rounded-full border border-track px-4 py-2">Sign out</button>
      </form>
    </main>
  );
}
