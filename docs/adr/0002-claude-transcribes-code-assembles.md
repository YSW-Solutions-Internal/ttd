# Claude only transcribes images; code assembles and prices the Quote

How corrections are stored is superseded by ADR 0005 (Items are rows edited in place).

Claude reads one image at a time and copies the Items it sees into an Extraction, exactly as shown, with null for anything it cannot read. It never calculates, groups, prices or adds fees. Everything after that is deterministic code: Accommodation options are grouped into Stays by matching dates, fees come from the Client's Fee schedule (or the standard one), the Consultant's corrections are applied on top, and the result is assembled into the quote JSON that the PDF is rendered from. Each Version is therefore exactly what the Consultant reviewed, can be rebuilt from the tables at any time, and costs no AI calls apart from new images.

## Considered Options

- **One Claude call per Quote, over all its images**: Claude could see that the outbound flight on one screenshot and the return on another belong together. Rejected because every Version would re-send and re-pay for every image, one bad image spoils the whole Quote, and corrections have no stable Item to attach to.
- **Claude produces the final quote JSON**: less code, but fees, totals and grouping would be guessed rather than calculated, and a Quote sent to a Client could contain numbers nobody checked.

## Consequences

- An image is sent to Claude once, ever. Changing a prompt means bumping `PROMPT_VERSION`, which only applies to images not yet read: an image already read keeps its stored Extraction, because the Consultant's corrections are keyed to its Items and a second reading would give them new ids.
- Prices Claude could not read stay null. Generate Quote is blocked until the Consultant fills each one in or marks it "On request". Code flags doubtful prices (fare plus taxes not matching the total, zero prices, a total worked out from per-passenger prices) for the Consultant to check. Every price is in Rand.
- An image whose Extraction failed does not block the rest. The Consultant decides whether to re-process it or go on without it.
