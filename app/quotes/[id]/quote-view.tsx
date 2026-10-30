import { createClient } from "@/lib/supabase/server";
import { canEdit, getProfile } from "@/lib/auth";
import { removeImage } from "./actions";
import { TABLE_KIND } from "@/lib/extraction/tables";
import { EditSection, TABS } from "./edit-section";
import { JumpToItems } from "./image-links";
import { ExtractButton } from "./extract-button";
import { GenerateVersionButton } from "./generate-version-button";
import { RetryPdfButton } from "./retry-pdf-button";
import { UploadForm } from "./upload-form";
import { FileLink } from "@/app/file-viewer";
import { Badge, Button } from "@/app/ui";

type ExtractionRow = {
  image_id: string;
  status: "pending" | "running" | "done" | "failed";
  image_type: string | null;
  error: string | null;
};

/** The tabs (id, label) holding Items from one image, in tab order. */
function tabsOf(counts: Map<string, number> | undefined): [string, string][] {
  return TABS.filter(([table]) => counts?.has(TABLE_KIND[table])).map(([, id, label]) => [id, label]);
}

/** Item counts per kind for one image, e.g. "2 hotel, 1 transfer". */
function summarise(counts: Map<string, number> | undefined): string {
  if (!counts || counts.size === 0) return "No services found";
  return [...counts].map(([k, n]) => `${n} ${k.replace("_", " ")}`).join(", ");
}

/**
 * The Quote's editor, inside the Trip page: Source images, the Items tab by tab, and Versions.
 * Each Trip has exactly one Quote (GLOSSARY: Quote).
 */
export async function QuoteEditor({ quoteId: id, trip }: { quoteId: string; trip: { id: string; reference: string } }) {
  const supabase = await createClient();
  const me = await getProfile();
  const editable = !!me && canEdit(me.role);
  const quote = { id };

  const [{ data: images }, { data: versions }] = await Promise.all([
    supabase
      .from("images")
      .select("id, filename, storage_path, size_bytes, created_at")
      .eq("quote_id", id)
      .is("removed_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("quote_versions")
      .select("id, version_no, pdf_path, created_at")
      .eq("quote_id", id)
      .order("version_no", { ascending: false }),
  ]);

  // Extractions for these images, whatever prompt version made them. A finished one wins
  // over a later failed or running attempt; otherwise the latest attempt shows.
  const extractions = new Map<string, ExtractionRow>();
  if (images && images.length > 0) {
    const { data: rows } = await supabase
      .from("extractions")
      .select("image_id, status, image_type, error")
      .in(
        "image_id",
        images.map((i) => i.id),
      )
      .order("created_at", { ascending: true });
    (rows as ExtractionRow[] | null)?.forEach((r) => {
      if (extractions.get(r.image_id)?.status !== "done") extractions.set(r.image_id, r);
    });
  }
  const waiting = (images ?? []).filter((i) => extractions.get(i.id)?.status !== "done").length;
  const reading = (images ?? []).filter((i) => ["pending", "running"].includes(extractions.get(i.id)?.status ?? "")).length;

  // The Quote's Items per image. The AI's raw answers stay in ai_calls (ADR 0005), for developers only.
  const counts = new Map<string, Map<string, number>>();
  if (images && images.length > 0) {
    const { data: items } = await supabase.from("quote_items").select("image_id, kind").eq("quote_id", id);
    items?.forEach((i) => {
      if (!i.image_id) return;
      const c = counts.get(i.image_id) ?? new Map<string, number>();
      c.set(i.kind, (c.get(i.kind) ?? 0) + 1);
      counts.set(i.image_id, c);
    });
  }

  // Private bucket: short-lived signed links for thumbnails.
  const urls = new Map<string, string>();
  if (images && images.length > 0) {
    const { data: signed } = await supabase.storage
      .from("quote-files")
      .createSignedUrls(
        images.map((i) => i.storage_path),
        3600,
      );
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    });
  }

  const pdfUrls = new Map<string, string>();
  const pdfPaths = (versions ?? []).flatMap((v) => (v.pdf_path ? [v.pdf_path] : []));
  if (pdfPaths.length > 0) {
    const { data: signed } = await supabase.storage.from("quote-files").createSignedUrls(pdfPaths, 3600);
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) pdfUrls.set(s.path, s.signedUrl);
    });
  }

  return (
    <section id="quote" className="scroll-mt-4">
      <h2>Source images</h2>
      {editable && <UploadForm quoteId={quote.id} />}

      <div className="mt-4">
        {(!images || images.length === 0) && <p className="text-muted">No images yet.</p>}
        {images && images.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3.5">
            {images.map((img) => {
              const ex = extractions.get(img.id);
              return (
                <div className="overflow-hidden rounded-md border border-line bg-white" key={img.id}>
                  {urls.get(img.storage_path) ? (
                    <JumpToItems imageId={img.id} tabs={tabsOf(counts.get(img.id))}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urls.get(img.storage_path)} alt={img.filename} className="h-[140px] w-full bg-paper object-cover" />
                    </JumpToItems>
                  ) : (
                    <div className="h-[140px] bg-paper" />
                  )}
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs">
                    <span className="truncate" title={img.filename}>
                      {img.filename}
                    </span>
                    {editable && (
                      <form action={removeImage.bind(null, quote.id, img.id)}>
                        <Button type="submit" variant="danger">
                          Remove
                        </Button>
                      </form>
                    )}
                  </div>
                  <div className="px-2.5 pb-2.5">
                    {!ex && <Badge>Not extracted</Badge>}
                    {ex?.status === "pending" && <Badge>Queued</Badge>}
                    {ex?.status === "running" && <Badge tone="amber">Reading…</Badge>}
                    {ex?.status === "done" && (
                      <Badge tone="teal" className="whitespace-normal">
                        {ex.image_type && `${ex.image_type}: `}
                        {summarise(counts.get(img.id))}
                      </Badge>
                    )}
                    {ex?.status === "failed" && (
                      <Badge tone="danger" className="whitespace-normal">
                        Failed: {ex.error}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editable && images && images.length > 0 && <ExtractButton quoteId={quote.id} pending={waiting} reading={reading} />}

      <h2>{editable ? "Items" : "Items (view only)"}</h2>
      <EditSection
        quoteId={quote.id}
        tripId={trip.id}
        images={(images ?? []).map((i) => ({ id: i.id, filename: i.filename, url: urls.get(i.storage_path) }))}
        readOnly={!editable}
        admin={me?.role === "admin"}
      />

      <h2>Versions</h2>
      {editable && <GenerateVersionButton quoteId={quote.id} />}
      {(!versions || versions.length === 0) && <p className="text-muted">No versions yet.</p>}
      {versions && versions.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>PDF</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td>
                  {trip.reference} V{v.version_no}
                </td>
                <td>
                  {!v.pdf_path ? (
                    editable ? <RetryPdfButton quoteId={quote.id} versionId={v.id} /> : "No PDF yet"
                  ) : pdfUrls.get(v.pdf_path) ? (
                    <FileLink href={pdfUrls.get(v.pdf_path)!} title={`${trip.reference} V${v.version_no}`}>
                      Open PDF
                    </FileLink>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="tabular-nums">{new Date(v.created_at).toLocaleString("en-ZA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
