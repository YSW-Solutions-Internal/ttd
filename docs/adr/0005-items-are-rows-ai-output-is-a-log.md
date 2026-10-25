# Items are flat rows edited in place; the AI's output is a separate log

Replaces the corrections part of ADR 0002. Every Item, whether read from an image or entered by hand, is a row in a table for its kind (`flight_options` with child `flights`, `accommodation_options`, `car_rentals`, `transfers`, `rail_journeys`, `excursions`), with a required `quote_id`, an `image_id` that is empty for hand-entered Items, and a text `entity_id` that `item_refs`, `version_items` and `item_bookings` point at. Consultants correct those rows directly. What Claude returned for each call is appended to `ai_calls` (raw text, model, prompt version, tokens, stop reason, error) for developers to debug; `extractions` only records whether an image has been read and locks it while it is being read.

## Considered Options

- **Keep the AI's answer as a JSON blob and store corrections as field-path patches on top** (the 0001 design: `extractions.result` + `overrides` + `manual_items`): the original reading stays next to the corrected value, but every read has to replay patches against JSON paths, a patch silently stops applying if the path changes, and hand-entered Items need a second code path.
- **One `items` table with shared price columns and a JSON column for kind-specific fields**: fewer tables, but kind-specific fields get no types or checks and are as awkward to query and debug as the blob.

## Consequences

- The AI's original value for a field is only in `ai_calls`. Showing "AI said X, you changed it to Y" means comparing the row with the parsed log.
- A Version's frozen copy is still `quote_versions.assembled`; the Item tables are the Working content only.
