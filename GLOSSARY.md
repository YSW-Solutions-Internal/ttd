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
_Avoid_: Owner, assigned user, creator

**Client code**:
A Client's short identifier: first letter of the first name, first three letters of the last name, and a two-digit number (e.g. RWOL01). Set when the Client is added and never changes afterwards. It appears inside every Trip and Quote reference for that Client.
_Avoid_: Client number, client no, client ID

## Records

**Trip**:
One journey for one Client. Quotes are always made for a Trip, never directly for a Client.
_Avoid_: Booking, itinerary

**Quote**:
A priced proposal for a Trip. A Trip can have several Quotes.
_Avoid_: Estimate, proposal

**Client document**:
A file kept against a Client, such as an ID copy or passport copy. It is personal information under POPIA.
_Avoid_: Attachment, upload
