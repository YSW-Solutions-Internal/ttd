# One Quote per Trip, kept as its own record

A Trip has exactly one Quote. The database creates it together with the Trip, and `unique (trip_id)` on `quotes` makes sure there is never a second one. Staff try a different offer by changing the Working content and generating another Version, not by starting another Quote. The Quote keeps its own table: the Trip holds the journey (Client, dates, travellers, Stays, visa/health/insurance info, terms, status), and the Quote holds the priced content (images, Items, fees) and its Versions. The Quote has no reference, title or owner of its own. PDFs carry the Trip reference (`TRIP-RW001-001-v2.pdf`).

## Considered Options

- **Fold the Quote into `trips`**: removes one join and one id, but means re-keying every Item table, `images`, `quote_versions`, the RLS functions and storage paths from `quote_id` to `trip_id`. It would also mix itinerary and pricing in one wide table, and splitting them again later would be hard.
- **Keep several Quotes per Trip** (the earlier design): staff never used it. Trip-level facts such as Stays were shared across Quotes anyway, so it only added a choice nobody needed.

## Consequences

- Code reaches the Quote through `quotes.trip_id`. Pages still address the Quote by its own id (`/quotes/[id]`).
- Allowing several Quotes per Trip again only means dropping the unique constraint and the create-with-Trip trigger.
