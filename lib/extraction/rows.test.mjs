// Run: node --test lib/extraction/rows.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { toExtractionResult } from "./parse.ts";
import { priceRows, toItemRows } from "./rows.ts";

const empty = { source_type: "NONE", flight: [], hotel: [], car_rental: [], excursion: [], transfer: [], rail: [] };

test("a flight option becomes one option row and one row per flight, in order", () => {
  const { items } = toExtractionResult({
    ...empty,
    flight: [
      {
        label: "Option 1",
        directions: [
          { label: "Outbound", fare_basis: "YLOW", flights: [{ flight_no: "EK762" }, { flight_no: "EK001" }] },
          { label: "Return", fare_basis: "", flights: [{ flight_no: "EK004", next_day: true, stops: "0" }] },
        ],
        fare_rules: "", seating: "", notes: "",
        total_price: "18400.00", lines: [],
      },
    ],
  });
  const rows = toItemRows("q1", "img1", items, "2026-10-25");
  const [opt] = rows.flight_options;
  assert.equal(opt.price, 18400);
  assert.equal(opt.price_note, null);
  assert.equal(opt.entity_id, items[0].entity_id);
  assert.deepEqual(
    rows.flights.map((f) => [f.flight_option_id === opt.id, f.direction_no, f.seq, f.flight_no, f.fare_basis]),
    [[true, 1, 1, "EK762", "YLOW"], [true, 1, 2, "EK001", "YLOW"], [true, 2, 1, "EK004", null]],
  );
  assert.equal(rows.flights[2].next_day, true);
  assert.equal(rows.flights[0].next_day, false);
});

test("no total on the image: worked out from complete per-passenger lines, and flagged", () => {
  const flight = (lines) => ({
    label: "", directions: [], fare_rules: "", seating: "", notes: "",
    total_price: "", lines,
  });
  const line = (count, fare, taxes) => ({ pax_label: "", count, fare_pp: fare, taxes_pp: taxes });
  const { items } = toExtractionResult({
    ...empty,
    flight: [flight([line("2", "5000.00", "1200.50"), line("1", "3000.00", "")]), flight([line("2", "", "100.00")])],
  });
  const [worked, incomplete] = toItemRows("q1", "img1", items, "2026-10-25").flight_options;
  assert.equal(worked.price, 15401);
  assert.match(worked.price_note, /per-passenger/);
  assert.equal(incomplete.price, null);
  assert.equal(incomplete.price_note, null);
});

test("every row of a table has the same keys (store_extraction takes them from the first)", () => {
  const { items } = toExtractionResult({
    ...empty,
    hotel: [{ hotel_name: "A", rooms: "2", price: "100.00" }, { hotel_name: "B" }],
    transfer: [{ from: "CPT", to: "Hotel", passengers: "4" }],
    rail: [{ class: "Deluxe" }],
  });
  const rows = toItemRows("q1", "img1", items, "2026-10-25");
  for (const list of Object.values(rows)) {
    for (const r of list) assert.deepEqual(Object.keys(r), Object.keys(list[0]));
  }
  assert.deepEqual(rows.accommodation_options.map((r) => r.rooms), [2, 1]);
  assert.deepEqual([rows.transfers[0].from_place, rows.transfers[0].to_place, rows.transfers[0].passengers], ["CPT", "Hotel", 4]);
  assert.equal(rows.rail_journeys[0].travel_class, "Deluxe");
  assert.equal(rows.accommodation_options[0].quote_id, "q1");
  assert.equal(rows.accommodation_options[1].image_id, "img1");
});

test("a freshly read image gets its regions and fees", () => {
  const { items } = toExtractionResult({
    ...empty,
    flight: [{ label: "", fare_rules: "", seating: "", notes: "", directions: [{ label: "", fare_basis: "", flights: [{ from_code: "JNB", to_code: "CPT", cabin: "Y" }] }], total_price: "", lines: [] }],
    hotel: [{ check_in_date: "--11-03" }],
  });
  const stays = [{ id: "s1", starts_on: "2026-11-02", ends_on: "2026-11-05", country_code: "ZA" }];
  const rates = [
    { kind: "flight", fee_region: "domestic", variant: "", transaction_fee: 437, change_fee: 437, refund_fee: 538.2, prepayment_fee: 0 },
    { kind: "hotel", fee_region: "domestic", variant: "", transaction_fee: 230, change_fee: 0, refund_fee: 556.6, prepayment_fee: 556.6 },
  ];
  const rows = priceRows(toItemRows("q1", "img1", items, "2026-10-25"), stays, rates, new Map([["JNB", "ZA"], ["CPT", "ZA"]]));
  assert.deepEqual([rows.flight_options[0].fee_region, rows.flight_options[0].transaction_fee], ["domestic", 437]);
  assert.deepEqual([rows.accommodation_options[0].fee_region, rows.accommodation_options[0].refund_fee], ["domestic", 556.6]);
});

test("dates printed without a year get one", () => {
  const { items } = toExtractionResult({
    ...empty,
    hotel: [{ check_in_date: "--09-15", check_out_date: "2027-09-18", cxl: "Free until 1 Sep" }],
    transfer: [{ date: "--11-02" }],
  });
  const rows = toItemRows("q1", "img1", items, "2026-10-25");
  assert.deepEqual(
    [rows.accommodation_options[0].check_in_date, rows.accommodation_options[0].check_out_date, rows.accommodation_options[0].cxl],
    ["2027-09-15", "2027-09-18", "Free until 1 Sep"],
  );
  assert.equal(rows.transfers[0].date, "2026-11-02");
});
