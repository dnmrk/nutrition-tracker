import { requireUser } from "@/lib/supabase/server";
import { TargetsForm } from "./targets-form";

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("daily_targets")
    .select("calorie_target, protein_target_g, carbs_target_g, fat_target_g")
    .maybeSingle();

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
      <TargetsForm initial={data} />
    </main>
  );
}
