// Ported from template.html (Jinja). Rendered to static HTML, then printed to PDF by Chromium.
import { flightTotal, money, num, symFor, withFees } from "./money";
import type { Experience, QuoteJson } from "./types";

const CSS = `
  :root{
    --teal:#11A597; --teal-deep:#0B7A70; --gold:#F9A61A; --gold-soft:#FEF3DD;
    --ink:#141414; --muted:#6E6E6E; --line:#E3DFD9; --line-strong:#CFC9C0;
    --wash:#FAF8F5; --head:#F3EFEA; --paper:#FFFFFF;
  }
  *{margin:0;padding:0;box-sizing:border-box;}
  html{-webkit-text-size-adjust:100%;}
  body{font-family:'Inter',system-ui,-apple-system,sans-serif;color:var(--ink);
       background:#EFECE7;font-size:13px;line-height:1.5;}
  .page{max-width:900px;margin:32px auto;background:var(--paper);
        box-shadow:0 2px 24px rgba(20,10,5,.10);}
  .inner{padding:40px 46px 36px;}

  .masthead{display:flex;justify-content:space-between;align-items:flex-start;gap:32px;}
  .masthead img{width:230px;height:auto;display:block;}
  .doc-id{text-align:right;}
  .doc-type{font-size:22px;font-weight:800;font-style:italic;letter-spacing:.05em;
            text-transform:uppercase;color:var(--teal-deep);line-height:1;}
  .meta{margin-top:12px;font-size:12px;}
  .meta div{display:flex;justify-content:flex-end;gap:10px;padding:1.5px 0;}
  .meta dt{color:var(--muted);font-weight:500;}
  .meta dd{font-weight:600;min-width:130px;text-align:right;}
  .rule{height:3px;background:var(--teal);margin:22px 0 0;}

  .summary{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;
           border:1px solid var(--line);border-top:none;background:var(--wash);}
  .summary .cell{padding:14px 18px;border-left:1px solid var(--line);}
  .summary .cell:first-child{border-left:none;}
  .k{display:block;font-size:9.5px;font-weight:700;letter-spacing:.13em;
     text-transform:uppercase;color:var(--teal-deep);margin-bottom:3px;}
  .v{font-weight:600;font-size:14px;}
  .v small{display:block;font-weight:400;color:var(--muted);font-size:11.5px;margin-top:1px;}

  /* section headings — two levels */
  .section{margin-top:28px;}
  .h-major{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:800;
           font-style:italic;letter-spacing:.06em;text-transform:uppercase;color:var(--teal-deep);
           border-bottom:2px solid var(--teal-deep);padding-bottom:6px;margin-bottom:14px;}
  .h-major .tag{margin-left:auto;font-style:normal;font-weight:500;letter-spacing:0;
                text-transform:none;color:var(--muted);font-size:11.5px;}
  .eyebrow{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:800;
           font-style:italic;letter-spacing:.12em;text-transform:uppercase;
           color:var(--ink);margin:16px 0 8px;}
  .eyebrow::before{content:"";width:20px;height:4px;background:var(--ink);flex:none;}
  .eyebrow .tag{font-style:normal;font-weight:500;letter-spacing:0;text-transform:none;
                color:var(--muted);font-size:11px;margin-left:auto;}

  table{width:100%;border-collapse:collapse;font-size:12px;}
  th{text-align:left;font-size:9.5px;font-weight:700;letter-spacing:.06em;
     text-transform:uppercase;color:var(--muted);padding:6px 9px;
     background:var(--head);border-bottom:1px solid var(--line-strong);}
  td{padding:6px 9px;border-bottom:1px solid var(--line);vertical-align:top;}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  th.num{text-align:right;}
  .code{font-weight:700;white-space:nowrap;}
  a{color:var(--teal-deep);text-decoration:none;}

  /* summary tables (flight & accommodation & destination) */
  .sumtab td{padding:8px 11px;}
  .sumtab .lbl{font-weight:600;}
  .sumtab .lbl small{color:var(--muted);font-weight:400;}
  .sumtab .amt{font-weight:800;font-size:13px;}
  .sumtab tr:last-child td{border-bottom:2px solid var(--ink);}

  /* option block (flight option / hotel option) */
  .opt{border:1px solid var(--line-strong);margin-top:12px;break-inside:avoid;}
  .opt-head{background:var(--teal);color:#fff;display:flex;align-items:center;gap:11px;padding:8px 14px;}
  .opt-chip{background:var(--paper);color:var(--teal-deep);font-size:9.5px;font-weight:800;
            letter-spacing:.09em;text-transform:uppercase;padding:3px 8px;flex:none;}
  .opt-title{font-size:14px;font-weight:700;}
  .opt-title .stars{color:var(--gold);margin-left:6px;font-size:12px;}
  .opt-total{margin-left:auto;text-align:right;font-size:10px;font-weight:500;opacity:.92;}
  .opt-total strong{display:block;font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;opacity:1;}
  .opt-body{padding:12px 14px;}

  .subhead{font-size:9.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;
           color:var(--teal-deep);margin:10px 0 5px;}
  .subhead:first-child{margin-top:0;}
  table.flights td, table.finfo td{padding:5px 9px;}
  table.finfo{margin-bottom:2px;}
  .fare-row td{font-weight:700;border-top:1px solid var(--line-strong);}

  /* fare rules / seating / notes as label-value rows */
  .rules{margin-top:10px;border:1px solid var(--line);}
  .rules .rr{display:grid;grid-template-columns:120px 1fr;border-bottom:1px solid var(--line);}
  .rules .rr:last-child{border-bottom:none;}
  .rules .rk{background:var(--head);padding:6px 10px;font-size:9.5px;font-weight:800;
             letter-spacing:.06em;text-transform:uppercase;color:var(--ink);}
  .rules .rv{padding:6px 10px;font-size:11.5px;}

  /* hotel option: label/value grid */
  .hgrid{display:grid;grid-template-columns:130px 1fr;gap:0;font-size:12px;}
  .hgrid .hk{background:var(--head);padding:6px 10px;font-size:9.5px;font-weight:800;
             letter-spacing:.05em;text-transform:uppercase;color:var(--ink);
             border-bottom:1px solid var(--line);}
  .hgrid .hv{padding:6px 10px;border-bottom:1px solid var(--line);}
  .hgrid .hv:last-of-type, .hgrid .hk:last-of-type{border-bottom:none;}
  .pill{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.04em;
        padding:2px 7px;border-radius:2px;vertical-align:middle;}
  .pill-free{background:#E7F3E9;color:#1F6B33;}
  .pill-nonref{background:#FBEAEA;color:#9A2A2A;}

  .note-box{border:1px solid var(--line);padding:11px 15px;background:var(--wash);break-inside:avoid;}
  .note-box ul{padding-left:16px;} .note-box li{margin:3px 0;}
  .note-box p{margin-bottom:5px;}
  .note-box.empty{color:var(--muted);font-style:italic;}
  .pending{border-left:3px solid var(--teal-deep);}
  .info-head{background:var(--teal);color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em;
             text-transform:uppercase;padding:6px 12px;}
  .info-body{border:1px solid var(--line);border-top:none;padding:10px 14px;font-size:12px;background:var(--wash);}
  .terms{font-size:10.5px;color:var(--muted);columns:2;column-gap:28px;}
  .terms ul{padding-left:14px;} .terms li{margin:0 0 5px;break-inside:avoid;}

  .foot{margin-top:30px;border-top:3px solid var(--teal);padding-top:12px;display:flex;
        justify-content:space-between;align-items:flex-start;gap:24px;font-size:11px;color:var(--muted);}
  .foot .cta{background:var(--teal);color:#fff;text-decoration:none;font-weight:700;
             padding:9px 16px;font-size:12px;white-space:nowrap;}
  .consultant b{color:var(--ink);}

  @media print{
    body{background:#fff;} .page{box-shadow:none;margin:0;max-width:none;}
    .inner{padding:20px 26px;} .section{margin-top:20px;}
    .opt{break-inside:avoid;} .rules,.note-box,.info-body,.hgrid{break-inside:avoid;}
    .opt-head{break-inside:avoid;break-after:avoid;} tr{break-inside:avoid;}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
  @media (max-width:660px){
    .inner{padding:20px 15px;}
    .masthead{flex-direction:column;} .doc-id{text-align:left;}
    .meta div{justify-content:flex-start;} .meta dd{text-align:left;}
    .summary{grid-template-columns:1fr 1fr;}
    .summary .cell:nth-child(n+3){border-top:1px solid var(--line);}
    .summary .cell:nth-child(3){border-left:none;}
    .hgrid,.rules .rr{grid-template-columns:100px 1fr;}
    .terms{columns:1;} .opt-head{flex-wrap:wrap;} .opt-total{margin-left:0;text-align:left;}
    table{font-size:11px;}
  }
`;

