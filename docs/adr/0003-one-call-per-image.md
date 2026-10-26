# One Claude call per image; the prompt covers every source, nothing is routed

Each image is sent to Claude exactly once, in a single call that returns every Item on it (several Items per image, of any kind) plus the image's source type (supplier website, Galileo GDS screen or BookingPad screen, for flights). The reading guidance for each source lives in sections of one prompt, and the answer's shape is a JSON schema given at the end of the prompt and checked by our code (see the amendment below). Claude does no lookups: airport codes and names are copied as printed and resolved against `public.airports` by code afterwards.

## Considered Options

- **Classify, then route to a per-source extractor** (the Make.com flow: service type, then flight source, then one of several extractors): each extractor's prompt is narrower, but every image is sent two or three times, a wrong classification silently sends it to the wrong extractor (hence the "routing safety" fallbacks), and one image can only ever be one service type.
- **Give Claude an airport lookup tool** (`search_airport_item` in Make): Claude would return resolved codes, but every lookup is an extra round trip, and choosing a match is a guess that ADR 0002 keeps out of Claude's hands.

## Consequences

- The source type is recorded for display and debugging only; nothing branches on it, except possibly the choice of model if an eval shows GDS screens need a stronger one.
- Adding a new source means adding a section to the prompt and a value to the source type, then bumping `PROMPT_VERSION`.
- The prompt is longer than any single routed prompt, but it is identical on every call, so it is cached.

## Amendment (2026-10-25): the schema is no longer enforced by the API

With transfers and rail added, structured outputs rejected every image ("The compiled grammar is too large"), and still did after the schema was cut by half; the limit is not published. The schema now goes at the end of the prompt and `parseAnswer` / `toExtractionResult` check the answer: a missing kind array or an answer that is not JSON fails that image visibly (raw answer in `ai_calls`), a missing field reads as empty, and numbers are accepted quoted or not. Rejected: one call to identify the kinds on the image, then one schema-enforced call per kind. It keeps the API's guarantee but doubles the calls, may still not fit the limit, and a kind the first call misses is silently never read.
