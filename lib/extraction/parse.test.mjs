// Run: node --test lib/extraction/parse.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { toExtractionResult, toNumber } from "./parse.ts";

test("toNumber accepts only plain digits with one decimal point", () => {
  assert.equal(toNumber("13111.80"), 13111.8);
  assert.equal(toNumber("0"), 0);
  for (const bad of ["", "13,111.80", "13.111.80", ".", "R100", "-5", "1 000"]) {
    assert.equal(toNumber(bad), null, bad);
  }
});

test("wire answer becomes stored items: '' to null, digit strings to numbers", () => {
  const price = (amount, text) => ({ amount, text });
  const r = toExtractionResult({
    source_type: "GALILEO_GDS",
    source_confidence: "HIGH",
    source_reason: "monospace",
    flight: [
      {
        selected: false,
        label: "",
        directions: [
          {
            label: "",
            fare_basis: "",
            price_shown: price("", ""),
            flights: [{ flight_no: "BA075", date: "--09-15", stops: "0", next_day: true }],
          },
        ],
        pricing: { currency: "ZAR", total_price: price("13111.80", "R 13 111,80"), vat: price("", ""), lines: [] },
      },
    ],
    hotel: [{ hotel_name: "A", star: "", nights: "3" }, { hotel_name: "B", star: "4", nights: "" }],
    car_rental: [],
    excursion: [],
  });

  assert.deepEqual(r.source, { type: "GALILEO_GDS", confidence: "HIGH", reason: "monospace" });
  assert.deepEqual(r.items.map((i) => i.kind), ["flight", "hotel", "hotel"]);
  const f = r.items[0].data;
  assert.equal(f.label, null);
  assert.deepEqual(f.pricing.total_price, { amount: 13111.8, text: "R 13 111,80" });
  assert.deepEqual(f.pricing.vat, { amount: null, text: null });
  assert.equal(f.directions[0].flights[0].stops, 0);
  assert.equal(f.directions[0].flights[0].next_day, true);
  assert.equal(f.directions[0].flights[0].date, "--09-15");
  assert.deepEqual([r.items[1].data.nights, r.items[2].data.star], [3, 4]);
  assert.equal(r.items[1].data.star, null);
  assert.notEqual(r.items[1].entity_id, r.items[2].entity_id);
});

test("no flight on the image means no source; a missing array is a loud failure", () => {
  const empty = { source_type: "NONE", source_confidence: "HIGH", source_reason: "", flight: [], hotel: [], car_rental: [], excursion: [] };
  assert.equal(toExtractionResult(empty).source, null);
  const { hotel, ...noHotel } = empty;
  assert.throws(() => toExtractionResult(noHotel), /"hotel"/);
});
