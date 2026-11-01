// Supabase types an embedded relation as an array when it has no generated types.
// Our relations here are many-to-one, so take the single row either way.
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Every row of a query: Supabase cuts each answer at its row limit (1,000 by default), without saying so. */
export async function everyRow<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + 999);
    if (error) throw new Error(`Could not load: ${error.message}`);
    if (!data?.length) return rows;
    rows.push(...data);
  }
}
