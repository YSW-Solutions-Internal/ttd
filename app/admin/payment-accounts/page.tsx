import { requireAdminPage } from "@/lib/auth";
import { AccountList } from "./account-list";

export const dynamic = "force-dynamic";

export default async function PaymentAccountsPage() {
  await requireAdminPage();
  return (
    <main className="mx-auto my-8 max-w-[1200px] px-5">
      <h1>Payment accounts</h1>
      <p className="mb-4 text-muted">
        The agency&apos;s own bank accounts, cards and cash box, by nickname only. A Client&apos;s cards and Cash are kept on the
        Client page. One that has been used is retired, never removed or renamed.
      </p>
      <AccountList clientId={null} admin />
    </main>
  );
}
