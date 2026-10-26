# PDFs are rendered by headless Chromium in the app, from the frozen Version

A Version's PDF is made by rendering the quote template to HTML and printing it with headless Chromium (`puppeteer-core` with `@sparticuz/chromium`) inside the app's own Vercel function. Generate version first saves the Version with its frozen quote JSON, then renders, uploads the PDF and records its path. If rendering or the upload fails, the Version stays, keeps its number, and shows "PDF failed" with a Retry. The retry renders the same frozen JSON, never the Working content. Once a Version has its PDF, that PDF is never rendered again; a different PDF means a new Version.

## Considered Options

- **`@react-pdf/renderer`**: no browser to ship, but the template is HTML and CSS (grid, print rules, page breaks) and would have to be rebuilt in its own layout system. It would no longer match the agreed design.
- **Hosted HTML-to-PDF API** (PDFShift, DocRaptor, Browserless): nothing to install, but it costs money per PDF and sends Client names, trips and prices to a third party, which raises a POPIA question.
- **Keep the separate Vercel render function from the make.com setup**: proven, but it's a second deployment to secure and keep alive, it's in Python, and every render sends Client data across a network hop. We copy its setup instead.
- **All or nothing on failure** (no Version unless the PDF succeeds): no Version without a PDF ever exists, but a retry would re-assemble from the Working content, which may have been edited in the meantime, so the retried PDF might not match what was generated.

## Consequences

- A Version can exist without a PDF. It cannot be sent until its PDF exists. Version numbers can be "used up" by a Version whose PDF failed.
- The final-version lock allows `pdf_path` to go from empty to set exactly once. Every other field is locked when the Version is created; there is no draft status.
- The Chromium binary has to fit within Vercel's function size limit, and the render runs inside the request until the background job runner exists.
- The template is ported from Jinja to a React component rendered with `react-dom/server`, so text from suppliers is escaped. The fonts are bundled so no PDF depends on Google Fonts being reachable.
