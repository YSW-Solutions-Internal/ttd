# TTD Quotes

Staff-only tool for a travel agency: building quotes for clients' trips from supplier material.

## People

**User**:
A staff member with an account (Administrator, Standard user or Accountant). Accounts exist only by invitation.
_Avoid_: Staff account, login

**Accountant**:
A User who follows the money after a Trip is booked: supplier invoices, Client invoices and their statuses, linked to the Items they cover. May be an external bookkeeper. Sees every Client, Trip and Quote but never edits them, and is never a Client's Consultant. Administrators can also do everything an Accountant does. Only Accountants and Administrators see the accounts queues; other Users see each Item's Invoicing stage on its Trip.
_Avoid_: Bookkeeper, accounts (as a person)

**Client**:
A person or a company the agency quotes for and invoices; which of the two is decided when the Client is added and never changes. A company Client may name a contact person. Clients never have accounts.
_Avoid_: Customer, contact

**Consultant**:
The Standard user or Administrator responsible for a Client. Every User can see every Client, Trip and Quote, and every User but an Accountant can work on them; only the Consultant and Administrators can see the Client's documents. Each Client has one Consultant; only an Administrator can hand a Client over to another Consultant. Not necessarily the User who first entered the Client. A Trip's or Quote's Consultant is always its Client's current Consultant, so a handover moves the Client's older Trips too.
_Avoid_: Owner, assigned user, creator, agent (ambiguous with Claude)

**Client code**:
A Client's short identifier: first letter of the first name, first three letters of the last name, and a two-digit number (e.g. RWOL01); for a company, the first four letters of its name and a two-digit number (e.g. OREA01). Set when the Client is added and never changes afterwards. It appears inside every Trip and Quote reference for that Client.
_Avoid_: Client number, client no, client ID

## Records

**Trip**:
One journey for one Client, taken by one or more Travellers. Each Trip has exactly one Quote, which comes into being with the Trip; there is never a Quote without a Trip, nor a second Quote for the same Trip.
_Avoid_: Booking (that is what happens to an Item), itinerary

**Trip status**:
Where a Trip stands: Enquiry, Quoted, Booked, Travelled or Cancelled. A new Trip is an Enquiry; it is Booked once the Client has accepted and its Items are being booked with suppliers. Staff can change it in any direction, including reopening a Cancelled Trip. A Trip with an open Refund shows that alongside its status; it is never a status of its own.
_Avoid_: State, stage, Booking status, Confirmed, "Refund in progress" (as a status)

**Traveller**:
A person who travels on a Trip. Each Traveller belongs to one Client (the company they travel for, or the person Client and their family) and can go on any of that Client's Trips. A person Client who travels is also one of their own Travellers. A Traveller is not a Client: they have no Client code or Consultant and are not invoiced. A Traveller has an ID (number and image), one or more Passports, or both; one without either is flagged until one is added. Their ID and Passports are personal information under POPIA, seen only by the Client's Consultant and Administrators, like Client documents. A Trip's adult and child counts are kept as typed; its Travellers may be added later and need not match them.
_Avoid_: Passenger, pax, guest

**Passport**:
One passport a Traveller holds or has held: number, nationality, issue and expiry dates, the name exactly as printed when it differs from the Traveller's, and an image of it. A Traveller keeps every Passport ever entered; none is overwritten when a new one is issued, and the most recent one stands out. Personal information under POPIA, seen only by the Client's Consultant and Administrators.
_Avoid_: Passport details (as a record), travel document

**Terms profile**:
The standard set of terms and conditions printed on a Trip's Quote. Every Trip uses Standard (South Africa, international) unless changed. Staff can add their own lines to it as custom notes.
_Avoid_: T&Cs, template

**Quote**:
The priced proposal for a Trip: its Working content and the Versions generated from it. Each Trip has exactly one Quote; trying a different offer means changing the Working content and generating another Version, not starting another Quote.
_Avoid_: Estimate, proposal

**Extraction**:
What Claude read off one image attached to a Quote: the Items it found, copied exactly as shown. Each image is read once; the Items found become part of the Quote's Working content, where staff correct them directly. A Quote's PDF is built from that, never by Claude.
_Avoid_: AI scan, parse

**Item**:
One bookable service found on an image or entered by hand, such as one flight option, one Accommodation option, one car rental, one Package, one Visa or one Insurance policy.
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

**Destination**:
A place a Stay can be at: a city or town, or an area with no airport such as a game reserve, always with its country. Destinations are one shared list; any User can add one, and only an Administrator can correct or remove one.
_Avoid_: City (a Destination need not be one), stop

**Stay**:
One stop on the Trip's itinerary: one place, from an arrival date to a departure date, with an optional highlight. A Stay holds the Accommodation options offered for it. Options with no dates belong to no Stay until staff place them, and a Version cannot be generated while any are unplaced.
_Avoid_: Trip stop, leg, segment

**Package**:
A tour operator's bundled trip, booked as one Item, usually paid as a deposit and then a final balance due some weeks before departure.
_Avoid_: Tour, holiday

