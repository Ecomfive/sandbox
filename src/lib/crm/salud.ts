/**
 * La salud de un dropshipper y sus alertas para el panel de Dirección (30 oct 2026, fase 1). Salen de sus pedidos de Dropi en un país
 * (`crm_salud_dropshippers`, migración 0197), sin cancelados. Lógica pura: se prueba en salud.test.ts.
 *
 * Salud (0 a 100), la suma pesada de cuatro factores (los que no se pueden medir no cuentan y los demás se reparten su peso):
 *  - Recencia (35 %): pidió hoy o ayer = 100; baja hasta 0 a los 30 días sin pedir.
 *  - Volumen (25 %): pedidos de 30 días en escala logarítmica; llegar al umbral VIP del país (pedidos al mes) = 100.
 *  - Tendencia (25 %): 30 días frente a los 30 anteriores; igual = 75, +20 % = 100, −40 % = 0. Sin los 30 anteriores, no cuenta.
 *  - Entrega (15 %): entregados ÷ (entregados + devueltos) de 60 días; 85 % = 100, 55 % = 0. Con menos de 5 cerrados, no cuenta.
 * 70 o más: Sano; de 40 a 69: Atención; menos de 40: Crítico. Sin pedidos: sin puntaje.
 */

export interface PedidosDropshipper {
  pedidos14: number;
  pedidos14Antes: number;
  pedidos30: number;
  pedidos30Antes: number;
  /** Fechas ISO (solo día); null si nunca pidió. */
  primerPedido: string | null;
  ultimoPedido: string | null;
  entregados60: number;
  devueltos60: number;
}

export type ClaveFactor = "recencia" | "volumen" | "tendencia" | "entrega";
export type Banda = "sano" | "atencion" | "critico" | "sin_pedidos";
export type Segmento = "activo" | "riesgo" | "dormido" | "perdido" | "sin_pedidos";
export type TipoAlerta = "caida" | "dormido" | "devoluciones" | "sin_primer_pedido";
export type Prioridad = "alta" | "media" | "baja";

export interface Factor {
  clave: ClaveFactor;
  etiqueta: string;
  /** 0 a 100; null si no se puede medir (no cuenta en el puntaje). */
  valor: number | null;
  peso: number;
  detalle: string;
}

export interface Salud {
  puntaje: number | null;
  banda: Banda;
  factores: Factor[];
}

export interface Alerta {
  tipo: TipoAlerta;
  prioridad: Prioridad;
  texto: string;
}

export const ETIQUETA_BANDA: Record<Banda, string> = { sano: "Sano", atencion: "Atención", critico: "Crítico", sin_pedidos: "Sin pedidos" };
export const ETIQUETA_SEGMENTO: Record<Segmento, string> = { activo: "Activo", riesgo: "En riesgo", dormido: "Dormido", perdido: "Perdido", sin_pedidos: "Sin pedidos" };
export const ETIQUETA_ALERTA: Record<TipoAlerta, string> = { caida: "Caída de pedidos", dormido: "Dormido", devoluciones: "Devoluciones altas", sin_primer_pedido: "Sin primer pedido" };
/** Lo que se sugiere hacer con cada alerta (va también como detalle de la tarea). */
export const SUGERENCIA_ALERTA: Record<TipoAlerta, string> = {
  caida: "Llamarle hoy: preguntar qué cambió y revisar si se le agotó algo que vendía.",
  dormido: "Escribirle para reactivarlo y ofrecerle un producto ganador con stock.",
  devoluciones: "Revisar con él la confirmación de pedidos y las direcciones.",
  sin_primer_pedido: "Acompañarle a publicar su primer producto.",
};

/** Días que una alerta atendida no vuelve a salir. */
export const DIAS_ATENDIDA = 7;

const PESOS: Record<ClaveFactor, number> = { recencia: 35, volumen: 25, tendencia: 25, entrega: 15 };
const limitar = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const pct = (n: number) => `${Math.round(n * 100)} %`;

