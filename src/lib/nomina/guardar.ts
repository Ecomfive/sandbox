// Guarda en Supabase lo que se leyó de un Excel de nómina (`excel.ts`). Lo usan la pantalla «Importar» (por lotes, desde
// Server Actions) y el script `scripts/finanzas/importar-nomina.ts`. Recibe el cliente: no decide permisos.
// Las validaciones son puras y tienen prueba en `guardar.test.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { claveCatalogo } from "../finanzas/libro-excel";
import { mesesCerrados } from "../finanzas/guardar-libro";
import { separarPorCierre } from "../finanzas/cierre";
import { claveNombre, type LineaExcel, type PeriodoExcel, type TipoNomina } from "./excel";

/** Líneas por lote: cada envío queda lejos del límite de 1 MB de una Server Action. */
export const TAMANO_LOTE = 400;
export const CLAVE_LINEA = /^[0-9a-f]{24}#\d{1,5}$/;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const PERIODO = /^\d{4}-\d{2}-01$/;
const MAX_MONTO = 10_000_000;

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s === "" ? null : s;
};
const fecha = (v: unknown) => (typeof v === "string" && FECHA.test(v) ? v : null);
const monto = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && Math.abs(n) <= MAX_MONTO ? Math.round(n * 100) / 100 : null;
};
const montoONulo = (v: unknown) => (v === null || v === undefined ? null : monto(v));

/** Revisa una línea que llega del navegador: no se confía en nada de lo que mandó. */
export function validarLinea(v: unknown): { ok: true; linea: LineaExcel } | { ok: false; motivo: string } {
  if (!v || typeof v !== "object") return { ok: false, motivo: "fila vacía" };
  const l = v as Record<string, unknown>;
  const tipo = l.tipo;
  if (tipo !== "formal" && tipo !== "externa") return { ok: false, motivo: "tipo inválido" };
  if (typeof l.periodo !== "string" || !PERIODO.test(l.periodo)) return { ok: false, motivo: "mes inválido" };
  const nombre = texto(l.nombre, 160);
  if (!nombre) return { ok: false, motivo: "sin nombre" };
  // La clave se vuelve a sacar del nombre: no se acepta la que mandó el navegador.
  const clave = claveNombre(nombre);
  if (!clave) return { ok: false, motivo: "sin nombre" };
  if (typeof l.origen_clave !== "string" || !CLAVE_LINEA.test(l.origen_clave)) return { ok: false, motivo: "huella inválida" };
  const importes = [
    "devengado", "horas_extra", "monto_horas_extra", "monto_feriado", "bono", "descuento_tardanza", "descuento_ausencia",
    "otros_descuentos", "total_bruto", "seguro_social", "seguro_educativo", "neto", "diferencia_calculo",
  ] as const;
  const valores = {} as Record<(typeof importes)[number], number>;
  for (const k of importes) {
    const n = monto(l[k]);
    if (n === null) return { ok: false, motivo: `${k} inválido` };
    valores[k] = n;
  }
  return {
    ok: true,
    linea: {
      hoja: texto(l.hoja, 60) ?? "",
      fila: Number.isInteger(l.fila) ? (l.fila as number) : 0,
      tipo,
      periodo: l.periodo,
      tramo: texto(l.tramo, 80) ?? "",
      clave,
      nombre,
      documento: texto(l.documento, 40),
      nacionalidad: texto(l.nacionalidad, 40),
      pais: texto(l.pais, 60),
      numero_empleado: texto(l.numero_empleado, 20),
      cargo: texto(l.cargo, 120),
      fecha_inicio: fecha(l.fecha_inicio),
      fecha_fin: fecha(l.fecha_fin),
      estatus: texto(l.estatus, 60),
      correo: texto(l.correo, 160),
      frecuencia: texto(l.frecuencia, 40),
      unidad: texto(l.unidad, 80),
      unidad_persona: texto(l.unidad_persona, 80),
      moneda: tipo === "externa" ? "USDT" : "USD",
      salario_mensual: montoONulo(l.salario_mensual),
      hora_rata: typeof l.hora_rata === "number" && Number.isFinite(l.hora_rata) && l.hora_rata >= 0 && l.hora_rata < 100_000 ? l.hora_rata : null,
      horas_trabajadas: montoONulo(l.horas_trabajadas),
      ...valores,
      pagado: typeof l.pagado === "boolean" ? l.pagado : null,
      fecha_pago: fecha(l.fecha_pago),
      medio_pago: texto(l.medio_pago, 80),
      referencia: texto(l.referencia, 120),
      origen_pago: texto(l.origen_pago, 120),
      tipo_pago: texto(l.tipo_pago, 120),
      observacion: texto(l.observacion, 500),
      origen_clave: l.origen_clave,
    },
  };
}

