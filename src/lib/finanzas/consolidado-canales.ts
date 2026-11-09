// Portal AF4 360° › Tiendas y proveeduría juntas: lo vendido y lo que falta cobrar de cada lado, por mes.
// Tiendas = `fin_tiendas_mensual` (migración 0962); proveeduría = `fin_dropi_mensual` (0938, solo dólares: Costa Rica queda
// aparte). Lógica pura. Prueba en `consolidado-canales.test.ts`.

const r2 = (v: number) => Math.round(v * 100) / 100;
const n = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

export interface MesTienda {
  periodo: string;
  ordenes: number | string;
  entregadas: number | string;
  canceladas: number | string;
  devueltas: number | string;
  ventas_entregadas: number | string;
  cod_esperado: number | string;
  cod_cobrado: number | string;
  cod_remitido: number | string;
}
export interface MesProveeduria {
  periodo: string;
  moneda: string;
  pedidos: number | string;
  entregados: number | string;
  ventas_entregadas: number | string;
  ganancias: number | string;
  retiros: number | string;
}

export interface LadoMes {
  pedidos: number;
  entregados: number;
  vendido: number;
  /** % de entrega sobre lo cerrado (entregado ÷ entregado + devuelto + cancelado); null si no hay base. */
  tasaEntrega: number | null;
}
export interface FilaConsolidada {
  periodo: string;
  tiendas: LadoMes;
  proveeduria: LadoMes;
  vendidoTotal: number;
  /** Cuánto del total vendido viene de las tiendas (0–1); null si no hay ventas. */
  pesoTiendas: number | null;
}

const mes = (p: string) => String(p).slice(0, 7);

export function consolidarMeses(tiendas: MesTienda[], proveeduria: MesProveeduria[]): FilaConsolidada[] {
  const meses = new Set<string>([...tiendas.map((t) => mes(t.periodo)), ...proveeduria.filter((p) => p.moneda === "USD").map((p) => mes(p.periodo))]);
  const filas: FilaConsolidada[] = [];
  for (const m of meses) {
    const t = tiendas.filter((x) => mes(x.periodo) === m);
    const p = proveeduria.filter((x) => mes(x.periodo) === m && x.moneda === "USD");
    const tEnt = t.reduce((a, x) => a + n(x.entregadas), 0);
    const tCerr = tEnt + t.reduce((a, x) => a + n(x.devueltas) + n(x.canceladas), 0);
    const pEnt = p.reduce((a, x) => a + n(x.entregados), 0);
    const pPed = p.reduce((a, x) => a + n(x.pedidos), 0);
    const lt: LadoMes = {
      pedidos: t.reduce((a, x) => a + n(x.ordenes), 0),
      entregados: tEnt,
      vendido: r2(t.reduce((a, x) => a + n(x.ventas_entregadas), 0)),
      tasaEntrega: tCerr > 0 ? r2((tEnt / tCerr) * 100) : null,
    };
    const lp: LadoMes = {
      pedidos: pPed,
      entregados: pEnt,
      vendido: r2(p.reduce((a, x) => a + n(x.ventas_entregadas), 0)),
      // Dropi no distingue devuelto de cancelado en el resumen mensual: la base son todos los pedidos.
      tasaEntrega: pPed > 0 ? r2((pEnt / pPed) * 100) : null,
    };
    const total = r2(lt.vendido + lp.vendido);
    filas.push({ periodo: `${m}-01`, tiendas: lt, proveeduria: lp, vendidoTotal: total, pesoTiendas: total > 0 ? r2(lt.vendido / total) : null });
  }
  return filas.sort((a, b) => b.periodo.localeCompare(a.periodo));
}

export interface PorCobrar {
  /** Efectivo contra entrega que cobraron mensajeros y transportadoras y no han remesado. */
  efectivoEnCalle: number;
  /** Saldo de la billetera de Dropi por retirar (cartera origen 'dropi'). */
  billeteraDropi: number;
  total: number;
}

export function porCobrarConsolidado(cartera: { origen: string; monto: number | string; abonado?: number | string }[]): PorCobrar {
  const saldo = (c: { monto: number | string; abonado?: number | string }) => Math.max(n(c.monto) - n(c.abonado), 0);
  const efectivoEnCalle = r2(cartera.filter((c) => c.origen === "tiendas").reduce((a, c) => a + saldo(c), 0));
  const billeteraDropi = r2(cartera.filter((c) => c.origen === "dropi").reduce((a, c) => a + saldo(c), 0));
  return { efectivoEnCalle, billeteraDropi, total: r2(efectivoEnCalle + billeteraDropi) };
}
