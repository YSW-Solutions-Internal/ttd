"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ClientFormState = { error?: string; notice?: string };

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

/**
 * Adds a client (no id in the form) or saves an existing one. The database
 * decides who may do what (migration 0007): only the client's Consultant or an
 * admin can save, only an admin can set the Consultant to someone else, and the
 * client code is generated there and never changes.
 */
export async function saveClient(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const id = text(formData, "id");
  const fields = {
    first_name: text(formData, "first_name"),
    last_name: text(formData, "last_name"),
    email: text(formData, "email") || null,
    phone: text(formData, "phone") || null,
    notes: text(formData, "notes") || null,
    // Only admins see the picker; for anyone else the database fills in (or keeps) their own id.
    ...(profile.role === "admin" && text(formData, "consultant_id")
      ? { consultant_id: text(formData, "consultant_id") }
      : {}),
  };
  if (!fields.first_name || !fields.last_name) return { error: "Enter a first and last name." };

  const supabase = await createClient();

  if (id) {
    const { data, error } = await supabase
      .from("clients")
      .update({ ...fields, active: formData.get("active") === "on" })
      .eq("id", id)
      .select("id");
    if (error) return { error: `Could not save: ${error.message}` };
    // RLS filters rather than errors, so zero rows means the update was refused.
    if (!data || data.length === 0) return { error: "Could not save: only the client's consultant or an administrator can edit." };
    revalidatePath(`/clients/${id}`);
    return { notice: "Saved." };
  }

  const { data, error } = await supabase.from("clients").insert(fields).select("id").single();
  if (error || !data) return { error: `Could not add the client: ${error?.message ?? "unknown error"}` };

  revalidatePath("/clients");
  // Came from the New trip form: go back there with this client chosen.
  if (text(formData, "next") === "trip") redirect(`/trips/new?client=${data.id}`);
  redirect(`/clients/${data.id}`);
}

const DOC_KINDS = new Set(["id_copy", "passport_copy", "other"]);
const DOC_EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const MAX_DOC_BYTES = 10 * 1024 * 1024;

export async function uploadDocument(
  clientId: string,
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const kind = text(formData, "kind");
  const file = formData.get("file");
  if (!DOC_KINDS.has(kind)) return { error: "Choose what kind of document this is." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  if (!DOC_EXT[file.type]) return { error: "Only PDF, JPG or PNG files." };
  if (file.size > MAX_DOC_BYTES) return { error: "The file is over 10 MB." };

  const supabase = await createClient();
  const path = `${clientId}/${crypto.randomUUID()}.${DOC_EXT[file.type]}`;
  // Storage policies (0007) refuse this unless you are the Consultant or an admin.
  const { error: upErr } = await supabase.storage
    .from("client-files")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: `Could not upload: ${upErr.message}` };

  const { error } = await supabase.from("client_documents").insert({
    client_id: clientId,
    kind,
    storage_path: path,
    filename: file.name,
    uploaded_by: profile.id,
  });
  // shortcut: the stored file is left behind if this fails (only admins can delete files); clean up by hand if it ever happens.
  if (error) return { error: `Could not save the document: ${error.message}` };

  revalidatePath(`/clients/${clientId}`);
  return { notice: `${file.name} uploaded.` };
}
