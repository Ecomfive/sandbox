"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dinero as formatoDinero } from "@/lib/af4/formato";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { SECCIONES, mesCorto } from "@/lib/finanzas/eerr";
import { cargarRealPorUnidad, esUuid } from "@/lib/finanzas/cargar-presupuesto";
import {
  ESCENARIOS,
  ESTADOS_PRESUPUESTO,
  celdasCambiadas,
  detalleDeLineas,
  editarSeccion,
  esEscenario,
  esSeccion,
  generarLineas,
  leerMes,
  leerModo,
  leerMonto,
  leerNumero,
  mesesDelAnio,
  puedePasar,
  rangoMeses,
  sumaEn,
  sumarSeries,
  supuestosDeFormulario,
  supuestosPorDefecto,
  type Escenario,
  type EstadoPresupuesto,
  type FilaTipo,
  type LineaPresupuesto,
  type Supuestos,
} from "@/lib/finanzas/presupuesto";

const MODULO = "presupuesto";
/** Hasta dos años de meses base. */
const MAX_MESES_BASE = 24;
const LOTE = 500;

const texto = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const etiquetaEscenario = (e: Escenario) => ESCENARIOS.find((x) => x.clave === e)!.etiqueta;
const etiquetaSeccion = (s: string) => SECCIONES.find((x) => x.clave === s)?.etiqueta ?? s;
const dinero = (v: number) => formatoDinero(v, "USD", { decimales: 2 });

/**
 * Lee del formulario el año, los meses base, la división por tienda y los supuestos, y arma las líneas de los tres
 * escenarios desde el real. Lo comparten crear y rehacer.
 */
async function generarDesdeFormulario(
  supabase: SupabaseClient,
  formData: FormData,
): Promise<{ error: string } | { anio: number; porTienda: boolean; supuestos: Supuestos; lineas: LineaPresupuesto[] }> {
  const anio = Number(formData.get("anio"));
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) return { error: "Elige el año del presupuesto." };
  const desde = leerMes(formData.get("base_desde"));
  const hasta = leerMes(formData.get("base_hasta"));
  if (!desde || !hasta) return { error: "Elige los meses base." };
  const mesesBase = rangoMeses(desde, hasta);
  if (!mesesBase.length) return { error: "El mes «hasta» va después del mes «desde»." };
  if (mesesBase.length > MAX_MESES_BASE) return { error: `Elige como máximo ${MAX_MESES_BASE} meses base.` };
  const porTienda = formData.get("por_tienda") === "si";

  const real = await cargarRealPorUnidad(supabase, mesesBase);
  if ("error" in real) return { error: real.error };
  if (!real.conDatos.size) return { error: "Los meses base no tienen movimientos en el libro." };
  // Solo los meses base con datos: un mes vacío bajaría el promedio.
  const conDatos = mesesBase.filter((m) => real.conDatos.has(m));
  const consolidado = sumarSeries([...real.porUnidad.values()], conDatos);
  if (sumaEn(consolidado.ingresos, conDatos) <= 0) return { error: "Los meses base no tienen ingresos: elige otros." };

  const modos = { administracion: leerModo(formData.get("modo_administracion")), marketing: leerModo(formData.get("modo_marketing")) };
  const porDefecto = supuestosPorDefecto(consolidado, conDatos, modos);
  const leidos = supuestosDeFormulario((c) => formData.get(c), porDefecto);
  if ("error" in leidos) return { error: leidos.error };
  const lineas = generarLineas(leidos.supuestos, real.porUnidad, anio, porTienda, real.tipos);
  return { anio, porTienda, supuestos: leidos.supuestos, lineas };
}

async function guardarLineas(supabase: SupabaseClient, presupuestoId: string, lineas: LineaPresupuesto[], usuarioId: string) {
  for (let i = 0; i < lineas.length; i += LOTE) {
    const { error } = await supabase.from("fin_presupuesto_lineas").insert(
      lineas.slice(i, i + LOTE).map((l) => ({ ...l, presupuesto_id: presupuestoId, origen: "generado", actualizado_por: usuarioId })),
    );
    if (error) return error.message;
  }
  return null;
}

