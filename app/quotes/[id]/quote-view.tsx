import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";
import { removeImage } from "./actions";
import { EditSection } from "./edit-section";
import { ExtractButton } from "./extract-button";
import { RetryPdfButton } from "./retry-pdf-button";
import { UploadForm } from "./upload-form";

type ExtractionRow = {
  image_id: string;
  status: "pending" | "running" | "done" | "failed";
  image_type: string | null;
  error: string | null;
};

/** Item counts per kind for one image, e.g. "2 hotel, 1 transfer". */
function summarise(counts: Map<string, number> | undefined): string {
  if (!counts || counts.size === 0) return "No services found";
  return [...counts].map(([k, n]) => `${n} ${k.replace("_", " ")}`).join(", ");
}

/** The AI's raw answer, indented for reading. */
function pretty(raw: string | undefined): string {
  if (!raw) return "No AI answer logged for this image.";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// Shared by the full Quote page and the Quote modal. Only the full page edits (the modal is too small).
export async function QuoteView({ id, editable = false }: { id: string; editable?: boolean }) {
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, created_at, trips(id, reference, title, clients(client_code, full_name))")
    .eq("id", id)
    .maybeSingle();
  if (!quote) notFound();
  const trip = one(quote.trips);
  const client = one(trip?.clients);

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

  // The Quote's Items per image, and what the AI last answered for each image (ai_calls, ADR 0005).
  const counts = new Map<string, Map<string, number>>();
  const answers = new Map<string, string>();
  if (images && images.length > 0) {
    const [{ data: items }, { data: calls }] = await Promise.all([
      supabase.from("quote_items").select("image_id, kind").eq("quote_id", id),
      supabase
        .from("ai_calls")
        .select("image_id, raw_output")
        .in(
          "image_id",
          images.map((i) => i.id),
        )
        .is("error", null)
        .order("finished_at", { ascending: false }),
    ]);
    items?.forEach((i) => {
      if (!i.image_id) return;
      const c = counts.get(i.image_id) ?? new Map<string, number>();
      c.set(i.kind, (c.get(i.kind) ?? 0) + 1);
      counts.set(i.image_id, c);
    });
    calls?.forEach((c) => {
      if (!answers.has(c.image_id) && c.raw_output) answers.set(c.image_id, c.raw_output);
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
    <>
      <p className="sub">
        <Link href={trip ? `/trips/${trip.id}` : "/"}>← Trip {trip?.reference}</Link>
      </p>
      <h1>
        Quote · {trip?.reference}
        {trip?.title ? ` · ${trip.title}` : ""}
      </h1>
      <p className="sub">
        {client ? `Prepared for ${client.full_name} (${client.client_code})` : "No client set"}
      </p>

      <h2>Source images</h2>
      <UploadForm quoteId={quote.id} />

      <div style={{ marginTop: 14 }}>
        {(!images || images.length === 0) && <p className="empty">No images yet.</p>}
        {images && images.length > 0 && (
          <div className="images">
            {images.map((img) => {
              const ex = extractions.get(img.id);
              return (
                <div className="thumb" key={img.id}>
                  {urls.get(img.storage_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls.get(img.storage_path)} alt={img.filename} />
                  ) : (
                    <div style={{ height: 140 }} />
                  )}
                  <div className="meta">
                    <span className="name" title={img.filename}>
                      {img.filename}
                    </span>
                    <form action={removeImage.bind(null, quote.id, img.id)}>
                      <button type="submit" className="danger">
                        Remove
                      </button>
                    </form>
                  </div>
                  <div className="status">
                    {!ex && <span className="badge">Not extracted</span>}
                    {ex?.status === "pending" && <span className="badge">Queued</span>}
                    {ex?.status === "running" && <span className="badge">Reading…</span>}
                    {ex?.status === "done" && (
                      <span className="badge ok">
                        {ex.image_type && `${ex.image_type} · `}{summarise(counts.get(img.id))}
                      </span>
                    )}
                    {ex?.status === "failed" && (
                      <span className="badge bad" title={ex.error ?? ""}>
                        Failed: {ex.error}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {images && images.length > 0 && <ExtractButton quoteId={quote.id} pending={waiting} reading={reading} />}

      {images && images.some((i) => extractions.get(i.id)?.status === "done") && (
        <>
          <h2>Extracted data</h2>
          {images.map((img) => {
            const ex = extractions.get(img.id);
            if (ex?.status !== "done") return null;
            return (
              <details className="card" key={img.id} style={{ marginBottom: 10 }}>
                <summary>
                  <b>{img.filename}</b> · {summarise(counts.get(img.id))}
                </summary>
                <pre>{pretty(answers.get(img.id))}</pre>
              </details>
            );
          })}
        </>
      )}

      <h2>Edit</h2>
      {editable && trip ? (
        <EditSection
          quoteId={quote.id}
          tripId={trip.id}
          images={(images ?? []).map((i) => ({ id: i.id, filename: i.filename, url: urls.get(i.storage_path) }))}
        />
      ) : (
        <p className="empty">
          {/* A plain link, so it opens the full page instead of this modal again. */}
          <a href={`/quotes/${quote.id}`}>Open the full Quote page to edit its Items.</a>
        </p>
      )}

      <h2>Versions</h2>
      {(!versions || versions.length === 0) && (
        <p className="empty">No versions yet. Quote assembly and PDF generation come in a later milestone.</p>
      )}
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
                  {trip?.reference} V{v.version_no}
                </td>
                <td>
                  {!v.pdf_path ? (
                    <RetryPdfButton quoteId={quote.id} versionId={v.id} />
                  ) : pdfUrls.get(v.pdf_path) ? (
                    <a href={pdfUrls.get(v.pdf_path)} target="_blank" rel="noreferrer">
                      Open PDF
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{new Date(v.created_at).toLocaleString("en-ZA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
