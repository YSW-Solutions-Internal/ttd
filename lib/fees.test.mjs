// Run: node --test lib/fees.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFees, autoRegion, cabinVariant, countryIn, feeRegion, fillYear, tenPercent } from "./fees.ts";

test("fee region from countries (Q27)", () => {
  assert.equal(feeRegion(["ZA", "ZA"], true), "domestic");
  assert.equal(feeRegion(["IT", "IT"], true), "local_international");
  assert.equal(feeRegion(["ZA", "NA", "ZA"], true), "neighbouring");
  assert.equal(feeRegion(["ZA", "SZ"], true), "neighbouring");
  assert.equal(feeRegion(["ZA", "AE", "GB"], true), "international");
  assert.equal(feeRegion(["ZA", null], true), null);
  assert.equal(feeRegion(["NA"], false), "neighbouring");
  assert.equal(feeRegion(["IT"], false), "international"); // local international is flights only
  assert.equal(feeRegion(["za"], false), "domestic");
});

test("premium if any cabin is business or first", () => {
  assert.equal(cabinVariant(["Economy", "Business"]), "premium");
  assert.equal(cabinVariant(["Y", " j "]), "premium");
  assert.equal(cabinVariant(["Y", "M", null]), "");
  assert.equal(cabinVariant(["Premium Economy"]), "");
});

test("year filled as the next occurrence on or after the Quote's creation day", () => {
  assert.equal(fillYear("--11-02", "2026-10-25"), "2026-11-02");
  assert.equal(fillYear("--10-25", "2026-10-25"), "2026-10-25");
  assert.equal(fillYear("--09-15", "2026-10-25"), "2027-09-15");
  assert.equal(fillYear("--12-28", "2026-10-25"), "2026-12-28");
  assert.equal(fillYear("--01-04", "2026-10-25"), "2027-01-04");
  assert.equal(fillYear("--02-29", "2026-10-25"), "2028-02-29");
  assert.equal(fillYear("--13-40", "2026-10-25"), "--13-40");
  assert.equal(fillYear("2026-05-01", "2026-10-25"), "2026-05-01");
  assert.equal(fillYear(null, "2026-10-25"), null);
});

test("car 10% only when it beats the Pre-payment fee", () => {
  assert.equal(tenPercent(9000, 556.6), 900);
  assert.equal(tenPercent(3000, 556.6), null);
  assert.equal(tenPercent(null, 556.6), null);
});

const rates = [
  { kind: "hotel", fee_region: "domestic", variant: "", transaction_fee: 230, change_fee: 0, refund_fee: 556.6, prepayment_fee: 556.6 },
  { kind: "hotel", fee_region: "international", variant: "", transaction_fee: 345, change_fee: 0, refund_fee: 556.6, prepayment_fee: 556.6 },
  { kind: "flight", fee_region: "international", variant: "", transaction_fee: 1690.5, change_fee: 1690.5, refund_fee: 948.75, prepayment_fee: 0 },
  { kind: "flight", fee_region: "international", variant: "premium", transaction_fee: 2323, change_fee: 1690.5, refund_fee: 948.75, prepayment_fee: 0 },
  { kind: "car_rental", fee_region: "domestic", variant: "", transaction_fee: 230, change_fee: 0, refund_fee: 586.5, prepayment_fee: 556.6 },
];
const none = { region: null, variant: "" };

test("fees follow Q61: typed fees stay until the region or variant changes", () => {
  const fresh = applyFees("hotel", { fee_region: null, variant: "" }, null, { region: "domestic", variant: "" }, rates);
  assert.equal(fresh.fee_region, "domestic");
  assert.equal(fresh.transaction_fee, 230);

  const prev = { ...fresh };
  const typed = applyFees("hotel", { ...fresh, transaction_fee: 200, room: "Suite" }, prev, none, rates);
  assert.equal(typed.transaction_fee, 200);

  const moved = applyFees("hotel", { ...typed, fee_region: "international" }, { ...typed }, none, rates);
  assert.equal(moved.transaction_fee, 345);

  const cleared = applyFees("hotel", { ...moved, refund_fee: null }, { ...moved }, none, rates);
  assert.equal(cleared.refund_fee, 556.6);
});

