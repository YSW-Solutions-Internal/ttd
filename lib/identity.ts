// A Traveller's ID and Passports (GLOSSARY: Passport), as shown on screen.

export type IdentityValues = {
  id: string;
  kind: "id" | "passport";
  number: string;
  nationality: string | null;
  issued_on: string | null;
  expires_on: string | null;
  name_as_printed: string | null;
  image_path: string | null;
};

/** The ID first, then Passports issued last first. */
export function orderIdentities(docs: IdentityValues[]): IdentityValues[] {
  return [...docs].sort(
    (a, b) => Number(b.kind === "id") - Number(a.kind === "id") || (b.issued_on ?? "").localeCompare(a.issued_on ?? ""),
  );
}

/** Expired Passports are greyed; every other one stands out, so a dual national's two valid ones both do. */
export const isExpired = (d: IdentityValues, today: string) => d.kind === "passport" && !!d.expires_on && d.expires_on < today;
