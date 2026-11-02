import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_KIND_LABEL } from "@/lib/payments";
import { AddAccountForm } from "./account-forms";
import { setRetired } from "./actions";
import { Badge, Button } from "@/app/ui";

/** The agency's own Payment accounts (no clientId) or one Client's; Administrators add and retire them. */
export async function AccountList({ clientId, admin }: { clientId: string | null; admin: boolean }) {
  const supabase = await createClient();
  const query = supabase.from("payment_accounts").select("id, kind, nickname, retired_at").order("nickname");
  const { data } = await (clientId ? query.eq("client_id", clientId) : query.is("client_id", null));
  return (
    <>
      {(data ?? []).length === 0 && <p className="py-3 text-muted">None yet.</p>}
      {(data ?? []).length > 0 && (
        <table>
          <tbody>
            {(data ?? []).map((a) => (
              <tr key={a.id}>
                <td>{a.nickname}</td>
                <td>{ACCOUNT_KIND_LABEL[a.kind]}</td>
                <td>{a.retired_at && <Badge>Retired</Badge>}</td>
                <td className="text-right">
                  {admin && (
                    <form action={setRetired.bind(null, a.id, !a.retired_at)}>
                      <Button type="submit" variant="quiet">
                        {a.retired_at ? "Bring back" : "Retire"}
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {admin && <AddAccountForm clientId={clientId} kinds={clientId ? ["card", "cash"] : ["bank", "card", "cash"]} />}
    </>
  );
}
