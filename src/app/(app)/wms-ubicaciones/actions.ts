"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { ETIQUETA_PROPIEDAD, ETIQUETA_TAMANO, PROPIEDADES, TAMANOS, type Propiedad, type Tamano } from "./def-ubicaciones";

const MODULO = "wms-ubicaciones";
const UUID = /^[0-9a-fA-F-]{8,64}$/;

const texto = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function leerDatos(formData: FormData): { codigo: string; propiedad: Propiedad; tamano: Tamano | null; codigoBarras: string; notas: string } | { error: string } {
  const codigo = texto(formData.get("codigo"), 60);
  if (!codigo) return { error: "Falta el código de la ubicación." };
  const propiedad = PROPIEDADES.find((p) => p === formData.get("propiedad"));
  if (!propiedad) return { error: "Elige la propiedad de la ubicación." };
  const tamano = TAMANOS.find((t) => t === formData.get("tamano")) ?? null;
  return { codigo, propiedad, tamano, codigoBarras: texto(formData.get("codigo_barras"), 100), notas: texto(formData.get("notas"), 1000) };
}

/** «Agregar»: una ubicación nueva dentro de una bodega. Devuelve el error como valor (la ficha lo muestra sin cerrarse). */
export async function crearUbicacion(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const bodegaId = texto(formData.get("bodega_id"), 64);
  if (!UUID.test(bodegaId)) return { error: "Elige la bodega." };
  const datos = leerDatos(formData);
  if ("error" in datos) return datos;

  const supabase = createServiceClient();
  const { data: bodega } = await supabase.from("wms_bodegas").select("nombre, activa").eq("id", bodegaId).single();
  if (!bodega) return { error: "La bodega ya no existe." };
  if (bodega.activa !== true) return { error: "La bodega está inactiva." };

  const { data, error } = await supabase
    .from("wms_ubicaciones")
    .insert({
      bodega_id: bodegaId,
      codigo: datos.codigo,
      propiedad: datos.propiedad,
      tamano: datos.tamano,
      codigo_barras: datos.codigoBarras || null,
      notas: datos.notas || null,
      creado_por: usuario.id,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return { error: "Ya hay una ubicación con ese código en esta bodega." };
  if (error || !data) return { error: error?.message ?? "No se pudo crear la ubicación." };

  await registrarAuditoria({ accion: "crear_ubicacion_wms", entidad: "wms_ubicaciones", entidadId: data.id as string, detalle: `${datos.codigo} en ${bodega.nombre} (${ETIQUETA_PROPIEDAD[datos.propiedad]})` });
  revalidatePath("/wms-ubicaciones");
  return {};
}

/** Guarda los datos de una ubicación desde su ficha. La bodega no se cambia (el stock guardado ahí dependerá de ella). */
export async function actualizarUbicacion(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  const id = texto(formData.get("id"), 64);
  if (!UUID.test(id)) return { error: "Ubicación no válida." };
  const datos = leerDatos(formData);
  if ("error" in datos) return datos;

  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("wms_ubicaciones").select("codigo, propiedad, tamano").eq("id", id).single();
  if (!antes) return { error: "La ubicación ya no existe." };

  const { error } = await supabase
    .from("wms_ubicaciones")
    .update({ codigo: datos.codigo, propiedad: datos.propiedad, tamano: datos.tamano, codigo_barras: datos.codigoBarras || null, notas: datos.notas || null, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error?.code === "23505") return { error: "Ya hay una ubicación con ese código en esta bodega." };
  if (error) return { error: error.message };

  const tam = (t: string | null) => (t ? (ETIQUETA_TAMANO[t as Tamano] ?? t) : "—");
  await registrarAuditoria({
    accion: "editar_ubicacion_wms",
    entidad: "wms_ubicaciones",
    entidadId: id,
    antes: { Código: antes.codigo, Propiedad: ETIQUETA_PROPIEDAD[antes.propiedad as Propiedad] ?? antes.propiedad, Tamaño: tam(antes.tamano) },
    despues: { Código: datos.codigo, Propiedad: ETIQUETA_PROPIEDAD[datos.propiedad], Tamaño: tam(datos.tamano) },
  });
  revalidatePath("/wms-ubicaciones");
  return {};
}

/** Desactiva o reactiva una ubicación. No se borra: los movimientos de stock que pasen por ella dependerán de ella. */
export async function cambiarEstadoUbicacion(id: string, activa: boolean): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Ubicación no válida." };
  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("wms_ubicaciones").select("activa").eq("id", id).single();
  if (!actual) return { error: "La ubicación ya no existe." };
  if (actual.activa === activa) return {};
  const { error } = await supabase.from("wms_ubicaciones").update({ activa, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  await registrarAuditoria({
    accion: "cambiar_estado_ubicacion_wms",
    entidad: "wms_ubicaciones",
    entidadId: id,
    antes: { Estado: activa ? "Inactiva" : "Activa" },
    despues: { Estado: activa ? "Activa" : "Inactiva" },
  });
  revalidatePath("/wms-ubicaciones");
  return {};
}

/** La actividad de una ubicación para su ficha. Es una lectura: basta poder abrir el módulo. */
export async function obtenerHistorialUbicacion(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Ubicación no válida." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "wms_ubicaciones")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}
