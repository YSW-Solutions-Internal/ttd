// Where invite and reset emails land. Nothing happens until the button is pressed:
// mail scanners open links but do not submit forms (app/auth/confirm/route.ts).
export default async function ContinuePage({ searchParams }: { searchParams: Promise<{ type?: string; token_hash?: string }> }) {
  const { type, token_hash } = await searchParams;
  const invite = type === "invite";

  return (
    <main className="mx-auto max-w-[380px]">
      <h1>{invite ? "Welcome" : "Reset your password"}</h1>
      <p className="mb-4 text-muted">{invite ? "Continue to choose your password and sign in." : "Continue to choose a new password."}</p>
      <form method="post" action="/auth/confirm" className="rounded-md border border-line bg-white p-5">
        <input type="hidden" name="type" value={type ?? ""} />
        <input type="hidden" name="token_hash" value={token_hash ?? ""} />
        <button type="submit" className="w-full">
          Continue
        </button>
      </form>
    </main>
  );
}
