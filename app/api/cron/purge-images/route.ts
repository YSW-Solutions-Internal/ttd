import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** How long a removed image can still be brought back by uploading it again. */
const KEEP_DAYS = 90;

/**
 * Daily (vercel.json): deletes images removed more than KEEP_DAYS ago, for good. Their Items,
 * flights, extraction and AI log go with them (on delete cascade); then the file goes from storage.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Service key: there is no signed-in user here. It only touches images removed long ago.
  const supabase = createAdminClient();
  const before = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  // Rows first: a file left behind only costs storage, but a row left without its file
  // would come back broken if the image were uploaded again.
  const { data: old, error: findErr } = await supabase.from("images").select("id").lt("removed_at", before).limit(500);
  if (findErr) return new Response(findErr.message, { status: 500 });
  if (!old || old.length === 0) return Response.json({ purged: 0 });
  const { data, error } = await supabase
    .from("images")
    .delete()
    .in("id", old.map((r) => r.id))
    .select("storage_path");
  if (error) return new Response(error.message, { status: 500 });

  const paths = (data ?? []).map((r) => r.storage_path);
  if (paths.length > 0) {
    const { error: fileErr } = await supabase.storage.from("quote-files").remove(paths);
    if (fileErr) return new Response(`Deleted ${paths.length} images, but not their files: ${fileErr.message}`, { status: 500 });
  }
  return Response.json({ purged: paths.length });
}
