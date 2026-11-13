// Gestión de tienda › Pedidos › «Todas las tiendas» (13 nov 2026, pedido de Hernán; prototipo aprobado): en vez de la lista de pedidos, un tablero que compara
// las tiendas del país para decidir rápido: indicadores de todas juntas, «Para decidir hoy» (lo que se salió de lo normal en cada tienda), una tarjeta por
// tienda (aparece sola al conectar otra) y gráficas. Aquí las cuentas, sin base ni React, con prueba (`tablero-tiendas.test.ts`).

import { diaPanama, pedidosPorDia, resumirPedidos, type PedidoResumen, type Resumen } from "./resumen";

/** El color de cada tienda, en el orden en que se listan (nunca se reparte por posición en el ranking). Validado en claro y en oscuro; con más de 6, gris. */
export const COLORES_TIENDA = ["#9a5fd8", "#d95926", "#199e70", "#3987e5", "#c98500", "#d55181"] as const;
export const colorTienda = (i: number) => COLORES_TIENDA[i] ?? "#8d8d8d";

export interface ResumenTienda {
  id: string;
  nombre: string;
  color: string;
  /** «En vivo · Shopify» o «Finanzas (Excel)». */
  fuente: string;
  actual: Resumen;
  anterior: Resumen;
  /** Pedidos por día del periodo, en orden (los días sin pedidos en 0). */
  dias: { dia: string; pedidos: number }[];
  /** Pedidos esperando confirmación (estado «Por confirmar»). */
  porConfirmar: number;
  /** Variantes de Shopify sin producto nuestro. */
  sinVincular: number;
}

/** Las cuentas de una tienda: los pedidos del periodo y los del periodo anterior (los que caen antes de `desde`). */
export function resumirTienda(
  t: { id: string; nombre: string; fuente: string; sinVincular: number },
  indice: number,
  pedidos: (PedidoResumen & { creado: string })[],
  desde: string,
  hasta: string,
): ResumenTienda {
  const actuales = pedidos.filter((p) => diaPanama(p.creado) >= desde && diaPanama(p.creado) <= hasta);
  const anteriores = pedidos.filter((p) => diaPanama(p.creado) < desde);
  const actual = resumirPedidos(actuales);
  return {
    id: t.id,
    nombre: t.nombre,
    color: colorTienda(indice),
    fuente: t.fuente,
    actual,
    anterior: resumirPedidos(anteriores),
    dias: pedidosPorDia(actuales, desde, hasta),
    porConfirmar: actual.porEstado.nuevo,
    sinVincular: t.sinVincular,
  };
}

/** Todas las tiendas juntas (para los indicadores de arriba). */
export function juntarTiendas(tiendas: ResumenTienda[]): { actual: Resumen; anterior: Resumen; porConfirmar: number } {
  const juntar = (rs: Resumen[]): Resumen => {
    const porEstado = { nuevo: 0, confirmado: 0, en_camino: 0, entregado: 0, cancelado: 0, devuelto: 0 };
    let facturado = 0;
    let recaudado = 0;
    let porRecaudar = 0;
    let devueltoMonto = 0;
    let unidades = 0;
    for (const r of rs) {
      for (const k of Object.keys(porEstado) as (keyof typeof porEstado)[]) porEstado[k] += r.porEstado[k];
      facturado += r.facturado;
      recaudado += r.recaudado;
      porRecaudar += r.porRecaudar;
      devueltoMonto += r.devueltoMonto;
      unidades += (r.unidadesPorPedido ?? 0) * r.pedidos;
    }
    const n = rs.reduce((s, r) => s + r.pedidos, 0);
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
    const confirmados = porEstado.confirmado + porEstado.en_camino + porEstado.entregado + porEstado.devuelto;
    const salieron = porEstado.en_camino + porEstado.entregado + porEstado.devuelto;
    const dinero = (x: number) => Math.round(x * 100) / 100;
    return {
      pedidos: n,
      porEstado,
      confirmados,
      confirmacion: pct(confirmados, n),
      entrega: pct(porEstado.entregado, salieron),
      cancelacion: pct(porEstado.cancelado, n),
      devolucion: pct(porEstado.devuelto, n),
      unidadesPorPedido: n ? Math.round((unidades / n) * 100) / 100 : null,
      facturado: dinero(facturado),
      recaudado: dinero(recaudado),
      porRecaudar: dinero(porRecaudar),
      devueltoMonto: dinero(devueltoMonto),
      ticketPromedio: n - porEstado.cancelado > 0 ? dinero(facturado / (n - porEstado.cancelado)) : null,
    };
  };
  return { actual: juntar(tiendas.map((t) => t.actual)), anterior: juntar(tiendas.map((t) => t.anterior)), porConfirmar: tiendas.reduce((s, t) => s + t.porConfirmar, 0) };
}