/** «Agregar»: crea un presupuesto con sus tres escenarios generados desde el real. Devuelve su id para abrirlo. */
export async function crearPresupuesto(formData: FormData): Promise<{ error?: string; id?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const nombre = texto(formData.get("nombre"), 120);
    if (!nombre) return { error: "Escribe el nombre del presupuesto." };
    const notas = texto(formData.get("notas"), 2000) || null;
    const supabase = createServiceClient();
    const generado = await generarDesdeFormulario(supabase, formData);
    if ("error" in generado) return { error: generado.error };

    const creado = await supabase
      .from("fin_presupuestos")
      .insert({ nombre, anio: generado.anio, por_tienda: generado.porTienda, supuestos: generado.supuestos, notas, creado_por: usuario.id })
      .select("id")
      .single();
    if (creado.error) {
      return { error: creado.error.code === "23505" ? `Ya hay un presupuesto «${nombre}» para ${generado.anio}.` : `No se pudo crear: ${creado.error.message}` };
    }
    const fallo = await guardarLineas(supabase, creado.data.id, generado.lineas, usuario.id);
    if (fallo) {
      await supabase.from("fin_presupuestos").delete().eq("id", creado.data.id);
      return { error: `No se pudieron guardar las líneas: ${fallo}` };
    }
    const base = generado.supuestos.mesesBase;
    await registrarAuditoria({
      accion: "crear_presupuesto",
      entidad: "fin_presupuestos",
      entidadId: creado.data.id,
      detalle: `${nombre} (${generado.anio}) desde el real de ${mesCorto(base[0])} a ${mesCorto(base[base.length - 1])}${generado.porTienda ? ", por tienda" : ""}`,
    });
    revalidatePath("/presupuesto");
    return { id: creado.data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear el presupuesto." };
  }
}

/** Lee la cabecera y exige que siga en borrador (lo aprobado y lo cerrado no se tocan). */
async function borradorEditable(supabase: SupabaseClient, id: unknown) {
  if (!esUuid(id)) return { error: "Presupuesto inválido." } as const;
  const { data, error } = await supabase.from("fin_presupuestos").select("id, nombre, anio, estado, por_tienda").eq("id", id).maybeSingle();
  if (error || !data) return { error: "Presupuesto inválido." } as const;
  if (data.estado !== "borrador") return { error: "Solo se cambia un presupuesto en borrador: vuélvelo a borrador primero." } as const;
  return { presupuesto: data as { id: string; nombre: string; anio: number; estado: EstadoPresupuesto; por_tienda: boolean } };
}

/** Valida la tienda de una celda: en un presupuesto por tienda hace falta una; en uno consolidado, ninguna. */
async function unidadDeCelda(supabase: SupabaseClient, porTienda: boolean, unidad: unknown) {
  if (!porTienda) return unidad === null ? { unidad: null, nombre: "Consolidado" } : { error: "Este presupuesto es consolidado." };
  if (unidad === null) return { error: "Elige una tienda para cambiar sus cifras." };
  if (!esUuid(unidad)) return { error: "Tienda inválida." };
  const { data } = await supabase.from("fin_unidades").select("id, nombre").eq("id", unidad).maybeSingle();
  return data ? { unidad: data.id as string, nombre: data.nombre as string } : { error: "Tienda inválida." };
}

/** La fila que se edita: la sección entera, su «Otros» o uno de sus tipos (id de `fin_tipos`). */
export type FilaEditable = "seccion" | "otros" | string;

/**
 * Cambia una celda del presupuesto (escenario, tienda, sección o tipo, y un mes o el total del año; `periodo` null = el
 * total del año). Editar un tipo cambia solo ese tipo (la sección es su suma); editar la sección la reparte entre sus
 * tipos en la misma proporción (`editarSeccion`). Lo cambiado queda como línea manual. Un presupuesto sin detalle por
 * tipo tiene una sola fila por sección («Otros») y se edita igual que antes.
 */
