"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoriaLote } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 100;

export interface CambioParaDropi {
  id: string;
  producto: number;
  nombre: string;
  guia: string | null;
  publicacion: string;
}

async function paisDeCodigo(codigo: string, permitidos: string[] | null) {
  if (typeof codigo !== "string" || !/^[a-z]{2}$/i.test(codigo)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("paises").select("id, nombre").eq("codigo", codigo.toUpperCase()).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, permitidos, data.id as string))) return null;
  return { id: data.id as string, nombre: data.nombre as string };
}

/**
 * Los cambios que esperan para Dropi en un país (pendientes y los que dieron error, para reintentarlos), para el favorito «Aplicar en
 * Dropi». No lleva nada de la sesión de Dropi: el favorito los aplica desde su pestaña.
 */
export async function pendientesParaDropi(codigoPais: string): Promise<{ error?: string; pais?: string; cambios?: CambioParaDropi[] }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pais = await paisDeCodigo(codigoPais, usuario.paisesPermitidos);
  if (!pais) return { error: "Ese país no está en el sistema o no lo puedes ver." };
  const { data, error } = await createServiceClient()
    .from("dropi_cambios_pendientes")
    .select("id, dropi_producto_id, nombre, nombre_guia, dropi_publicaciones(nombre)")
    .eq("pais_id", pais.id)
    .in("estado", ["pendiente", "error"])
    .order("creado_en")
    .limit(MAX);
  if (error) return { error: /does not exist|schema cache/i.test(error.message) ? "Falta correr en Supabase la migración 0137." : "No se pudieron leer los cambios pendientes." };
  return {
    pais: pais.nombre,
    cambios: (data ?? []).map((f) => ({
      id: f.id as string,
      producto: Number(f.dropi_producto_id),
      nombre: f.nombre as string,
      guia: (f.nombre_guia as string | null) ?? null,
      publicacion: ((f.dropi_publicaciones as { nombre?: string } | null)?.nombre ?? "") as string,
    })),
  };
}

/**
 * Guarda lo que el favorito hizo en Dropi con cada cambio (aplicado, o el motivo del error). Solo acepta cambios de ese país que
 * seguían pendientes o con error; cada resultado queda en la actividad de su publicación a nombre de quien pulsó el favorito.
 */
export async function guardarResultadosDropi(codigoPais: string, resultados: unknown): Promise<{ error?: string; aplicados?: number; errores?: number }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pais = await paisDeCodigo(codigoPais, usuario.paisesPermitidos);
  if (!pais) return { error: "País no válido." };
  if (!Array.isArray(resultados) || resultados.length > MAX) return { error: "Resultados no válidos." };
  const limpios = resultados
    .map((r) => r as { id?: unknown; ok?: unknown; error?: unknown })
    .filter((r) => typeof r.id === "string" && UUID.test(r.id))
    .map((r) => ({ id: r.id as string, ok: r.ok === true, error: typeof r.error === "string" ? r.error.slice(0, 300) : "Sin detalle" }));
  if (!limpios.length) return { aplicados: 0, errores: 0 };
  const supabase = createServiceClient();
  const { data: filas } = await supabase
    .from("dropi_cambios_pendientes")
    .select("id, publicacion_id, dropi_producto_id, nombre, nombre_guia, intentos")
    .eq("pais_id", pais.id)
    .in("estado", ["pendiente", "error"])
    .in("id", limpios.map((r) => r.id));
  const porId = new Map((filas ?? []).map((f) => [f.id as string, f]));
  const ahora = new Date().toISOString();
  const auditoria: Parameters<typeof registrarAuditoriaLote>[0] = [];
  let aplicados = 0;
  let errores = 0;
  for (const r of limpios) {
    const f = porId.get(r.id);
    if (!f) continue;
    await supabase
      .from("dropi_cambios_pendientes")
      .update(r.ok ? { estado: "aplicado", aplicado_en: ahora, error: null, intentos: Number(f.intentos) + 1 } : { estado: "error", error: r.error, intentos: Number(f.intentos) + 1 })
      .eq("id", r.id);
    auditoria.push({
      accion: r.ok ? "dropi_nombre_aplicado" : "dropi_nombre_error",
      entidad: "dropi_publicaciones",
      entidadId: f.publicacion_id as string,
      detalle: r.ok ? `ID ${f.dropi_producto_id} · «${f.nombre}»${f.nombre_guia ? ` · guía «${f.nombre_guia}»` : ""} (desde Dropi)` : `ID ${f.dropi_producto_id} · ${r.error}`,
    });
    if (r.ok) aplicados++;
    else errores++;
  }
  await registrarAuditoriaLote(auditoria);
  revalidatePath("/publicaciones-dropi");
  return { aplicados, errores };
}
