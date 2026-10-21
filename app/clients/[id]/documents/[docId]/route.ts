import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Opens a client document: a fresh one-minute signed link per click, so a link
// copied out of the browser stops working almost at once. RLS (0007) hides the
// row from anyone who is not the Consultant or an admin.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("client_documents")
    .select("storage_path")
    .eq("id", docId)
    .eq("client_id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await supabase.storage.from("client-files").createSignedUrl(doc.storage_path, 60);
  if (error || !data) return new NextResponse("Could not open the document", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
