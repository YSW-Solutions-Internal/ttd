# An Item's invoicing stage is calculated, never typed

An Item's or Change's invoicing stage (Awaiting supplier invoice, Received, Verified, Invoiced, No supplier invoice expected) and its Rand amount still to invoice are worked out from its linked Supplier invoices and Client invoices. There is no status column to set. The SharePoint pilot had a status on the service and another on the PDF; they drifted apart, and the Power Automate flow meant to keep them in step failed (Lisa's SPEC §5.2).

## Considered Options

- **A status per Item that staff move by hand** (the pilot's Client Invoicing Status): simple and familiar to Lisa, but nothing stops it disagreeing with the invoices actually attached, and a supplier invoice arriving must not mark charges as invoiced (brief §12).
- **A status per Item kept in step by triggers**: the same answer without drift, but two places hold the truth and the trigger has to cover every edit and delete.

## Consequences

- The Accountant's queues (awaiting, overdue, to invoice) are queries, not filters on a typed field.
- "No supplier invoice expected" is the one hand-set input: a flag an Accountant sets on an Item or Change.
- "Overdue" needs an expected supplier-invoice date on booked Items.
