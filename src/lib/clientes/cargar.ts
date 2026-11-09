// Lectura de Clientes y marketing desde Supabase (migración 0920). La comparten las páginas de /clientes-marketing y la
// descarga en Excel. Solo lectura y sin datos personales; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { CalidadTelefono, TipoLlave } from "./identidad";
import type { Cohorte, FilaFrecuencia, GastoMarketing, Plataforma, PuntoCurva, ResumenMes } from "./metricas";

const num = (v: unknown) => Number(v ?? 0) || 0;
const dia = (v: unknown) => String(v).slice(0, 10);

export interface Tienda {
  id: string;
  nombre: string;
}

export interface Calidad {
  ordenesPorCalidad: Record<CalidadTelefono, number>;
  clientesPorTipo: Record<TipoLlave, number>;
  /** Clientes con al menos una entrega, por tipo de llave. */
  compradoresPorTipo: Record<TipoLlave, number>;
  /** Órdenes que todavía no tienen cliente (importadas después del último recálculo). */
  ordenesSinCliente: number;
}

export interface DatosClientes {
  /** Las tiendas con órdenes. */
  tiendas: Tienda[];
  /** Nombre de cada unidad del libro (también las que solo tienen gasto, como la corporativa). */
  nombresUnidades: Record<string, string>;
  resumen: ResumenMes[];
  cohortes: Cohorte[];
  curva: PuntoCurva[];
  frecuencia: FilaFrecuencia[];
  marketing: GastoMarketing[];
  mesesLibro: Set<string>;
  calidad: Calidad;
  /** Fecha de la última orden: el corte de la madurez de las cohortes. */
  corte: string | null;
}

async function rpcTodas<T>(supabase: SupabaseClient, fn: string): Promise<{ data: T[] | null; error: unknown }> {
  return traerTodasConError<T>((d, h) => supabase.rpc(fn).range(d, h));
}

export async function cargarClientes(supabase: SupabaseClient): Promise<DatosClientes | { error: string }> {
  const [unidades, resumen, cohortes, curva, frec, mkt, libro, calidad, corte] = await Promise.all([
    supabase.from("fin_unidades").select("id, nombre, orden").order("orden"),
    rpcTodas<Record<string, unknown>>(supabase, "cli_resumen_mensual"),
    rpcTodas<Record<string, unknown>>(supabase, "cli_cohortes"),
    rpcTodas<Record<string, unknown>>(supabase, "cli_curva_cohortes"),
    rpcTodas<Record<string, unknown>>(supabase, "cli_frecuencia"),
    traerTodasConError<Record<string, unknown>>((d, h) =>
      supabase.from("cli_marketing_mensual").select("periodo, unidad_id, plataforma, gasto").order("periodo").order("unidad_id").order("plataforma").range(d, h),
    ),
    supabase.rpc("cli_meses_libro"),
    supabase.rpc("cli_calidad"),
    supabase.from("ven_ordenes").select("fecha").order("fecha", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (resumen.error || cohortes.error || curva.error || frec.error || mkt.error || libro.error || calidad.error || unidades.error) {
    return { error: "Falta correr la migración 0920 (clientes y marketing) en Supabase." };
  }

  const conOrdenes = new Set((resumen.data ?? []).map((r) => String(r.ambito)));
  const tiendas = ((unidades.data ?? []) as { id: string; nombre: string }[])
    .filter((u) => conOrdenes.has(u.id))
    .map((u) => ({ id: u.id, nombre: u.nombre }));

  const c: Calidad = {
    ordenesPorCalidad: { movil: 0, fijo: 0, invalido: 0, sospechoso: 0, sin_dato: 0 },
    clientesPorTipo: { telefono: 0, correo: 0, orden: 0 },
    compradoresPorTipo: { telefono: 0, correo: 0, orden: 0 },
    ordenesSinCliente: 0,
  };
  for (const f of (calidad.data ?? []) as { grupo: string; clave: string; n: number }[]) {
    if (f.grupo === "calidad") c.ordenesPorCalidad[f.clave as CalidadTelefono] = num(f.n);
    else if (f.grupo === "tipo") c.clientesPorTipo[f.clave as TipoLlave] = num(f.n);
    else if (f.grupo === "tipo_con_entrega") c.compradoresPorTipo[f.clave as TipoLlave] = num(f.n);
    else if (f.grupo === "sin_cliente") c.ordenesSinCliente = num(f.n);
  }

  return {
    tiendas,
    nombresUnidades: Object.fromEntries(((unidades.data ?? []) as { id: string; nombre: string }[]).map((u) => [u.id, u.nombre])),
    resumen: (resumen.data ?? []).map((r) => ({
      ambito: String(r.ambito),
      periodo: dia(r.periodo),
      ordenes: num(r.ordenes),
      entregadas: num(r.entregadas),
      ordenes_sin_cliente: num(r.ordenes_sin_cliente),
      compradores: num(r.compradores),
      nuevos: num(r.nuevos),
      recurrentes: num(r.recurrentes),
      ventas: num(r.ventas),
      costo_mercancia: num(r.costo_mercancia),
      costo_envio: num(r.costo_envio),
      margen: num(r.margen),
    })),
    cohortes: (cohortes.data ?? []).map((r) => {
      const x = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "ambito" ? String(v) : k === "cohorte" ? dia(v) : num(v)]));
      return x as unknown as Cohorte;
    }),
    curva: (curva.data ?? []).map((r) => ({
      ambito: String(r.ambito),
      cohorte: dia(r.cohorte),
      mes: num(r.mes),
      activos: num(r.activos),
      margen: num(r.margen),
      completo: r.completo === true,
    })),
    frecuencia: (frec.data ?? []).map((r) => ({
      ambito: String(r.ambito),
      entregas: num(r.entregas),
      clientes: num(r.clientes),
      dias: num(r.dias),
      intervalos: num(r.intervalos),
    })),
    marketing: (mkt.data ?? []).map((r) => ({
      periodo: dia(r.periodo),
      unidad_id: String(r.unidad_id),
      plataforma: String(r.plataforma) as Plataforma,
      gasto: num(r.gasto),
    })),
    // Una función de una sola columna puede llegar como filas ({ periodo }) o como valores sueltos: se aceptan las dos.
    mesesLibro: new Set(((libro.data ?? []) as ({ periodo: string } | string)[]).map((r) => dia(typeof r === "object" && r ? r.periodo : r))),
    calidad: c,
    corte: corte.data ? dia((corte.data as { fecha: string }).fecha) : null,
  };
}
