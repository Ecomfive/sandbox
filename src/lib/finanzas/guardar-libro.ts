// Guarda en Supabase lo que se leyó de un libro de Excel (ver `libro-excel.ts`). Lo usan la pantalla «Importar Excel»
// del Libro de movimientos (en lotes, desde una Server Action) y el script `scripts/finanzas/importar-libro.ts`.
// Recibe el cliente de Supabase: no decide permisos (eso lo hace quien lo llama).

import type { SupabaseClient } from "@supabase/supabase-js";
import { claseDeCuenta, claveCatalogo, UNIDAD_SIN_ASIGNAR, type BaseExcel, type MovimientoExcel } from "./libro-excel";
import { reglaPara, type Regla } from "./clasificacion";
import { mesesDeMovimiento, separarPorCierre } from "./cierre";
import { ENTIDAD_BASE, MONEDA_BASE, tasaDelMes, unidadEnEntidad, type TasaMes, type UnidadCatalogo } from "./entidades";

/** Tamaño de cada lote que manda la pantalla (cabe holgado en el límite de 1 MB de una Server Action). */
export const TAMANO_LOTE = 400;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CLAVE = /^[0-9a-f]{24}#\d{1,5}$/;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

/**
 * Revisa un movimiento que llega del navegador: no se confía en nada de lo que mandó. Devuelve el movimiento limpio o
 * el motivo por el que se rechaza.
 */
export function validarMovimiento(v: unknown): { ok: true; mov: MovimientoExcel } | { ok: false; motivo: string } {
  if (!v || typeof v !== "object") return { ok: false, motivo: "fila vacía" };
  const m = v as Record<string, unknown>;
  const periodo = m.periodo;
  if (typeof periodo !== "string" || !/^\d{4}-\d{2}-01$/.test(periodo)) return { ok: false, motivo: "mes inválido" };
  const unidad = texto(m.unidad, 80)?.trim();
  if (!unidad) return { ok: false, motivo: "sin tienda" };
  const monto = Number(m.monto);
  if (!Number.isFinite(monto) || monto === 0 || Math.abs(monto) > 100_000_000) return { ok: false, motivo: "monto inválido" };
  const clave = m.origen_clave;
  if (typeof clave !== "string" || !CLAVE.test(clave)) return { ok: false, motivo: "huella inválida" };
  const fecha = (x: unknown) => (typeof x === "string" && FECHA.test(x) ? x : null);
  return {
    ok: true,
    mov: {
      fila: Number.isInteger(m.fila) ? (m.fila as number) : 0,
      periodo,
      fecha_registro: fecha(m.fecha_registro),
      unidad,
      tipo: texto(m.tipo, 120)?.trim() || null,
      estatus_gestion: texto(m.estatus_gestion, 80),
      unidad_a_pagar: texto(m.unidad_a_pagar, 80),
      descripcion: texto(m.descripcion, 500) ?? "",
      en_eerr: m.en_eerr === true,
      en_flujo: m.en_flujo === true,
      monto: Math.round(monto * 100) / 100,
      moneda: typeof m.moneda === "string" && /^[A-Z]{3}$/.test(m.moneda) ? m.moneda : MONEDA_BASE,
      fecha_servicio: fecha(m.fecha_servicio),
      fecha_pago: fecha(m.fecha_pago),
      cuenta: texto(m.cuenta, 80)?.trim() || null,
      factura: texto(m.factura, 300),
      factura_numero: texto(m.factura_numero, 80),
      ruc_proveedor: texto(m.ruc_proveedor, 40),
      es_bien_de_uso: m.es_bien_de_uso === true,
      origen_clave: clave,
    },
  };
}

/** El nombre del archivo como origen: sin la ruta ni el prefijo que agrega la subida, solo letras, números y . _ - */
export function origenDeArchivo(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? nombre;
  return base.replace(/^[0-9a-f]{8}-/, "").replace(/[^\w.\- ]/g, "").slice(0, 120) || "excel";
}