/** Revisa los datos de un mes (comisión y total del Excel) que llegan al cerrar la importación. */
export function validarPeriodo(v: unknown): PeriodoExcel | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (p.tipo !== "formal" && p.tipo !== "externa") return null;
  if (typeof p.periodo !== "string" || !PERIODO.test(p.periodo)) return null;
  const comision = monto(p.comision ?? 0);
  if (comision === null || comision < 0) return null;
  return {
    periodo: p.periodo,
    tipo: p.tipo,
    comision,
    total_excel: montoONulo(p.total_excel),
    suma_lineas: monto(p.suma_lineas) ?? 0,
    lineas: Number.isInteger(p.lineas) ? (p.lineas as number) : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------------------------

type Catalogo = Map<string, string>;

async function leerUnidades(supabase: SupabaseClient): Promise<Catalogo> {
  const { data, error } = await supabase.from("fin_unidades").select("id, nombre");
  if (error) throw new Error(`fin_unidades: ${error.message}`);
  return new Map((data ?? []).map((r) => [claveCatalogo(r.nombre as string), r.id as string]));
}

/** Crea las tiendas que falten (como lo hace el libro: tienda que no recibe reparto). Devuelve las nuevas. */
async function asegurarUnidades(supabase: SupabaseClient, mapa: Catalogo, nombres: string[]): Promise<string[]> {
  const faltan = [...new Map(nombres.map((n) => [claveCatalogo(n), n])).values()].filter((n) => !mapa.has(claveCatalogo(n)));
  if (!faltan.length) return [];
  const { error } = await supabase
    .from("fin_unidades")
    .upsert(faltan.map((nombre) => ({ nombre, clase: "tienda", recibe_reparto: false })), { onConflict: "nombre", ignoreDuplicates: true });
  if (error) throw new Error(`fin_unidades: ${error.message}`);
  for (const [k, v] of await leerUnidades(supabase)) mapa.set(k, v);
  return faltan;
}

interface PersonaBase {
  id: string;
  tipo: TipoNomina;
  clave: string;
  unidad_id: string | null;
  unidad_editada: boolean;
  documento: string | null;
  nacionalidad: string | null;
  pais: string | null;
  numero_empleado: string | null;
  cargo: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estatus: string | null;
  correo: string | null;
  medio_pago: string | null;
  frecuencia_pago: string | null;
  salario_mensual: number | null;
}

const COLUMNAS_PERSONA =
  "id, tipo, clave, unidad_id, unidad_editada, documento, nacionalidad, pais, numero_empleado, cargo, fecha_inicio, fecha_fin, estatus, correo, medio_pago, frecuencia_pago, salario_mensual";

/**
 * Los datos de una persona a partir de sus líneas (en orden de mes): lo último que dice el Excel, sin borrar lo que ya
 * estaba si ahora viene vacío. La tienda no se toca si alguien la cambió a mano.
 */
export function fusionarPersona(
  lineas: LineaExcel[],
  existente: Omit<PersonaBase, "id" | "tipo" | "clave"> | null,
  unidadId: (nombre: string | null) => string | null,
) {
  const ultimo = <K extends keyof LineaExcel>(k: K): LineaExcel[K] | null => {
    for (let i = lineas.length - 1; i >= 0; i--) if (lineas[i][k] !== null && lineas[i][k] !== "") return lineas[i][k];
    return null;
  };
  const primero = <K extends keyof LineaExcel>(k: K): LineaExcel[K] | null => lineas.find((l) => l[k] !== null)?.[k] ?? null;
  const u = lineas[lineas.length - 1];
  const editada = existente?.unidad_editada ?? false;
  return {
    tipo: u.tipo,
    clave: u.clave,
    nombre: u.nombre,
    documento: ultimo("documento") ?? existente?.documento ?? null,
    nacionalidad: ultimo("nacionalidad") ?? existente?.nacionalidad ?? null,
    pais: ultimo("pais") ?? existente?.pais ?? null,
    numero_empleado: ultimo("numero_empleado") ?? existente?.numero_empleado ?? null,
    cargo: ultimo("cargo") ?? existente?.cargo ?? null,
    fecha_inicio: existente?.fecha_inicio ?? primero("fecha_inicio"),
    fecha_fin: ultimo("fecha_fin") ?? existente?.fecha_fin ?? null,
    estatus: ultimo("estatus") ?? existente?.estatus ?? null,
    correo: ultimo("correo") ?? existente?.correo ?? null,
    medio_pago: ultimo("medio_pago") ?? existente?.medio_pago ?? null,
    frecuencia_pago: ultimo("frecuencia") ?? existente?.frecuencia_pago ?? null,
    salario_mensual: ultimo("salario_mensual") ?? existente?.salario_mensual ?? null,
    unidad_id: editada ? (existente?.unidad_id ?? null) : (unidadId(u.unidad_persona) ?? existente?.unidad_id ?? null),
    unidad_editada: editada,
  };
}

export interface ResultadoLote {
  guardados: number;
  /** Líneas corregidas a mano en el portal: el Excel no las pisa. */
  conservados: number;
  personasNuevas: number;
  tiendasNuevas: string[];
  /** De un mes cerrado: no se tocan (ver Finanzas › Cierre de mes). */
  enMesCerrado: number;
}

/** Crea o actualiza (por huella) un lote de líneas: los meses, las personas y las tiendas que falten. */
export async function guardarLoteNomina(supabase: SupabaseClient, origen: string, todas: LineaExcel[]): Promise<ResultadoLote> {
  // Lo de un mes cerrado no se manda: la base lo rechazaría y fallaría el lote entero.
  const { abiertas: lineas, enCerrado } = separarPorCierre(todas, await mesesCerrados(supabase), (l) => [l.periodo]);
  if (!lineas.length) return { guardados: 0, conservados: 0, personasNuevas: 0, tiendasNuevas: [], enMesCerrado: enCerrado.length };
  const ordenadas = [...lineas].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const unidades = await leerUnidades(supabase);
  const tiendasNuevas = await asegurarUnidades(
    supabase,
    unidades,
    ordenadas.flatMap((l) => [l.unidad, l.unidad_persona]).filter((n): n is string => Boolean(n)),
  );
  const unidadId = (n: string | null) => (n ? (unidades.get(claveCatalogo(n)) ?? null) : null);

  // Meses
  const meses = [...new Map(ordenadas.map((l) => [`${l.periodo}|${l.tipo}`, { periodo: l.periodo, tipo: l.tipo }])).values()];
  const { error: errPeriodos } = await supabase.from("nom_periodos").upsert(meses, { onConflict: "periodo,tipo", ignoreDuplicates: true });
  if (errPeriodos) throw new Error(`nom_periodos: ${errPeriodos.message}`);
  const { data: filasPeriodos, error: errLeer } = await supabase
    .from("nom_periodos")
    .select("id, periodo, tipo")
    .in("periodo", [...new Set(meses.map((m) => m.periodo))]);
  if (errLeer) throw new Error(`nom_periodos: ${errLeer.message}`);
  const periodoId = new Map((filasPeriodos ?? []).map((p) => [`${String(p.periodo).slice(0, 10)}|${p.tipo}`, p.id as string]));

  // Personas
  const porPersona = new Map<string, LineaExcel[]>();
  for (const l of ordenadas) {
    const k = `${l.tipo}|${l.clave}`;
    porPersona.set(k, [...(porPersona.get(k) ?? []), l]);
  }
  const existentes = new Map<string, PersonaBase>();
  const claves = [...new Set(ordenadas.map((l) => l.clave))];
  for (let i = 0; i < claves.length; i += 100) {
    const { data, error } = await supabase.from("nom_personas").select(COLUMNAS_PERSONA).in("clave", claves.slice(i, i + 100));
    if (error) throw new Error(`nom_personas: ${error.message}`);
    for (const p of (data ?? []) as PersonaBase[]) existentes.set(`${p.tipo}|${p.clave}`, p);
  }
  const ahora = new Date().toISOString();
  const personas = [...porPersona].map(([k, ls]) => ({ ...fusionarPersona(ls, existentes.get(k) ?? null, unidadId), actualizado_en: ahora }));
  const { data: guardadas, error: errPersonas } = await supabase
    .from("nom_personas")
    .upsert(personas, { onConflict: "tipo,clave" })
    .select("id, tipo, clave");
  if (errPersonas) throw new Error(`nom_personas: ${errPersonas.message}`);
  const personaId = new Map((guardadas ?? []).map((p) => [`${p.tipo}|${p.clave}`, p.id as string]));

  // Líneas (las corregidas a mano se dejan como están)
  const editadas = new Set<string>();
  const huellas = ordenadas.map((l) => l.origen_clave);
  for (let i = 0; i < huellas.length; i += 100) {
    const { data, error } = await supabase
      .from("nom_lineas")
      .select("origen_clave")
      .eq("editado_a_mano", true)
      .in("origen_clave", huellas.slice(i, i + 100));
    if (error) throw new Error(`nom_lineas: ${error.message}`);
    for (const r of data ?? []) editadas.add(r.origen_clave as string);
  }
  const filas = ordenadas
    .filter((l) => !editadas.has(l.origen_clave))
    .map((l) => ({
      periodo_id: periodoId.get(`${l.periodo}|${l.tipo}`)!,
      persona_id: personaId.get(`${l.tipo}|${l.clave}`)!,
      periodo: l.periodo,
      tipo: l.tipo,
      tramo: l.tramo,
      unidad_id: unidadId(l.unidad),
      cargo: l.cargo,
      estatus: l.estatus,
      frecuencia: l.frecuencia,
      moneda: l.moneda,
      salario_mensual: l.salario_mensual,
      hora_rata: l.hora_rata,
      horas_trabajadas: l.horas_trabajadas,
      devengado: l.devengado,
      horas_extra: l.horas_extra,
      monto_horas_extra: l.monto_horas_extra,
      monto_feriado: l.monto_feriado,
      bono: l.bono,
      descuento_tardanza: l.descuento_tardanza,
      descuento_ausencia: l.descuento_ausencia,
      otros_descuentos: l.otros_descuentos,
      total_bruto: l.total_bruto,
      seguro_social: l.seguro_social,
      seguro_educativo: l.seguro_educativo,
      neto: l.neto,
      pagado: l.pagado,
      fecha_pago: l.fecha_pago,
      medio_pago: l.medio_pago,
      referencia: l.referencia,
      origen_pago: l.origen_pago,
      tipo_pago: l.tipo_pago,
      observacion: l.observacion,
      diferencia_calculo: l.diferencia_calculo,
      origen,
      origen_clave: l.origen_clave,
      actualizado_en: ahora,
    }));
  if (filas.some((f) => !f.periodo_id || !f.persona_id)) throw new Error("No se pudo ubicar el mes o la persona de alguna línea.");
  if (filas.length) {
    const { error } = await supabase.from("nom_lineas").upsert(filas, { onConflict: "origen_clave" });
    if (error) throw new Error(`nom_lineas: ${error.message}`);
  }
  return {
    guardados: filas.length,
    conservados: ordenadas.length - filas.length,
    personasNuevas: [...porPersona.keys()].filter((k) => !existentes.has(k)).length,
    tiendasNuevas,
    enMesCerrado: enCerrado.length,
  };
}

/** Las huellas de lo que ya está cargado de ese archivo (para el resumen previo y para borrar lo que ya no viene). */
export async function huellasDeOrigen(supabase: SupabaseClient, origen: string): Promise<Map<string, { id: string; editada: boolean; periodo: string }>> {
  const huellas = new Map<string, { id: string; editada: boolean; periodo: string }>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("nom_lineas")
      .select("id, origen_clave, editado_a_mano, periodo")
      .eq("origen", origen)
      .order("id")
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) huellas.set(r.origen_clave as string, { id: r.id as string, editada: Boolean(r.editado_a_mano), periodo: String(r.periodo).slice(0, 10) });
    if (!data || data.length < 1000) break;
  }
  return huellas;
}

