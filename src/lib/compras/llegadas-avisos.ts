// Compras › avisos de llegada (16 nov 2026, pedido de Hernán). Dos momentos de una compra avisan a otra área:
//  · «06 - Llegada a Puerto» (`arribo_mercancia`) → Logística (el usuario de Dinora) recibe lo que viene: producto, unidades, cajas y etiqueta de las cajas.
//  · «07 - En Bodega» (`en_bodega`) → quien paga (María José) recibe lo que hay que pagar del segundo pago, con el total de la llegada. Al registrar el pago la compra pasa a Completado.
// Lógica pura, con prueba: qué etapa avisa a quién, cómo se arma la lista de una llegada y el texto del aviso. Lo que toca la base vive en `llegadas-servidor.ts`.

export type TipoLlegada = "puerto" | "bodega";
export type EventoAviso = "llegada_puerto" | "llegada_bodega";

/** Qué etapa de la compra dispara el aviso de una llegada. */
export const LLEGADA_DE_ETAPA: Readonly<Record<string, { tipo: TipoLlegada; evento: EventoAviso }>> = {
  arribo_mercancia: { tipo: "puerto", evento: "llegada_puerto" },
  en_bodega: { tipo: "bodega", evento: "llegada_bodega" },
};

export const EVENTO_DE_TIPO: Readonly<Record<TipoLlegada, EventoAviso>> = { puerto: "llegada_puerto", bodega: "llegada_bodega" };

/** A quién le toca cada aviso, como se dice en pantalla. */
export const AVISOS_DE_COMPRAS: readonly { evento: EventoAviso; titulo: string; detalle: string }[] = [
  { evento: "llegada_puerto", titulo: "Logística · Llegada a Puerto", detalle: "Reciben la lista de lo que viene (producto, unidades, cajas y etiqueta de las cajas) cuando una compra pasa a «06 - Llegada a Puerto»." },
  { evento: "llegada_bodega", titulo: "Pagos (solo aviso) · En Bodega", detalle: "Se enteran de lo que hay que pagar del segundo pago (por compra y en total) cuando una compra pasa a «07 - En Bodega». El pago lo registra quien gestiona Compras." },
];

export interface ProductoLlegada {
  codigo: string | null;
  nombre: string;
}

/** Una compra dentro de una llegada. */
export interface FilaLlegada {
  compraId: string;
  /** «OC-0123». */
  orden: string;
  /** Código de la compra (ECOM01-0525), si lo tiene. */
  codigo: string | null;
  /** Los productos vinculados; si no hay, el nombre de la compra. */
  productos: ProductoLlegada[];
  unidades: number | null;
  cajas: number | null;
  /** Rutas de las imágenes de la etiqueta de las cajas (se firman al mostrarlas). */
  etiquetasRutas: string[];
  segundoPago: number | null;
  /** Ya registrado: día, monto y quién. */
  pagadoEn: string | null;
  montoPagado: number | null;
  pagadoPor: string | null;
  etapa: string;
  /** La llegada de la que sale esta fila y cuándo se avisó (solo en la lista de todas las llegadas). */
  llegadaId?: string;
  llegadaEn?: string;
}

/** Los periodos de «Todas las llegadas» (días contando hoy) y el de entrada. */
export const DIAS_LISTA_LLEGADAS = [1, 7, 30, 90] as const;
export const DIAS_LISTA_PREDETERMINADO = 7;
export const diasDeLista = (v: unknown): number => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (DIAS_LISTA_LLEGADAS as readonly number[]).includes(n) ? n : DIAS_LISTA_PREDETERMINADO;
};

/** El instante desde el que cuenta un periodo: las 00:00 de Panamá (UTC−5, sin horario de verano) de `dias − 1` días antes de `hoy` (AAAA-MM-DD). */
export function desdeDeLista(hoy: string, dias: number): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (Math.max(1, dias) - 1));
  return `${d.toISOString().slice(0, 10)}T00:00:00-05:00`;
}

/** Una compra puede estar en dos llegadas (si se movió de etapa y volvió): en la lista de todas cuenta una vez, con su llegada más reciente (las filas vienen de la más nueva a la más vieja). */
export function unaPorCompra<T extends { compraId: string }>(filas: readonly T[]): T[] {
  const vistas = new Set<string>();
  return filas.filter((f) => (vistas.has(f.compraId) ? false : (vistas.add(f.compraId), true)));
}

/** Solo las etapas de aviso tienen llegada. */
export const llegadaDeEtapa = (etapa: string) => LLEGADA_DE_ETAPA[etapa] ?? null;

const entero = (n: number) => n.toLocaleString("es-PA");
const dinero = (n: number) => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, uno: string, varios: string) => `${entero(n)} ${n === 1 ? uno : varios}`;

