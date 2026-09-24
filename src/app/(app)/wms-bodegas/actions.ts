"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { ETIQUETA_TIPO_BODEGA, TIPOS_BODEGA, type TipoBodega } from "./def-bodegas";

const MODULO = "wms-bodegas";
const UUID = /^[0-9a-fA-F-]{8,64}$/;

const texto = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function leerDatos(formData: FormData): { nombre: string; tipo: TipoBodega; direccion: string; contacto: string; notas: string } | { error: string } {
  const nombre = texto(formData.get("nombre"), 120);
  if (!nombre) return { error: "Falta el nombre de la bodega." };
  const tipo = TIPOS_BODEGA.find((t) => t === formData.get("tipo"));
  if (!tipo) return { error: "Elige si la bodega es propia o externa." };
  return { nombre, tipo, direccion: texto(formData.get("direccion"), 300), contacto: texto(formData.get("contacto"), 200), notas: texto(formData.get("notas"), 1000) };
}

/** «Agregar»: una bodega más además de las 6 fuentes. Devuelve el error como valor (la ficha lo muestra sin cerrarse). */
export async function crearBodega(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  const paisId = texto(formData.get("pais_id"), 64);
  if (!UUID.test(paisId)) return { error: "País no válido." };
  const datos = leerDatos(formData);
  if ("error" in datos) return datos;

  const supabase = createServiceClient();
  const { data: ultima } = await supabase.from("wms_bodegas").select("orden").eq("pais_id", paisId).order("orden", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("wms_bodegas")
    .insert({ pais_id: paisId, ...datos, direccion: datos.direccion || null, contacto: datos.contacto || null, notas: datos.notas || null, orden: (ultima?.orden ?? 0) + 1 })
    .select("id")
    .single();
  if (error?.code === "23505") return { error: "Ya hay una bodega con ese nombre." };
  if (error || !data) return { error: error?.message ?? "No se pudo crear la bodega." };

  await registrarAuditoria({ accion: "crear_bodega_wms", entidad: "wms_bodegas", entidadId: data.id as string, detalle: `${datos.nombre} (${ETIQUETA_TIPO_BODEGA[datos.tipo]})` });
  revalidatePath("/wms-bodegas");
  return {};
}

/** Guarda los datos de una bodega desde su ficha. El código de las 6 fuentes no se toca. */
export async function actualizarBodega(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  const id = texto(formData.get("id"), 64);
  if (!UUID.test(id)) return { error: "Bodega no válida." };
  const datos = leerDatos(formData);
  if ("error" in datos) return datos;

  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("wms_bodegas").select("nombre, tipo, direccion, contacto").eq("id", id).single();
  if (!antes) return { error: "La bodega ya no existe." };

  const { error } = await supabase
    .from("wms_bodegas")
    .update({ ...datos, direccion: datos.direccion || null, contacto: datos.contacto || null, notas: datos.notas || null, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error?.code === "23505") return { error: "Ya hay una bodega con ese nombre." };
  if (error) return { error: error.message };

  const tipoAntes = ETIQUETA_TIPO_BODEGA[antes.tipo as TipoBodega] ?? antes.tipo;
  await registrarAuditoria({
    accion: "editar_bodega_wms",
    entidad: "wms_bodegas",
    entidadId: id,
    antes: { Nombre: antes.nombre, Tipo: tipoAntes, Dirección: antes.direccion ?? "—", Contacto: antes.contacto ?? "—" },
    despues: { Nombre: datos.nombre, Tipo: ETIQUETA_TIPO_BODEGA[datos.tipo], Dirección: datos.direccion || "—", Contacto: datos.contacto || "—" },
  });
  revalidatePath("/wms-bodegas");
  return {};
}

/** Desactiva o reactiva una bodega. No se borra: el stock y los movimientos futuros dependen de ella. */
export async function cambiarEstadoBodega(id: string, activa: boolean): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Bodega no válida." };
  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("wms_bodegas").select("nombre, activa").eq("id", id).single();
  if (!actual) return { error: "La bodega ya no existe." };
  if (actual.activa === activa) return {};
  const { error } = await supabase.from("wms_bodegas").update({ activa, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  await registrarAuditoria({
    accion: "cambiar_estado_bodega_wms",
    entidad: "wms_bodegas",
    entidadId: id,
    antes: { Estado: activa ? "Inactiva" : "Activa" },
    despues: { Estado: activa ? "Activa" : "Inactiva" },
  });
  revalidatePath("/wms-bodegas");
  return {};
}

/** La actividad de una bodega para su ficha. Es una lectura: basta poder abrir el módulo. */
export async function obtenerHistorialBodega(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Bodega no válida." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "wms_bodegas")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}
