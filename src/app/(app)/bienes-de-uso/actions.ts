"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { dinero } from "@/lib/af4/formato";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoARegistros, sinAccesoAUnidades } from "@/lib/finanzas/acceso-tienda";
import { VIDA_UTIL, tipoDeBien, validarBienExcel, type TipoBien } from "@/lib/finanzas/bienes-uso";
import { guardarBienes, type BienValidado } from "@/lib/finanzas/guardar-bienes";
import { origenDeArchivo } from "@/lib/finanzas/guardar-libro";

const MODULO = "bienes-de-uso";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BIENES = 2_000;
const texto = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

interface DatosBien {
  descripcion: string;
  tipo: TipoBien;
  unidad_id: string | null;
  fecha_alta: string;
  importe: number;
  meses_vida: number;
  valor_residual: number;
  notas: string | null;
}

async function leerDatos(formData: FormData): Promise<DatosBien | { error: string }> {
  const descripcion = texto(formData.get("descripcion"), 300);
  if (!descripcion) return { error: "Falta la descripción." };
  const tipo = tipoDeBien(texto(formData.get("tipo"), 40));
  if (!tipo) return { error: "Elige el tipo de bien." };
  const fecha = texto(formData.get("fecha_alta"), 10);
  if (!FECHA.test(fecha)) return { error: "Falta la fecha de alta." };
  const importe = Number(texto(formData.get("importe"), 20));
  if (!Number.isFinite(importe) || importe <= 0 || importe > 100_000_000) return { error: "El importe debe ser mayor a cero." };
  const mesesTexto = texto(formData.get("meses_vida"), 4);
  const meses = mesesTexto ? Number(mesesTexto) : VIDA_UTIL[tipo];
  if (!Number.isInteger(meses) || meses < 1 || meses > 600) return { error: "Los meses de vida útil van de 1 a 600." };
  const residual = Number(texto(formData.get("valor_residual"), 20) || 0);
  if (!Number.isFinite(residual) || residual < 0 || residual >= importe) return { error: "El valor residual debe ser menor que el importe." };
  const unidad = texto(formData.get("unidad_id"), 64);
  let unidadId: string | null = null;
  if (unidad) {
    if (!UUID.test(unidad)) return { error: "Tienda inválida." };
    const { data } = await createServiceClient().from("fin_unidades").select("id").eq("id", unidad).maybeSingle();
    if (!data) return { error: "La tienda no existe." };
    unidadId = unidad;
  }
  return {
    descripcion,
    tipo,
    unidad_id: unidadId,
    fecha_alta: fecha,
    importe: Math.round(importe * 10_000) / 10_000,
    meses_vida: meses,
    valor_residual: Math.round(residual * 10_000) / 10_000,
    notas: texto(formData.get("notas"), 1000) || null,
  };
}

const revalidar = () => revalidatePath("/bienes-de-uso", "layout");

