import { getGroq, analyzeMeal } from "@/lib/analyze";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const err = (status: number, error: string) => Response.json({ error }, { status });
const NO_PHOTO = "Choose a photo to analyze.";
const TOO_LARGE = "That photo is too large. Try another one.";

export async function POST(request: Request) {
  // Not requireUser: it redirects, and an API caller needs a 401.
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims) return err(401, "Sign in again to analyze photos.");

  if (Number(request.headers.get("content-length")) > 1_700_000) return err(413, TOO_LARGE);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return err(400, NO_PHOTO);
  }
  const file = form.get("image");
  if (!(file instanceof File)) return err(400, NO_PHOTO);
  const mediaType = IMAGE_TYPES.find((t) => t === file.type);
  if (!mediaType) return err(415, "Use a JPEG, PNG or WebP photo.");
  if (file.size === 0) return err(400, NO_PHOTO);
  if (file.size > MAX_IMAGE_BYTES) return err(413, TOO_LARGE);

  const result = await analyzeMeal(getGroq(), {
    data: Buffer.from(await file.arrayBuffer()).toString("base64"),
    mediaType,
  });
  return result.ok ? Response.json(result.data) : err(result.status, result.error);
}
