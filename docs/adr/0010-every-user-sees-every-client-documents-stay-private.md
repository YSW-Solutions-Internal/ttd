# Every User sees every Client and Trip; only Client documents stay private

Supersedes ADR 0001. Every User can see and work on every Client, Trip, Quote and their financial records, because the booking and accounts brief needs any Consultant to help on a Trip and an Accountant to follow every Trip's invoices. Client documents (ID and passport copies, personal information under POPIA) stay visible only to the Client's Consultant and Administrators, enforced by storage and row-level security as before. Every change is recorded with who made it and when, so shared access stays accountable.

## Considered Options

- **Keep ADR 0001 and let a Trip list assisting Users**: least exposure, but every Trip would need its helpers added before they can help, and the Accountant would need a separate exception to see everything.
- **Everyone sees everything, documents included**: simplest, but puts passport copies in front of every User for no reason the brief gives.

## Consequences

- RLS on Clients, Trips, Quotes and everything under a Quote is relaxed to "any signed-in User"; Client documents keep the Consultant-or-Administrator rule.
- Duplicate-client detection no longer has to run in the database, since every User can see every Client.
- Handing a Client over changes who is responsible and who sees their documents, not who can see the Client.
- The Trips list's Consultant filter is useful to every User, not only Administrators.
- Lisa has to be told that every User, including an external Accountant, sees every Client's contact details and Trips.
