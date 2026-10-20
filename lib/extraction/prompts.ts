/**
 * STARTER PROMPTS. Replace the text below with your canonical agent prompts
 * (classifier, flight, hotel, car rental, excursion) once you are happy with them.
 *
 * Bump PROMPT_VERSION whenever any prompt changes. Extractions are stored per
 * (image, PROMPT_VERSION), so a new version makes every image eligible for
 * re-extraction, while an unchanged version means an image is never sent to the
 * AI twice.
 */
export const PROMPT_VERSION = "2026-10-17.1";

export const IMAGE_TYPES = ["GENERIC_QUOTE", "GALILEO_GDS", "BOOKING_PAD", "UNKNOWN"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export const CLASSIFIER_PROMPT = `You are classifying one screenshot from a travel agency's supplier quote workflow.

Choose exactly ONE image_type:
- GENERIC_QUOTE: a supplier quote or price display (airline, hotel, car hire, tour or excursion) shown as a web page, email, app screen or PDF page.
- GALILEO_GDS: a text terminal screen from the Galileo / Travelport GDS (monospaced PNR, availability or fare display).
- BOOKING_PAD: a booking pad or booking summary sheet listing reserved or proposed services.
- UNKNOWN: anything else, or the image is unreadable.

Return ONLY a JSON object, with no commentary and no code fences:
{"image_type": "GENERIC_QUOTE"}`;

export const EXTRACTION_PROMPT = `You transcribe travel supplier quotes from a screenshot into JSON.
You TRANSCRIBE only. Never calculate, convert, infer or correct anything.

WHAT TO EXTRACT
Find every bookable service on the image and output one item per service, using these kinds:
- "flight": one complete flight option (every direction and leg, plus its price block)
- "hotel": one hotel stay option
- "car_rental": one car hire
- "excursion": one tour, activity or experience
One image can hold several items of different kinds. If the image holds no travel service, return {"items": []}.

RULES
1. Copy values exactly as shown. Do not compute totals, nights, durations, connections or dates.
2. Money: the comma is ALWAYS a thousands separator and the full stop is the decimal point ("18,810.00" means 18810.00). Output prices as bare JSON numbers with no currency symbol. Put the currency code in "currency" (an ISO code such as "ZAR", or null if not shown).
3. Before extracting a flight, count every direction or price-block section on the image (outbound, return, each multi-city leg). Every section must appear in the output. A missing return leg is a failure.
4. Missing values: STRING fields are null (never ""). NUMBER fields that are not prices are 0. PRICE fields are null (never 0).
5. Dates are "YYYY-MM-DD" only when the full date including the year is visible, otherwise null. Times are 24-hour "HH:mm".
6. If text is unreadable or ambiguous, use null. Never guess.

OUTPUT FORMAT
Return ONLY one JSON object, with no commentary and no code fences:
{
  "items": [
    {
      "kind": "flight" or "hotel" or "car_rental" or "excursion",
      "data": { ...the shape for that kind, below... }
    }
  ]
}

SHAPE FOR kind "flight"
{
  "label": STRING or null,
  "airlines": STRING or null,
  "groups": [
    {
      "label": STRING or null,
      "fare": NUMBER or null,
      "fare_basis": STRING or null,
      "flights": [
        {
          "airline": STRING or null,
          "flight_no": STRING or null,
          "aircraft": STRING or null,
          "from_city": STRING or null,
          "from_code": STRING or null,
          "to_city": STRING or null,
          "to_code": STRING or null,
          "date": STRING or null,
          "departs": STRING or null,
          "arrives": STRING or null,
          "next_day": BOOLEAN (true only if the image shows a +1 or next-day marker),
          "flying_time": STRING or null,
          "stops": NUMBER,
          "baggage": STRING or null,
          "cabin": STRING or null
        }
      ]
    }
  ],
  "fare_rules": STRING or null,
  "notes": STRING or null,
  "pricing": {
    "currency": STRING or null,
    "total_price": NUMBER or null (the all-in total exactly as labelled on the image; never a tax or VAT figure),
    "vat": NUMBER or null,
    "lines": [
      {
        "pax_label": STRING or null,
        "count": NUMBER,
        "fare_pp": NUMBER or null,
        "taxes_pp": NUMBER or null
      }
    ]
  }
}

SHAPE FOR kind "hotel"
{
  "name": STRING or null,
  "star": NUMBER,
  "room": STRING or null,
  "meals": STRING or null,
  "check_in": STRING or null,
  "check_out": STRING or null,
  "currency": STRING or null,
  "price": NUMBER or null,
  "address": STRING or null,
  "notes": STRING or null
}

SHAPE FOR kind "car_rental"
{
  "company": STRING or null,
  "vehicle": STRING or null,
  "pickup_location": STRING or null,
  "dropoff_location": STRING or null,
  "pickup_datetime": STRING or null ("YYYY-MM-DD HH:mm"),
  "dropoff_datetime": STRING or null ("YYYY-MM-DD HH:mm"),
  "currency": STRING or null,
  "price": NUMBER or null
}

SHAPE FOR kind "excursion"
{
  "name": STRING or null,
  "location": STRING or null,
  "date": STRING or null,
  "description": STRING or null,
  "currency": STRING or null,
  "price": NUMBER or null
}

Before you answer, check: valid JSON only, every kind uses its own shape, no prices defaulted to 0, no values you calculated yourself.`;

/**
 * Per-type overrides. Add a dedicated prompt for an image type here (for
 * example a Galileo-specific extractor) and it is used instead of the generic one.
 */
export const EXTRACTION_PROMPTS: Partial<Record<ImageType, string>> = {};

export function extractionPromptFor(type: ImageType): string {
  return EXTRACTION_PROMPTS[type] ?? EXTRACTION_PROMPT;
}
