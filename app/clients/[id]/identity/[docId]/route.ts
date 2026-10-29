import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Opens an ID or Passport image, like a Client document: a fresh one-minute signed
// link per click. RLS (0022) hides the row from anyone but the Consultant and admins.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { docId } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase.from("identity_documents").select("image_path").eq("id", docId).maybeSingle();
  if (!doc?.image_path) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await supabase.storage.from("client-files").createSignedUrl(doc.image_path, 60);
  if (error || !data) return new NextResponse("Could not open the image", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
