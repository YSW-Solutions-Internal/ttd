import type { createClient } from "@/lib/supabase/server";
import { itemTotal } from "@/lib/pdf/money";
import { one } from "@/lib/relations";
import { changeCharge, expectsSupplierInvoice, invoicingStage, type InvoiceStatus, type Side, type Stage } from "@/lib/invoicing";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

export type LinkedInvoice = {
  linkId: string;
  invoiceId: string;
  side: Side;
  number: string;
  amount: number; // the part linked here
  currency: string;
  status: InvoiceStatus | null;
  url?: string;
};

/** One booked Item or one of its Changes, as invoicing sees it. Key: "entityId" or "entityId|changeId". */
export type Billable = {
  key: string;
  entityId: string;
  changeId: string | null;
  supplierId: string;
  supplierName: string;
  label: string;
  stage: Stage;
  toInvoice: number;
  noneExpectedFlag: boolean;
  links: LinkedInvoice[];
};

/**
 * Every booked Item and Change on a Quote with its Invoicing stage, the Rand amount still
 * to invoice and its linked invoices. `items` are the Quote's Item rows by entity_id, with
 * a label each; their prices give the Item total.
 */
export async function loadBillables(
  supabase: Supabase,
  quoteId: string,
  items: Map<string, { row: Row; label: string }>,
): Promise<Billable[]> {
  const [{ data: bookings }, { data: changes }, { data: links }] = await Promise.all([
    supabase.from("item_bookings").select("entity_id, supplier_id, booking_reference, no_supplier_invoice, suppliers(name)").eq("quote_id", quoteId),
    supabase.from("item_changes").select("*").eq("quote_id", quoteId).order("happened_on").order("created_at"),
    supabase
      .from("invoice_links")
      .select("id, entity_id, change_id, amount, invoices(id, side, number, currency, status, file_path)")
      .eq("quote_id", quoteId)
      .order("created_at"),
  ]);

  // Private bucket: short-lived signed links for the PDFs.
  const paths = [...new Set((links ?? []).flatMap((l) => one(l.invoices)?.file_path ?? []))];
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from("invoice-files").createSignedUrls(paths, 3600);
    signed?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }

  const linked = (entityId: string, changeId: string | null): LinkedInvoice[] =>
    (links ?? [])
      .filter((l) => l.entity_id === entityId && (l.change_id ?? null) === changeId)
      .flatMap((l) => {
        const i = one(l.invoices);
        if (!i) return [];
        return [{ linkId: l.id, invoiceId: i.id, side: i.side, number: i.number, amount: Number(l.amount), currency: i.currency, status: i.status, url: urls.get(i.file_path) }];
      });

  const billable = (b: NonNullable<typeof bookings>[number], changeId: string | null, label: string, charge: number, flag: boolean, expects: boolean): Billable => {
    const ls = linked(b.entity_id, changeId);
    return {
      key: changeId ? `${b.entity_id}|${changeId}` : b.entity_id,
      entityId: b.entity_id,
      changeId,
      supplierId: b.supplier_id,
      supplierName: one(b.suppliers)?.name ?? "",
      label,
      noneExpectedFlag: flag,
      links: ls,
      ...invoicingStage({
        charge,
        clientInvoiced: ls.filter((l) => l.side === "client").map((l) => l.amount),
        supplierStatuses: ls.filter((l) => l.side === "supplier").map((l) => l.status as InvoiceStatus),
        noneExpected: flag || !expects,
      }),
    };
  };

  return (bookings ?? []).flatMap((b) => {
    const item = items.get(b.entity_id);
    const head = `${item?.label ?? "Item"} · ${one(b.suppliers)?.name ?? ""} ${b.booking_reference}`;
    const own = billable(b, null, head, item ? itemTotal(item.row, Number(item.row.rooms ?? 1)) ?? 0 : 0, b.no_supplier_invoice, true);
    const ofItem = (changes ?? [])
      .filter((c) => c.entity_id === b.entity_id)
      .map((c) =>
        billable(
          b,
          c.id,
          `${head} · ${c.kind === "cancellation" ? "Cancellation" : "Change"} ${c.happened_on}${c.description ? `: ${c.description}` : ""}`,
          changeCharge(c),
          c.no_supplier_invoice,
          expectsSupplierInvoice(c),
        ),
      );
    return [own, ...ofItem];
  });
}