/** Variación en % (un decimal); null sin base. */
export const variacion = (actual: number, antes: number): number | null => (antes > 0 ? Math.round(((actual - antes) / antes) * 1000) / 10 : null);

export type TonoAlerta = "critico" | "serio" | "aviso" | "info" | "bien";

export interface AlertaTienda {
  tiendaId: string;
  tono: TonoAlerta;
  titulo: string;
  detalle: string;
}

/** Los umbrales de «Para decidir hoy». */
export const UMBRALES = { caidaSemana: 30, entregaBaja: 60, cancelacionAlta: 25, porConfirmar: 100, crecimiento: 50, minimoPedidos: 20 } as const;

const ORDEN_TONO: Record<TonoAlerta, number> = { critico: 0, serio: 1, aviso: 2, info: 3, bien: 4 };
const n1 = (x: number) => x.toLocaleString("es-PA", { maximumFractionDigits: 1 });

/**
 * «Para decidir hoy»: lo que se salió de lo normal en cada tienda, de lo más grave a lo menos. Una tienda con menos de `minimoPedidos` pedidos en el periodo
 * no se mide (cualquier porcentaje saldría raro). La caída de la última semana compara sus últimos 7 días con el promedio por día de los días anteriores del periodo.
 */
export function alertasTiendas(tiendas: ResumenTienda[]): AlertaTienda[] {
  const fuera: AlertaTienda[] = [];
  for (const t of tiendas) {
    const a = t.actual;
    if (a.pedidos >= UMBRALES.minimoPedidos && t.dias.length >= 14) {
      const ult = t.dias.slice(-7).reduce((s, d) => s + d.pedidos, 0) / 7;
      const previos = t.dias.slice(0, -7);
      const antes = previos.reduce((s, d) => s + d.pedidos, 0) / previos.length;
      const caida = antes > 0 ? Math.round((1 - ult / antes) * 100) : 0;
      if (caida >= UMBRALES.caidaSemana)
        fuera.push({ tiendaId: t.id, tono: "critico", titulo: `${t.nombre}: los pedidos bajaron ${caida} % en la última semana`, detalle: `${n1(ult)} por día, frente a ${n1(antes)} los días anteriores. Revisar campañas y stock.` });
    }
    if (a.pedidos >= UMBRALES.minimoPedidos) {
      const salieron = a.porEstado.en_camino + a.porEstado.entregado + a.porEstado.devuelto;
      if (a.entrega !== null && salieron >= UMBRALES.minimoPedidos && a.entrega < UMBRALES.entregaBaja)
        fuera.push({ tiendaId: t.id, tono: "serio", titulo: `${t.nombre}: solo ${n1(a.entrega)} % entregado de lo que salió`, detalle: `${a.porEstado.en_camino.toLocaleString("es-PA")} pedidos siguen en camino. Revisar con logística qué está trabado.` });
      if (a.cancelacion !== null && a.cancelacion >= UMBRALES.cancelacionAlta)
        fuera.push({ tiendaId: t.id, tono: "aviso", titulo: `${t.nombre}: cancelación de ${n1(a.cancelacion)} %`, detalle: `${a.porEstado.cancelado.toLocaleString("es-PA")} pedidos cancelados (lo normal es menos de 20 %).` });
    }
    if (t.porConfirmar >= UMBRALES.porConfirmar)
      fuera.push({ tiendaId: t.id, tono: "aviso", titulo: `${t.nombre}: ${t.porConfirmar.toLocaleString("es-PA")} pedidos por confirmar`, detalle: "Cada día sin confirmar baja la entrega." });
    if (t.sinVincular > 0)
      fuera.push({ tiendaId: t.id, tono: "info", titulo: `${t.nombre}: ${t.sinVincular.toLocaleString("es-PA")} SKU sin vincular`, detalle: "Sin vincular no se sabe el costo ni lo vendido por producto." });
    const crec = variacion(a.pedidos, t.anterior.pedidos);
    if (crec !== null && t.anterior.pedidos >= UMBRALES.minimoPedidos && crec >= UMBRALES.crecimiento)
      fuera.push({ tiendaId: t.id, tono: "bien", titulo: `${t.nombre}: los pedidos crecieron ${Math.round(crec)} %`, detalle: `${t.anterior.pedidos.toLocaleString("es-PA")} → ${a.pedidos.toLocaleString("es-PA")} frente al periodo anterior.` });
  }
  return fuera.sort((x, y) => ORDEN_TONO[x.tono] - ORDEN_TONO[y.tono]);
}
