// Compras › avisos de llegada (16 nov 2026, pedido de Hernán). Dos momentos de una compra avisan a otra área:
//  · «06 - Llegada a Puerto» (`arribo_mercancia`) → Logística (el usuario de Dinora) recibe lo que viene: producto, unidades, cajas y etiqueta de las cajas.
//  · «07 - En Bodega» (`en_bodega`) → quien paga (María José) recibe lo que hay que pagar del segundo pago, con el total de la llegada. Al registrar el pago la compra pasa a Completado.
// Lógica pura, con prueba: qué etapa avisa a quién, cómo se arma la lista de una llegada y el texto del aviso. Lo que toca la base vive en `llegadas-servidor.ts`.

export type TipoLlegada = "puerto" | "bodega";
export type EventoAviso = "llegada_puerto" | "llegada_bodega" | "pago_adelantado";

/** Qué etapa de la compra dispara el aviso de una llegada. */
export const LLEGADA_DE_ETAPA: Readonly<Record<string, { tipo: TipoLlegada; evento: EventoAviso }>> = {
  arribo_mercancia: { tipo: "puerto", evento: "llegada_puerto" },
  llegada_puerto_lote_1: { tipo: "puerto", evento: "llegada_puerto" },
  llegada_puerto_lote_2: { tipo: "puerto", evento: "llegada_puerto" },
  llegada_puerto_lote_3: { tipo: "puerto", evento: "llegada_puerto" },
  en_bodega: { tipo: "bodega", evento: "llegada_bodega" },
};

export const EVENTO_DE_TIPO: Readonly<Record<TipoLlegada, EventoAviso>> = { puerto: "llegada_puerto", bodega: "llegada_bodega" };

/** A quién le toca cada aviso, como se dice en pantalla. */
export const AVISOS_DE_COMPRAS: readonly { evento: EventoAviso; titulo: string; detalle: string }[] = [
  { evento: "llegada_puerto", titulo: "Logística · Llegada a Puerto", detalle: "Reciben la lista de lo que viene (producto, unidades, cajas y etiqueta de las cajas) cuando una compra pasa a «06 - Llegada a Puerto»." },
  { evento: "llegada_bodega", titulo: "Pagos (solo aviso) · En Bodega", detalle: "Se enteran de lo que hay que pagar del segundo pago (por compra y en total) cuando una compra pasa a «07 - En Bodega». El pago lo registra quien gestiona Compras." },
  { evento: "pago_adelantado", titulo: "Pago por adelantado · Confirmación con IA", detalle: "Se enteran cuando un pedido confirmado es de una zona de pago por adelantado, para avisarle al cliente y esperar el pago. Sin nadie marcado, no se avisa a nadie." },
];

export interface ProductoLlegada {
  codigo: string | null;
  nombre: string;
  /** La foto comercial del producto (la de Producto), si la tiene. */
  foto?: string | null;
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
  /** La foto del primer producto que tenga una (18 nov 2026, pedido de Logística: reconocer el producto de un vistazo). */
  foto?: string | null;
  /** Rutas de las imágenes de la etiqueta de las cajas (se firman al mostrarlas). */
  etiquetasRutas: string[];
  segundoPago: number | null;
  /** Ya registrado: día, monto y quién. */
  pagadoEn: string | null;
  montoPagado: number | null;
  pagadoPor: string | null;
  /** Si ya se pagó, cuando la fila llega sin el día ni el monto (`filaSinMontos`). */
  pagada?: boolean;
  etapa: string;
  /** La llegada de la que sale esta fila y cuándo se avisó (solo en la lista de todas las llegadas). */
  llegadaId?: string;
  llegadaEn?: string;
  /** Cuándo se archivó (ya se recibió); null = pendiente de recibir (migración 0360). */
  archivadaEn?: string | null;
}

/** Las que siguen pendientes de recibir (sin archivar) y las ya archivadas, cada una en el orden en que llegaron. */
export const pendientesDeRecibir = <T extends { archivadaEn?: string | null }>(filas: readonly T[]): T[] => filas.filter((f) => !f.archivadaEn);
export const yaArchivadas = <T extends { archivadaEn?: string | null }>(filas: readonly T[]): T[] => filas.filter((f) => !!f.archivadaEn);

/** Una compra se mueve a «Llegada a Puerto» de a una; las que pasan una tras otra en una misma tanda forman un lote. Más que esto sin moverse nada, empieza otro lote. */
export const MINUTOS_ENTRE_LOTES = 20;

/** Las llegadas que se avisaron juntas: de la primera a la última compra que pasó a puerto en esa tanda. */
export interface LoteLlegada<T> {
  /** La compra más antigua del lote: así el lote conserva su identidad aunque le lleguen más compras después. */
  clave: string;
  desde: string;
  hasta: string;
  filas: T[];
}

