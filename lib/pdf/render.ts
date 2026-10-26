// Ported from render_lib.py and the make.com-era render-pdf.js: quote JSON -> HTML -> PDF.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { QuoteTemplate } from "./quote-template";
import type { QuoteJson } from "./types";

const DIR = path.join(process.cwd(), "lib", "pdf");

const STANDARD_TERMS: Record<string, string[]> = {
  standard_za_international: [
    "This is a quotation only. No reservations have been made and all services are subject to availability at the time of booking.",
    "Prices are calculated on discounted airfares with limited availability; the actual fare is confirmed at the time of booking, dependent on the airline and class available.",
    "Fares and airport taxes are subject to change without prior notice due to currency fluctuations or airfare increases, until full payment has been made and documentation issued.",
    "Prices are based on the rate of exchange on the day of quotation and remain subject to change until full payment is received.",
    "Passports must be valid for at least 6 months after your intended return to South Africa, with at least 3 blank pages.",
    "Children under 18 must travel with an unabridged birth certificate together with a valid passport.",
    "Please ensure that traveller names and surnames match your ID / passport exactly; failure to do so could cause inconvenience or denied boarding.",
    "Professional fees apply to all transactions and are not refundable in the case of cancellation.",
    "We will never notify you of a change to our bank details by email. If you receive such an email, do not act on it and contact us immediately.",
    "E&OE: errors and omissions excepted.",
  ],
};

const REQUIRED = ["reference", "date", "valid_until", "consultant", "client", "trip"] as const;

// Embedded as data URLs: Chromium won't load file:// fonts into a page set with setContent.
function fontCss(): string {
  const faces: string[] = [];
  for (const weight of [400, 500, 600, 700, 800]) {
    for (const style of ["normal", "italic"]) {
      const b64 = readFileSync(path.join(DIR, "fonts", `inter-latin-${weight}-${style}.woff2`)).toString("base64");
      faces.push(
        `@font-face{font-family:'Inter';font-style:${style};font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');}`,
      );
    }
  }
  return faces.join("\n");
}

/** The quote as a standalone HTML page. Throws if a field the header needs is missing. */
export async function renderQuoteHtml(q: QuoteJson): Promise<string> {
  for (const f of REQUIRED) {
    if (q[f] === undefined || q[f] === null) throw new Error(`Missing mandatory field: ${f}`);
  }
  const terms = [...(STANDARD_TERMS[q.terms_profile ?? "standard_za_international"] ?? []), ...(q.custom_notes ?? [])];
  const logoDataUrl = `data:image/png;base64,${readFileSync(path.join(DIR, "logo.png")).toString("base64")}`;

  // Imported here: Next refuses a static react-dom/server import in server code.
  const { renderToStaticMarkup } = await import("react-dom/server");
  return "<!DOCTYPE html>" + renderToStaticMarkup(createElement(QuoteTemplate, { q, terms, logoDataUrl, fontCss: fontCss() }));
}

/** The quote as an A4 PDF, with the same page settings as the make.com-era renderer. */
export async function renderQuotePdf(q: QuoteJson): Promise<Uint8Array> {
  const html = await renderQuoteHtml(q);
  const puppeteer = (await import("puppeteer-core")).default;

  // Locally there's no Linux Chromium: point CHROME_PATH at Chrome or chrome-headless-shell 138.
  const local = process.env.CHROME_PATH;
  const chromium = local ? null : (await import("@sparticuz/chromium")).default;
  const browser = await puppeteer.launch(
    chromium
      ? { args: chromium.args, executablePath: await chromium.executablePath(), headless: true }
      : { executablePath: local, headless: true },
  );
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "14mm", left: "10mm", right: "10mm" },
    });
  } finally {
    await browser.close();
  }
}
