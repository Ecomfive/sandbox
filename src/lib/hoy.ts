import type { SupabaseClient } from "@supabase/supabase-js";
import { resultadoDe } from "@/app/(app)/productos-test/informe";
import type { PendientesHoy } from "@/lib/pendientes-hoy";

/** Una fila de la cola de trabajo de «Hoy»: algo que hay que atender y a dónde se resuelve. */
export interface FilaCola {
  clave: string;
  titulo: string;
  descripcion: string;
  cantidad: number;
  href: string;
  /** El verbo del botón: «Revisar», «Conciliar»… */
  accion: string;
}

/** Los pendientes que cuenta el sistema, en el orden en que se muestran, con el módulo que hay que poder abrir. */
const PENDIENTES: {
  clave: string;
  modulo: string;
  campo: keyof PendientesHoy;
  titulo: string;
  descripcion: string;
  href: string;
  accion: string;
}[] = [
  {
    clave: "novedad",
    modulo: "pedidos-dropi",
    campo: "pedidosConNovedad",
    titulo: "Pedidos de Dropi en Novedad",
    descripcion: "Pedidos que Dropi reportó con estado «Novedad»",
    href: "/pedidos-dropi",
    accion: "Revisar",
  },
  {
    clave: "saldos",
    modulo: "retiros",
    campo: "saldosSinRegistrar",
    titulo: "Plataformas sin saldo de wallet registrado",
    descripcion: "Falta registrar el saldo de su wallet",
    href: "/retiros",
    accion: "Registrar",
  },
  {
    clave: "sin-vincular",
    modulo: "retiros",
    campo: "retirosDropiSinVincular",
    titulo: "Retiros de Dropi sin vincular",
    descripcion: "Llegaron de Dropi y no coinciden con ningún retiro del equipo",
    href: "/retiros",
    accion: "Conciliar",
  },
  {
    clave: "alertas",
    modulo: "alertas",
    campo: "alertasInventario",
    titulo: "Alertas de inventario abiertas",
    descripcion: "Inventario que la plataforma no devolvió y falta reclamar",
    href: "/alertas",
    accion: "Revisar",
  },
];

/**
 * La cola de trabajo: lo que tiene algo por atender va primero (en el orden de arriba) y lo que está al día queda
 * abajo, como una lista de comprobación. Solo salen los pendientes de módulos que la persona puede abrir.
 */
export function armarCola(pendientes: PendientesHoy, modulos: string[]): FilaCola[] {
  const filas = PENDIENTES.filter((p) => modulos.includes(p.modulo)).map<FilaCola>((p) => ({
    clave: p.clave,
    titulo: p.titulo,
    descripcion: p.descripcion,
    cantidad: pendientes[p.campo],
    href: p.href,
    accion: p.accion,
  }));
  return [...filas.filter((f) => f.cantidad > 0), ...filas.filter((f) => f.cantidad === 0)];
}

/** Lo que se testeó en un período, para la tarjeta «Producto en test». */
export interface ResumenTestHoy {
  testeados: number;
  ganadores: number;
  fallidos: number;
  consulta: number;
  /** Porcentaje de los testeados que ganaron. */
  tasa: number;
  /** Gasto total ÷ compras totales; null si no hubo compras. */
  cpa: number | null;
}

/**
 * Los tests con «Fecha Test» dentro del período (hasta 1 000), contados por resultado. El gasto y las compras se suman
 * para el CPA global; los valores vacíos cuentan como 0.
 */
export async function obtenerResumenTest(supabase: SupabaseClient, paisId: string, desde: string, hasta: string): Promise<ResumenTestHoy> {
  const { data } = await supabase
    .from("wms_productos_test")
    .select("estado, metrica_gasto, metrica_compras")
    .eq("pais_id", paisId)
    .gte("fecha_test", desde)
    .lte("fecha_test", hasta)
    .limit(1000);

  const filas = data ?? [];
  const por = (r: ReturnType<typeof resultadoDe>) => filas.filter((f) => resultadoDe(f.estado) === r).length;
  const gasto = filas.reduce((t, f) => t + Number(f.metrica_gasto ?? 0), 0);
  const compras = filas.reduce((t, f) => t + Number(f.metrica_compras ?? 0), 0);
  const ganadores = por("ganador");
  return {
    testeados: filas.length,
    ganadores,
    fallidos: por("fallido"),
    consulta: por("consulta"),
    tasa: filas.length ? (ganadores / filas.length) * 100 : 0,
    cpa: compras > 0 ? gasto / compras : null,
  };
}