/**
 * Separa la lista de llegadas en lotes (24 nov 2026, pedido de Logística: «cada llegada a puerto por separado, para descargarla y verla por lotes»). Compras llega con un aviso por compra
 * (se mueven de a una, a veces 17 en un minuto), así que el lote es la tanda: las compras cuya llegada cayó con menos de `MINUTOS_ENTRE_LOTES` minutos entre una y otra. Las filas vienen de la
 * más reciente a la más antigua (`llegadaEn`) y el resultado va igual: el lote más reciente primero, y dentro de cada uno el orden en que vienen. Una fila sin fecha forma su propio lote.
 */
export function agruparEnLotes<T extends { compraId: string; llegadaEn?: string }>(filas: readonly T[], minutos = MINUTOS_ENTRE_LOTES): LoteLlegada<T>[] {
  const lotes: LoteLlegada<T>[] = [];
  const brecha = minutos * 60_000;
  for (const f of filas) {
    const t = f.llegadaEn ? Date.parse(f.llegadaEn) : NaN;
    const ultimo = lotes[lotes.length - 1];
    // `desde` es la hora de la compra más antigua que ya tiene el lote (las filas vienen de la más nueva a la más vieja).
    if (ultimo && Number.isFinite(t) && f.llegadaEn && Date.parse(ultimo.desde) - t <= brecha && Date.parse(ultimo.desde) - t >= 0) {
      ultimo.filas.push(f);
      ultimo.desde = f.llegadaEn;
      ultimo.clave = f.compraId;
    } else lotes.push({ clave: f.compraId, desde: f.llegadaEn ?? "", hasta: f.llegadaEn ?? "", filas: [f] });
  }
  return lotes;
}

const HORA = { hour: "numeric", minute: "2-digit", timeZone: "America/Panama" } as const;

/** Cómo se llama un lote en pantalla y en el PDF: «24 nov 2026 · 7:14 a. m.» (o «7:14 – 7:15 a. m.» si la tanda duró más de un minuto), en hora de Panamá. Sin fecha, «Sin fecha». */
export function nombreDeLote(desde: string, hasta: string): string {
  if (!desde || Number.isNaN(Date.parse(desde))) return "Sin fecha";
  const dia = new Date(desde).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Panama" });
  const a = new Date(desde).toLocaleTimeString("es-PA", HORA);
  const b = hasta && !Number.isNaN(Date.parse(hasta)) ? new Date(hasta).toLocaleTimeString("es-PA", HORA) : a;
  return a === b ? `${dia} · ${a}` : `${dia} · ${a} – ${b}`;
}

/** Cuántas compras archivar o sacar del archivo de una vez, como mucho. */
export const MAX_ARCHIVAR_A_LA_VEZ = 300;

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

/** La dirección de «Llegadas a puerto» con el periodo más corto que alcanza a todo lo que sigue por recibir (si algo es más viejo que el más largo, el más largo). */
export function hrefDeListaPuerto(hoy: string, pendientes: readonly { llegadaEn?: string }[]): string {
  const alcanza = (dias: number) => pendientes.every((f) => !f.llegadaEn || Date.parse(f.llegadaEn) >= Date.parse(desdeDeLista(hoy, dias)));
  const dias = pendientes.length ? (DIAS_LISTA_LLEGADAS.find((d) => d >= DIAS_LISTA_PREDETERMINADO && alcanza(d)) ?? DIAS_LISTA_LLEGADAS[DIAS_LISTA_LLEGADAS.length - 1]) : DIAS_LISTA_PREDETERMINADO;
  return `${RUTA_LISTA_PUERTO}&dias=${dias}`;
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
    if (f.pagadoEn || f.pagada) t.pagado += f.montoPagado ?? 0;
    else {
      t.pendientes += 1;
      if (f.segundoPago == null) t.sinMonto += 1;
      else t.porPagar += f.segundoPago;
    }
  }
  return t;
}

/**
 * La fila para quien no ve el segundo pago: sin el monto, lo pagado ni su día (no llegan a la pantalla); solo queda que ya se pagó
 * (auditoría de seguridad, 18 nov 2026).
 */
export function filaSinMontos(f: FilaLlegada): FilaLlegada {
  return { ...f, segundoPago: null, montoPagado: null, pagadoEn: null, pagada: f.pagada ?? !!f.pagadoEn };
}

/** La lista de lo que llegó a puerto en los últimos días: a donde lleva «Ver lista» del aviso de Llegada a Puerto (el de bodega sigue abriendo su llegada para pagar). */
export const RUTA_LISTA_PUERTO = "/llegadas?tipo=puerto";

/** ¿Es el aviso de una llegada a puerto? Se reconoce por su título (`armarAviso`): así los avisos que ya estaban guardados también ofrecen la lista. */
export const esAvisoDePuerto = (titulo: string): boolean => titulo.startsWith("Llega a puerto");

/** A dónde lleva un aviso: el de puerto va a la lista de llegadas (no hay nada que gestionar, solo prepararse); los demás conservan su dirección. */
export const hrefDeAviso = (titulo: string, href: string): string => (esAvisoDePuerto(titulo) && href.startsWith("/llegadas") ? RUTA_LISTA_PUERTO : href);

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