export async function editarCeldaPresupuesto(
  id: string,
  escenario: string,
  unidad: string | null,
  seccion: string,
  fila: FilaEditable,
  periodo: string | null,
  valor: string,
): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const supabase = createServiceClient();
    const cab = await borradorEditable(supabase, id);
    if ("error" in cab) return { error: cab.error };
    const p = cab.presupuesto;
    if (!esEscenario(escenario) || !esSeccion(seccion)) return { error: "Celda inválida." };
    const meses = mesesDelAnio(p.anio);
    const mes = periodo === null ? null : leerMes(periodo);
    if (periodo !== null && (!mes || !meses.includes(mes))) return { error: "Mes inválido." };
    const monto = mes ? leerMonto(valor) : leerNumeroAnual(valor);
    if (monto === null) return { error: "Escribe un monto válido." };
    const u = await unidadDeCelda(supabase, p.por_tienda, unidad);
    if ("error" in u) return { error: u.error };

    let tipo: string | null | undefined;
    let nombreFila = etiquetaSeccion(seccion);
    if (fila === "otros") {
      tipo = null;
      nombreFila = `Otros de ${nombreFila.toLowerCase()}`;
    } else if (fila !== "seccion") {
      if (!esUuid(fila)) return { error: "Tipo inválido." };
      const t = await supabase.from("fin_tipos").select("id, nombre, seccion").eq("id", fila).maybeSingle();
      if (t.error || !t.data || t.data.seccion !== seccion) return { error: "Tipo inválido." };
      tipo = t.data.id as string;
      nombreFila = `${etiquetaSeccion(seccion)} › ${t.data.nombre as string}`;
    }

    let q = supabase.from("fin_presupuesto_lineas").select("periodo, tipo_id, monto").eq("presupuesto_id", p.id).eq("escenario", escenario).eq("seccion", seccion);
    q = u.unidad ? q.eq("unidad_id", u.unidad) : q.is("unidad_id", null);
    const actuales = await q;
    if (actuales.error) return { error: actuales.error.message };
    const filas = detalleDeLineas(
      (actuales.data ?? []).map((l) => ({ escenario, periodo: String(l.periodo).slice(0, 10), unidad_id: u.unidad, seccion, tipo_id: (l.tipo_id as string | null) ?? null, monto: Number(l.monto) })),
      escenario,
      meses,
    )[seccion];
    const nuevas = editarSeccion(filas, meses, tipo, mes, monto);
    const cambios = celdasCambiadas(filas, nuevas, meses);
    if (!cambios.length) return {};
    const valorDe = (fs: FilaTipo[]) =>
      fs.filter((f) => tipo === undefined || f.tipo_id === tipo).reduce((a, f) => a + (mes ? (f.meses[mes] ?? 0) : sumaEn(f.meses, meses)), 0);

    const ahora = new Date().toISOString();
    const { error } = await supabase.from("fin_presupuesto_lineas").upsert(
      cambios.map((c) => ({
        presupuesto_id: p.id,
        escenario,
        periodo: c.periodo,
        unidad_id: u.unidad,
        seccion,
        tipo_id: c.tipo_id,
        monto: c.monto,
        origen: "manual",
        actualizado_en: ahora,
        actualizado_por: usuario.id,
      })),
      { onConflict: "presupuesto_id,escenario,periodo,unidad_id,seccion,tipo_id" },
    );
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await supabase.from("fin_presupuestos").update({ actualizado_en: ahora }).eq("id", p.id);
    await registrarAuditoria({
      accion: "editar_presupuesto",
      entidad: "fin_presupuestos",
      entidadId: p.id,
      detalle: `${p.nombre} · ${etiquetaEscenario(escenario)} · ${u.nombre} · ${nombreFila} · ${mes ? mesCorto(mes) : "total del año"}`,
      antes: { Monto: dinero(valorDe(filas)) },
      despues: { Monto: dinero(monto) },
    });
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la celda." };
  }
}

/** El total del año: hasta 1.200 millones (12 meses del tope de una celda). */
const leerNumeroAnual = (v: unknown) => leerNumero(v, -1.2e9, 1.2e9);