type Catalogo = Map<string, string>;

/** Las reglas activas. Sin la migración 0903 no hay reglas: la importación sigue igual. */
export async function leerReglas(supabase: SupabaseClient): Promise<Regla[]> {
  const { data, error } = await supabase.from("fin_reglas").select("id, patron, unidad_id, tipo_id, activo").eq("activo", true);
  return error ? [] : ((data ?? []) as Regla[]);
}

/** De estas huellas, las que alguien corrigió a mano en el portal (de a 100 para no alargar la dirección). */
async function editadosAMano(supabase: SupabaseClient, claves: string[]): Promise<Set<string>> {
  const editados = new Set<string>();
  for (let i = 0; i < claves.length; i += 100) {
    const { data, error } = await supabase
      .from("fin_movimientos")
      .select("origen_clave")
      .eq("editado_a_mano", true)
      .in("origen_clave", claves.slice(i, i + 100));
    if (error) return editados; // sin la migración 0903 nadie corrigió a mano
    for (const r of data ?? []) editados.add(r.origen_clave as string);
  }
  return editados;
}

async function leerCatalogo(supabase: SupabaseClient, tabla: "fin_unidades" | "fin_tipos" | "fin_cuentas"): Promise<Catalogo> {
  const { data, error } = await supabase.from(tabla).select("id, nombre");
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return new Map((data ?? []).map((r) => [claveCatalogo(r.nombre as string), r.id as string]));
}

async function asegurar(
  supabase: SupabaseClient,
  tabla: "fin_unidades" | "fin_cuentas",
  mapa: Catalogo,
  nombres: string[],
  extra: (n: string) => object,
): Promise<string[]> {
  const faltan = [...new Map(nombres.map((n) => [claveCatalogo(n), n])).values()].filter((n) => !mapa.has(claveCatalogo(n)));
  if (!faltan.length) return [];
  const { data, error } = await supabase
    .from(tabla)
    .upsert(faltan.map((n) => ({ nombre: n, ...extra(n) })), { onConflict: "nombre", ignoreDuplicates: true })
    .select("id, nombre");
  if (error) throw new Error(`${tabla}: ${error.message}`);
  for (const r of data ?? []) mapa.set(claveCatalogo(r.nombre as string), r.id as string);
  // Si otra subida las creó a la vez, `ignoreDuplicates` no las devuelve: se releen.
  if (faltan.some((n) => !mapa.has(claveCatalogo(n)))) for (const [k, v] of await leerCatalogo(supabase, tabla)) mapa.set(k, v);
  return faltan;
}

/** La entidad del libro que se importa (migración 0923). Sin ella, el libro es de Panamá en dólares, como siempre. */
export interface EntidadLibro {
  id: string;
  codigo: string;
  moneda: string;
}

/** Las unidades con su entidad y su clase, para resolver los nombres del libro de otra entidad. */
async function leerUnidadesConEntidad(supabase: SupabaseClient): Promise<UnidadCatalogo[]> {
  const { data, error } = await supabase.from("fin_unidades").select("id, nombre, clase, pais");
  if (error) throw new Error(`fin_unidades: ${error.message}`);
  return (data ?? []).map((u) => ({ nombre: u.nombre as string, entidad: (u.pais as string | null) ?? ENTIDAD_BASE, clase: (u.clase as string | null) ?? "tienda" }));
}

/**
 * En el libro de otra entidad, el nombre con que se guarda cada unidad (ver `unidadEnEntidad`) y crea las que faltan en
 * esa entidad. Devuelve el nombre del libro → el nombre guardado, y las creadas.
 */