**Visa**:
An entry permit the agency applies for or pays for on a Traveller's behalf, booked as an Item. Advice about visas without a purchase belongs on the Trip checklist.
_Avoid_: Visa info

**Insurance**:
A travel insurance policy issued through the agency (TIC, Hollard, Chubb or another insurer), booked as an Item. A Client declining or using their own cover is recorded on the Trip checklist, not as an Item.
_Avoid_: Cover, policy (alone)

**Trip checklist**:
The checks and advice a Consultant records for a Trip, each with who ticked it and when: visa and entry requirements, health advice, insurance decision, Traveller details checked with the supplier, seats and meals requested, documents sent.
_Avoid_: Visa info, health info, notes

**Experience**:
A tour, activity or outing the Client can book. "Excursion" is accepted as an everyday synonym.
_Avoid_: Activity, tour

**Fee schedule**:
The agency's fees for each kind of Item, Fee region and (for flights) cabin: a Transaction fee, Change fee, Refund fee and Pre-payment fee, all including VAT, plus the Card surcharge rate. A Client may have their own; otherwise the standard one applies. Claude never sets or reads fees.
_Avoid_: Tariff, price list

**Transaction fee**:
The agency's fee for booking one Item, taken from the Fee schedule. It is added to the Item's total. It is also what the Client pays if they cancel an Item before it is issued.
_Avoid_: Service fee, booking fee, professional fee

**Markup**:
A Rand amount the Consultant adds to one Item by hand. It is added to the Item's total.
_Avoid_: Margin, commission

**Fee region**:
Which Fee schedule line applies to an Item: Domestic (South Africa), Neighbouring (Mozambique, Botswana, Zimbabwe, Namibia, Eswatini, Lesotho, Zambia), Local international (flights only: within one other country) or International (anywhere else). It is worked out from where the Item takes place: the airports of a flight; otherwise the country in the Item's own address or location, or failing that the Stay it is in. A worked-out region follows later corrections to those; once the Consultant picks a region for an Item, it stays as picked.
_Avoid_: Zone, area, local

**Item total**:
What the Client pays for one Item, for everyone on the Trip: the supplier's price as shown (taxes included) plus the Transaction fee, the Markup and, if the Item is prepaid, the Pre-payment fee and, if paid with an international card, the Card surcharge. It is always in Rand, and it is the only price the Quote shows for an Item.
_Avoid_: Rate, price

**Issued**:
An Item is issued once the supplier has confirmed and ticketed it, a step after Booked (or together with it). A flight is issued with its ticket numbers. Only Items are issued; Versions are generated.
_Avoid_: Confirmed, ticketed (for the state), issued (for a Version)

**Booked**:
An Item is booked once a User other than an Accountant has reserved it with the supplier, at any time and whether or not it went on a Version or the Quote is finished. It is booked with the supplier's booking reference, the supplier's actual currency and amount, the rate to Rand (1 for Rand) and the date its Supplier invoice is expected. From then on its prices are fixed, later Versions show it at its Item total, it cannot be deleted, and anything that alters it is a Change. Booking an Item never changes the Trip status, and the other options offered beside it stay as they are.
_Avoid_: Confirmed, reserved

**Change**:
A dated event against a booked Item, such as a flight reissue, with its own charges: extra fare, extra taxes and supplier penalty in the supplier's currency at that day's rate, plus the Change fee and Markup in Rand. A Change never overwrites the Item or an earlier Change. A Cancellation is one kind of Change.
_Avoid_: Amendment, reissue (as a record), edit

**History**:
The record of every edit to a Client, Trip, Quote, Item or anything else staff keep here, from the moment it is entered, before booking as much as after: who did it, when, and what it was before and after. Each edit is one History entry. History is never edited or removed.
_Avoid_: Audit log, audit trail, activity, Change (that is an event against a booked Item)

**Supplier**:
Who the agency books an Item with and pays, and who invoices for it: XL Ticketing, Bedsonline, a lodge directly. Not the airline or hotel the Client uses. Named when the Item is booked, from one shared list that any User can add to and only an Administrator can correct.
_Avoid_: Vendor, provider, operator (for the one who invoices)

**Correction**:
An edit that fixes booking details typed wrong on a booked Item (reference, Supplier, currency, amount, rate, dates, ticket numbers). Nothing happened with the Supplier, so it is not a Change; History keeps what it was. Any User but an Accountant may make one until a Supplier invoice for the Item is Verified, only an Administrator after that, and only an Administrator corrects an Item total once booked.
_Avoid_: Change (that is a real event), amendment

