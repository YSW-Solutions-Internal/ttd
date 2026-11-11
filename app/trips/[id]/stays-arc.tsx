type ArcStay = { id: string; name: string; starts_on: string | null; ends_on: string | null };

const day = (d: string) => new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });

// The arc is y = 100 − 280·t(1−t) in a 1000×120 box (the path below), so each Stay's dot sits on the curve.
const arcY = (t: number) => 100 - 280 * t * (1 - t);

/**
 * The Trip's Stays along a teal flight path, after the arc in the TTD logo.
 * Seven or more Stays keep their spacing and scroll sideways rather than squeeze.
 */
export function StaysArc({ stays }: { stays: ArcStay[] }) {
  if (stays.length === 0) {
    return (
      <p className="mt-4 mb-2 text-muted">
        No Stays yet. <a href="#stays">Add the first Stay</a> to draw the Trip&rsquo;s route.
      </p>
    );
  }

  return (
    <div className="-mx-1 mt-2 overflow-x-auto px-1">
      <ol aria-label="Stays" className="relative h-[170px]" style={{ minWidth: stays.length * 150 }}>
        <svg viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-x-0 top-0 h-[120px] w-full">
          <path d="M0 100 Q500 -40 1000 100" fill="none" stroke="var(--color-teal)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        <span aria-hidden="true" className="absolute top-[88px] -left-1 -rotate-[18deg] text-lg leading-none text-ink">
          ✈
        </span>
        {stays.map((s, i) => {
          const t = (i + 1) / (stays.length + 1);
          return (
            <li key={s.id} className="absolute w-[140px] -translate-x-1/2 text-center" style={{ left: `${t * 100}%`, top: arcY(t) - 6 }}>
              <span aria-hidden="true" className="mx-auto block size-3 rounded-full border-2 border-teal bg-white" />
              <span className="mt-1.5 block font-display text-lg leading-tight">{s.name}</span>
              <span className="block text-xs text-muted tabular-nums">
                {s.starts_on ? `${day(s.starts_on)} – ${s.ends_on ? day(s.ends_on) : "?"}` : "No dates yet"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