async function resolverUnidadesDeEntidad(
  supabase: SupabaseClient,
  entidad: EntidadLibro,
  nombres: string[],
  mapa: Catalogo,
): Promise<{ nombres: Map<string, string>; nuevas: string[] }> {
  const catalogo = await leerUnidadesConEntidad(supabase);
  const resueltos = new Map<string, string>();
  const crear = new Map<string, { nombre: string; clase: string }>();
  for (const n of new Set(nombres)) {
    const r = unidadEnEntidad(n, entidad.codigo, catalogo);
    resueltos.set(n, r.nombre);
    if (r.crear && !mapa.has(claveCatalogo(r.nombre))) crear.set(claveCatalogo(r.nombre), { nombre: r.nombre, clase: r.crear.clase });
  }
  if (crear.size) {
    const { data, error } = await supabase
      .from("fin_unidades")
      .upsert(
        [...crear.values()].map((u) => ({ nombre: u.nombre, clase: u.clase, recibe_reparto: false, entidad_id: entidad.id })),
        { onConflict: "nombre", ignoreDuplicates: true },
      )
      .select("id, nombre");
    if (error) throw new Error(`fin_unidades: ${error.message}`);
    for (const r of data ?? []) mapa.set(claveCatalogo(r.nombre as string), r.id as string);
    if ([...crear.keys()].some((k) => !mapa.has(k))) for (const [k, v] of await leerCatalogo(supabase, "fin_unidades")) mapa.set(k, v);
  }
  return { nombres: resueltos, nuevas: [...crear.values()].map((u) => u.nombre) };
}

/** Las tasas de esas monedas (sin la migración 0923, ninguna). */
async function leerTasas(supabase: SupabaseClient, monedas: string[]): Promise<TasaMes[]> {
  if (!monedas.length) return [];
  const { data, error } = await supabase.from("fin_tipos_cambio_mes").select("moneda, periodo, promedio, cierre").in("moneda", monedas);
  if (error) return [];
  return (data ?? []).map((t) => ({ moneda: t.moneda as string, periodo: String(t.periodo).slice(0, 10), promedio: Number(t.promedio), cierre: Number(t.cierre) }));
}

export interface ResultadoLote {
  guardados: number;
  /** De los guardados, cuántos no estaban (el resto se actualizó). */
  nuevos?: number;
  /** Corregidos a mano en el portal: el Excel no los pisa. */
  conservados: number;
  /** Completados por una regla (tienda o tipo que faltaba). */
  porRegla: number;
  tiendasNuevas: string[];
  cuentasNuevas: string[];
  sinTipo: number;
  /** En un mes cerrado (o ya guardados en uno): no se tocan (ver Cierre de mes). */
  enMesCerrado: number;
  /** En otra moneda y sin la tasa de su mes: quedan en 0 USD y fuera del EERR hasta cargarla (migración 0923). */
  sinTasa?: number;
}

/** Los meses cerrados (migración 0914). Sin la migración no hay ninguno. */
export async function mesesCerrados(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("fin_cierres").select("periodo").eq("estado", "cerrado");
  return error ? new Set() : new Set((data ?? []).map((r) => String(r.periodo).slice(0, 10)));
}

/** De estas huellas, las que ya están guardadas en un mes cerrado (moverlas a otro mes también cambiaría el cerrado). */
async function guardadosEnMesCerrado(supabase: SupabaseClient, claves: string[], cerrados: Set<string>): Promise<Set<string>> {
  const encontrados = new Set<string>();
  if (!cerrados.size) return encontrados;
  for (let i = 0; i < claves.length; i += 100) {
    const { data, error } = await supabase
      .from("fin_movimientos")
      .select("origen_clave, periodo, fecha_pago")
      .in("origen_clave", claves.slice(i, i + 100));
    if (error) throw new Error(`fin_movimientos: ${error.message}`);
    for (const r of data ?? []) {
      const periodo = String(r.periodo).slice(0, 10);
      if (mesesDeMovimiento({ periodo, fecha_pago: r.fecha_pago as string | null }).some((m) => cerrados.has(m))) encontrados.add(r.origen_clave as string);
    }
  }
  return encontrados;
}

