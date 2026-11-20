// Ventas por tienda › proyección del mes, patrón de la semana, unidades por pedido y del vendido a lo depositado
// (lista de 100 mejoras, 46 a 49 y 43; 19 nov 2026). Lógica pura sobre lo que suman las funciones de la migración 0988 y
// `fin_tiendas_mensual` (0962). Prueba en `patrones.test.ts`.

const r2 = (n: number) => Math.round(n * 100) / 100;
const n = (v: unknown) => Number(v ?? 0) || 0;

export interface Diario {
  fecha: string;
  ordenes: number;
  /** Vendido sin las canceladas. */
  ventas: number;
  entregadas: number;
  canceladas: number;
}

export interface Proyeccion {
  /** Días con datos completos (hasta ayer) y días del mes. */
  dias: number;
  diasMes: number;
  ordenesHasta: number;
  ventasHasta: number;
  /** Al mismo ritmo de los días completos. */
  ordenesProyectadas: number;
  ventasProyectadas: number;
  /** Lo que se espera entregar: lo proyectado × la parte entregada de los meses cerrados; null sin esa base. */
  entregadasProyectadas: number | null;
  /** Parte del vendido que terminó entregada en los meses cerrados (0–1). */
  parteEntregada: number | null;
}

/** Los días de un mes «AAAA-MM-01». */
export const diasDelMes = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();

/**
 * Proyecta el mes en curso al ritmo de los días completos (hasta ayer: hoy está a medias). Null si `mes` no es el mes de
 * `hoy` o si todavía no hay un día completo (el día 1). `parteEntregada` = ventas entregadas ÷ vendido de los meses
 * cerrados recientes (quien llama la calcula), para pasar de lo vendido a lo que se espera cobrar.
 */
export function proyectarMes(diarios: Diario[], mes: string, hoy: string, parteEntregada: number | null): Proyeccion | null {
  if (hoy.slice(0, 7) !== mes.slice(0, 7)) return null;
  const dias = Number(hoy.slice(8, 10)) - 1;
  if (dias < 1) return null;
  const diasMes = diasDelMes(mes);
  const completos = diarios.filter((d) => d.fecha.slice(0, 7) === mes.slice(0, 7) && d.fecha < hoy);
  const ordenesHasta = completos.reduce((a, d) => a + d.ordenes - d.canceladas, 0);
  const ventasHasta = r2(completos.reduce((a, d) => a + d.ventas, 0));
  const factor = diasMes / dias;
  const ventasProyectadas = r2(ventasHasta * factor);
  return {
    dias,
    diasMes,
    ordenesHasta,
    ventasHasta,
    ordenesProyectadas: Math.round(ordenesHasta * factor),
    ventasProyectadas,
    entregadasProyectadas: parteEntregada === null ? null : r2(ventasProyectadas * parteEntregada),
    parteEntregada,
  };
}

/** Parte del vendido (sin canceladas) que terminó entregada, sobre los meses que se pasan. Null si no hay vendido. */
export function parteEntregadaDe(vendido: number, entregado: number): number | null {
  return vendido > 0 ? Math.min(1, entregado / vendido) : null;
}

export interface FilaSemana {
  dia: number;
  hora: number | null;
  ordenes: number;
  ventas: number;
}

export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

/** Franjas del día (hora de Panamá). */
export const FRANJAS = [
  { id: "madrugada", nombre: "Madrugada (0–6 h)", desde: 0, hasta: 6 },
  { id: "manana", nombre: "Mañana (6–12 h)", desde: 6, hasta: 12 },
  { id: "tarde", nombre: "Tarde (12–18 h)", desde: 12, hasta: 18 },
  { id: "noche", nombre: "Noche (18–24 h)", desde: 18, hasta: 24 },
] as const;

export interface PatronSemana {
  /** Una por día de la semana, de lunes a domingo, con su promedio por día (cuántas veces cayó ese día en el período). */
  dias: { dia: string; ordenes: number; ventas: number; ordenesPorDia: number; ventasPorDia: number; parte: number | null }[];
  mejorDia: string | null;
  /** Por franja, solo de las órdenes con hora (las de Shopify). */
  franjas: { franja: string; ordenes: number; parte: number | null }[];
  mejorFranja: string | null;
  /** Parte de las órdenes con hora (0–1). */
  conHora: number | null;
  ordenes: number;
}

