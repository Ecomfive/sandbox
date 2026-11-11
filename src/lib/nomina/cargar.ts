// Lectura de la nómina desde Supabase (migración 0906). La comparten la página /nomina, la descarga en Excel y la
// conciliación. Solo lectura; los permisos los decide quien llama. Los documentos de identidad salen enmascarados: el
// completo solo lo pide la ficha de la persona (`obtenerPersonaNomina`).

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "../supabase/paginar";
import { enmascararDocumento } from "./documento";
import { TIPOS_SUELDO, type BaseReparto, type CostoNomina, type EerrSueldo, type MovimientoSueldo } from "./conciliacion";
import { UNIDAD_REPARTO, type TipoNomina } from "./excel";

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export interface LineaMes {
  id: string;
  personaId: string;
  nombre: string;
  /** Enmascarado. */
  documento: string;
  tipo: TipoNomina;
  periodo: string;
  tramo: string;
  unidad: string;
  cargo: string;
  moneda: "USD" | "USDT";
  salarioMensual: number | null;
  devengado: number;
  montoHorasExtra: number;
  montoFeriado: number;
  bono: number;
  descuentos: number;
  bruto: number;
  seguroSocial: number;
  seguroEducativo: number;
  neto: number;
  pagado: boolean | null;
  fechaPago: string | null;
  medioPago: string | null;
  diferencia: number;
  observacion: string | null;
}

interface FilaBase {
  id: string;
  persona_id: string;
  tipo: TipoNomina;
  periodo: string;
  tramo: string;
  unidad_id: string | null;
  cargo: string | null;
  moneda: "USD" | "USDT";
  salario_mensual: number | string | null;
  devengado: number | string;
  monto_horas_extra: number | string;
  monto_feriado: number | string;
  bono: number | string;
  descuento_tardanza: number | string;
  descuento_ausencia: number | string;
  otros_descuentos: number | string;
  total_bruto: number | string;
  seguro_social: number | string;
  seguro_educativo: number | string;
  neto: number | string;
  pagado: boolean | null;
  fecha_pago: string | null;
  medio_pago: string | null;
  diferencia_calculo: number | string;
  observacion: string | null;
  nom_personas: Uno<{ nombre: string; documento: string | null; unidad_id: string | null; cargo: string | null }>;
}

export const SIN_MIGRACION = "Falta correr la migración 0906 (Nómina) en Supabase.";

/** id → nombre de las tiendas y unidades, y cuáles son de reparto. */
export async function cargarUnidades(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("fin_unidades").select("id, nombre, clase, activo, orden").order("orden");
  if (error) return { error: error.message } as const;
  const filas = (data ?? []) as { id: string; nombre: string; clase: string; activo: boolean }[];
  return {
    nombre: new Map(filas.map((u) => [u.id, u.nombre])),
    reparto: new Set(filas.filter((u) => u.clase === "reparto").map((u) => u.nombre)),
    opciones: filas.filter((u) => u.activo && u.nombre !== "SIN ASIGNAR" && u.nombre !== "INFORMACIÓN").map((u) => ({ id: u.id, nombre: u.nombre })),
  } as const;
}

/** Los meses con nómina (de cualquier tipo), del más viejo al más nuevo, y la comisión de cada uno. */
export async function cargarMeses(supabase: SupabaseClient): Promise<{ error: string } | { meses: string[]; comision: Record<string, number> }> {
  const { data, error } = await supabase.from("nom_periodos").select("periodo, tipo, comision").order("periodo");
  if (error) return { error: SIN_MIGRACION };
  const comision: Record<string, number> = {};
  for (const p of data ?? []) {
    const k = String(p.periodo).slice(0, 10);
    comision[k] = (comision[k] ?? 0) + Number(p.comision ?? 0);
  }
  return { meses: Object.keys(comision).sort(), comision };
}