const DASH = "—";
const NOT_SPECIFIED = "Not specified / required.";

const stars = (star: number | null | undefined) => "★".repeat(Math.max(0, Math.round(num(star))));

function experienceLine(e: Experience): string {
  if (typeof e === "string") return e;
  return [
    e.location,
    e.start_date || e.date,
    e.provider_name || e.provider || e.name,
    money(withFees(e, num(e.price)), symFor(e.currency)),
    e.description,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function QuoteTemplate({
  q,
  terms,
  logoDataUrl,
  fontCss,
}: {
  q: QuoteJson;
  terms: string[];
  logoDataUrl: string;
  fontCss: string;
}) {
  const flights = q.flight_options ?? [];
  const itinerary = q.itinerary_overview ?? [];

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`Quotation ${q.reference}: ${q.trip.title ?? ""}`}</title>
        <style dangerouslySetInnerHTML={{ __html: fontCss }} />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        <div className="page">
          <div className="inner">
            {/* HEADER */}
            <header className="masthead">
              <img src={logoDataUrl} alt="XL The Travel Department" />
              <div className="doc-id">
                <div className="doc-type">Quotation</div>
                <dl className="meta">
                  <div><dt>Quote ref</dt><dd>{q.reference}</dd></div>
                  <div><dt>Date</dt><dd>{q.date}</dd></div>
                  <div><dt>Valid until</dt><dd>{q.valid_until}</dd></div>
                  <div><dt>Consultant</dt><dd>{q.consultant.name}</dd></div>
                  {q.client.file_ref && <div><dt>Client file</dt><dd>{q.client.file_ref}</dd></div>}
                </dl>
              </div>
            </header>
            <div className="rule"></div>

            {/* 1. TRAVELLERS / TRIP */}
            <div className="summary">
              <div className="cell">
                <span className="k">Destination</span>
                <span className="v">
                  {(q.trip.destinations ?? []).join(" · ")}
                  {q.client.name && <small>Prepared for {q.client.name}</small>}
                </span>
              </div>
              <div className="cell">
                <span className="k">Travel dates</span>
                <span className="v">{q.trip.dates_display}<small>{q.trip.year}</small></span>
              </div>
              <div className="cell">
                <span className="k">Duration</span>
                <span className="v">{q.trip.nights} nights</span>
              </div>
              <div className="cell">
                <span className="k">Travellers</span>
                <span className="v">
                  {q.trip.travellers_main}
                  {q.trip.travellers_sub && <small>{q.trip.travellers_sub}</small>}
                </span>
              </div>
            </div>

            {itinerary.length > 0 && (
              <section className="section">
                <div className="eyebrow">
                  Itinerary overview
                  <span className="tag">
                    {itinerary.reduce((sum, leg) => sum + Math.trunc(num(leg.nights)), 0)} nights across{" "}
                    {itinerary.length} destinations
                  </span>
                </div>
                <table>
                  <thead><tr><th>Dates</th><th>Destination</th><th className="num">Nights</th><th>Highlights</th></tr></thead>
                  <tbody>
                    {itinerary.map((leg, i) => (
                      <tr key={i}>
                        <td>{leg.dates}</td><td className="code">{leg.destination}</td>
                        <td className="num">{num(leg.nights)}</td><td>{leg.highlight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* 2. FLIGHTS */}
            {flights.length > 0 && (
              <section className="section">
                <div className="h-major">Flights{q.flights_tag && <span className="tag">{q.flights_tag}</span>}</div>

                {/* 2.1 Flight summary */}
                <div className="eyebrow">Flight summary <span className="tag">Airlines and total per option</span></div>
                <table className="sumtab">
                  <thead><tr><th>Option</th><th>Airline(s)</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {flights.map((fo, i) => (
                      <tr key={i}>
                        <td className="lbl">{fo.label}{fo.summary_line && <> <small>· {fo.summary_line}</small></>}</td>
                        <td>{fo.airlines}</td>
                        <td className="num amt">{money(flightTotal(fo.pricing), symFor(fo.pricing.currency))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 2.2+ Each flight option: schedule and information per leg group, then fare rules / seating / notes */}
                {flights.map((fo, i) => {
                  const sym = symFor(fo.pricing.currency);
                  const total = money(flightTotal(fo.pricing), sym);
                  return (
                    <div className="opt" key={i}>
                      <div className="opt-head">
                        {flights.length > 1 && <span className="opt-chip">{fo.label}</span>}
                        <span className="opt-title">{fo.headline}</span>
                        <span className="opt-total">Total<strong>{total}</strong></span>
                      </div>
                      <div className="opt-body">
                        {(fo.groups ?? []).map((grp, g) => (
                          <div key={g}>
                            <div className="subhead">{grp.label}{grp.meta && ` · ${grp.meta}`}</div>

                            {/* Table 1: schedule */}
                            <table className="flights">
                              <thead><tr><th>Flight</th><th>Aircraft</th><th>From</th><th>To</th><th>Date</th>
                                <th className="num">Departs</th><th className="num">Arrives</th><th>Class</th></tr></thead>
                              <tbody>
                                {(grp.flights ?? []).map((f, n) => (
                                  <tr key={n}>
                                    <td className="code">{f.airline} {f.flight_no}</td>
                                    <td>{f.aircraft || DASH}</td>
                                    <td>{f.from_city}{f.from_code && ` (${f.from_code})`}</td>
                                    <td>{f.to_city}{f.to_code && ` (${f.to_code})`}</td>
                                    <td>{f.date}</td><td className="num">{f.departs}</td>
                                    <td className="num">{f.arrives}{f.next_day && " +1"}</td>
                                    <td>{f.cabin || "Economy"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {/* Table 2: flight information */}
                            <table className="finfo">
                              <thead><tr><th>Flight</th><th>Flying time</th><th className="num">Stops</th><th>Baggage</th></tr></thead>
                              <tbody>
                                {(grp.flights ?? []).map((f, n) => (
                                  <tr key={n}>
                                    <td className="code">{f.airline} {f.flight_no}</td>
                                    <td>{f.flying_time || DASH}</td>
                                    <td className="num">{f.stops ?? DASH}</td>
                                    <td>{f.baggage || DASH}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}

                        <div className="rules">
                          <div className="rr"><div className="rk">Fare rules</div><div className="rv">{fo.fare_rules || "As per airline conditions at time of ticketing."}</div></div>
                          <div className="rr"><div className="rk">Seating</div><div className="rv">{fo.seating || "Seat selection is not included; complimentary allocation is generally available at online check-in, subject to the airline."}</div></div>
                          <div className="rr"><div className="rk">Notes</div><div className="rv">{fo.notes || NOT_SPECIFIED}</div></div>
                          {!!fo.pricing.cancellation_fee && <div className="rr"><div className="rk">Flight Cancellation fee</div><div className="rv">{money(fo.pricing.cancellation_fee, sym)}</div></div>}
                          {!!fo.pricing.change_fee && <div className="rr"><div className="rk">Flight Change fee</div><div className="rv">{money(fo.pricing.change_fee, sym)}</div></div>}
                        </div>

                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "2px solid var(--ink)", display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 13 }}>
                          <span>Total for {fo.label}</span><span className="num">{total}</span>
                        </div>
                        {fo.pricing.note && <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{fo.pricing.note}</div>}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {/* 3. ACCOMMODATION, grouped by Stay */}
            {(q.accommodation ?? []).length > 0 && (
              <section className="section">
                <div className="h-major">Accommodation <span className="tag">Options grouped by destination</span></div>
                {q.accommodation!.map((dest, d) => {
                  const options = (dest.options ?? []).map((h) => ({ h, price: money(withFees(h, num(h.price)), symFor(h.currency)) }));
                  return (
                    <div key={d}>
                      <div className="eyebrow">{dest.name}{dest.dates && <span className="tag">{dest.dates} · {dest.nights} nights</span>}</div>

                      {/* Stay summary */}
                      <table className="sumtab" style={{ marginBottom: 6 }}>
                        <thead><tr><th>Option</th><th>Hotel</th><th>Room</th><th className="num">Rate total</th></tr></thead>
                        <tbody>
                          {options.map(({ h, price }, i) => (
                            <tr key={i}>
                              <td className="lbl">Option {i + 1}</td>
                              <td>{h.name}{!!h.star && <> <span style={{ color: "var(--gold)" }}>{stars(h.star)}</span></>}</td>
                              <td>{h.room}</td><td className="num amt">{price}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* each option as a detail table */}
                      {options.map(({ h, price }, i) => (
                        <div className="opt" key={i}>
                          <div className="opt-head">
                            <span className="opt-chip">Option {i + 1}</span>
                            <span className="opt-title">{h.name}{!!h.star && <span className="stars">{stars(h.star)}</span>}</span>
                            <span className="opt-total">Rate total<strong>{price}</strong></span>
                          </div>
                          <div className="opt-body">
                            <div className="hgrid">
                              <div className="hk">Hotel name</div><div className="hv">{h.name}</div>
                              <div className="hk">Location</div><div className="hv">{h.address || "Not specified"}{h.geo_url && <> · <a href={h.geo_url}>View map</a></>}</div>
                              <div className="hk">Website</div><div className="hv">{h.url ? <a href={h.url}>{h.url_label || h.url}</a> : "Not specified"}</div>
                              <div className="hk">Check in</div><div className="hv">{h.check_in}</div>
                              <div className="hk">Check out</div><div className="hv">{h.check_out}</div>
                              <div className="hk">Room type</div><div className="hv">{h.room}</div>
                              <div className="hk">Meals</div><div className="hv">{h.meals || "Room only"}</div>
                              <div className="hk">Cancellation</div>
                              <div className="hv">
                                {h.cxl_type === "free" ? <><span className="pill pill-free">FREE</span> {h.cxl}</>
                                  : h.cxl_type === "nonref" ? <span className="pill pill-nonref">NON-REF</span>
                                  : h.cxl || "Not specified"}
                              </div>
                              <div className="hk">Rate total</div><div className="hv"><b>{price}</b></div>
                              <div className="hk">Notes</div><div className="hv">{h.notes || h.desc || NOT_SPECIFIED}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </section>
            )}

            {/* 4. TRANSFERS */}
            {(q.transfers ?? []).length > 0 && (
              <section className="section">
                <div className="h-major">Transfers</div>
                <table>
                  <thead><tr><th>Date</th><th>Supplier</th><th>Route</th><th>Vehicle</th><th className="num">Rate</th></tr></thead>
                  <tbody>
                    {q.transfers!.map((t, i) => (
                      <tr key={i}>
                        <td>{t.date}</td><td>{t.supplier || DASH}</td><td>{t.route}</td>
                        <td>{t.vehicle || DASH}</td>
                        <td className="num">{"rate" in t ? money(withFees(t, num(t.rate)), symFor(t.currency)) : DASH}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* 5. RAIL */}
            {(q.rail ?? []).length > 0 && (
              <section className="section">
                <div className="h-major">Rail</div>
                <table>
                  <thead><tr><th>Date</th><th>Service</th><th>From</th><th>To</th><th className="num">Rate</th></tr></thead>
                  <tbody>
                    {q.rail!.map((r, i) => (
                      <tr key={i}>
                        <td>{r.date}</td><td>{r.service}</td><td>{r.from_city}</td><td>{r.to_city}</td>
                        <td className="num">{"rate" in r ? money(withFees(r, num(r.rate)), symFor(r.currency)) : DASH}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* 6. CAR RENTAL */}
            {(q.car_rentals ?? []).length > 0 && (
              <section className="section">
                <div className="h-major">Car rental</div>
                <table>
                  <thead><tr><th>Pickup</th><th>Drop-off</th><th>Vehicle</th><th>Supplier</th><th className="num">Rate</th></tr></thead>
                  <tbody>
                    {q.car_rentals!.map((c, i) => (
                      <tr key={i}>
                        <td>{c.pickup_datetime}{c.pickup_location && ` · ${c.pickup_location}`}</td>
                        <td>{c.dropoff_datetime}{c.dropoff_location && ` · ${c.dropoff_location}`}</td>
                        <td>{c.vehicle || DASH}</td>
                        <td>{c.company || DASH}</td>
                        <td className="num">{money(withFees(c, num(c.price)), symFor(c.currency))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* 7. RECOMMENDED EXPERIENCES */}
            {(q.experiences ?? []).length > 0 && (
              <section className="section">
                <div className="h-major">Recommended experiences <span className="tag">Optional · priced separately</span></div>
                <div className="note-box">
                  <ul>
                    {q.experiences!.map((e, i) =>
                      typeof e === "string" ? <li key={i}>{e}</li> : <li key={i}><b>{experienceLine(e)}</b></li>,
                    )}
                  </ul>
                </div>
              </section>
            )}

            {/* 8-10. VISA / HEALTH / INSURANCE */}
            <section className="section">
              <div className="h-major">Travel information</div>
              <div style={{ marginBottom: 10 }}><div className="info-head">Visa info</div>
                <div className="info-body">{q.visa_info || NOT_SPECIFIED}</div></div>
              <div style={{ marginBottom: 10 }}><div className="info-head">Health info</div>
                <div className="info-body">{q.health_info || NOT_SPECIFIED}</div></div>
              <div><div className="info-head">Travel insurance</div>
                <div className="info-body">{q.insurance_info || "Travel insurance is strongly recommended from the moment a deposit is paid. We can assist with a policy to meet your needs."}</div></div>
            </section>

            {(q.not_yet_included ?? []).length > 0 && (
              <section className="section">
                <div className="eyebrow">Not yet included <span className="tag">To follow in a revised quote</span></div>
                <div className="note-box pending"><ul>{q.not_yet_included!.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
              </section>
            )}

            {/* 11. IMPORTANT NOTES */}
            <section className="section">
              <div className="h-major">Important notes</div>
              <div className="terms"><ul>{terms.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
            </section>

            <footer className="foot">
              <div className="consultant">
                Prepared by <b>{q.consultant.name}</b> · The Travel Department<br />
                {q.consultant.email} · {q.consultant.address}<br />
                Questions or changes? Reply to this quote and we&apos;ll adjust it the same day.
              </div>
              <a className="cta" href={`mailto:${q.consultant.email ?? ""}?subject=${encodeURIComponent(`Booking request - Quote ${q.reference}`)}`}>
                Book this trip
              </a>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
