import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/relations";
import { STAGE_LABEL, STATUS_LABEL, type InvoiceStatus, type Side } from "@/lib/invoicing";
import type { Billable } from "./invoicing-data";
import { setNoSupplierInvoice } from "./invoice-actions";
import { AddInvoiceForm, DeleteInvoiceButton, LinkForm, RemoveLinkButton, StatusForms } from "./invoice-forms";
import { FileLink } from "@/app/file-viewer";

const amount = (currency: string, n: number) => `${currency} ${n.toFixed(2)}`;

/**
 * The Trip's Supplier invoices and Client invoices, each with the booked Items and
 * Changes it is linked to (GLOSSARY: Supplier invoice, Client invoice).
 */
export async function Invoices({
  tripId,
  quoteId,
  billables,
  canAdd,
  accounts,
  admin,
}: {
  tripId: string;
  quoteId: string;
  billables: Billable[];
  canAdd: boolean; // the Trip's status and Consultant (migration 0024)
  accounts: boolean; // Accountants and Administrators
  admin: boolean;
}) {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, side, supplier_id, number, issued_on, amount, currency, status, query_reason, file_path, suppliers(name), invoice_links(id, entity_id, change_id, amount)")
    .eq("trip_id", tripId)
    .order("issued_on");

  const paths = (invoices ?? []).map((i) => i.file_path);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from("invoice-files").createSignedUrls(paths, 3600);
    signed?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }

  const byKey = new Map(billables.map((b) => [b.key, b]));
  const suppliers = [...new Map(billables.map((b) => [b.supplierId, { id: b.supplierId, name: b.supplierName }])).values()];

  const block = (side: Side) =>
    (invoices ?? [])
      .filter((i) => i.side === side)
      .map((i) => {
        const total = Number(i.amount);
        const links = i.invoice_links ?? [];
        const unlinked = Math.round((total - links.reduce((a, l) => a + Number(l.amount), 0)) * 100) / 100;
        const verified = i.status === "verified";
        const changeable = (canAdd || accounts) && (!verified || admin);
        const linkedKeys = new Set(links.map((l) => (l.change_id ? `${l.entity_id}|${l.change_id}` : l.entity_id)));
        const targets = billables.filter((b) => !linkedKeys.has(b.key) && (side === "client" || b.supplierId === i.supplier_id));
        return (
          <section key={i.id} className="card">
            <div className="item-head">
              <b>
                {total < 0 ? "Credit note" : "Invoice"} {i.number}
              </b>
              {side === "supplier" && ` · ${one(i.suppliers)?.name ?? ""}`} · {i.issued_on} · {amount(i.currency, total)}
              {i.status && <span className={`badge ${verified ? "ok" : i.status === "query" ? "bad" : ""}`}>{STATUS_LABEL[i.status as InvoiceStatus]}</span>}
              {urls.get(i.file_path) && (
                <>
                  {" "}
                  · <FileLink href={urls.get(i.file_path)!} title={`${total < 0 ? "Credit note" : "Invoice"} ${i.number}`}>Open PDF</FileLink>
                </>
              )}
            </div>
            {i.status === "query" && <p className="msg">Query: {i.query_reason}</p>}
            {links.length > 0 && (
              <table>
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id}>
                      <td>{byKey.get(l.change_id ? `${l.entity_id}|${l.change_id}` : l.entity_id)?.label ?? "An Item no longer on the Quote"}</td>
                      <td>{amount(i.currency, Number(l.amount))}</td>
                      <td>{changeable && <RemoveLinkButton tripId={tripId} linkId={l.id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {unlinked !== 0 && <p className="msg">⚠ {amount(i.currency, unlinked)} not linked to any Item or Change.</p>}
            {changeable && unlinked !== 0 && (
              <LinkForm tripId={tripId} invoiceId={i.id} quoteId={quoteId} credit={total < 0} targets={targets} remaining={unlinked} />
            )}
            {accounts && side === "supplier" && <StatusForms tripId={tripId} invoiceId={i.id} status={i.status ?? ""} />}
            {canAdd && (!verified || admin) && <DeleteInvoiceButton tripId={tripId} invoiceId={i.id} />}
          </section>
        );
      });

  return (
    <>
      <h2>Invoices</h2>
      {billables.length === 0 && <p className="empty">Nothing booked yet.</p>}
      {billables.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Booked</th>
              <th>Invoicing stage</th>
              <th>Still to invoice</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {billables.map((b) => (
              <tr key={b.key}>
                <td>{b.label}</td>
                <td>{STAGE_LABEL[b.stage]}</td>
                <td>{b.toInvoice !== 0 ? `R ${b.toInvoice.toFixed(2)}` : "—"}</td>
                <td>
                  {accounts && (b.noneExpectedFlag || b.stage === "awaiting") && (
                    <form action={setNoSupplierInvoice.bind(null, tripId, quoteId, b.entityId, b.changeId, !b.noneExpectedFlag)}>
                      <button type="submit" className="link">
                        {b.noneExpectedFlag ? "A supplier invoice is expected after all" : "No supplier invoice expected"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>From Suppliers</h3>
      {block("supplier")}
      {canAdd && <AddInvoiceForm tripId={tripId} side="supplier" suppliers={suppliers} />}
      <h3>To the Client</h3>
      {block("client")}
      {canAdd && <AddInvoiceForm tripId={tripId} side="client" suppliers={[]} />}
    </>
  );
}