/**
 * Crea o actualiza (por huella) un lote de movimientos de un archivo. Crea las tiendas y formas de pago que falten.
 * Con `entidad` (el libro de otra entidad, migración 0923) las tiendas se buscan y se crean en esa entidad y un movimiento
 * en otra moneda guarda su monto en `monto_original`: la base lo pasa a dólares con la tasa del mes.
 */
export async function guardarLoteMovimientos(
  supabase: SupabaseClient,
  origen: string,
  todos: MovimientoExcel[],
  entidad: EntidadLibro | null = null,
  importacionId: string | null = null,
): Promise<ResultadoLote> {
  // Lo de un mes cerrado no se manda: la base lo rechazaría y fallaría el lote entero.
  const cerrados = await mesesCerrados(supabase);
  const yaCerrados = await guardadosEnMesCerrado(supabase, todos.map((m) => m.origen_clave), cerrados);
  const { abiertas, enCerrado } = separarPorCierre(todos, cerrados, mesesDeMovimiento);
  const movimientos = abiertas.filter((m) => !yaCerrados.has(m.origen_clave));
  const enMesCerrado = enCerrado.length + abiertas.length - movimientos.length;
  const [unidades, tipos, cuentas] = await Promise.all([
    leerCatalogo(supabase, "fin_unidades"),
    leerCatalogo(supabase, "fin_tipos"),
    leerCatalogo(supabase, "fin_cuentas"),
  ]);
  const otra = entidad && entidad.codigo !== ENTIDAD_BASE ? entidad : null;
  let nombreUnidad = (n: string) => n;
  let tiendasNuevas: string[];
  if (otra) {
    const r = await resolverUnidadesDeEntidad(supabase, otra, [...movimientos.map((m) => m.unidad), UNIDAD_SIN_ASIGNAR], unidades);
    nombreUnidad = (n) => r.nombres.get(n) ?? n;
    tiendasNuevas = r.nuevas;
  } else {
    tiendasNuevas = await asegurar(supabase, "fin_unidades", unidades, movimientos.map((m) => m.unidad), () => ({
      clase: "tienda",
      recibe_reparto: false,
    }));
  }
  const cuentasNuevas = await asegurar(
    supabase,
    "fin_cuentas",
    cuentas,
    movimientos.flatMap((m) => (m.cuenta ? [m.cuenta] : [])),
    (n) => ({ clase: claseDeCuenta(n), ...(otra ? { entidad_id: otra.id, moneda: otra.moneda } : {}) }),
  );
  const [reglas, editados] = await Promise.all([
    leerReglas(supabase),
    editadosAMano(supabase, movimientos.map((m) => m.origen_clave)),
  ]);
  const sinAsignar = unidades.get(claveCatalogo(nombreUnidad(UNIDAD_SIN_ASIGNAR))) ?? null;
  // En el libro de otra entidad, una regla solo pone una tienda de esa misma entidad.
  const deLaEntidad = otra
    ? new Set((await leerUnidadesConEntidad(supabase)).filter((u) => u.entidad === otra.codigo).map((u) => unidades.get(claveCatalogo(u.nombre))))
    : null;
  const monedas = [...new Set(movimientos.map((m) => m.moneda ?? MONEDA_BASE))].filter((x) => x !== MONEDA_BASE);
  const tasas = await leerTasas(supabase, monedas);
  let sinTasa = 0;
  let sinTipo = 0;
  let porRegla = 0;
  const ahora = new Date().toISOString();
  const aGuardar = movimientos.filter((m) => !editados.has(m.origen_clave));
  const filas = aGuardar.map((m) => {
    let unidadId = unidades.get(claveCatalogo(nombreUnidad(m.unidad)))!;
    let tipoId = m.tipo ? (tipos.get(claveCatalogo(m.tipo)) ?? null) : null;
    // Una regla solo completa lo que falta; lo que vino en el Excel se respeta.
    let reglaId: string | null = null;
    if (unidadId === sinAsignar || !tipoId) {
      const r = reglaPara(m.descripcion, reglas);
      if (r) {
        if (unidadId === sinAsignar && r.unidad_id && (!deLaEntidad || deLaEntidad.has(r.unidad_id))) unidadId = r.unidad_id;
        if (!tipoId && r.tipo_id) tipoId = r.tipo_id;
        if (unidadId !== sinAsignar || tipoId) {
          reglaId = r.id;
          porRegla++;
        }
      }
    }
    if (!tipoId) sinTipo++;
    const moneda = m.moneda ?? MONEDA_BASE;
    if (moneda !== MONEDA_BASE && tasaDelMes(tasas, moneda, m.periodo, "promedio") === null) sinTasa++;
    // En otra moneda la base calcula los dólares (disparador de la 0136); en dólares, como siempre (sin columnas nuevas).
    const montos =
      moneda !== MONEDA_BASE
        ? { moneda, monto_original: m.monto, monto: 0, tasa_usd: null }
        : otra
          ? { moneda, monto_original: null, monto: m.monto, tasa_usd: null }
          : { monto: m.monto };
    return {
      periodo: m.periodo,
      fecha_registro: m.fecha_registro,
      unidad_id: unidadId,
      tipo_id: tipoId,
      ...(reglaId ? { regla_id: reglaId } : {}),
      tipo_texto: m.tipo,
      estatus_gestion: m.estatus_gestion,
      unidad_a_pagar: m.unidad_a_pagar,
      descripcion: m.descripcion,
      en_eerr: m.en_eerr,
      en_flujo: m.en_flujo,
      ...montos,
      fecha_servicio: m.fecha_servicio,
      fecha_pago: m.fecha_pago,
      cuenta_id: m.cuenta ? (cuentas.get(claveCatalogo(m.cuenta)) ?? null) : null,
      factura: m.factura,
      factura_numero: m.factura_numero,
      ruc_proveedor: m.ruc_proveedor,
      es_bien_de_uso: m.es_bien_de_uso,
      origen,
      origen_clave: m.origen_clave,
      actualizado_en: ahora,
    };
  });
  // Cuáles ya estaban (para la bitácora y para marcar solo lo nuevo con la importación que lo creó).
  const existian = filas.length ? await clavesExistentes(supabase, filas.map((f) => f.origen_clave)) : new Set<string>();
  if (filas.length) {
    const { error } = await supabase.from("fin_movimientos").upsert(filas, { onConflict: "origen_clave" });
    if (error) throw new Error(`fin_movimientos: ${error.message}`);
  }
  const nuevas = filas.filter((f) => !existian.has(f.origen_clave)).map((f) => f.origen_clave);
  if (importacionId && nuevas.length) {
    // Sin la migración 0925 la columna no existe: se sigue sin marcar.
    for (let i = 0; i < nuevas.length; i += 100) {
      const { error } = await supabase.from("fin_movimientos").update({ importacion_id: importacionId }).in("origen_clave", nuevas.slice(i, i + 100)).is("importacion_id", null);
      if (error) break;
    }
  }
  return {
    guardados: filas.length,
    nuevos: nuevas.length,
    conservados: movimientos.length - aGuardar.length,
    porRegla,
    tiendasNuevas,
    cuentasNuevas,
    sinTipo,
    enMesCerrado,
    ...(monedas.length ? { sinTasa } : {}),
  };
}