/** Las líneas de uno o varios meses, con la persona (documento enmascarado) y su tienda resuelta. */
export async function cargarLineas(
  supabase: SupabaseClient,
  meses: string[],
  nombreUnidad: Map<string, string>,
): Promise<{ error: string } | { lineas: LineaMes[] }> {
  if (!meses.length) return { lineas: [] };
  const r = await traerTodasConError<FilaBase>((desde, hasta) =>
    supabase
      .from("nom_lineas")
      .select(
        "id, persona_id, tipo, periodo, tramo, unidad_id, cargo, moneda, salario_mensual, devengado, monto_horas_extra, monto_feriado, bono, descuento_tardanza, descuento_ausencia, otros_descuentos, total_bruto, seguro_social, seguro_educativo, neto, pagado, fecha_pago, medio_pago, diferencia_calculo, observacion, nom_personas(nombre, documento, unidad_id, cargo)",
      )
      .in("periodo", meses)
      .order("periodo")
      .order("id")
      .range(desde, hasta) as unknown as PromiseLike<{ data: FilaBase[] | null; error: unknown }>,
  );
  if (r.error) return { error: SIN_MIGRACION };
  const n = (v: number | string | null) => Number(v ?? 0);
  return {
    lineas: (r.data ?? []).map((l) => {
      const p = uno(l.nom_personas);
      const unidadId = l.unidad_id ?? p?.unidad_id ?? null;
      return {
        id: l.id,
        personaId: l.persona_id,
        nombre: p?.nombre ?? "—",
        documento: enmascararDocumento(p?.documento),
        tipo: l.tipo,
        periodo: String(l.periodo).slice(0, 10),
        tramo: l.tramo,
        unidad: (unidadId && nombreUnidad.get(unidadId)) || UNIDAD_REPARTO,
        cargo: l.cargo ?? p?.cargo ?? "—",
        moneda: l.moneda,
        salarioMensual: l.salario_mensual === null ? null : n(l.salario_mensual),
        devengado: n(l.devengado),
        montoHorasExtra: n(l.monto_horas_extra),
        montoFeriado: n(l.monto_feriado),
        bono: n(l.bono),
        descuentos: Math.round((n(l.descuento_tardanza) + n(l.descuento_ausencia) + n(l.otros_descuentos)) * 100) / 100,
        bruto: n(l.total_bruto),
        seguroSocial: n(l.seguro_social),
        seguroEducativo: n(l.seguro_educativo),
        neto: n(l.neto),
        pagado: l.pagado,
        fechaPago: l.fecha_pago,
        medioPago: l.medio_pago,
        diferencia: n(l.diferencia_calculo),
        observacion: l.observacion,
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Conciliación con el libro
// ---------------------------------------------------------------------------------------------

export interface DatosConciliacion {
  costos: CostoNomina[];
  libro: MovimientoSueldo[];
  eerr: EerrSueldo[];
  base: BaseReparto[];
  comision: Record<string, number>;
  retenciones: Record<string, number>;
  reparto: Set<string>;
}

/** Nómina (vista `nom_costo_mensual`) y lo que el libro cargó como SUELDOS y OTROS SUELDOS, con la base de reparto. */
export async function cargarConciliacion(supabase: SupabaseClient): Promise<{ error: string } | DatosConciliacion> {
  const [unidades, meses, tipos] = await Promise.all([
    cargarUnidades(supabase),
    cargarMeses(supabase),
    supabase.from("fin_tipos").select("id, nombre").in("nombre", TIPOS_SUELDO),
  ]);
  if ("error" in meses) return meses;
  if ("error" in unidades || tipos.error) return { error: "Falta correr la migración 0901 (libro de movimientos) en Supabase." };
  const nombreTipo = new Map((tipos.data ?? []).map((t) => [t.id as string, String(t.nombre).toUpperCase()]));
  const ids = [...nombreTipo.keys()];
  const unidad = (id: string | null) => (id && unidades.nombre.get(id)) || UNIDAD_REPARTO;
  const vacio = Promise.resolve({ data: [], error: null });

  const [costos, libro, eerr, base] = await Promise.all([
    traerTodasConError<{ periodo: string; tipo: TipoNomina; unidad_id: string | null; neto: number | string; retenciones: number | string }>((d, h) =>
      supabase.from("nom_costo_mensual").select("periodo, tipo, unidad_id, neto, retenciones").order("periodo").order("tipo").order("unidad_id").range(d, h),
    ),
    ids.length
      ? traerTodasConError<{ periodo: string; unidad_id: string; tipo_id: string; en_eerr: boolean; monto: number | string; descripcion: string; fecha_pago: string | null }>((d, h) =>
          supabase.from("fin_movimientos").select("periodo, unidad_id, tipo_id, en_eerr, monto, descripcion, fecha_pago").in("tipo_id", ids).order("periodo").order("id").range(d, h),
        )
      : vacio,
    ids.length
      ? traerTodasConError<{ periodo: string; unidad_id: string; tipo_id: string; monto: number | string }>((d, h) =>
          supabase.from("fin_eerr_mensual").select("periodo, unidad_id, tipo_id, monto").in("tipo_id", ids).order("periodo").order("unidad_id").order("tipo_id").range(d, h),
        )
      : vacio,
    traerTodasConError<{ periodo: string; unidad_id: string; envios: number; fin_unidades: Uno<{ recibe_reparto: boolean }> }>((d, h) =>
      supabase.from("fin_base_distribucion").select("periodo, unidad_id, envios, fin_unidades(recibe_reparto)").order("periodo").order("unidad_id").range(d, h),
    ),
  ]);
  if (costos.error) return { error: SIN_MIGRACION };
  if (libro.error || eerr.error || base.error) return { error: "No se pudo leer el libro de movimientos." };
  const mes = (p: string) => String(p).slice(0, 10);
  const retenciones: Record<string, number> = {};
  for (const c of costos.data ?? []) retenciones[mes(c.periodo)] = Math.round(((retenciones[mes(c.periodo)] ?? 0) + Number(c.retenciones)) * 100) / 100;
  return {
    costos: (costos.data ?? []).map((c) => ({ periodo: mes(c.periodo), tipo: c.tipo, unidad: unidad(c.unidad_id), neto: Number(c.neto) })),
    libro: (libro.data ?? []).map((m) => ({
      periodo: mes(m.periodo),
      unidad: unidad(m.unidad_id),
      tipo: nombreTipo.get(m.tipo_id) ?? "",
      en_eerr: m.en_eerr,
      monto: Number(m.monto),
      descripcion: m.descripcion,
      fecha: m.fecha_pago,
    })),
    eerr: (eerr.data ?? []).map((e) => ({ periodo: mes(e.periodo), unidad: unidad(e.unidad_id), tipo: nombreTipo.get(e.tipo_id) ?? "", monto: Number(e.monto) })),
    base: (base.data ?? []).filter((b) => uno(b.fin_unidades)?.recibe_reparto).map((b) => ({ periodo: mes(b.periodo), unidad: unidad(b.unidad_id), envios: b.envios })),
    comision: meses.comision,
    retenciones,
    reparto: unidades.reparto,
  };
}

/** El mes anterior a «AAAA-MM-01». */
export function mesAnterior(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
}