/** Días entre dos fechas ISO (solo día). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

export function bandaDe(puntaje: number | null): Banda {
  if (puntaje === null) return "sin_pedidos";
  return puntaje >= 70 ? "sano" : puntaje >= 40 ? "atencion" : "critico";
}

/** `refVolumen`: los pedidos al mes desde los que el país considera VIP (Configuración › Tipo de cliente). */
export function calcularSalud(p: PedidosDropshipper, hoy: string, refVolumen: number): Salud {
  if (!p.ultimoPedido) return { puntaje: null, banda: "sin_pedidos", factores: [] };
  const dias = Math.max(0, diasEntre(p.ultimoPedido, hoy));
  const recencia = dias <= 1 ? 100 : limitar(100 - ((dias - 1) * 100) / 29);
  const ref = Math.max(2, refVolumen);
  const volumen = limitar((Math.log(1 + p.pedidos30) / Math.log(1 + ref)) * 100);
  // Sin 30 días anteriores completos (empezó a pedir hace menos de 60 días) no hay con qué comparar.
  const conHistoria = !!p.primerPedido && diasEntre(p.primerPedido, hoy) >= 45;
  const tendencia = !conHistoria ? null : p.pedidos30Antes === 0 ? (p.pedidos30 > 0 ? 100 : 0) : limitar(75 + (p.pedidos30 / p.pedidos30Antes - 1) * 125);
  const cerrados = p.entregados60 + p.devueltos60;
  const tasa = cerrados ? p.entregados60 / cerrados : 0;
  const entrega = cerrados < 5 ? null : limitar(((tasa - 0.55) / 0.3) * 100);
  const cambio = p.pedidos30Antes ? p.pedidos30 / p.pedidos30Antes - 1 : null;
  const factores: Factor[] = [
    { clave: "recencia", etiqueta: "Recencia", valor: recencia, peso: PESOS.recencia, detalle: dias === 0 ? "Pidió hoy" : dias === 1 ? "Pidió ayer" : `Último pedido hace ${dias} días` },
    { clave: "volumen", etiqueta: "Volumen", valor: volumen, peso: PESOS.volumen, detalle: `${p.pedidos30} pedidos en 30 días (VIP desde ${refVolumen} al mes)` },
    {
      clave: "tendencia",
      etiqueta: "Tendencia",
      valor: tendencia,
      peso: PESOS.tendencia,
      detalle: !conHistoria
        ? "Todavía sin 30 días anteriores para comparar"
        : cambio === null
          ? `${p.pedidos30} pedidos; en los 30 días anteriores no pidió`
          : `${cambio >= 0 ? "+" : "−"}${pct(Math.abs(cambio))} frente a los 30 días anteriores (${p.pedidos30} y ${p.pedidos30Antes})`,
    },
    {
      clave: "entrega",
      etiqueta: "Entrega",
      valor: entrega,
      peso: PESOS.entrega,
      detalle: cerrados < 5 ? "Menos de 5 pedidos cerrados en 60 días" : `${pct(tasa)} entregados (${p.entregados60} de ${cerrados} cerrados en 60 días)`,
    },
  ];
  const medidos = factores.filter((f) => f.valor !== null);
  const peso = medidos.reduce((s, f) => s + f.peso, 0);
  const puntaje = limitar(medidos.reduce((s, f) => s + (f.valor as number) * f.peso, 0) / peso);
  return { puntaje, banda: bandaDe(puntaje), factores };
}

/** Bajó fuerte en 14 días (con al menos 5 pedidos antes), o lleva de 10 a 20 días sin pedir cuando antes pedía seguido. */
function caida(p: PedidosDropshipper, dias: number): Alerta | null {
  if (p.pedidos14Antes >= 5 && p.pedidos14 <= p.pedidos14Antes * 0.6) {
    const baja = 1 - p.pedidos14 / p.pedidos14Antes;
    return {
      tipo: "caida",
      prioridad: p.pedidos14Antes >= 20 ? "alta" : "media",
      texto: `Sus pedidos bajaron ${pct(baja)}: ${p.pedidos14} en los últimos 14 días frente a ${p.pedidos14Antes} en los 14 anteriores.`,
    };
  }
  if (dias >= 10 && dias < 21 && p.pedidos30 + p.pedidos30Antes >= 6)
    return { tipo: "caida", prioridad: "media", texto: `Lleva ${dias} días sin pedir; en los últimos 60 días había hecho ${p.pedidos30 + p.pedidos30Antes} pedidos.` };
  return null;
}

export function segmentoDe(p: PedidosDropshipper, hoy: string): Segmento {
  if (!p.ultimoPedido) return "sin_pedidos";
  const dias = diasEntre(p.ultimoPedido, hoy);
  if (dias >= 60) return "perdido";
  if (dias >= 21) return "dormido";
  return caida(p, dias) ? "riesgo" : "activo";
}

/**
 * Las alertas de un dropshipper hoy. `ingreso` (ISO) sirve para «Sin primer pedido»: solo los que entraron hace 7 a 45 días (los más
 * viejos que nunca pidieron no llenan la cola).
 */
export function alertasDe(p: PedidosDropshipper, hoy: string, ingreso: string | null): Alerta[] {
  const alertas: Alerta[] = [];
  if (!p.ultimoPedido) {
    const desde = ingreso ? diasEntre(ingreso, hoy) : null;
    if (desde !== null && desde >= 7 && desde <= 45)
      alertas.push({ tipo: "sin_primer_pedido", prioridad: desde >= 21 ? "media" : "baja", texto: `Entró hace ${desde} días y todavía no hace su primer pedido.` });
    return alertas;
  }
  const dias = diasEntre(p.ultimoPedido, hoy);
  const c = caida(p, dias);
  if (c) alertas.push(c);
  const sesenta = p.pedidos30 + p.pedidos30Antes;
  if (dias >= 21 && dias < 60 && sesenta >= 3)
    alertas.push({ tipo: "dormido", prioridad: sesenta >= 20 ? "alta" : "media", texto: `Lleva ${dias} días sin pedir; en los 60 días anteriores hizo ${sesenta} pedidos.` });
  const cerrados = p.entregados60 + p.devueltos60;
  const devolucion = cerrados ? p.devueltos60 / cerrados : 0;
  if (cerrados >= 10 && devolucion >= 0.25)
    alertas.push({
      tipo: "devoluciones",
      prioridad: devolucion >= 0.4 ? "alta" : "media",
      texto: `Le devuelven el ${pct(devolucion)} (${p.devueltos60} de ${cerrados} pedidos cerrados en 60 días).`,
    });
  return alertas;
}

const ORDEN_PRIORIDAD: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };
/** Para ordenar la cola: primero las urgentes y, entre iguales, la que más pedidos movía. */
export const compararAlertas = (a: { prioridad: Prioridad; peso: number }, b: { prioridad: Prioridad; peso: number }) =>
  ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] || b.peso - a.peso;
