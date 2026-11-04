# Destinations stay a shared list

A Stay's place is picked from one shared list of Destinations, and an Administrator corrects, removes and merges them. Today the app uses only a Destination's country (for the Fee region); its name is copied onto each Stay and its code is only a key. A text box and a country on each Stay would do that job with nothing to maintain. We keep the list anyway because we may need to filter Trips by place across Clients, and that needs one spelling per place.

## Considered Options

- **Free text plus a country on each Stay**: no list to maintain, no made-up codes, and no admin page. But spellings drift ("Cape Town", "Capetown", "CPT"), so counting by place becomes unreliable, and going back to a list later means cleaning up months of drift by hand.
- **Free text that suggests earlier names**: less drift, but still no guarantee of one spelling per place.

## Consequences

- The choice can be undone in one direction only. Dropping the list later is cheap, because each Stay already holds its own name, but building one up from free text is not. That asymmetry is why we kept the list.
- Duplicates are fixed after the fact by merging, not prevented when someone adds a place.
- Correcting a Destination's country, or merging into one with a different country, changes the Fee region of every Stay there on its next Version.
