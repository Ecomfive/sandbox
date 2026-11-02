"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioSesion } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { detectarImagen } from "@/lib/seguridad/imagen";

export async function subirAvatar(formData: FormData) {
  // Con la verificación en dos pasos encendida, también aquí hace falta haberla cumplido.
  const user = await getUsuarioSesion();
  if (!user) throw new Error("No autenticado.");

  const archivo = formData.get("avatar") as File | null;
  if (!archivo || archivo.size === 0) throw new Error("Selecciona una imagen.");
  if (archivo.size > 2 * 1024 * 1024) throw new Error("La imagen debe pesar menos de 2MB.");

  // El tipo y la extensión salen de la firma del archivo, no de lo que declaran el navegador o el nombre (quien sube el
  // archivo controla ambos). No se admite SVG: puede llevar scripts y el bucket es público.
  const contenido = new Uint8Array(await archivo.arrayBuffer());
  const imagen = detectarImagen(contenido);
  if (!imagen) throw new Error("La imagen debe ser JPG, PNG, WebP o GIF.");

  const supabase = createServiceClient();
  const ruta = `${user.id}/avatar.${imagen.extension}`;

  const { error: errorSubida } = await supabase.storage
    .from("avatars")
    .upload(ruta, contenido, { upsert: true, contentType: imagen.tipo });
  if (errorSubida) throw new Error(errorSubida.message);

  const { data: publico } = supabase.storage.from("avatars").getPublicUrl(ruta);

  const { error: errorPerfil } = await supabase
    .from("perfiles")
    .update({ avatar_url: `${publico.publicUrl}?v=${Date.now()}` })
    .eq("id", user.id);
  if (errorPerfil) throw new Error(errorPerfil.message);

  revalidatePath("/", "layout");
}
