"use server";

import { revalidatePath } from "next/cache";
import { createSessionClient, createServiceClient } from "@/lib/supabase/server";

export async function subirAvatar(formData: FormData) {
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) throw new Error("No autenticado.");

  const archivo = formData.get("avatar") as File | null;
  if (!archivo || archivo.size === 0) throw new Error("Selecciona una imagen.");
  if (!archivo.type.startsWith("image/")) throw new Error("El archivo debe ser una imagen.");
  if (archivo.size > 2 * 1024 * 1024) throw new Error("La imagen debe pesar menos de 2MB.");

  const supabase = createServiceClient();
  const extension = archivo.name.split(".").pop() || "jpg";
  const ruta = `${user.id}/avatar.${extension}`;

  const { error: errorSubida } = await supabase.storage
    .from("avatars")
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type });
  if (errorSubida) throw new Error(errorSubida.message);

  const { data: publico } = supabase.storage.from("avatars").getPublicUrl(ruta);

  const { error: errorPerfil } = await supabase
    .from("perfiles")
    .update({ avatar_url: `${publico.publicUrl}?v=${Date.now()}` })
    .eq("id", user.id);
  if (errorPerfil) throw new Error(errorPerfil.message);

  revalidatePath("/", "layout");
}
