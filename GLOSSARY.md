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
What Claude read off one image attached to a Quote: the Items it found, copied exactly as shown. Each image is read once; the Items found become part of the Quote's Working content, where staff correct them directly. A Quote's PDF is built from that, never by Claude.
_Avoid_: AI scan, parse

**Item**:
One bookable service found on an image or entered by hand, such as one flight option, one Accommodation option or one car rental.
_Avoid_: Line, entry

**Flight option**:
One complete way of flying the Trip, as offered by a supplier: every Direction and flight in it, with one price for the whole option. Each fare or cabin choice shown on a screen is its own Flight option.
_Avoid_: Flight quote, fare, booking

**Direction**:
One part of a Flight option travelled in one go, such as the outbound or the return, or one leg of a multi-city trip. It may contain several flights joined by connections. It has no price of its own.
_Avoid_: Bound, leg, group, segment

**Accommodation**:
A place the Client stays: hotel, lodge, guesthouse, B&B and so on. "Hotel" is accepted as an everyday synonym.
_Avoid_: Lodging, stay

**Stay**:
One stop on the Trip's itinerary: one place, from an arrival date to a departure date, with an optional highlight. A Stay holds the Accommodation options offered for it. Options with no dates belong to no Stay until staff place them, and a Version cannot be generated while any are unplaced.
_Avoid_: Trip stop, leg, segment

**Experience**:
A tour, activity or outing the Client can book. "Excursion" is accepted as an everyday synonym.
_Avoid_: Activity, tour

**Fee schedule**:
The agency's fees for each kind of Item, Fee region and (for flights) cabin: a Transaction fee, Change fee, Refund fee and Pre-payment fee, all including VAT. A Client may have their own; otherwise the standard one applies. Claude never sets or reads fees.
_Avoid_: Tariff, price list

**Transaction fee**:
The agency's fee for booking one Item, taken from the Fee schedule. It is added to the Item's total. It is also what the Client pays if they cancel an Item before it is issued.
_Avoid_: Service fee, booking fee, professional fee

**Markup**:
A Rand amount the Consultant adds to one Item by hand. It is added to the Item's total.
_Avoid_: Margin, commission

**Fee region**:
Which Fee schedule line applies to an Item: Domestic (South Africa), Neighbouring (Mozambique, Botswana, Zimbabwe, Namibia, Eswatini, Lesotho, Zambia), Local international (flights only: within one other country) or International (anywhere else). It is worked out from where the Item takes place, and the Consultant can change it per Item.
_Avoid_: Zone, area, local

**Item total**:
What the Client pays for one Item, for everyone on the Trip: the supplier's price as shown (taxes included) plus the Transaction fee, the Markup and, if the Item is prepaid, the Pre-payment fee. It is always in Rand, and it is the only price the Quote shows for an Item.
_Avoid_: Rate, price

**Issued**:
An Item is issued once the supplier has confirmed and ticketed it. Only Items are issued; Versions are generated.
_Avoid_: Confirmed, ticketed (for the state), issued (for a Version)

**Refund fee**:
What the agency charges if the Client cancels an Item after it has been issued. Taken from the Fee schedule; the Consultant can change it. Shown on the Quote as the cancellation / refund fee, never added to the Item total.
_Avoid_: Cancellation fee, cxl fee

**Change fee**:
What the agency charges to change an Item after it has been issued, such as reissuing a ticket. Taken from the Fee schedule (only flights have one as standard); the Consultant can change it. Shown on the Quote, never added to the Item total.
_Avoid_: Reissue fee, amendment fee

**Pre-payment fee**:
What the agency charges when it pays the supplier upfront or bills the Client back for an Item. Taken from the Fee schedule; charged only when the Consultant marks the Item as prepaid, and then added to the Item total.
_Avoid_: Bill-back fee, prepay fee

**Transfer**:
A road trip from one place to another as part of the Trip, such as airport to hotel. Read from images like any other Item.
_Avoid_: Shuttle, pickup

**Rail journey**:
A train trip that is part of the Trip. Read from images like any other Item.
_Avoid_: Train, rail ticket

**Version**:
One generated edition of a Quote (V1, V2 ...), with exactly one PDF. Made by Generating a version: a frozen copy of the Quote's Working content at that moment. Versions are never edited and their PDF is never re-rendered; changes, including a needed re-render, go into the next Version.
_Avoid_: Revision, draft

**Working content**:
The editable state of a Quote: its Items (read from its images or entered by hand, as corrected by staff), their placement in Stays, and fees. Editing a Quote means changing its Working content.
_Avoid_: Draft, current version

**Generate version**:
The act of freezing a Quote's Working content into its next Version and producing that Version's PDF. The freeze is kept even if the PDF fails; producing the PDF is then retried from the frozen copy, never from the Working content. A Version without its PDF cannot be sent.
_Avoid_: Save, publish, issue, commit

**Client document**:
A file kept against a Client, such as an ID copy or passport copy. It is personal information under POPIA.
_Avoid_: Attachment, upload
