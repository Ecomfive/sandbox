import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";

/** Un estado del período: cuántas órdenes tiene, cuánto suman y cuántas están en alerta. */
export interface GrupoEstado {
  estado: string;
  cantidad: number;
  monto: number;
  alertas: number;
}

/** Una orden en alerta: Dropi ya liquidó su ganancia pero el pedido no figura ENTREGADO. */
export interface OrdenEnAlerta {
  referencia: string;
  estado: string;
}

export interface ResumenPedidos {
  grupos: GrupoEstado[];
  alertas: OrdenEnAlerta[];
  /** «base»: lo calculó Postgres. «respaldo»: lo calculó JavaScript porque la función SQL no existe todavía. */
  origen: "base" | "respaldo";
}

export interface ParametrosResumen {
  paisId: string;
  plataformaId: string;
  desde: string;
  hasta: string;
}

const esEntregada = (estado: string) => estado.toUpperCase().includes("ENTREGAD");

/** Los estados de mayor a menor cantidad; a igual cantidad, por nombre (la base no garantiza un orden). */
export function ordenarGrupos(grupos: GrupoEstado[]): GrupoEstado[] {
  return [...grupos].sort((a, b) => b.cantidad - a.cantidad || a.estado.localeCompare(b.estado));
}

export function totalesPedidos(grupos: GrupoEstado[]) {
  return {
    ordenes: grupos.reduce((suma, g) => suma + g.cantidad, 0),
    monto: grupos.reduce((suma, g) => suma + g.monto, 0),
    alertas: grupos.reduce((suma, g) => suma + g.alertas, 0),
  };
}

/** Cuántas órdenes deja un filtro: los estados elegidos (todos si no hay ninguno) y, opcionalmente, solo las alertas. */
export function contarFiltrado(grupos: GrupoEstado[], estados: string[], soloAlertas: boolean): number {
  return grupos
    .filter((g) => estados.length === 0 || estados.includes(g.estado))
    .reduce((suma, g) => suma + (soloAlertas ? g.alertas : g.cantidad), 0);
}

/**
 * El mismo resumen que da la base, calculado en JavaScript sobre las órdenes ya traídas. Es el plan B mientras la
 * migración 0037 no se haya corrido, y lo que comprueban las pruebas contra el SQL.
 */
export function resumirEnJs(
  ordenes: { monto: number | string; estado: string; referencia_externa: string }[],
  referenciasLiquidadas: Set<string>
): { grupos: GrupoEstado[]; alertas: OrdenEnAlerta[] } {
  const porEstado = new Map<string, GrupoEstado>();
  const alertas: OrdenEnAlerta[] = [];
  for (const o of ordenes) {
    const grupo = porEstado.get(o.estado) ?? { estado: o.estado, cantidad: 0, monto: 0, alertas: 0 };
    grupo.cantidad += 1;
    grupo.monto += Number(o.monto);
    if (referenciasLiquidadas.has(o.referencia_externa) && !esEntregada(o.estado)) {
      grupo.alertas += 1;
      alertas.push({ referencia: o.referencia_externa, estado: o.estado });
    }
    porEstado.set(o.estado, grupo);
  }
  return { grupos: ordenarGrupos([...porEstado.values()]), alertas };
}

/** Plan B: trae todas las órdenes del período y toda la cartera de ganancias, y resume en JavaScript. */
async function resumenDeRespaldo(supabase: SupabaseClient, p: ParametrosResumen): Promise<ResumenPedidos> {
  const [ordenes, cartera] = await Promise.all([
    traerTodasLasFilas<{ monto: number; estado: string; referencia_externa: string }>((rDesde, rHasta) =>
      supabase
        .from("ordenes")
        .select("monto, estado, referencia_externa")
        .eq("pais_id", p.paisId)
        .eq("plataforma_id", p.plataformaId)
        .gte("fecha", p.desde)
        .lte("fecha", p.hasta)
        .range(rDesde, rHasta)
    ),
    traerTodasLasFilas<{ orden_referencia_externa: string | null }>((rDesde, rHasta) =>
      supabase
        .from("historial_cartera")
        .select("orden_referencia_externa")
        .eq("pais_id", p.paisId)
        .eq("plataforma_id", p.plataformaId)
        .ilike("descripcion", "%GANANCIA%")
        .range(rDesde, rHasta)
    ),
  ]);
  const liquidadas = new Set(cartera.map((c) => c.orden_referencia_externa).filter((r): r is string => r !== null));
  return { ...resumirEnJs(ordenes, liquidadas), origen: "respaldo" };
}

/**
 * Resumen del período para la página de Pedidos Dropi. Lo calcula Postgres (`pedidos_dropi_resumen` y
 * `pedidos_dropi_alertas`, migración 0037): un renglón por estado en vez de miles de órdenes. Si las funciones no
 * existen (migración sin correr) o fallan, cae al cálculo en JavaScript de antes: la página nunca deja de abrir.
 */
export async function obtenerResumenPedidos(supabase: SupabaseClient, p: ParametrosResumen): Promise<ResumenPedidos> {
  // Sin la plataforma Dropi en la base no hay órdenes que resumir (y un id vacío no es un uuid válido).
  if (!p.plataformaId) return { grupos: [], alertas: [], origen: "base" };

  const argumentos = { p_pais: p.paisId, p_plataforma: p.plataformaId, p_desde: p.desde, p_hasta: p.hasta };
  const [resumen, alertas] = await Promise.all([
    supabase.rpc("pedidos_dropi_resumen", argumentos),
    supabase.rpc("pedidos_dropi_alertas", argumentos),
  ]);

  if (resumen.error || alertas.error || !Array.isArray(resumen.data) || !Array.isArray(alertas.data)) {
    console.warn(
      "pedidos_dropi_resumen no disponible; se calcula en JavaScript (¿falta correr la migración 0037?):",
      resumen.error?.message ?? alertas.error?.message
    );
    return resumenDeRespaldo(supabase, p);
  }

  return {
    grupos: ordenarGrupos(
      (resumen.data as { estado: string; cantidad: number | string; monto: number | string; alertas: number | string }[]).map(
        (g) => ({ estado: g.estado, cantidad: Number(g.cantidad), monto: Number(g.monto), alertas: Number(g.alertas) })
      )
    ),
    alertas: (alertas.data as { referencia_externa: string; estado: string }[]).map((a) => ({
      referencia: a.referencia_externa,
      estado: a.estado,
    })),
    origen: "base",
  };
}
