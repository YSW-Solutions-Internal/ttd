# Every Item total is in Rand, converted at Generate version with a stored rate

Suppliers price in their own currency, but the Markup is a Rand amount and the Transaction fee comes from a Rand Fee schedule, so an Item total can only be one number if the supplier price is converted first. When the Consultant generates a version, code fetches today's rate for each foreign currency on the Quote, the Consultant may override any rate (and must type one in if the fetch fails), and the rates used are stored on the Version. Every Item total on the PDF is in Rand; the rate itself is not printed.

## Considered Options

- **Show the supplier price and the Rand fees side by side, no total**: no conversion needed, but the Client cannot see what an option costs, which is the point of the Quote.
- **Consultant always types the rate**: no external dependency, but slow and easy to get wrong on every Version.

## Consequences

- A Version can be re-rendered at any time with the same numbers, because it holds its own rates; it never re-fetches.
- The terms already state that prices follow the rate of exchange on the day of quotation, which is the day the Version was generated.
