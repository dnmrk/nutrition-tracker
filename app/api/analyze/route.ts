import { analyzeMeal, ERRORS, getGroq } from "@/lib/analyze";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const err = (status: number, error: string) => Response.json({ error }, { status });
const MAX_BODY = 1_700_000;

// Returns null once the body exceeds MAX_BODY, cancelling the stream.
async function readCapped(request: Request) {
  if (!request.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const NO_PHOTO = "Choose a photo to analyze.";
const TOO_LARGE = "That photo is too large. Try another one.";

export async function POST(request: Request) {
  // Not requireUser: it redirects, and an API caller needs a 401.
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims) return err(401, "Sign in again to analyze photos.");

  if (Number(request.headers.get("content-length")) > MAX_BODY) return err(413, TOO_LARGE);

  let form: FormData;
  try {
    // Cap while reading: content-length can be absent or wrong.
    const body = await readCapped(request);
    if (!body) return err(413, TOO_LARGE);
    form = await new Request(request.url, { method: "POST", headers: request.headers, body }).formData();
  } catch {
    return err(400, NO_PHOTO);
  }
  const file = form.get("image");
  if (!(file instanceof File)) return err(400, NO_PHOTO);
  const mediaType = IMAGE_TYPES.find((t) => t === file.type);
  if (!mediaType) return err(415, "Use a JPEG, PNG or WebP photo.");
  if (file.size === 0) return err(400, NO_PHOTO);
  if (file.size > MAX_IMAGE_BYTES) return err(413, TOO_LARGE);

  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  let result;
  try {
    // getGroq throws on a missing key; never echo the cause.
    result = await analyzeMeal(getGroq(), { data: b64, mediaType });
  } catch {
    result = { ok: false as const, status: 502, error: ERRORS.upstream };
  }
  return result.ok ? Response.json(result.data) : err(result.status, result.error);
}