test("a region the Consultant set is never replaced by the worked-out one (Q66)", () => {
  const r = applyFees("hotel", { fee_region: "international", variant: "" }, null, { region: "domestic", variant: "" }, rates);
  assert.equal(r.fee_region, "international");
  assert.equal(r.transaction_fee, 345);
});

test("international business flight uses the premium row; no region means no fees", () => {
  const f = applyFees("flight", { fee_region: null }, null, { region: "international", variant: "premium" }, rates);
  assert.deepEqual([f.variant, f.transaction_fee, f.change_fee], ["premium", 2323, 1690.5]);
  const unknown = applyFees("flight", { fee_region: null }, null, none, rates);
  assert.equal(unknown.transaction_fee, null);
});

test("prepaid car with the 10% tick gets 10% of its price; unticking resets it", () => {
  const base = { fee_region: "domestic", variant: "", price: 9000, prepaid: true, ten_percent_fee: true };
  const ticked = applyFees("car_rental", { ...base }, null, none, rates);
  assert.equal(ticked.prepayment_fee, 900);
  const unticked = applyFees("car_rental", { ...ticked, ten_percent_fee: false }, { ...ticked }, none, rates);
  assert.equal(unticked.prepayment_fee, 556.6);
});

test("auto region: airports for flights, the covering Stay for the rest", () => {
  const airports = new Map([["JNB", "ZA"], ["CPT", "ZA"], ["DXB", "AE"]]);
  const stays = [
    { id: "s1", starts_on: "2026-11-02", ends_on: "2026-11-05", country_code: "ZA" },
    { id: "s2", starts_on: "2026-11-05", ends_on: "2026-11-09", country_code: "NA" },
  ];
  assert.deepEqual(
    autoRegion("flight", {}, [{ from_code: "jnb", to_code: "DXB", cabin: "C" }], stays, airports),
    { region: "international", variant: "premium" },
  );
  assert.equal(autoRegion("flight", {}, [{ from_code: "JNB", to_code: "XXX" }], stays, airports).region, null);
  assert.equal(autoRegion("transfer", { date: "2026-11-07" }, [], stays, airports).region, "neighbouring");
  assert.equal(autoRegion("hotel", { check_in_date: "2026-11-03", stay_id: "s2" }, [], stays, airports).region, "neighbouring");
  assert.equal(autoRegion("hotel", { check_in_date: "2026-12-01" }, [], stays, airports).region, null);
});

test("country from the end of an address or place name", () => {
  assert.equal(countryIn("2 rue Toussaint Féron, 13th arr., 75013 Paris, France"), "FR");
  assert.equal(countryIn("Maun, Botswana"), "BW");
  assert.equal(countryIn("Mbabane, Swaziland"), "SZ");
  assert.equal(countryIn("Sandton, Johannesburg, South Africa 2196"), "ZA");
  assert.equal(countryIn("Lagos, Nigeria"), "NG"); // not Niger
  assert.equal(countryIn("Malabo, Equatorial Guinea"), "GQ"); // not Guinea
  assert.equal(countryIn("Chobe National Park"), null);
  assert.equal(countryIn(null), null);
});

test("auto region: the Item's own address beats its Stay", () => {
  const stays = [{ id: "s1", starts_on: "2026-09-05", ends_on: "2026-09-08", country_code: "ZA" }];
  const paris = { address: "2 rue Toussaint Féron, 75013 Paris, France", check_in_date: "2026-09-05" };
  assert.equal(autoRegion("hotel", paris, [], stays, new Map()).region, "international");
  assert.equal(autoRegion("excursion", { location: "Victoria Falls, Zimbabwe" }, [], [], new Map()).region, "neighbouring");
  assert.equal(autoRegion("hotel", { address: "Somewhere", check_in_date: "2026-09-06" }, [], stays, new Map()).region, "domestic");
});

test("a worked-out region follows later edits; a picked one stays", () => {
  const auto = applyFees("hotel", { fee_region: "domestic", fee_region_auto: true }, null, { region: "international", variant: "" }, rates);
  assert.deepEqual([auto.fee_region, auto.fee_region_auto, auto.transaction_fee], ["international", true, 345]);
  const picked = applyFees("hotel", { fee_region: "domestic", fee_region_auto: false }, null, { region: "international", variant: "" }, rates);
  assert.deepEqual([picked.fee_region, picked.fee_region_auto], ["domestic", false]);
});
