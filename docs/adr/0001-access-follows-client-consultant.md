---
status: superseded by 0010
---

# Access follows the Client's Consultant, enforced in the database

A non-admin User can see and work on a Client only if they are that Client's Consultant. The same applies to everything under the Client: their documents, Trips, Quotes and all data and files below a Quote, plus fee schedules tied to the Client. Administrators see everything and are the only ones who hand a Client to another Consultant; on handover, everything moves with the Client at once. This is enforced by Postgres row-level security and storage policies, not only in the app, because the Supabase key in the browser lets any signed-in User query the database directly. Client documents are personal information under POPIA, which is the main reason for the rule.

## Considered Options

- **Every User sees every Client** (the 0006 rules): simplest, and makes duplicates easy to spot, but it exposes clients' personal details and documents to all staff.
- **Access per Trip** (each Trip has its own controller, so one Client's Trips can be run by different Consultants): wanted later, but in about 90% of cases the Trip's controller is the Client's Consultant, so it is deferred. When it is added, a Trip's controller should default to the Client's Consultant, and the rule extends to "Client's Consultant *or* the Trip's controller" for that Trip and its Quotes.

## Consequences

- `trips.consultant_id` ("Person" on the boards) and `quotes.owner_id` ("Owner") are labels only and grant no access, until per-Trip control is built.
- A User cannot see other Users' Clients, so duplicate-client detection, when built, has to happen in the database.
