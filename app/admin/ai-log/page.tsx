import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth";
import { everyRow, one } from "@/lib/relations";
import { callCost } from "@/lib/ai-cost";
import { AnswerButton } from "./answer-button";
import { Msg } from "@/app/ui";

export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const int = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-ZA"));

/** The month before or after "YYYY-MM". */
function step(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Every call to Claude in one month, for developers (ADR 0005): what it cost and what it answered. */
export default async function AiLogPage({ searchParams }: { searchParams: Promise<{ month?: string; errors?: string }> }) {
  await requireAdminPage();
  const params = await searchParams;
  const thisMonth = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }).slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "") ? params.month! : thisMonth;
  const errorsOnly = params.errors === "1";

  const supabase = await createClient();
  // Months in South African time, as everywhere else in the app.
  const [from, to] = [`${month}-01T00:00:00+02:00`, `${step(month, 1)}-01T00:00:00+02:00`];
  let calls: Awaited<ReturnType<typeof load>> = [];
  let failed: string | null = null;
  function load() {
    return everyRow((f, t) =>
      supabase
        .from("ai_calls")
        .select("id, model, prompt_version, started_at, finished_at, stop_reason, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, error, images(filename, quotes(trips(id, reference)))")
        .gte("finished_at", from)
        .lt("finished_at", to)
        .order("finished_at", { ascending: false })
        .order("id")
        .range(f, t),
    );
  }
  try {
    calls = await load();
  } catch (e) {
    failed = (e as Error).message;
  }

  const rows = calls.map((c) => {
    type Trip = { id: string; reference: string };
    const image = one(c.images as unknown as { filename: string; quotes: { trips: Trip | Trip[] } | null } | null);
    return { ...c, filename: image?.filename ?? "", trip: one(one(image?.quotes)?.trips), cost: callCost(c) };
  });
  const total = rows.reduce((sum, r) => sum + (r.cost?.usd ?? 0), 0);
  const errors = rows.filter((r) => r.error).length;
  const partial = rows.some((r) => r.cost?.partial);
  const unpriced = rows.some((r) => !r.cost);
  const shown = errorsOnly ? rows.filter((r) => r.error) : rows;
  const monthHref = (m: string) => `/admin/ai-log?month=${m}${errorsOnly ? "&errors=1" : ""}`;

  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <h1>AI log</h1>
      <p className="mb-4 text-muted">
        Every call to Claude reading an image, with its answer exactly as returned. Costs are estimates at list price
        in US dollars; the real bill is in the Anthropic console. An image&apos;s calls go when the image is deleted for good.
      </p>
      <form className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={monthHref(step(month, -1))} aria-label="Previous month">‹</Link>
        <input type="month" name="month" aria-label="Month" defaultValue={month} />
        <Link href={monthHref(step(month, 1))} aria-label="Next month">›</Link>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="errors" value="1" defaultChecked={errorsOnly} /> Errors only
        </label>
        <button type="submit">Show</button>
      </form>
      <p className="mb-4">
        <b>{rows.length}</b> call{rows.length === 1 ? "" : "s"} · <b>{errors}</b> error{errors === 1 ? "" : "s"} ·{" "}
        <b>{partial ? "≈ " : ""}{usd(total)}</b>
        {partial && <span className="text-muted"> (some calls predate the cache counts, so this is low)</span>}
        {unpriced && <span className="text-muted"> (calls on a model with no price are left out)</span>}
      </p>
      {failed && <Msg tone="error">Could not load the log: {failed}</Msg>}
      {!failed && shown.length === 0 && <p className="py-3 text-muted">No {errorsOnly ? "errors" : "calls"} this month.</p>}
      {shown.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Trip and image</th>
              <th>Model and prompt</th>
              <th>Tokens in / out / cached</th>
              <th>Cost</th>
              <th>Stop</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={r.error ? "bg-danger/10" : undefined}>
                <td>
                  {new Date(r.finished_at).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "short", timeStyle: "short" })}
                  <div className="text-xs text-muted">{((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000).toFixed(1)} s</div>
                </td>
                <td>
                  {r.trip ? <Link href={`/trips/${r.trip.id}`}>{r.trip.reference}</Link> : "—"}
                  <div className="text-xs text-muted">{r.filename}</div>
                </td>
                <td>
                  {r.model}
                  <div className="text-xs text-muted">{r.prompt_version}</div>
                </td>
                <td>
                  {int(r.input_tokens)} / {int(r.output_tokens)} /{" "}
                  {r.cache_write_tokens === null ? "—" : int(r.cache_write_tokens + (r.cache_read_tokens ?? 0))}
                </td>
                <td>{r.cost ? `${r.cost.partial ? "≈ " : ""}${usd(r.cost.usd)}` : "—"}</td>
                <td>
                  {r.stop_reason ?? "—"}
                  {r.error && <div className="text-xs text-danger">{r.error}</div>}
                </td>
                <td><AnswerButton id={r.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
