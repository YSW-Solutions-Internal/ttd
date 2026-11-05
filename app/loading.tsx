// Shown at once on every in-app link, while the server builds the next page.
export default function Loading() {
  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <p className="text-muted" role="status">Loading…</p>
    </main>
  );
}
