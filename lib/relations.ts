// Supabase types an embedded relation as an array when it has no generated types.
// Our relations here are many-to-one, so take the single row either way.
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}
