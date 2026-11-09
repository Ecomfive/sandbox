// Lectura de la Distribución de utilidades desde Supabase: la utilidad por tienda (vista `fin_eerr_mensual`, la misma del
// Estado de resultados), los socios y sus porcentajes y los retiros de dividendos del libro (migración 0904). Solo
// lectura; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { rangoMeses } from "./flujo";
import type { FilaResultado, Participacion, Retiro, Socio } from "./utilidades";

export interface UnidadUtilidad {
  id: string;
  nombre: string;
  clase: string;
  orden: number;
}

export interface DatosUtilidades {
  filas: FilaResultado[];
  unidades: UnidadUtilidad[];
  socios: (Socio & { activo: boolean })[];
  participaciones: (Participacion & { id: string })[];
  retiros: (Retiro & { cuenta: string | null; tipo: string })[];
  disponibles: string[];
}

interface FilaVista {
  periodo: string;
  unidad_id: string;
  tipo_id: string;
  efecto_resultado: number | string;
}

interface FilaRetiro {
  id: string;
  periodo: string;
  unidad_id: string;
  descripcion: string;
  monto: number | string;
  tipo_id: string;
  cuenta_id: string | null;
}

export async function cargarUtilidades(supabase: SupabaseClient): Promise<{ error: string } | DatosUtilidades> {
  const [tipos, unidades, socios, participaciones, manuales, cuentas] = await Promise.all([
    supabase.from("fin_tipos").select("id, nombre"),
    supabase.from("fin_unidades").select("id, nombre, clase, orden").order("orden"),
    supabase.from("fin_socios").select("id, nombre, alias, activo, orden").order("orden"),
    supabase.from("fin_participaciones").select("id, socio_id, unidad_id, porcentaje, vigente_desde").order("vigente_desde"),
    supabase.from("fin_retiros_socio").select("movimiento_id, socio_id"),
    supabase.from("fin_cuentas").select("id, nombre"),
  ]);
  if (socios.error || participaciones.error || manuales.error) {
    return { error: "Falta correr la migración 0904 (distribución de utilidades) en Supabase." };
  }
  if (tipos.error || unidades.error || cuentas.error) return { error: "No se pudieron leer los catálogos del libro." };
  const nombreTipo = new Map((tipos.data ?? []).map((t) => [t.id as string, t.nombre as string]));
  const idsDividendos = (tipos.data ?? []).filter((t) => /dividendo/i.test(t.nombre as string)).map((t) => t.id as string);

  const [vista, movs] = await Promise.all([
    traerTodasConError<FilaVista>((desde, hasta) =>
      supabase
        .from("fin_eerr_mensual")
        .select("periodo, unidad_id, tipo_id, efecto_resultado")
        .order("periodo")
        .order("unidad_id")
        .order("tipo_id")
        .range(desde, hasta),
    ),
    idsDividendos.length
      ? traerTodasConError<FilaRetiro>((desde, hasta) =>
          supabase
            .from("fin_movimientos")
            .select("id, periodo, unidad_id, descripcion, monto, tipo_id, cuenta_id")
            .in("tipo_id", idsDividendos)
            // Como la hoja EERR: los retiros que entran al EERR («EERR = SI»).
            .eq("en_eerr", true)
            .order("periodo")
            .order("id")
            .range(desde, hasta),
        )
      : Promise.resolve({ data: [] as FilaRetiro[], error: null }),
  ]);
  if (vista.error || movs.error) return { error: "No se pudo leer el libro." };

  const filas: FilaResultado[] = (vista.data ?? []).map((f) => ({
    periodo: String(f.periodo).slice(0, 10),
    unidad_id: f.unidad_id,
    tipo: nombreTipo.get(f.tipo_id) ?? "—",
    efecto: Number(f.efecto_resultado),
  }));
  const manual = new Map((manuales.data ?? []).map((m) => [m.movimiento_id as string, m.socio_id as string]));
  const nombreCuenta = new Map((cuentas.data ?? []).map((c) => [c.id as string, c.nombre as string]));
  const retiros = (movs.data ?? []).map((m) => ({
    id: m.id,
    periodo: String(m.periodo).slice(0, 10),
    unidad_id: m.unidad_id,
    descripcion: m.descripcion ?? "",
    monto: Number(m.monto),
    socio_manual: manual.get(m.id) ?? null,
    cuenta: m.cuenta_id ? (nombreCuenta.get(m.cuenta_id) ?? null) : null,
    tipo: nombreTipo.get(m.tipo_id) ?? "—",
  }));
  const meses = [...filas.map((f) => f.periodo), ...retiros.map((r) => r.periodo)].sort();
  return {
    filas,
    unidades: (unidades.data ?? []) as UnidadUtilidad[],
    socios: (socios.data ?? []).map((s) => ({
      id: s.id as string,
      nombre: s.nombre as string,
      alias: (s.alias as string[] | null) ?? [],
      activo: s.activo as boolean,
    })),
    participaciones: (participaciones.data ?? []).map((p) => ({
      id: p.id as string,
      socio_id: p.socio_id as string,
      unidad_id: p.unidad_id as string,
      porcentaje: Number(p.porcentaje),
      vigente_desde: String(p.vigente_desde).slice(0, 10),
    })),
    retiros,
    disponibles: meses.length ? rangoMeses(meses[0], meses[meses.length - 1]) : [],
  };
}
