"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";

/** Marca o desmarca una página del menú como acceso rápido para el usuario actual. */
export async function alternarFavorito(href: string, marcar: boolean) {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No hay sesión activa.");

  const supabase = createServiceClient();
  if (marcar) {
    const { error } = await supabase
      .from("favoritos_nav")
      .upsert({ usuario_id: usuario.id, href }, { onConflict: "usuario_id,href" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("favoritos_nav")
      .delete()
      .eq("usuario_id", usuario.id)
      .eq("href", href);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/", "layout");
}
