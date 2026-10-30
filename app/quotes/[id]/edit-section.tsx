import { createClient } from "@/lib/supabase/server";
import { loadFeeContext } from "@/lib/fee-context";
import { TABLE_KIND, type ItemTable } from "@/lib/extraction/tables";
import { problems } from "@/lib/pdf/assemble";
import { AddItemForm, ItemForm, type StayOption } from "./item-form";
import { confirmAirline } from "./item-actions";
import { EditTabs, type EditTab } from "./edit-tabs";
import { ImageViewer } from "./image-links";
import { BookingPanel, type Booking } from "./booking-panel";
import { one } from "@/lib/relations";
import { ITEM_LABEL } from "./item-fields";
import { loadBillables } from "@/app/trips/[id]/invoicing-data";

type Row = Record<string, unknown>;
type Image = { id: string; filename: string; url?: string };

/** The tabs, in the order agents work through a Trip. */
export const TABS: [ItemTable, string, string][] = [
  ["flight_options", "flights", "Flights"],
  ["accommodation_options", "accommodation", "Accommodation"],
  ["excursions", "experiences", "Experiences"],
  ["transfers", "transfers", "Transfers"],
  ["rail_journeys", "rail-journeys", "Rail journeys"],
  ["car_rentals", "car-rentals", "Car rentals"],
];

/**
 * The Working content of a Quote, editable: one tab per kind of Item, each with one
 * block per image (the image beside its Items of that kind) and one block for Items
 * of that kind entered by hand (ADR 0005).
 */
