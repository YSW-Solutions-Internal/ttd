# Bookings and accounts are built in this app, not on Microsoft 365

Lisa's booking and accounts brief (October 2026) assumes Microsoft 365: SharePoint lists, Power Automate, Microsoft 365 identities, Outlook attachments dragged into a OneDrive shortcut. Her SharePoint pilot holds only test data. We build the brief's requirements into this app instead (Supabase, Vercel, our own invitation-only accounts), so a Trip goes from Quote to booked Items to supplier and Client invoices in one system. Supplier PDFs are dragged from Outlook straight into the browser.

## Considered Options

- **Finish the SharePoint pilot**: no new platform for staff, but it lives in the Assore tenant TTD expects to leave around July 2027. Its flows were failing, its permissions were never set up, and the quoting half would stay in a second system, which is where charges get lost.
- **Move this app onto Microsoft 365** (Power Apps, Dataverse): one Microsoft sign-in, but it means rebuilding extraction, PDFs and access rules on a platform tied to the tenant TTD is leaving.

## Consequences

- Signing in with a Microsoft account can be added later as an extra login method; nothing depends on it.
- The brief's "who did it" (Microsoft 365 identity, initials) comes from our own Users.