**Supplier invoice**:
An invoice or credit note from a Supplier (often XL Ticketing), kept here as a PDF with its number, date, amount and currency, and linked to that Supplier's Items and Changes it charges for, all on one Trip, with the part of its amount that belongs to each. An Accountant checks it: Received, then Verified, or Query. It can be Verified only once all its amount is linked and no Item or Change it covers would be charged more than was booked, or in another currency; billing in parts is fine. A difference is never explained away: the booking is Corrected, a Change is added, or the invoice goes to Query with a reason. A credit note is the same record with negative amounts. A Supplier never has two with the same number. While the Trip is an Enquiry or Quoted, only the Client's Consultant and Administrators add them; once it is Booked, Travelled or Cancelled, any User can.
_Avoid_: Supplier document, XL invoice (XL is one supplier)

**Invoicing stage**:
How far an Item or Change has got from supplier to Client: Awaiting supplier invoice, Received, Verified, Invoiced, or No supplier invoice expected. Worked out from its Supplier invoices, its Client invoices and whether an Accountant has marked that no supplier invoice is expected; never set by hand, together with the Rand amount still to invoice. It is Invoiced once nothing is left to invoice, even while its Supplier invoice is still awaited; a Change with no supplier charges expects no Supplier invoice by itself; one whose Supplier invoice is under Query stays Received.
_Avoid_: Client invoicing status, invoice status

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
The act of freezing a Quote's Working content into its next Version and producing that Version's PDF. Any edit not yet saved is saved first; if one cannot be saved, nothing is generated. The freeze is kept even if the PDF fails; producing the PDF is then retried from the frozen copy, never from the Working content. A Version without its PDF cannot be sent. A Version cannot be generated while an Accommodation option is not placed in a Stay, or while an Item with a price has no Transaction fee.
_Avoid_: Save, publish, issue, commit

**Client document**:
A file kept against a Client that belongs to no one Traveller, such as a company's letter of authority. It is personal information under POPIA. ID and passport images are not Client documents: they go with their Traveller.
_Avoid_: Attachment, upload

**Client invoice**:
An invoice or credit note issued to a Client in Quicktrav, never created here. Its PDF is kept here, with its Quicktrav number and date, and linked to the Items and Changes it covers, all on one Trip, with the part of its amount that belongs to each; one Client invoice can cover several Items or part of one. A credit note is the same record with negative amounts. No two share a Quicktrav number. Who may add one follows the same rule as a Supplier invoice.
_Avoid_: Quicktrav invoice, sales invoice

**Card surcharge**:
A percentage (2.75% today) added to an Item paid with an international credit card, set in the Fee schedule and shown as its own line, never folded into the supplier's price.
_Avoid_: Card fee, credit card levy

**Online saving**:
How much less the Client pays than a comparable fare found online, worked out from an optional comparable price on a Flight option. Flagged when above a threshold Administrators set.
_Avoid_: Savings, discount

**Cancellation**:
A Change that cancels a booked Item, carrying the charges for it: the supplier penalty and the agency's fee (the Transaction fee if before issue, the Refund fee after), and the refund amount expected from the supplier. It opens a Refund when that amount is above zero, and the agency's fee then comes off what the Client gets back rather than being invoiced; with nothing to refund, the fee is invoiced like any Change. It is the Item's last Change; from then on the Item shows as Cancelled, which is never set by hand. Not the same as unbooking, which undoes an Item marked booked by mistake and is only possible while it has no Changes or invoices.
_Avoid_: Cancel (as a status), unbook (for a real cancellation)

**Refund**:
Money due back from a Supplier after a Cancellation: the amount expected, the Supplier's progress (Requested, then Approved or Declined, set by staff), what was received and what went back to the Client, possibly in several stages. What goes back to the Client is what the Supplier refunds less the agency's fee on the Cancellation. Received and paid back are worked out from Payments; a Refund closes by itself once both are complete, or once Declined. Paying the Client back before the Supplier refunds is allowed and flagged as out of pocket. The Client's credit note is a Client invoice.
_Avoid_: Refund in progress (as a Trip status), credit

**Commission**:
What a supplier owes the agency for an Item (tour operators, Bedsonline, Viator): the amount expected and how it is settled, deducted when the agency pays the supplier or claimed and paid later. What is still owed is worked out from Payments received against it.
_Avoid_: Markup, kickback, margin

**Payment**:
One actual movement of money: paid to a supplier, received from a Client, refund in, refund out, or commission in. It belongs to one Trip and moves money to or from one party. It has a date, amount, currency, rate and Rand amount, a Payment account and a reconciliation status (Unreconciled, Reconciled or Query, set by an Accountant). A Payment to or from a Supplier is linked to that Supplier's booked Items and Changes on the Trip; a Payment from or to the Client is linked to the Client invoices it settles, or to none yet while it is a deposit. Several Payments, including partial ones and reversals, can cover one Item or Client invoice.
_Avoid_: Transaction, charge

**Payment account**:
A card or account money moves through, named by a nickname and never holding card numbers. Either a Client's (every Client has EFT from the start; Administrators add its cards, such as "Ore and Metal Services card", and Cash where used) or the agency's own (such as "TTD card"), which Administrators keep. A Payment from or to a Client uses one of that Client's Payment accounts; a Payment to a Supplier uses an agency account or one of the Trip's Client's.
_Avoid_: Payment method, card (alone), Client's own card
