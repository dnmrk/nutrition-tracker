import { MealLogger } from "./meal-logger";

export default function LogPage() {
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">Log meal</h1>
      <MealLogger />
    </main>
  );
}
