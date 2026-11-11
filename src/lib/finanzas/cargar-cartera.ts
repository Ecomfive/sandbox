// Lee una cartera (por cobrar o por pagar) con sus abonos y la deja lista para la página: filas serializables con
// saldo, estado, antigüedad y vencimiento ya calculados (`cxc-cxp.ts`). Solo lectura; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import {
  abonadoDe,
  antiguedad,
  diasVencido,
  estadoDe,
  estaVencido,
  saldoDe,
  tramoDe,
  vencimientoEfectivo,
  type Clase,
  type Estado,
  type EstadoManual,
  type Tramo,
} from "./cxc-cxp";

export interface AbonoFila {
  id: string;
  fecha: string | null;
  monto: number;
  metodo: string | null;
  referencia: string | null;
  cuenta: string | null;
  notas: string | null;
  origen: "manual" | "excel";
}

export interface FilaCartera {
  id: string;
  documento: string;
  contraparte: string;
  unidad: string;
  unidadId: string | null;
  fecha: string | null;
  vencimiento: string | null;
  vence: string | null;
  motivo: string;
  monto: number;
  abonado: number;
  saldo: number;
  estado: Estado;
  estadoManual: EstadoManual | null;
  motivoEstado: string | null;
  dias: number | null;
  tramo: Tramo;
  vencido: boolean;
  diasVencido: number;
  notas: string;
  notasExcel: string | null;
  origen: "manual" | "excel";
  origenArchivo: string | null;
  origenHoja: string | null;
  abonos: AbonoFila[];
}

export interface Opcion {
  id: string;
  nombre: string;
}

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

interface DocBase {
  id: string;
  documento: string | null;
  contraparte: string;
  unidad_id: string | null;
  fecha: string | null;
  vencimiento: string | null;
  motivo: string | null;
  monto: number | string;
  estado_manual: EstadoManual | null;
  motivo_estado: string | null;
  notas: string | null;
  notas_excel: string | null;
  origen: "manual" | "excel";
  origen_archivo: string | null;
  origen_hoja: string | null;
  fin_unidades: Uno<{ nombre: string }>;
  fin_cartera_abonos: {
    id: string;
    fecha: string | null;
    monto: number | string;
    metodo: string | null;
    referencia: string | null;
    notas: string | null;
    origen: "manual" | "excel";
    fin_cuentas: Uno<{ nombre: string }>;
  }[] | null;
}

export type DatosCartera = { error: string } | { filas: FilaCartera[]; unidades: Opcion[]; cuentas: Opcion[]; contrapartes: string[] };

export async function cargarCartera(supabase: SupabaseClient, clase: Clase, hoy: string): Promise<DatosCartera> {
  const [docs, unidades, cuentas] = await Promise.all([
    traerTodasConError<DocBase>((desde, hasta) =>
      supabase
        .from("fin_cartera")
        .select(
          "id, documento, contraparte, unidad_id, fecha, vencimiento, motivo, monto, estado_manual, motivo_estado, notas, notas_excel, origen, origen_archivo, origen_hoja, fin_unidades(nombre), fin_cartera_abonos(id, fecha, monto, metodo, referencia, notas, origen, fin_cuentas(nombre))",
        )
        .eq("clase", clase)
        .order("fecha", { ascending: false, nullsFirst: false })
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<{ data: DocBase[] | null; error: unknown }>,
    ),
    supabase.from("fin_unidades").select("id, nombre").eq("activo", true).neq("nombre", "SIN ASIGNAR").order("orden"),
    supabase.from("fin_cuentas").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  if (docs.error) return { error: "Falta correr la migración 0905 (cuentas por cobrar y por pagar) en Supabase." };

  const filas: FilaCartera[] = (docs.data ?? []).map((d) => {
    const abonos: AbonoFila[] = (d.fin_cartera_abonos ?? [])
      .map((a) => ({
        id: a.id,
        fecha: a.fecha,
        monto: Number(a.monto),
        metodo: a.metodo,
        referencia: a.referencia,
        cuenta: uno(a.fin_cuentas)?.nombre ?? null,
        notas: a.notas,
        origen: a.origen,
      }))
      .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
    const base = { monto: Number(d.monto), fecha: d.fecha, vencimiento: d.vencimiento, estado_manual: d.estado_manual, abonos };
    const dias = antiguedad(d.fecha, hoy);
    return {
      id: d.id,
      documento: d.documento ?? "",
      contraparte: d.contraparte,
      unidad: uno(d.fin_unidades)?.nombre ?? "Sin tienda",
      unidadId: d.unidad_id,
      fecha: d.fecha,
      vencimiento: d.vencimiento,
      vence: vencimientoEfectivo(base),
      motivo: d.motivo ?? "",
      monto: base.monto,
      abonado: abonadoDe(base),
      saldo: saldoDe(base),
      estado: estadoDe(base),
      estadoManual: d.estado_manual,
      motivoEstado: d.motivo_estado,
      dias,
      tramo: tramoDe(dias),
      vencido: estaVencido(base, hoy),
      diasVencido: diasVencido(base, hoy),
      notas: d.notas ?? "",
      notasExcel: d.notas_excel,
      origen: d.origen,
      origenArchivo: d.origen_archivo,
      origenHoja: d.origen_hoja,
      abonos,
    };
  });
  const contrapartes = [...new Set(filas.map((f) => f.contraparte))].sort((a, b) => a.localeCompare(b));
  return { filas, unidades: (unidades.data ?? []) as Opcion[], cuentas: (cuentas.data ?? []) as Opcion[], contrapartes };
}
