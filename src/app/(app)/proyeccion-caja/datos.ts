// Lo que comparten la página de la proyección y su descarga: leer los datos, elegir escenario y armar los tres.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarProyeccion, type DatosProyeccion } from "@/lib/finanzas/cargar-proyeccion";
import { ESCENARIOS, aplicarEscenario, armarProyeccion, esEscenario, indicadores, type Escenario, type Indicadores, type Proyeccion } from "@/lib/finanzas/proyeccion-caja";

import { hoyPanama } from "@/lib/af4/fecha";
export { hoyPanama };

export interface VistaProyeccion {
  datos: DatosProyeccion;
  escenario: Escenario;
  conDividendos: boolean;
  /** Los tres escenarios (con o sin dividendos, según se pidió). */
  porEscenario: Record<Escenario, Proyeccion>;
  activa: Proyeccion;
  kpis: Indicadores;
  /** La base con dividendos: la que se guarda como foto. */
  baseCompleta: Proyeccion;
}

export function leerParametros(sp: { [k: string]: string | string[] | undefined }): { escenario: Escenario; conDividendos: boolean } {
  const e = typeof sp.escenario === "string" ? sp.escenario : "base";
  return { escenario: esEscenario(e) ? e : "base", conDividendos: sp.dividendos !== "no" };
}

export async function cargarVista(supabase: SupabaseClient, escenario: Escenario, conDividendos: boolean): Promise<{ error: string } | VistaProyeccion> {
  const datos = await cargarProyeccion(supabase, hoyPanama());
  if ("error" in datos) return datos;
  const lineas = conDividendos ? datos.lineas : datos.lineas.filter((l) => l.concepto !== "dividendos");
  const porEscenario = Object.fromEntries(
    ESCENARIOS.map((e) => [e.clave, armarProyeccion(aplicarEscenario(lineas, e.clave), datos.semanas, datos.cajaHoy)]),
  ) as Record<Escenario, Proyeccion>;
  const activa = porEscenario[escenario];
  return {
    datos,
    escenario,
    conDividendos,
    porEscenario,
    activa,
    kpis: indicadores(activa, datos.config.cajaMinima),
    baseCompleta: conDividendos ? porEscenario.base : armarProyeccion(datos.lineas, datos.semanas, datos.cajaHoy),
  };
}
