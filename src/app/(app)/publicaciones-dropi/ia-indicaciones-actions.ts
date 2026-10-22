"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { CLAVES_INDICACION, ETIQUETA_INDICACION } from "@/lib/publicaciones/ia/criterios";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const MAX = 1500;

/**
 * Guarda lo que el equipo le dice a la IA (Reglas › Indicaciones para la IA): un texto por parte (para todo, títulos, descripción y
 * ángulos, fotos, análisis). Se agrega a cada pedido. Solo lo cambia quien puede modificar el módulo. Devuelve el error como valor.
 */
export async function guardarIndicacionesIA(entrada: Record<string, string>): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const { data: previas, error: errorLectura } = await supabase.from("dropi_ia_indicaciones").select("clave, texto");
  if (errorLectura) return { error: "Falta correr en Supabase la migración 0134." };
  const antes = new Map((previas ?? []).map((f) => [f.clave as string, String(f.texto ?? "")]));
  const filas: { clave: string; texto: string; actualizado_en: string; actualizado_por: string; actualizado_por_nombre: string }[] = [];
  const cambios: string[] = [];
  for (const clave of CLAVES_INDICACION) {
    if (typeof entrada?.[clave] !== "string") continue;
    const texto = entrada[clave].replace(/\r/g, "").trim().slice(0, MAX);
    if (texto === (antes.get(clave) ?? "")) continue;
    filas.push({ clave, texto, actualizado_en: new Date().toISOString(), actualizado_por: usuario.id, actualizado_por_nombre: usuario.nombre || usuario.email });
    cambios.push(ETIQUETA_INDICACION[clave]);
  }
  if (!filas.length) return {};
  const { error } = await supabase.from("dropi_ia_indicaciones").upsert(filas, { onConflict: "clave" });
  if (error) return { error: "No se pudieron guardar las indicaciones." };
  await registrarAuditoria({ accion: "editar_indicaciones_ia", entidad: "dropi_publicaciones", detalle: `Indicaciones para la IA: ${cambios.join(", ")}` });
  revalidatePath("/publicaciones-dropi/reglas");
  return {};
}