/** De estas huellas, las que ya existen en el libro (de a 100 para no alargar la dirección). */
async function clavesExistentes(supabase: SupabaseClient, claves: string[]): Promise<Set<string>> {
  const salida = new Set<string>();
  for (let i = 0; i < claves.length; i += 100) {
    const { data, error } = await supabase.from("fin_movimientos").select("origen_clave").in("origen_clave", claves.slice(i, i + 100));
    if (error) throw new Error(`fin_movimientos: ${error.message}`);
    for (const r of data ?? []) salida.add(r.origen_clave as string);
  }
  return salida;
}

/** Las huellas de lo que ya está cargado de ese archivo (para el resumen previo y para borrar lo que ya no está). */
export async function huellasDeOrigen(supabase: SupabaseClient, origen: string): Promise<Map<string, string>> {
  const huellas = new Map<string, string>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("fin_movimientos")
      .select("id, origen_clave")
      .eq("origen", origen)
      .order("id")
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) huellas.set(r.origen_clave as string, r.id as string);
    if (!data || data.length < 1000) break;
  }
  return huellas;
}

/**
 * Cierra una importación: borra lo de ese mismo archivo que ya no vino (nunca lo cargado a mano ni de otro archivo) y
 * guarda la base de reparto. Lo de un mes cerrado no se borra ni se cambia. Devuelve cuántos movimientos borró.
 */
