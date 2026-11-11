// Lectura de Tesorería › Optimizar deuda, Refinanciamiento, Covenants y Capital para crecer (migración 0946 y lo que ya
// existe: deuda, proyección de caja, balance y EERR). Solo lectura; los permisos los decide quien llama. La lógica está en
// `optimizar-deuda.ts`, `covenants.ts` y `capital-crecimiento.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { inicioDeMes } from "@/lib/af4/fecha";
import { armarBalance } from "./balance";
import { cargarBalance } from "./cargar-balance";
import { cargarEerr } from "./cargar-eerr";
import { cargarProyeccion } from "./cargar-proyeccion";
import { mesesCerrados } from "./cargar-paquete-bancario";
import { cargarDeuda, type DeudaTesoreria } from "./cargar-tesoreria";
import { esAmbitoCovenant, esIndicadorCovenant, mesCovenant, type Covenant, type MesCovenant } from "./covenants";
import { armarEerr } from "./eerr";
import { cajaDisponibleDeProyeccion, esRefDeuda, instrumentosDeDeuda, type Instrumento, type OfertaRefinanciamiento } from "./optimizar-deuda";
import { corteSugerido, mesesHasta } from "./paquete-bancario";
import { armarProyeccion } from "./proyeccion-caja";

export const SIN_MIGRACION_0946 = "Falta correr la migración 0946 (optimización de deuda) en Supabase.";

const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

export interface BaseDeuda {
  deuda: DeudaTesoreria;
  instrumentos: Instrumento[];
}

/** La deuda vigente como instrumentos (null sin la migración 0932). */
export async function cargarBaseDeuda(supabase: SupabaseClient, hoy: string): Promise<BaseDeuda | null> {
  const deuda = await cargarDeuda(supabase);
  if (!deuda) return null;
  return { deuda, instrumentos: instrumentosDeDeuda(deuda, hoy) };
}

export interface CajaDisponible {
  /** Lo que se puede usar sin bajar de la caja mínima en ninguna semana de la proyección. */
  disponible: number;
  cajaHoy: number;
  cajaMinima: number;
  /** La caja final más baja de las 13 semanas. */
  minimo: number;
  semanas: string[];
  cajaFinal: number[];
}

/** La caja disponible según la proyección base de 13 semanas (error si la proyección no se puede armar). */
export async function cargarCajaDisponible(supabase: SupabaseClient, hoy: string): Promise<CajaDisponible | { error: string }> {
  const datos = await cargarProyeccion(supabase, hoy);
  if ("error" in datos) return { error: datos.error };
  const p = armarProyeccion(datos.lineas, datos.semanas, datos.cajaHoy);
  const minimo = p.cajaFinal.length ? Math.min(p.cajaInicial, ...p.cajaFinal) : p.cajaInicial;
  return {
    disponible: cajaDisponibleDeProyeccion(p.cajaFinal, p.cajaInicial, datos.config.cajaMinima),
    cajaHoy: datos.cajaHoy,
    cajaMinima: datos.config.cajaMinima,
    minimo: Math.round(minimo * 100) / 100,
    semanas: datos.semanas,
    cajaFinal: p.cajaFinal,
  };
}

export async function cargarOfertas(supabase: SupabaseClient): Promise<{ ofertas: (OfertaRefinanciamiento & { nota: string | null })[]; sinMigracion: boolean }> {
  const { data, error } = await supabase
    .from("fin_ofertas_refinanciamiento")
    .select("id, banco, nombre, monto, plazo_meses, tasa_anual, comision_apertura, gracia_meses, garantias, fecha_desembolso, sustituye, nota")
    .eq("activo", true)
    .order("creado_en");
  if (error) return { ofertas: [], sinMigracion: true };
  return {
    sinMigracion: false,
    ofertas: (data ?? []).map((x) => ({
      id: String(x.id),
      banco: String(x.banco),
      nombre: String(x.nombre),
      monto: n(x.monto),
      plazoMeses: Number(x.plazo_meses),
      tasaAnual: n(x.tasa_anual),
      comisionApertura: n(x.comision_apertura),
      graciaMeses: Number(x.gracia_meses ?? 0),
      garantias: (x.garantias as string | null) ?? null,
      fechaDesembolso: String(x.fecha_desembolso).slice(0, 10),
      sustituye: ((x.sustituye as string[] | null) ?? []).filter(esRefDeuda),
      nota: (x.nota as string | null) ?? null,
    })),
  };
}

export async function cargarCovenants(supabase: SupabaseClient): Promise<{ covenants: Covenant[]; sinMigracion: boolean }> {
  const { data, error } = await supabase.from("fin_covenants").select("id, ambito, ref_id, indicador, umbral, nota").eq("activo", true).order("creado_en");
  if (error) return { covenants: [], sinMigracion: true };
  return {
    sinMigracion: false,
    covenants: (data ?? [])
      .filter((x) => esAmbitoCovenant(x.ambito) && esIndicadorCovenant(x.indicador))
      .map((x) => ({ id: String(x.id), ambito: x.ambito, refId: (x.ref_id as string | null) ?? null, indicador: x.indicador, umbral: n(x.umbral), nota: (x.nota as string | null) ?? null })),
  };
}

export interface BaseCovenants {
  /** Los últimos cortes cerrados, del más viejo al más nuevo. */
  meses: MesCovenant[];
  corte: string;
  avisos: string[];
}

/**
 * Los indicadores de los últimos `cortes` meses (el último es el corte sugerido del paquete bancario: el último mes cerrado
 * antes del mes en curso), consolidados: EERR de 12 meses de cada corte y balance de cada fin de mes.
 */
export async function cargarBaseCovenants(supabase: SupabaseClient, hoy: string, cortes = 6): Promise<BaseCovenants | { error: string }> {
  const mesEnCurso = inicioDeMes(hoy);
  const cerrados = await mesesCerrados(supabase);
  const corte = corteSugerido(mesEnCurso, cerrados);
  const lista = mesesHasta(corte, cortes);
  const ventana = mesesHasta(corte, cortes + 11);
  const [balanceR, eerrR] = await Promise.all([cargarBalance(supabase, lista, null, mesEnCurso), cargarEerr(supabase, null, ventana)]);
  if ("error" in balanceR) return { error: balanceR.error };
  if ("error" in eerrR) return { error: "No se pudo leer el Estado de resultados (migración 0901)." };
  const b = armarBalance(lista, balanceR.insumos);
  const meses = lista
    .map((m, k) => {
      const insumos = balanceR.insumos[m];
      if (!insumos) return null;
      const doce = mesesHasta(m, 12);
      return mesCovenant(m, armarEerr(eerrR.filas, doce), doce.filter((x) => eerrR.conDatos.has(x)).length, insumos, b.patrimonio[k] ?? null);
    })
    .filter((x): x is MesCovenant => x !== null);
  if (!meses.length) return { error: "No hay balance para los últimos meses." };
  return { meses, corte, avisos: balanceR.avisos };
}