/** Lo que dice el nombre de una compra en una lista: «CÓDIGO · Nombre» de su producto (o los dos primeros y «+N más»). */
export function textoProductos(f: Pick<FilaLlegada, "productos" | "orden" | "codigo">): string {
  if (f.productos.length === 0) return f.codigo ?? f.orden;
  const uno = (p: ProductoLlegada) => (p.codigo ? `${p.codigo} · ${p.nombre}` : p.nombre);
  const primeros = f.productos.slice(0, 2).map(uno).join(" + ");
  return f.productos.length > 2 ? `${primeros} +${f.productos.length - 2} más` : primeros;
}

export interface TotalesLlegada {
  compras: number;
  unidades: number;
  cajas: number;
  /** Compras sin cajas anotadas por el proveedor. */
  sinCajas: number;
  /** Lo que falta pagar del segundo pago (las compras sin pago registrado). */
  porPagar: number;
  pagado: number;
  /** Compras sin monto de segundo pago (no se pueden sumar). */
  sinMonto: number;
  pendientes: number;
}

export function totalesDeLlegada(filas: readonly FilaLlegada[]): TotalesLlegada {
  const t: TotalesLlegada = { compras: filas.length, unidades: 0, cajas: 0, sinCajas: 0, porPagar: 0, pagado: 0, sinMonto: 0, pendientes: 0 };
  for (const f of filas) {
    t.unidades += f.unidades ?? 0;
    if (f.cajas == null) t.sinCajas += 1;
    else t.cajas += f.cajas;
    if (f.pagadoEn) t.pagado += f.montoPagado ?? 0;
    else {
      t.pendientes += 1;
      if (f.segundoPago == null) t.sinMonto += 1;
      else t.porPagar += f.segundoPago;
    }
  }
  return t;
}

export interface AvisoArmado {
  titulo: string;
  texto: string;
}

/** El aviso «Para ti» de una llegada: un título corto y un texto con lo principal; el detalle completo está en su página. */
export function armarAviso(tipo: TipoLlegada, filas: readonly FilaLlegada[]): AvisoArmado {
  const t = totalesDeLlegada(filas);
  const lista = (cada: (f: FilaLlegada) => string) => {
    const visibles = filas.slice(0, 4).map(cada).join(" · ");
    return filas.length > 4 ? `${visibles} · +${filas.length - 4} más` : visibles;
  };
  if (tipo === "puerto") {
    const cajas = t.cajas > 0 ? `${plural(t.cajas, "caja", "cajas")}${t.sinCajas ? ` (${plural(t.sinCajas, "compra sin cajas anotadas", "compras sin cajas anotadas")})` : ""}` : "cajas sin anotar";
    return {
      titulo: `Llega a puerto: ${plural(t.compras, "compra", "compras")} · ${plural(t.unidades, "unidad", "unidades")}`,
      texto: `Prepárense: ${cajas}. ${lista((f) => `${textoProductos(f)} (${plural(f.unidades ?? 0, "u.", "u.")}${f.cajas != null ? `, ${plural(f.cajas, "caja", "cajas")}` : ""})`)}`,
    };
  }
  const montos = t.sinMonto ? ` (${plural(t.sinMonto, "compra sin monto", "compras sin monto")})` : "";
  return {
    titulo: `En bodega: ${dinero(t.porPagar)} por pagar de ${plural(t.compras, "compra", "compras")}`,
    texto: `Segundo pago${montos}. ${lista((f) => `${textoProductos(f)}: ${f.segundoPago == null ? "sin monto" : dinero(f.segundoPago)}`)}`,
  };
}

/** Lo que se puede registrar como pago: un monto mayor que cero y un día válido que no sea futuro. Devuelve el error en palabras o los datos limpios. */
export function revisarPago(monto: unknown, dia: unknown, hoy: string): { error: string } | { monto: number; dia: string } {
  const n = typeof monto === "number" ? monto : Number(String(monto ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return { error: "Escribe el monto pagado (mayor que cero)." };
  if (n > 100_000_000) return { error: "Ese monto no parece válido." };
  const d = String(dia ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) return { error: "Elige el día del pago." };
  if (d > hoy) return { error: "El día del pago no puede ser futuro." };
  return { monto: Math.round(n * 100) / 100, dia: d };
}

/** El nuevo «Pagado a Proveedor» al registrar el segundo pago: lo que ya había, pero nunca menos que primer pago + lo pagado ahora. */
export function pagadoTrasSegundoPago(actual: number | null, primerPago: number | null, montoPagado: number): number {
  return Math.round(Math.max(actual ?? 0, (primerPago ?? 0) + montoPagado) * 100) / 100;
}
