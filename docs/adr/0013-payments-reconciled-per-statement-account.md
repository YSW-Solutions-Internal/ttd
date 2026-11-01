# Payments are reconciled per statement account

Every Client has an EFT Payment account, but a Client's EFT or Cash lands in an agency account (the bank account, the cash box), and that statement is what an Accountant reconciles against. So a Client Payment by EFT or Cash also names the agency account it landed in or left from, and the month-end list and reconciliation page exist per account with a statement of its own: each agency account and each Client card (decided 2026-10-30).

## Considered Options

- **One month-end CSV per Payment account**, as first planned: one EFT file per Client and none for the bank account, so nothing lines up with a real statement.
- **No Client EFT or Cash accounts, only agency ones**: simpler, but loses who paid how, which the brief asks for (Lisa's question 5 is still open).

## Consequences

- Reconciling happens on `/accounts/statements/[account]`, one month at a time across all Trips, not Trip by Trip.