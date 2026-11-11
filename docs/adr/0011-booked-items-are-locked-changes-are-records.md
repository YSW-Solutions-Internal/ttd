# Booked Items are locked; changes after booking are Change records

Extends ADR 0005. Before an Item is booked it is edited in place, as now. Once booked, its prices are fixed and it gains the supplier's actual currency, amount and rate (the Quote itself stays in Rand). Anything that alters it after that, such as a flight reissue, is a Change: a dated child record with its own extra fare, taxes, supplier penalty, Change fee and Markup. Supplier invoices and Client invoices link to an Item or a Change. This is because the booking and accounts brief needs every charge kept: one flight change can bring two XL invoices weeks apart, and an Accountant matching them needs the original charge to still be there.

## Considered Options

- **Keep editing booked Items in place, with the audit trail as history**: no new table, but the original charges only survive in a log, invoices would point at a moving target, and "still to invoice" could not be worked out per change.
- **Bring currency back to every Item, quoted or not**: matches the brief's "configurable currency" literally, but reopens the multi-currency Quotes dropped on 2026-10-25 (migration 0011).

## Consequences

- The quoted Rand total and the actual Rand amount can differ, which is how a Blacklane charge on the day shows its difference.
- Fixing booking details typed wrong is a Correction, an edit kept in History, not a Change: staff may correct until a linked Supplier invoice is Verified, Administrators after that (decided 2026-10-29).
