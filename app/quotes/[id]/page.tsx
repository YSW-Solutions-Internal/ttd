import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { removeImage } from "./actions";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, reference, title, client_name, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!quote) notFound();

  const [{ data: images }, { data: versions }] = await Promise.all([
    supabase
      .from("images")
      .select("id, filename, storage_path, size_bytes, created_at")
      .eq("quote_id", id)
      .is("removed_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("quote_versions")
      .select("id, version_no, status, pdf_path, created_at")
      .eq("quote_id", id)
      .order("version_no", { ascending: false }),
  ]);

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

  return (
    <main className="container">
      <p className="sub">
        <Link href="/">← All quotes</Link>
      </p>
      <h1>
        {quote.reference} · {quote.title}
      </h1>
      <p className="sub">{quote.client_name ? `Prepared for ${quote.client_name}` : "No client name set"}</p>

      <h2>Source images</h2>
      <UploadForm quoteId={quote.id} />

      <div style={{ marginTop: 14 }}>
        {(!images || images.length === 0) && <p className="empty">No images yet.</p>}
        {images && images.length > 0 && (
          <div className="images">
            {images.map((img) => (
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
              </div>
            ))}
          </div>
        )}
      </div>

      <h2>Versions</h2>
      {(!versions || versions.length === 0) && (
        <p className="empty">No versions yet. Extraction and PDF generation come in the next milestone.</p>
      )}
      {versions && versions.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Status</th>
              <th>PDF</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td>
                  {quote.reference} v{v.version_no}
                </td>
                <td>{v.status}</td>
                <td>{v.pdf_path ? "Ready" : "—"}</td>
                <td>{new Date(v.created_at).toLocaleString("en-ZA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