/**
 * Cierra una importación: borra las líneas de ese mismo archivo que ya no vinieron (nunca las corregidas a mano ni las
 * de otro archivo) y guarda por mes la comisión y el total del Excel. Lo de un mes cerrado no se toca.
 */
export async function cerrarImportacionNomina(
  supabase: SupabaseClient,
  origen: string,
  delArchivo: Set<string>,
  todosLosPeriodos: PeriodoExcel[],
): Promise<{ borrados: number; meses: number; enMesCerrado: number }> {
  const [enBase, cerrados] = await Promise.all([huellasDeOrigen(supabase, origen), mesesCerrados(supabase)]);
  const candidatas = [...enBase].filter(([clave, x]) => !delArchivo.has(clave) && !x.editada).map(([, x]) => x);
  const { abiertas: aBorrar, enCerrado: protegidas } = separarPorCierre(candidatas, cerrados, (x) => [x.periodo]);
  const sobran = aBorrar.map((x) => x.id);
  const { abiertas: periodos, enCerrado: periodosCerrados } = separarPorCierre(todosLosPeriodos, cerrados, (p) => [p.periodo]);
  for (let i = 0; i < sobran.length; i += 200) {
    const { error } = await supabase.from("nom_lineas").delete().in("id", sobran.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  if (periodos.length) {
    const ahora = new Date().toISOString();
    const { error } = await supabase.from("nom_periodos").upsert(
      periodos.map((p) => ({ periodo: p.periodo, tipo: p.tipo, comision: p.comision, total_excel: p.total_excel, origen, actualizado_en: ahora })),
      { onConflict: "periodo,tipo" },
    );
    if (error) throw new Error(`nom_periodos: ${error.message}`);
  }
  return { borrados: sobran.length, meses: periodos.length, enMesCerrado: protegidas.length + periodosCerrados.length };
}
