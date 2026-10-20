import { initials, type Day, type Targets } from "@/lib/today";
import { TodayDays } from "./today-days";

export function TodayScreen({ email, days, targets }: { email: string; days: Day[]; targets: Targets | null }) {
  return (
    <main className="flex flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">NutritionTracker</p>
          <h1 className="text-[32px] font-bold leading-tight">Today</h1>
        </div>
        <span
          role="img"
          aria-label={`Signed in as ${email}`}
          className="grid size-10 place-items-center rounded-full bg-track text-sm font-semibold"
        >
          {initials(email)}
        </span>
      </div>
      <TodayDays days={days} targets={targets} />
    </main>
  );
}