export async function EditSection({
  quoteId,
  tripId,
  images,
  readOnly,
  admin,
}: {
  quoteId: string;
  tripId: string;
  images: Image[];
  readOnly: boolean; // Accountants (ADR 0010)
  admin: boolean; // corrects booked Items (ADR 0011)
}) {
  const supabase = await createClient();
  const tables = Object.keys(TABLE_KIND) as ItemTable[];

  const [ctx, { data: stops }, { data: bookingRows }, { data: changeRows }, { data: supplierRows }, ...results] = await Promise.all([
    loadFeeContext(supabase, quoteId),
    supabase.from("trip_stops").select("id, position, destination, starts_on, ends_on").eq("trip_id", tripId).order("position"),
    supabase.from("item_bookings").select("*, suppliers(name)").eq("quote_id", quoteId),
    supabase.from("item_changes").select("*").eq("quote_id", quoteId).order("happened_on").order("created_at"),
    supabase.from("suppliers").select("name").order("name"),
    ...tables.map((t) => supabase.from(t).select("*").eq("quote_id", quoteId).order("created_at")),
  ]);
  const rows = tables.flatMap((table, i) => ((results[i].data ?? []) as Row[]).map((row) => ({ table, row })));

  const optionIds = rows.filter((r) => r.table === "flight_options").map((r) => String(r.row.id));
  const { data: flights } = optionIds.length
    ? await supabase.from("flights").select("*").in("flight_option_id", optionIds).order("direction_no").order("seq")
    : { data: [] };

  // Airline codes on this Quote whose name no Consultant has confirmed yet (migration 0012).
  const airlineCodes = [
    ...new Set(
      ((flights ?? []) as Row[])
        .flatMap((f) => [f.airline, f.operated_by])
        .filter((c): c is string => typeof c === "string" && /^[A-Za-z0-9]{2}$/.test(c.trim()))
        .map((c) => c.trim().toUpperCase()),
    ),
  ];
  const { data: known } = airlineCodes.length
    ? await supabase.from("airlines").select("iata, name, confirmed").in("iata", airlineCodes)
    : { data: [] };
  const toConfirm = airlineCodes
    .map((code) => ({ code, suggestion: known?.find((a) => a.iata === code) }))
    .filter((a) => !a.suggestion?.confirmed);

  const stays: StayOption[] = (stops ?? []).map((s) => ({
    id: s.id,
    label: [s.destination, s.starts_on && s.ends_on ? `${s.starts_on} to ${s.ends_on}` : null].filter(Boolean).join(", "),
  }));

  const bookings = new Map(
    (bookingRows ?? []).map((b) => [b.entity_id as string, { ...b, supplier: one(b.suppliers)?.name ?? "" } as Booking]),
  );
  const suppliers = (supplierRows ?? []).map((s) => s.name as string);
  const billables = await loadBillables(
    supabase,
    quoteId,
    new Map(rows.map(({ table, row }) => [String(row.entity_id), { row, label: ITEM_LABEL[table] }])),
  );

  const form = ({ table, row }: { table: ItemTable; row: Row }) => {
    const entityId = String(row.entity_id);
    const booking = bookings.get(entityId) ?? null;
    return (
      // Never re-mounts after a save: autosave puts the values the server filled in into the card.
      <div key={String(row.id)}>
        <ItemForm
          quoteId={quoteId}
          table={table}
          row={row}
          flights={table === "flight_options" ? ((flights ?? []) as Row[]).filter((f) => f.flight_option_id === row.id) : undefined}
          stays={stays}
          rates={ctx.rates}
          lastOfImage={row.image_id != null && rows.filter((r) => r.row.image_id === row.image_id).length === 1}
          booked={!!booking}
          locked={!!booking && !admin}
        />
        <BookingPanel
          quoteId={quoteId}
          entityId={entityId}
          kind={TABLE_KIND[table]}
          item={row}
          booking={booking}
          changes={(changeRows ?? []).filter((c) => c.entity_id === entityId)}
          suppliers={suppliers}
          billing={billables.filter((b) => b.entityId === entityId)}
          readOnly={readOnly}
        />
      </div>
    );
  };

  const shown = new Set(images.map((i) => i.id));
  // Items from removed images are left out here, as Generate version leaves them out.
  const visible = rows.filter((r) => r.row.image_id == null || shown.has(String(r.row.image_id)));

  const airlines = toConfirm.length > 0 && (
    <section className="card confirm-airlines">
      <b>Airline names to confirm</b>
      <p className="sub">
        Confirm or correct each name once; it is then used on every Quote. Until then the PDF shows only the code.
      </p>
      {toConfirm.map(({ code, suggestion }) => (
        <form key={code} action={confirmAirline.bind(null, quoteId)} className="inline-form">
          <input type="hidden" name="iata" value={code} />
          <label htmlFor={`airline-${code}`}>{code}</label>
          <input
            id={`airline-${code}`}
            type="text"
            name="name"
            required
            defaultValue={suggestion?.name ?? ""}
            placeholder="Airline name"
          />
          <button type="submit">Confirm</button>
          {!suggestion && <small>Not in the list</small>}
        </form>
      ))}
    </section>
  );

  const tabs: EditTab[] = TABS.map(([table, id, label]) => {
    const ofKind = visible.filter((r) => r.table === table);
    const byHand = ofKind.filter((r) => r.row.image_id == null);
    const onlyThis = Object.fromEntries(tables.map((t) => [t, t === table ? ofKind.map((r) => r.row) : []]));
    return {
      id,
      label,
      count: ofKind.length,
      // The same check Generate version makes, for this kind only.
      warn: problems({ ...(onlyThis as Record<ItemTable, Row[]>), flights: [] }).length > 0,
      content: (
        <>
          {table === "flight_options" && !readOnly && airlines}
          {images.map((img) => {
            const items = ofKind.filter((r) => r.row.image_id === img.id);
            if (items.length === 0) return null;
            return (
              <section className="edit-block" key={img.id} id={`block-${id}-${img.id}`}>
                <div className="edit-image">
                  {img.url && <ImageViewer src={img.url} alt={img.filename} />}
                  <small>{img.filename}</small>
                </div>
                <fieldset className="edit-items plain" disabled={readOnly}>
                  {items.map(form)}
                </fieldset>
              </section>
            );
          })}
          <section className="edit-block">
            <div className="edit-image">
              <b>Manual Capture</b>
            </div>
            <fieldset className="edit-items plain" disabled={readOnly}>
              {byHand.map(form)}
              {!readOnly && <AddItemForm quoteId={quoteId} table={table} />}
            </fieldset>
          </section>
        </>
      ),
    };
  });

  return (
    <>
      <EditTabs tabs={tabs} />
      {rows.length > visible.length && (
        <p className="empty">Items from removed images are left out. Uploading the same image again within 90 days brings them back.</p>
      )}
    </>
  );
}