/** «Agregar»: un bien de uso cargado a mano. */
export async function crearBien(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const d = await leerDatos(formData);
    if ("error" in d) return d;
    const acceso = await sinAccesoAUnidades([d.unidad_id]);
    if (acceso) return { error: acceso };
    const { data, error } = await createServiceClient()
      .from("fin_bienes_uso")
      .insert({ ...d, origen: "manual", creado_por: usuario.id })
      .select("id")
      .single();
    if (error || !data) return { error: `No se pudo guardar: ${error?.message ?? "sin respuesta"}` };
    await registrarAuditoria({
      accion: "crear_bien_uso",
      entidad: "fin_bienes_uso",
      entidadId: data.id as string,
      detalle: `${d.descripcion} · ${d.tipo} · ${usd(d.importe)} en ${d.meses_vida} meses`,
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el bien." };
  }
}

const vistaBien = (b: { descripcion: string; tipo: string; tienda: string; fecha_alta: string; importe: number; meses_vida: number; valor_residual: number }) => ({
  Descripción: b.descripcion,
  Tipo: b.tipo,
  Tienda: b.tienda || "A DISTRIBUIR",
  Alta: b.fecha_alta,
  Importe: b.importe.toFixed(2),
  "Vida útil": `${b.meses_vida} meses`,
  "Valor residual": b.valor_residual.toFixed(2),
});

/** Guarda la ficha de un bien. Queda corregido a mano: reimportar el Excel ya no lo pisa. */
export async function actualizarBien(formData: FormData): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    const id = texto(formData.get("id"), 64);
    if (!UUID.test(id)) return { error: "Bien inválido." };
    const d = await leerDatos(formData);
    if ("error" in d) return d;
    const supabase = createServiceClient();
    const acceso = (await sinAccesoARegistros(supabase, "fin_bienes_uso", [id])) ?? (await sinAccesoAUnidades([d.unidad_id]));
    if (acceso) return { error: acceso };
    const { data: a } = await supabase
      .from("fin_bienes_uso")
      .select("descripcion, tipo, fecha_alta, importe, meses_vida, valor_residual, fecha_baja, fin_unidades(nombre)")
      .eq("id", id)
      .maybeSingle();
    if (!a) return { error: "El bien ya no existe." };
    if (a.fecha_baja && a.fecha_baja < d.fecha_alta) return { error: "La fecha de alta no puede ser posterior a la baja." };
    const nombreTienda = async (uid: string | null) =>
      uid ? (((await supabase.from("fin_unidades").select("nombre").eq("id", uid).maybeSingle()).data?.nombre as string | undefined) ?? "") : "";
    const tiendaAntes = ((Array.isArray(a.fin_unidades) ? a.fin_unidades[0] : a.fin_unidades) as { nombre?: string } | null)?.nombre ?? "";
    const antes = vistaBien({ ...(a as unknown as DatosBien), tienda: tiendaAntes, importe: Number(a.importe), valor_residual: Number(a.valor_residual) });
    const despues = vistaBien({ ...d, tienda: await nombreTienda(d.unidad_id) });
    const cambiados = Object.keys(antes).filter((k) => antes[k as keyof typeof antes] !== despues[k as keyof typeof despues]);
    if (!cambiados.length) return {};
    const { error } = await supabase
      .from("fin_bienes_uso")
      .update({ ...d, editado_a_mano: true, actualizado_en: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({
      accion: "editar_bien_uso",
      entidad: "fin_bienes_uso",
      entidadId: id,
      antes: Object.fromEntries(cambiados.map((k) => [k, antes[k as keyof typeof antes]])),
      despues: Object.fromEntries(cambiados.map((k) => [k, despues[k as keyof typeof despues]])),
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el bien." };
  }
}

/** «Dar de baja»: el bien deja de depreciar desde el mes de la baja y sale del valor neto. Con fecha vacía, anula la baja. */
export async function cambiarBaja(id: string, fecha: string | null, motivo: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Bien inválido." };
    if (fecha !== null && (typeof fecha !== "string" || !FECHA.test(fecha))) return { error: "Elige la fecha de baja." };
    const supabase = createServiceClient();
    const acceso = await sinAccesoARegistros(supabase, "fin_bienes_uso", [id]);
    if (acceso) return { error: acceso };
    const { data: b } = await supabase.from("fin_bienes_uso").select("fecha_alta, fecha_baja").eq("id", id).maybeSingle();
    if (!b) return { error: "El bien ya no existe." };
    if (fecha && fecha < (b.fecha_alta as string)) return { error: "La baja no puede ser anterior al alta." };
    const motivoLimpio = typeof motivo === "string" ? motivo.trim().slice(0, 300) : "";
    const { error } = await supabase
      .from("fin_bienes_uso")
      .update({ fecha_baja: fecha, motivo_baja: fecha ? motivoLimpio || null : null, actualizado_en: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({
      accion: fecha ? "baja_bien_uso" : "anular_baja_bien_uso",
      entidad: "fin_bienes_uso",
      entidadId: id,
      antes: { Baja: (b.fecha_baja as string | null) ?? "—" },
      despues: { Baja: fecha ? `${fecha}${motivoLimpio ? ` (${motivoLimpio})` : ""}` : "—" },
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cambiar la baja." };
  }
}

/** La actividad de un bien para su ficha. Es una lectura: basta poder abrir el módulo. */
export async function obtenerHistorialBien(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Bien inválido." };
  const acceso = await sinAccesoARegistros(createServiceClient(), "fin_bienes_uso", [id]);
  if (acceso) return { error: acceso };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "fin_bienes_uso")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}

/**
 * «Importar Excel»: los bienes leídos en el navegador de la hoja «Bienes de Uso». Se revalida cada uno; se crean o
 * actualizan por huella y se borran los de ese mismo archivo que ya no vinieron (nunca los cargados o corregidos a mano).
 */
export async function importarBienes(
  archivo: string,
  filas: unknown[],
): Promise<{ error: string } | { guardados: number; conservados: number; borrados: number; rechazados: number }> {
  try {
    await requireModuloEscritura(MODULO);
    if (!Array.isArray(filas) || !filas.length || filas.length > MAX_BIENES) return { error: "El archivo no trae bienes válidos." };
    const buenos = filas.map(validarBienExcel).filter((b): b is BienValidado => b !== null);
    if (!buenos.length) return { error: "El archivo no trae bienes válidos." };
    const origen = origenDeArchivo(String(archivo ?? ""));
    const r = await guardarBienes(createServiceClient(), origen, buenos);
    await registrarAuditoria({
      accion: "importar_bienes_uso",
      entidad: "fin_bienes_uso",
      detalle: `${origen}: ${buenos.length} bienes, ${r.borrados} borrados`,
    });
    revalidar();
    return { ...r, rechazados: filas.length - buenos.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo importar." };
  }
}
