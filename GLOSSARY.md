# TTD Quotes

Staff-only tool for a travel agency: building quotes for clients' trips from supplier material.

## People

**User**:
A staff member with an account (Administrator or Standard user). Accounts exist only by invitation.
_Avoid_: Staff account, login

**Client**:
A traveller (or contact) the agency quotes for. Clients never have accounts.
_Avoid_: Customer, contact

**Consultant**:
The User responsible for a Client, and the only non-admin User who may see or work on that Client, their documents, Trips and Quotes. Each Client has one Consultant; only an Administrator can hand a Client over to another Consultant. Not necessarily the User who first entered the Client.
_Avoid_: Owner, assigned user, creator, agent (ambiguous with Claude)

**Client code**:
A Client's short identifier: first letter of the first name, first three letters of the last name, and a two-digit number (e.g. RWOL01). Set when the Client is added and never changes afterwards. It appears inside every Trip and Quote reference for that Client.
_Avoid_: Client number, client no, client ID

## Records

**Trip**:
One journey for one Client. Quotes are always made for a Trip, never directly for a Client.
_Avoid_: Booking, itinerary

**Trip status**:
Where a Trip stands: In progress, Completed or Cancelled. A new Trip is In progress. Its Consultant or an Administrator can change it in any direction, including reopening a Cancelled Trip.
_Avoid_: State, stage, "current trip" (say In progress)

**Quote**:
A priced proposal for a Trip. A Trip can have several Quotes.
_Avoid_: Estimate, proposal

**Extraction**:
What Claude read off one image attached to a Quote: the Items it found, copied exactly as shown. Each image is read once; a Quote's PDF is built from its images' Extractions plus staff corrections, never by Claude.
_Avoid_: AI scan, parse

**Item**:
One bookable service found on an image or entered by hand, such as one flight option, one Accommodation option or one car rental.
_Avoid_: Line, entry

**Accommodation**:
A place the Client stays: hotel, lodge, guesthouse, B&B and so on. "Hotel" is accepted as an everyday synonym.
_Avoid_: Lodging, stay

**Stay**:
One stop on the Trip's itinerary: one place, from an arrival date to a departure date, with an optional highlight. A Stay holds the Accommodation options offered for it. Options with no dates belong to no Stay until staff place them, and a Quote cannot be issued while any are unplaced.
_Avoid_: Trip stop, leg, segment

**Experience**:
A tour, activity or outing the Client can book. "Excursion" is accepted as an everyday synonym.
_Avoid_: Activity, tour

**Fee schedule**:
The agency's list of service fees (ticketing, booking, refund and so on). A Client may have their own; otherwise the standard one applies. Claude never sets or reads fees.
_Avoid_: Tariff, price list

**Version**:
One issued edition of a Quote (V1, V2 ...), with exactly one PDF. Made by Generating a version: a frozen copy of the Quote's Working content at that moment. Versions are never edited; changes go into the Working content and become the next Version.
_Avoid_: Revision, draft

**Working content**:
The editable state of a Quote: the Items from its images' Extractions, staff corrections, Items entered by hand, their placement in Stays, and fees. Editing a Quote means changing its Working content.
_Avoid_: Draft, current version

**Generate version**:
The act of freezing a Quote's Working content into its next Version and producing that Version's PDF.
_Avoid_: Save, publish, issue, commit

**Client document**:
A file kept against a Client, such as an ID copy or passport copy. It is personal information under POPIA.
_Avoid_: Attachment, upload
