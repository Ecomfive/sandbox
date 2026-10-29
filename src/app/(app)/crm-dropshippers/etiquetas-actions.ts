"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/auth";
import { colorValido, limpiarEtiqueta, normalizarEtiquetas } from "@/lib/etiquetas";
import { escribirEtiquetasDropshipper } from "@/lib/crm/etiquetas-dropshipper";
import { createServiceClient } from "@/lib/supabase/server";

const ES_ID = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const puedeVer = (m: string[]) => m.includes("crm-dropshippers");
const puedeEscribir = (u: { modulos: string[]; modulosSoloLectura: string[] }) => u.modulos.includes("crm-dropshippers") && !u.modulosSoloLectura.includes("crm-dropshippers");

/**
 * Las etiquetas del CRM (las de los dropshippers y las de los chats sin dropshipper) y el color de cada una, para el selector de etiquetas
 * como el de ClickUp. Los colores viven en `whatsapp_etiquetas` (migración 0185) y valen para todo el CRM.
 */
export async function etiquetasCrmDisponibles(): Promise<{ todas: string[]; colores: Record<string, string> } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u || !puedeVer(u.modulos)) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const [ds, chats, colores] = await Promise.all([
    supabase.from("dropshippers").select("etiquetas").neq("etiquetas", "{}").range(0, 4999),
    supabase.from("whatsapp_conversaciones").select("etiquetas").neq("etiquetas", "{}").range(0, 4999),
    supabase.from("whatsapp_etiquetas").select("nombre, color"),
  ]);
  const todas = new Set<string>();
  for (const r of [...(ds.data ?? []), ...(chats.error ? [] : (chats.data ?? []))]) for (const e of (r.etiquetas as string[] | null) ?? []) todas.add(e);
  const mapa: Record<string, string> = {};
  if (!colores.error) for (const c of colores.data ?? []) mapa[c.nombre as string] = c.color as string;
  for (const n of Object.keys(mapa)) todas.add(n);
  return { todas: [...todas], colores: mapa };
}

/** Pone las etiquetas de un dropshipper (reemplaza la lista). Pide poder modificar el CRM; queda en la auditoría con lo de antes y lo de después. */
export async function guardarEtiquetasDropshipper(id: string, etiquetas: string[]): Promise<{ etiquetas: string[] } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u || !puedeEscribir(u)) return { error: "No tienes permiso para modificar el CRM." };
  if (!ES_ID(String(id))) return { error: "Dropshipper no válido." };
  const supabase = createServiceClient();
  const r = await escribirEtiquetasDropshipper(supabase, id, normalizarEtiquetas(etiquetas));
  if ("error" in r) return r;
  revalidatePath("/crm-dropshippers", "layout");
  return r;
}

/** Elige el color de una etiqueta del CRM (vale para todos los dropshippers y chats que la tengan). */
export async function guardarColorEtiquetaCrm(nombre: string, color: string): Promise<{ ok: true } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u || !puedeEscribir(u)) return { error: "No tienes permiso para modificar el CRM." };
  const limpio = limpiarEtiqueta(nombre);
  if (!limpio) return { error: "Etiqueta no válida." };
  if (!colorValido(color)) return { error: "Color no válido." };
  const { error } = await createServiceClient().from("whatsapp_etiquetas").upsert({ nombre: limpio, color, actualizado_en: new Date().toISOString() }, { onConflict: "nombre" });
  if (error) return { error: "No se pudo guardar el color (¿falta la migración 0185?)." };
  return { ok: true };
}
