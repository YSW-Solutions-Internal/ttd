import test from "node:test";
import assert from "node:assert/strict";
import { summariseFlights } from "./flight-summary.ts";

const leg = (o: Record<string, unknown>) => ({ direction_no: 1, seq: 1, next_day: false, ...o });

test("a return trip: destination, dates, nights and airlines", () => {
  const s = summariseFlights([
    leg({ direction_no: 2, airline: "BA", to_code: "JNB", date: "2026-03-20" }),
    leg({ airline: "SA", from_code: "JNB", to_code: "CPT", to_city: "Cape Town", date: "2026-03-12" }),
    leg({ seq: 2, airline: "BA", to_city: "Lisbon", date: "2026-03-13" }),
  ]);
  assert.equal(s.destination, "Lisbon");
  assert.equal(s.from, "2026-03-12");
  assert.equal(s.to, "2026-03-20");
  assert.equal(s.nights, 7);
  assert.deepEqual(s.airlines, ["SA", "BA"]);
});

test("a next-day arrival moves the first night", () => {
  const s = summariseFlights([leg({ to_code: "LHR", date: "2026-03-12", next_day: true }), leg({ direction_no: 2, date: "2026-03-20" })]);
  assert.equal(s.nights, 7);
});

test("one-way has no nights and no end date", () => {
  const s = summariseFlights([leg({ to_code: "CPT", date: "2026-03-12" })]);
  assert.equal(s.destination, "CPT");
  assert.equal(s.nights, null);
  assert.equal(s.to, null);
});

test("missing or odd dates and no flights give nulls, not NaN", () => {
  assert.deepEqual(summariseFlights([]), { destination: null, from: null, to: null, nights: null, airlines: [] });
  const s = summariseFlights([leg({ date: "12 Mar", to_code: "CPT" }), leg({ direction_no: 2, date: "" })]);
  assert.equal(s.from, null);
  assert.equal(s.nights, null);
});

test("a return dated before the arrival gives no nights", () => {
  const s = summariseFlights([leg({ date: "2026-03-20" }), leg({ direction_no: 2, date: "2026-03-12" })]);
  assert.equal(s.nights, null);
});