/** Cuántas veces cae cada día de la semana (1 = lunes) entre dos fechas, ambas incluidas. */
export function vecesPorDia(desde: string, hasta: string): number[] {
  const veces = [0, 0, 0, 0, 0, 0, 0];
  const d = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  while (d <= fin) {
    veces[(d.getUTCDay() + 6) % 7]++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return veces;
}

export function patronSemana(filas: FilaSemana[], desde: string, hasta: string): PatronSemana {
  const veces = vecesPorDia(desde, hasta);
  const porDia = DIAS_SEMANA.map(() => ({ ordenes: 0, ventas: 0 }));
  const porFranja = FRANJAS.map(() => 0);
  let conHora = 0;
  for (const f of filas) {
    const i = n(f.dia) - 1;
    if (i < 0 || i > 6) continue;
    porDia[i].ordenes += n(f.ordenes);
    porDia[i].ventas += n(f.ventas);
    if (f.hora !== null && f.hora !== undefined) {
      const j = FRANJAS.findIndex((x) => n(f.hora) >= x.desde && n(f.hora) < x.hasta);
      if (j >= 0) {
        porFranja[j] += n(f.ordenes);
        conHora += n(f.ordenes);
      }
    }
  }
  const ordenes = porDia.reduce((a, x) => a + x.ordenes, 0);
  const dias = porDia.map((x, i) => ({
    dia: DIAS_SEMANA[i],
    ordenes: x.ordenes,
    ventas: r2(x.ventas),
    ordenesPorDia: veces[i] ? r2(x.ordenes / veces[i]) : 0,
    ventasPorDia: veces[i] ? r2(x.ventas / veces[i]) : 0,
    parte: ordenes ? x.ordenes / ordenes : null,
  }));
  const mejor = ordenes ? dias.reduce((a, b) => (b.ventasPorDia > a.ventasPorDia ? b : a)) : null;
  const franjas = FRANJAS.map((x, i) => ({ franja: x.nombre, ordenes: porFranja[i], parte: conHora ? porFranja[i] / conHora : null }));
  const mejorFranja = conHora ? franjas.reduce((a, b) => (b.ordenes > a.ordenes ? b : a)).franja : null;
  return { dias, mejorDia: mejor?.dia ?? null, franjas, mejorFranja, conHora: ordenes ? conHora / ordenes : null, ordenes };
}

/** Unidades por pedido entregado; null sin entregas. */
export const unidadesPorPedido = (unidades: number, entregadas: number) => (entregadas > 0 ? r2(unidades / entregadas) : null);

export interface FilaCod {
  ventas_entregadas: number | string;
  cod_esperado: number | string;
  cod_cobrado: number | string;
  cod_remitido: number | string;
}

export interface DelVendidoAlBanco {
  vendido: number;
  /** De lo vendido, lo que se cobra en efectivo contra entrega. */
  contraEntrega: number;
  /** Lo que los mensajeros y transportadoras dicen que cobraron. */
  cobrado: number;
  /** Lo que ya devolvieron (remesado). */
  remesado: number;
  /** Cobrado y todavía sin remesar. */
  enLaCalle: number;
  /** Contra entrega que aún no figura como cobrado (entregas sin cobro anotado). */
  sinCobroAnotado: number;
  /** Parte del contra entrega que ya está remesada (0–1). */
  parteRemesada: number | null;
}

/** Del vendido a lo depositado (mejora 43): suma las filas de `fin_tiendas_mensual` del mes. */
export function delVendidoAlBanco(filas: FilaCod[]): DelVendidoAlBanco {
  const s = (k: keyof FilaCod) => r2(filas.reduce((a, f) => a + n(f[k]), 0));
  const vendido = s("ventas_entregadas");
  const contraEntrega = s("cod_esperado");
  const cobrado = s("cod_cobrado");
  const remesado = s("cod_remitido");
  return {
    vendido,
    contraEntrega,
    cobrado,
    remesado,
    enLaCalle: r2(Math.max(0, cobrado - remesado)),
    sinCobroAnotado: r2(Math.max(0, contraEntrega - cobrado)),
    parteRemesada: contraEntrega > 0 ? Math.min(1, remesado / contraEntrega) : null,
  };
}

export interface MesDropi {
  moneda: string;
  pedidos: number | string;
  entregados: number | string;
  ventas_entregadas: number | string;
  ganancias: number | string;
}

export interface ResumenDropi {
  pedidos: number;
  entregados: number;
  /** Lo que pagó el cliente final por lo entregado. */
  vendidoCliente: number;
  /** Lo que Dropi nos acredita (nuestro ingreso). */
  ganancias: number;
  tasaEntrega: number | null;
}

/** Proveeduría (Dropi) de un mes, solo en dólares (Costa Rica va en colones y no se mezcla). Null si no hay nada. */
export function resumenDropi(filas: MesDropi[]): ResumenDropi | null {
  const usd = filas.filter((f) => f.moneda === "USD");
  if (!usd.length) return null;
  const pedidos = usd.reduce((a, f) => a + n(f.pedidos), 0);
  const entregados = usd.reduce((a, f) => a + n(f.entregados), 0);
  return {
    pedidos,
    entregados,
    vendidoCliente: r2(usd.reduce((a, f) => a + n(f.ventas_entregadas), 0)),
    ganancias: r2(usd.reduce((a, f) => a + n(f.ganancias), 0)),
    tasaEntrega: pedidos ? entregados / pedidos : null,
  };
}
