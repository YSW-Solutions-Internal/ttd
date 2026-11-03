/** Whether a file name or storage path is an image the zoom viewer can show (not a PDF). */
export const isImage = (name: string | null | undefined) => /\.(png|jpe?g|webp|gif)$/i.test(name ?? "");

/** One file per request, under Vercel's 4.5 MB request limit (it refuses bigger ones before our code runs). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_TEXT = "4 MB";

/** For a file input's setCustomValidity: the browser then refuses to send a file over the limit. */
export function sizeProblem(files: FileList | null): string {
  const big = Array.from(files ?? []).find((f) => f.size > MAX_UPLOAD_BYTES);
  return big ? `${big.name} is over ${MAX_UPLOAD_TEXT}.` : "";
}
