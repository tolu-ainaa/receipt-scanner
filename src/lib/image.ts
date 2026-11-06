// Long edge in pixels. Keeps small print readable while staying near Claude's
// useful resolution, so bigger uploads would cost time and buy no accuracy.
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;

export function scaledSize(width: number, height: number, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Resizes a photo and re-encodes it as JPEG, applying its EXIF rotation. */
export async function prepareImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't open that image. Try a JPEG or PNG. (iPhone HEIC photos work best from Safari.)");
  }

  const { width, height } = scaledSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't process that image.");
  // White backing, since JPEG has no transparency and PNG screenshots may.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that image."))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