/** Vuelve a generar los tres escenarios desde el real con supuestos nuevos. Borra todas las líneas, también las manuales. */
export async function rehacerPresupuesto(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const supabase = createServiceClient();
    const cab = await borradorEditable(supabase, formData.get("presupuesto_id"));
    if ("error" in cab) return { error: cab.error };
    const p = cab.presupuesto;
    const generado = await generarDesdeFormulario(supabase, formData);
    if ("error" in generado) return { error: generado.error };
    if (generado.anio !== p.anio) return { error: "El año no se cambia al rehacer: crea otro presupuesto." };

    const borrado = await supabase.from("fin_presupuesto_lineas").delete().eq("presupuesto_id", p.id);
    if (borrado.error) return { error: `No se pudo rehacer: ${borrado.error.message}` };
    const fallo = await guardarLineas(supabase, p.id, generado.lineas, usuario.id);
    if (fallo) return { error: `No se pudieron guardar las líneas: ${fallo}` };
    await supabase
      .from("fin_presupuestos")
      .update({ supuestos: generado.supuestos, por_tienda: generado.porTienda, actualizado_en: new Date().toISOString() })
      .eq("id", p.id);
    const base = generado.supuestos.mesesBase;
    await registrarAuditoria({
      accion: "rehacer_presupuesto",
      entidad: "fin_presupuestos",
      entidadId: p.id,
      detalle: `${p.nombre} desde el real de ${mesCorto(base[0])} a ${mesCorto(base[base.length - 1])}${generado.porTienda ? ", por tienda" : ""}`,
    });
    revalidatePath(`/presupuesto/${p.id}`);
    revalidatePath("/presupuesto");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo rehacer el presupuesto." };
  }
}

const ACCION_ESTADO: Record<EstadoPresupuesto, string> = {
  aprobado: "aprobar_presupuesto",
  cerrado: "cerrar_presupuesto",
  borrador: "reabrir_presupuesto",
};

/** Aprobar (borrador → aprobado), cerrar (aprobado → cerrado) o volver a borrador (aprobado → borrador). */
export async function cambiarEstadoPresupuesto(id: string, estado: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!esUuid(id)) return { error: "Presupuesto inválido." };
    const destino = ESTADOS_PRESUPUESTO.find((e) => e.clave === estado);
    if (!destino) return { error: "Estado inválido." };
    const supabase = createServiceClient();
    const { data, error } = await supabase.from("fin_presupuestos").select("id, nombre, anio, estado").eq("id", id).maybeSingle();
    if (error || !data) return { error: "Presupuesto inválido." };
    const de = data.estado as EstadoPresupuesto;
    if (!puedePasar(de, destino.clave)) return { error: `Un presupuesto ${ESTADOS_PRESUPUESTO.find((e) => e.clave === de)?.etiqueta.toLowerCase()} no pasa a ${destino.etiqueta.toLowerCase()}.` };
    const ahora = new Date().toISOString();
    const cambios: Record<string, unknown> = { estado: destino.clave, actualizado_en: ahora };
    if (destino.clave === "aprobado") Object.assign(cambios, { aprobado_en: ahora, aprobado_por: usuario.id });
    if (destino.clave === "cerrado") Object.assign(cambios, { cerrado_en: ahora, cerrado_por: usuario.id });
    if (destino.clave === "borrador") Object.assign(cambios, { aprobado_en: null, aprobado_por: null });
    // Solo si sigue en el estado que se leyó (dos personas a la vez).
    const act = await supabase.from("fin_presupuestos").update(cambios).eq("id", id).eq("estado", de).select("id");
    if (act.error) return { error: act.error.message };
    if (!act.data?.length) return { error: "Otra persona cambió el estado: recarga la página." };
    await registrarAuditoria({
      accion: ACCION_ESTADO[destino.clave],
      entidad: "fin_presupuestos",
      entidadId: id,
      detalle: `${data.nombre} (${data.anio})`,
      antes: { Estado: ESTADOS_PRESUPUESTO.find((e) => e.clave === de)!.etiqueta },
      despues: { Estado: destino.etiqueta },
    });
    revalidatePath(`/presupuesto/${id}`);
    revalidatePath("/presupuesto");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cambiar el estado." };
  }
}

/** Borra un presupuesto en borrador con todas sus líneas. Lo aprobado o cerrado no se borra. */
export async function eliminarPresupuesto(id: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    const supabase = createServiceClient();
    const cab = await borradorEditable(supabase, id);
    if ("error" in cab) return { error: cab.error };
    const { error } = await supabase.from("fin_presupuestos").delete().eq("id", cab.presupuesto.id).eq("estado", "borrador");
    if (error) return { error: `No se pudo eliminar: ${error.message}` };
    await registrarAuditoria({
      accion: "eliminar_presupuesto",
      entidad: "fin_presupuestos",
      entidadId: cab.presupuesto.id,
      detalle: `${cab.presupuesto.nombre} (${cab.presupuesto.anio})`,
    });
    revalidatePath("/presupuesto");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar el presupuesto." };
  }
}
