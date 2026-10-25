// Run: node --test lib/codes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { cabinFor, fillFlightNames, placeCodes, placesFrom } from "./codes.ts";

const rows = [
  { iata: "JNB", name: "O.R. Tambo International Airport", city: "Johannesburg", city_code: "JNB", country_code: "ZA" },
  { iata: "LHR", name: "Heathrow Airport", city: "London", city_code: "LON", country_code: "GB" },
  { iata: "LGW", name: "Gatwick Airport", city: "London", city_code: "LON", country_code: "GB" },
];

test("an airport code gives city and airport; a city code gives only the city (Q73)", () => {
  const places = placesFrom(rows, placeCodes(["jnb", "LON", "LHR", "XXX", "", null, "TOOLONG"]));
  assert.deepEqual(places.get("JNB"), { city: "Johannesburg", airport: "O.R. Tambo International Airport", country: "ZA" });
  assert.deepEqual(places.get("LON"), { city: "London", airport: null, country: "GB" });
  assert.equal(places.get("LHR").airport, "Heathrow Airport");
  assert.equal(places.has("XXX"), false);
  assert.deepEqual(placeCodes(["jnb", "JNB", "A1B"]), ["JNB"]);
});

test("only empty names are filled; typed ones stay (Q74)", () => {
  const places = placesFrom(rows, ["JNB", "LHR"]);
  const f = fillFlightNames({ from_code: "JNB", from_city: null, from_airport: "", to_code: "LHR", to_city: "London (T5)", to_airport: null, booking_class: "J", cabin: null }, places);
  assert.deepEqual(
    [f.from_city, f.from_airport, f.to_city, f.to_airport, f.cabin],
    ["Johannesburg", "O.R. Tambo International Airport", "London (T5)", "Heathrow Airport", "Business"],
  );
  assert.equal(fillFlightNames({ booking_class: "Y", cabin: "Premium Economy" }, places).cabin, "Premium Economy");
});

test("booking class to cabin", () => {
  assert.deepEqual(["F", "j", "W", "Y", "", "YLOW", null].map(cabinFor), ["First", "Business", "Premium Economy", "Economy", null, null, null]);
});
