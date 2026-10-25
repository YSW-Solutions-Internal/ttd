import { createClient } from "@/lib/supabase/server";
import { loadFeeContext } from "@/lib/fee-context";
import { TABLE_KIND, type ItemTable } from "@/lib/extraction/tables";
import { AddItemForm, ItemForm, type StayOption } from "./item-form";

type Row = Record<string, unknown>;
type Image = { id: string; filename: string; url?: string };

/**
 * The Working content of a Quote, editable: one block per image (the image beside
 * the Items read from it) and one block for Items entered by hand (ADR 0005).
 */
export async function EditSection({ quoteId, tripId, images }: { quoteId: string; tripId: string; images: Image[] }) {
  const supabase = await createClient();
  const tables = Object.keys(TABLE_KIND) as ItemTable[];

  const [ctx, { data: stops }, ...results] = await Promise.all([
    loadFeeContext(supabase, quoteId),
    supabase.from("trip_stops").select("id, position, destination, starts_on, ends_on").eq("trip_id", tripId).order("position"),
    ...tables.map((t) => supabase.from(t).select("*").eq("quote_id", quoteId).order("created_at")),
  ]);
  const rows = tables.flatMap((table, i) => ((results[i].data ?? []) as Row[]).map((row) => ({ table, row })));

  const optionIds = rows.filter((r) => r.table === "flight_options").map((r) => String(r.row.id));
  const { data: flights } = optionIds.length
    ? await supabase.from("flights").select("*").in("flight_option_id", optionIds).order("direction_no").order("seq")
    : { data: [] };

  const stays: StayOption[] = (stops ?? []).map((s) => ({
    id: s.id,
    label: [s.destination, s.starts_on && s.ends_on ? `${s.starts_on} to ${s.ends_on}` : null].filter(Boolean).join(", "),
  }));

  const form = ({ table, row }: { table: ItemTable; row: Row }) => (
    <ItemForm
      // Re-mounts after a save, so values the server filled in (fees, region) show up.
      key={`${row.id}-${row.updated_at}`}
      quoteId={quoteId}
      table={table}
      row={row}
      flights={table === "flight_options" ? ((flights ?? []) as Row[]).filter((f) => f.flight_option_id === row.id) : undefined}
      stays={stays}
      rates={ctx.rates}
    />
  );

  const shown = new Set(images.map((i) => i.id));
  const byHand = rows.filter((r) => r.row.image_id == null);

  return (
    <>
      {images.map((img) => {
        const items = rows.filter((r) => r.row.image_id === img.id);
        if (items.length === 0) return null;
        return (
          <section className="edit-block" key={img.id}>
            <div className="edit-image">
              {img.url && (
                <a href={img.url} target="_blank" rel="noreferrer" title="Open full size">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.filename} />
                </a>
              )}
              <small>{img.filename}</small>
            </div>
            <div className="edit-items">{items.map(form)}</div>
          </section>
        );
      })}

      <section className="edit-block">
        <div className="edit-image">
          <b>Entered by hand</b>
        </div>
        <div className="edit-items">
          {byHand.map(form)}
          <AddItemForm quoteId={quoteId} />
        </div>
      </section>

      {rows.some((r) => r.row.image_id != null && !shown.has(String(r.row.image_id))) && (
        <p className="empty">Items from removed images are kept but left out. Re-add the image to bring them back.</p>
      )}
    </>
  );
}
