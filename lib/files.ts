/** Whether a file name or storage path is an image the zoom viewer can show (not a PDF). */
export const isImage = (name: string | null | undefined) => /\.(png|jpe?g|webp|gif)$/i.test(name ?? "");
