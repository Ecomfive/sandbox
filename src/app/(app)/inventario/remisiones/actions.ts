"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { numeroRemision, revisarLineasRemision } from "@/lib/wms/remision";

const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F-]{8,64}$/.test(v);

/**
 * Crea una remisión con todos sus productos (`wms_crear_remision`, migración 0233): salen de la bodega y quedan «en camino». Es todo o nada: si a uno no le alcanza el
 * stock, no sale ninguno. Devuelve el error como valor.
 */
export async function crearRemision(datos: { desde: unknown; hacia: unknown; notas: unknown; lineas: unknown }): Promise<{ error: string } | { id: string; numero: string }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID(datos.desde)) return { error: "Elige de qué bodega sale." };
  if (!ES_ID(datos.hacia)) return { error: "Elige a qué bodega va." };
  const revisadas = revisarLineasRemision(datos.lineas);
  if ("error" in revisadas) return revisadas;
  const notas = typeof datos.notas === "string" ? datos.notas.trim().slice(0, 300) : "";
  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, datos.desde)) || !(await puedeVerBodega(supabase, usuario.paisesPermitidos, datos.hacia))) {
    return { error: "No tienes acceso al país de esas bodegas." };
  }
  const { data, error } = await supabase.rpc("wms_crear_remision", { p_desde: datos.desde, p_hacia: datos.hacia, p_items: revisadas.lineas, p_notas: notas || null, p_usuario: usuario.id });
  if (error) {
    if (/wms_crear_remision/.test(error.message)) return { error: "Falta correr la migración 0233 en la base." };
    return { error: error.message.length < 200 ? error.message : "No se pudo crear la remisión." };
  }
  const creada = data as { id: string; numero: number };
  const numero = numeroRemision(creada.numero);
  const unidades = revisadas.lineas.reduce((t, l) => t + l.cantidad, 0);
  await registrarAuditoria({
    accion: "envio_dropi_inventario",
    entidad: "wms_remisiones",
    entidadId: creada.id,
    detalle: `${numero}: ${revisadas.lineas.length} ${revisadas.lineas.length === 1 ? "producto" : "productos"}, ${unidades.toLocaleString("es-PA")} unidades${notas ? ` · ${notas}` : ""}`,
  });
  revalidatePath("/inventario");
  revalidatePath("/inventario/remisiones");
  return { id: creada.id, numero };
}
