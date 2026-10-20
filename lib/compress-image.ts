import { MAX_IMAGE_BYTES } from "@/lib/nutrition";

const MAX_EDGE = 1568;

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

// Downscale to a JPEG under MAX_IMAGE_BYTES; throws Error("too-large") when it can't.
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.8, 0.6]) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_IMAGE_BYTES) return blob;
  }
  throw new Error("too-large");
}