export async function cerrarImportacion(
  supabase: SupabaseClient,
  origen: string,
  huellasDelArchivo: Set<string>,
  todaLaBase: BaseExcel[],
  entidad: EntidadLibro | null = null,
): Promise<{ borrados: number; base: number; enMesCerrado: number }> {
  const [enBase, cerrados] = await Promise.all([huellasDeOrigen(supabase, origen), mesesCerrados(supabase)]);
  const candidatos = [...enBase].filter(([clave]) => !huellasDelArchivo.has(clave));
  const protegidos = await guardadosEnMesCerrado(supabase, candidatos.map(([clave]) => clave), cerrados);
  const sobran = candidatos.filter(([clave]) => !protegidos.has(clave)).map(([, id]) => id);
  const { abiertas: base, enCerrado: baseCerrada } = separarPorCierre(todaLaBase, cerrados, (b) => [b.periodo]);
  for (let i = 0; i < sobran.length; i += 200) {
    const { error } = await supabase.from("fin_movimientos").delete().in("id", sobran.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  if (base.length) {
    const unidades = await leerCatalogo(supabase, "fin_unidades");
    let nombreUnidad = (n: string) => n;
    if (entidad && entidad.codigo !== ENTIDAD_BASE) {
      const r = await resolverUnidadesDeEntidad(supabase, entidad, base.map((b) => b.unidad), unidades);
      nombreUnidad = (n) => r.nombres.get(n) ?? n;
    } else {
      await asegurar(supabase, "fin_unidades", unidades, base.map((b) => b.unidad), () => ({ clase: "tienda", recibe_reparto: false }));
    }
    const { error } = await supabase.from("fin_base_distribucion").upsert(
      base.map((b) => ({
        periodo: b.periodo,
        unidad_id: unidades.get(claveCatalogo(nombreUnidad(b.unidad)))!,
        envios: b.envios,
        entregados: b.entregados,
        origen,
        actualizado_en: new Date().toISOString(),
      })),
      { onConflict: "periodo,unidad_id" },
    );
    if (error) throw new Error(`fin_base_distribucion: ${error.message}`);
  }
  return { borrados: sobran.length, base: base.length, enMesCerrado: protegidos.size + baseCerrada.length };
}

/** Revisa una fila de la base de reparto que llega del navegador. */
export function validarBase(v: unknown): BaseExcel | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  if (typeof b.periodo !== "string" || !/^\d{4}-\d{2}-01$/.test(b.periodo)) return null;
  const unidad = texto(b.unidad, 80)?.trim();
  const envios = Number(b.envios);
  const entregados = Number(b.entregados ?? 0);
  if (!unidad || !Number.isInteger(envios) || envios < 0 || envios > 10_000_000) return null;
  if (!Number.isInteger(entregados) || entregados < 0) return null;
  return { periodo: b.periodo, unidad, envios, entregados };
}
