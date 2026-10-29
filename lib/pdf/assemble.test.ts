import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleQuote, day, problems, type AssembleInput } from "./assemble.ts";

const empty = { flight_options: [], flights: [], accommodation_options: [], transfers: [], rail_journeys: [], car_rentals: [], excursions: [] };

function input(items: Partial<AssembleInput["items"]> = {}): AssembleInput {
  return {
    today: "2026-10-26",
    reference: "TRIP-RWOL01-001",
    consultant: { name: "Dan K", email: "dan@example.co.za" },
    client: { name: "Ron Wolovitz", code: "RWOL01" },
    trip: { title: "Italy", starts_on: "2027-04-04", ends_on: "2027-04-12", nights: 8, adults: 2, children: 1, custom_notes: "One\n\n Two " },
    stays: [
      { id: "s1", destination: "Rome", starts_on: "2027-04-04", ends_on: "2027-04-08", nights: 4 },
      { id: "s2", destination: "Florence", starts_on: "2027-04-08", ends_on: "2027-04-12", nights: 4 },
    ],
    items: { ...empty, ...items },
    airlines: new Map([["EK", "Emirates"]]),
  };
}

test("day formats ISO dates and leaves other text alone", () => {
  assert.equal(day("2027-04-04"), "4 Apr");
  assert.equal(day("2026-10-26", true), "26 Oct 2026");
  assert.equal(day("Mon 4 Apr"), "Mon 4 Apr");
  assert.equal(day(null), "");
});

test("header: dates, validity, travellers, notes", () => {
  const { quote } = assembleQuote(input());
  assert.equal(quote.date, "26 Oct 2026");
  assert.equal(quote.valid_until, "2 Nov 2026");
  assert.equal(quote.trip.dates_display, "4 Apr – 12 Apr");
  assert.equal(quote.trip.year, "2027");
  assert.equal(quote.trip.travellers_main, "2 Adults");
  assert.equal(quote.trip.travellers_sub, "1 Child");
  assert.deepEqual(quote.trip.destinations, ["Rome", "Florence"]);
  assert.deepEqual(quote.custom_notes, ["One", "Two"]);
});

test("flight options: directions in order, confirmed airline names only", () => {
  const { quote, items } = assembleQuote(
    input({
      flight_options: [{ id: "o1", entity_id: "e1", price: 1000, transaction_fee: 950, label: null }],
      flights: [
        { flight_option_id: "o1", direction_no: 2, seq: 1, airline: "EK", flight_no: "98", date: "2027-04-12" },
        { flight_option_id: "o1", direction_no: 1, seq: 2, airline: "XQ", flight_no: "97" },
        { flight_option_id: "o1", direction_no: 1, seq: 1, airline: "EK", flight_no: "762", date: "2027-04-04" },
      ],
    }),
  );
  const fo = quote.flight_options![0];
  assert.equal(fo.label, "Option 1");
  assert.equal(fo.airlines, "Emirates, XQ");
  assert.deepEqual(fo.groups!.map((g) => g.label), ["Outbound", "Return"]);
  assert.deepEqual(fo.groups![0].flights!.map((f) => f.flight_no), ["762", "97"]);
  assert.equal(fo.groups![0].meta, "4 Apr");
  assert.deepEqual(items, [{ entity_id: "e1", kind: "flight", option_no: 1 }]);
});

test("accommodation is grouped by Stay and numbered within it", () => {
  const { quote, items } = assembleQuote(
    input({
      accommodation_options: [
        { entity_id: "h1", stay_id: "s2", hotel_name: "A" },
        { entity_id: "h2", stay_id: "s1", hotel_name: "B" },
        { entity_id: "h3", stay_id: "s2", hotel_name: "C" },
      ],
    }),
  );
  assert.deepEqual(quote.accommodation!.map((s) => [s.name, s.options!.map((o) => o.name)]), [
    ["Rome", ["B"]],
    ["Florence", ["A", "C"]],
  ]);
  assert.deepEqual(items.map((i) => [i.entity_id, i.option_no]), [["h2", 1], ["h1", 1], ["h3", 2]]);
});

test("problems: unplaced Accommodation and priced Items without a Transaction fee", () => {
  assert.deepEqual(
    problems({
      ...empty,
      accommodation_options: [{ hotel_name: "Artemide", stay_id: null, price: null }],
      transfers: [{ supplier: "Shuttle Co", price: 500, transaction_fee: null }, { price: null, transaction_fee: null }],
    }),
    ["Artemide is not placed in a Stay.", "Shuttle Co has a price but no Transaction fee."],
  );
});
