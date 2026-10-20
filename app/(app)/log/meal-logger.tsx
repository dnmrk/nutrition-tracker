"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { compressImage } from "@/lib/compress-image";
import { AnalysisSchema, fmt, ITEM_MAX, MAX_ITEMS, NAME_MAX, sumItems } from "@/lib/nutrition";
import { saveMeal } from "./actions";

type Phase = "idle" | "analyzing" | "review" | "analyzeError";

const FIELDS = [
  ["grams", "Grams"],
  ["calories", "Calories"],
  ["protein_g", "Protein (g)"],
  ["carbs_g", "Carbs (g)"],
  ["fat_g", "Fat (g)"],
] as const;

// Numbers stay strings while editing so an empty or half-typed input isn't coerced.
type Draft = { key: string; name: string } & Record<(typeof FIELDS)[number][0], string>;

const blank = (): Draft => ({ key: crypto.randomUUID(), name: "", grams: "", calories: "", protein_g: "", carbs_g: "", fat_g: "" });
const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

const TOO_LARGE = "That photo is too large. Try another one.";
const ANALYZE_FAILED = "Couldn't analyze the photo. Try again or enter the meal manually.";
const SAVE_FAILED = "Couldn't save the meal. Try again.";

export function MealLogger() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [analyzeError, setAnalyzeError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, startSaving] = useTransition();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [confidence, setConfidence] = useState<string>("high");
  const [mealId, setMealId] = useState("");
  const [canRetry, setCanRetry] = useState(false); // a compressed blob is held for Try again
  const fileInput = useRef<HTMLInputElement>(null);
  const blob = useRef<Blob | null>(null);
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);

  useEffect(() => () => {
    requestId.current++;
    controller.current?.abort();
  }, []);

  // A new mealId per review session; kept across edits and save retries.
  function enterReview(items: Draft[], conf: string) {
    setMealId(crypto.randomUUID());
    setDrafts(items);
    setConfidence(conf);
    setSaveError("");
    setPhase("review");
  }

  async function analyze(file: File | null) {
    const id = ++requestId.current;
    controller.current?.abort();
    const ctl = (controller.current = new AbortController());
    const stale = () => id !== requestId.current;
    const fail = (message: string) => {
      if (stale()) return;
      setAnalyzeError(message);
      setPhase("analyzeError");
    };
    setPhase("analyzing");
    try {
      if (file) {
        blob.current = null;
        setCanRetry(false);
        blob.current = await compressImage(file);
        if (!stale()) setCanRetry(true);
      }
    } catch {
      return fail(TOO_LARGE);
    }
    if (stale() || !blob.current) return;
    const body = new FormData();
    body.append("image", blob.current, "meal.jpg");
    try {
      const res = await fetch("/api/analyze", { method: "POST", body, signal: ctl.signal });
      const data: unknown = await res.json().catch(() => null);
      if (stale()) return;
      if (!res.ok) {
        const msg = (data as { error?: unknown } | null)?.error;
        return fail(typeof msg === "string" ? msg : ANALYZE_FAILED);
      }
      const parsed = AnalysisSchema.safeParse(data);
      if (!parsed.success) return fail(ANALYZE_FAILED);
      enterReview(
        parsed.data.items.map((i) => ({
          key: crypto.randomUUID(),
          name: i.name,
          grams: String(i.grams),
          calories: String(i.calories),
          protein_g: String(i.protein_g),
          carbs_g: String(i.carbs_g),
          fat_g: String(i.fat_g),
        })),
        parsed.data.confidence,
      );
    } catch {
      fail(ANALYZE_FAILED);
    }
  }

  function retake() {
    requestId.current++;
    controller.current?.abort();
    blob.current = null;
    setPhase("idle");
  }

  const edit = (key: string, field: keyof Draft, value: string) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, [field]: value } : d)));

  const totals = sumItems(drafts.map((d) => ({ name: d.name, grams: 0, calories: num(d.calories) || 0, protein_g: num(d.protein_g) || 0, carbs_g: num(d.carbs_g) || 0, fat_g: num(d.fat_g) || 0 })));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    const items = drafts.map((d) => ({
      name: d.name,
      grams: num(d.grams),
      calories: num(d.calories),
      protein_g: num(d.protein_g),
      carbs_g: num(d.carbs_g),
      fat_g: num(d.fat_g),
    }));
    startSaving(async () => {
      try {
        const res = await saveMeal({ id: mealId, items });
        if (res?.error) setSaveError(res.error);
      } catch {
        setSaveError(SAVE_FAILED); // lost response: retry reuses mealId
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void analyze(file);
        }}
      />

      {phase === "idle" && (
        <button type="button" onClick={() => fileInput.current?.click()} className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
          Snap meal
        </button>
      )}

      {phase === "analyzing" && (
        <p role="status" aria-live="polite">
          Analyzing your meal…
        </p>
      )}

      {phase === "analyzeError" && (
        <>
          <p role="alert">{analyzeError}</p>
          <div className="flex flex-wrap gap-2">
            {canRetry && (
              <button type="button" onClick={() => void analyze(null)} className="rounded border px-4 py-2">
                Try again
              </button>
            )}
            <button type="button" onClick={() => enterReview([blank()], "high")} className="rounded border px-4 py-2">
              Enter manually
            </button>
          </div>
        </>
      )}

      {phase === "review" && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {confidence === "low" && <p className="rounded bg-amber-100 p-2 text-amber-900">Rough estimate — tap any item to adjust.</p>}
          <p className="text-sm text-gray-600 dark:text-gray-400">Estimates from a photo, not medical advice. Check and edit before saving.</p>
          {drafts.length === 0 && <p>No food detected. Add items manually.</p>}

          {drafts.map((d, n) => (
            <fieldset key={d.key} className="flex min-w-0 flex-col gap-2 rounded border p-3">
              <legend className="max-w-full break-all px-1">{d.name || `Item ${n + 1}`}</legend>
              <label className="flex flex-col gap-1">
                Food
                <input
                  value={d.name}
                  onChange={(e) => edit(d.key, "name", e.target.value)}
                  maxLength={NAME_MAX}
                  required
                  className="w-full min-w-0 rounded border px-3 py-2"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {FIELDS.map(([k, label]) => (
                  <label key={k} className="flex min-w-0 flex-col gap-1">
                    {label}
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      max={ITEM_MAX[k]}
                      required
                      value={d[k]}
                      onChange={(e) => edit(d.key, k, e.target.value)}
                      className="w-full min-w-0 rounded border px-3 py-2"
                    />
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} className="self-start rounded border px-3 py-1">
                Remove
              </button>
            </fieldset>
          ))}

          <button type="button" disabled={drafts.length >= MAX_ITEMS} onClick={() => setDrafts((ds) => [...ds, blank()])} className="self-start rounded border px-3 py-1 disabled:opacity-50">
            Add item
          </button>

          <p>
            Total: {fmt(totals.calories)} kcal · P {fmt(totals.protein_g)} g · C {fmt(totals.carbs_g)} g · F {fmt(totals.fat_g)} g
          </p>
          {saveError && <p role="alert">{saveError}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving || drafts.length === 0} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black">
              {saving ? "Saving…" : "Log meal"}
            </button>
            <button type="button" onClick={retake} className="rounded border px-4 py-2">
              Retake
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
