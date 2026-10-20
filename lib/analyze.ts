import Groq from "groq-sdk";
import { z } from "zod";
import { AnalysisSchema, IMAGE_TYPES } from "@/lib/nutrition";

// Groq preview model: the only place the ID appears.
export const ANALYZE_MODEL = "qwen/qwen3.8-27b";

export const ERRORS = {
  tooLarge: "That photo is too large. Try another one.",
  unreadable: "We couldn't read that photo. Try another one or enter the meal manually.",
  busy: "Photo analysis is busy. Wait a minute and try again.",
  daily: "Today's photo analysis limit is used up. Enter the meal manually or try again tomorrow.",
  upstream: "Couldn't analyze the photo. Try again or enter the meal manually.",
} as const;

const SYSTEM_PROMPT =
  'You estimate nutrition from a single meal photo. List each distinct food item you can see with an estimated portion in grams and its calories, protein, carbs and fat for that portion. Estimate portions from visual cues such as plate size, utensils and packaging. Always return your best estimate. Use confidence "low" when the image is ambiguous, blurry, partly hidden, or not clearly food; "medium" when portions are uncertain; "high" only when items and portions are clear. If the photo contains no food, return an empty items array with confidence "low".';

// Retries off: the SDK would sit out a daily-quota retry-after; the user has "Try again".
export const getGroq = () => new Groq({ timeout: 30_000, maxRetries: 0 });

type Result =
  | { ok: true; data: z.infer<typeof AnalysisSchema> }
  | { ok: false; status: 413 | 422 | 429 | 502; error: string };

const fail = (status: 413 | 422 | 429 | 502, error: string): Result => ({ ok: false, status, error });

export async function analyzeMeal(
  client: Groq,
  image: { data: string; mediaType: (typeof IMAGE_TYPES)[number] },
): Promise<Result> {
  let completion;
  try {
    completion = await client.chat.completions.create({
      model: ANALYZE_MODEL,
      temperature: 0.2,
      max_completion_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            SYSTEM_PROMPT +
            "\n\nRespond with only a JSON object that matches this JSON Schema:\n" +
            JSON.stringify(z.toJSONSchema(AnalysisSchema)),
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Estimate the food items in this photo." },
            { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } },
          ],
        },
      ],
    });
  } catch (err) {
    return mapError(err);
  }

  const choice = completion.choices[0];
  if (choice?.finish_reason !== "stop" || !choice.message.content) return fail(502, ERRORS.upstream);
  let raw: unknown;
  try {
    raw = JSON.parse(choice.message.content);
  } catch {
    return fail(502, ERRORS.upstream);
  }
  if (raw && typeof raw === "object" && typeof (raw as { confidence?: unknown }).confidence === "string") {
    const o = raw as { confidence: string };
    o.confidence = o.confidence.toLowerCase();
  }
  const parsed = AnalysisSchema.safeParse(raw);
  return parsed.success ? { ok: true, data: parsed.data } : fail(502, ERRORS.upstream);
}

function mapError(err: unknown): Result {
  if (!(err instanceof Groq.APIError)) return fail(502, ERRORS.upstream);
  const code = (err.error as { error?: { code?: string } } | undefined)?.error?.code;
  if (err instanceof Groq.RateLimitError) {
    return Number(err.headers?.get("retry-after")) > 60 ? fail(429, ERRORS.daily) : fail(429, ERRORS.busy);
  }
  if (err.status === 413) return fail(413, ERRORS.tooLarge);
  if (err instanceof Groq.NotFoundError || code === "model_not_found" || code === "model_decommissioned") {
    console.error("groq model unavailable", ANALYZE_MODEL);
    return fail(502, ERRORS.upstream);
  }
  if (err instanceof Groq.BadRequestError && code !== "json_validate_failed") return fail(422, ERRORS.unreadable);
  return fail(502, ERRORS.upstream);
}
