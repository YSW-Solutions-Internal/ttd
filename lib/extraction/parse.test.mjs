// Run: node --test lib/extraction/parse.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAnswer, toExtractionResult, toNumber } from "./parse.ts";

test("toNumber accepts only plain digits with one decimal point", () => {
  assert.equal(toNumber("13111.80"), 13111.8);
  assert.equal(toNumber("0"), 0);
  for (const bad of ["", "13,111.80", "13.111.80", ".", "R100", "-5", "1 000"]) {
    assert.equal(toNumber(bad), null, bad);
  }
});

test("wire answer becomes stored items: '' to null, digit strings to numbers", () => {
  const r = toExtractionResult({
    source_type: "GALILEO_GDS",
    flight: [
      {
        label: "",
        directions: [
          {
            label: "",
            fare_basis: "",
            flights: [{ flight_no: "BA075", date: "--09-15", stops: "0", next_day: true }],
          },
        ],
        total_price: "13111.80",
        lines: [],
      },
    ],
    hotel: [{ hotel_name: "A", star: "", nights: "3", rooms: "2" }, { hotel_name: "B", star: "4", nights: "", rooms: "" }],
    car_rental: [],
    excursion: [],
    transfer: [{ supplier: "X", from: "CPT", to: "Hotel", passengers: "4", price: "850.00" }],
    rail: [{ operator: "Rovos", class: "Deluxe", price: "" }],
  });

  assert.deepEqual(r.source, { type: "GALILEO_GDS" });
  assert.deepEqual(r.items.map((i) => i.kind), ["flight", "hotel", "hotel", "transfer", "rail"]);
  const f = r.items[0].data;
  assert.equal(f.label, null);
  assert.equal(f.total_price, 13111.8);
  assert.equal(f.directions[0].flights[0].stops, 0);
  assert.equal(f.directions[0].flights[0].next_day, true);
  assert.equal(f.directions[0].flights[0].date, "--09-15");
  assert.deepEqual([r.items[1].data.nights, r.items[2].data.star], [3, 4]);
  assert.equal(r.items[1].data.star, null);
  assert.deepEqual([r.items[1].data.rooms, r.items[2].data.rooms], [2, null]);
  assert.equal(r.items[3].data.passengers, 4);
  assert.equal(r.items[3].data.price, 850);
  assert.equal(r.items[4].data.price, null);
  assert.equal(r.items[4].data.class, "Deluxe");
  assert.notEqual(r.items[1].entity_id, r.items[2].entity_id);
});

test("no flight on the image means no source; a missing array is a loud failure", () => {
  const empty = { source_type: "NONE", flight: [], hotel: [], car_rental: [], excursion: [], transfer: [], rail: [] };
  assert.equal(toExtractionResult(empty).source, null);
  const { hotel, ...noHotel } = empty;
  assert.throws(() => toExtractionResult(noHotel), /"hotel"/);
});

test("the answer is read even inside a code fence, with numbers quoted or not", () => {
  const raw = `Here you go:
\`\`\`json
{"source_type":"NONE","flight":[],"hotel":[{"hotel_name":"A","price":1250.5,"nights":"3","star":4}],"car_rental":[],"excursion":[],"transfer":[],"rail":[]}
\`\`\``;
  const r = toExtractionResult(parseAnswer(raw));
  assert.deepEqual([r.items[0].data.price, r.items[0].data.nights, r.items[0].data.star], [1250.5, 3, 4]);
  assert.equal(toNumber(-5), null);
  assert.throws(() => parseAnswer("I could not read this image."), /no JSON object/);
  assert.throws(() => parseAnswer("{not json}"), /not valid JSON/);
});
