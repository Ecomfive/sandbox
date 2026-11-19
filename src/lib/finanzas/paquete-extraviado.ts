// «Paquete extraviado» (pedido de María José, Oceans, 19 nov 2026): cuando un repartidor pierde un paquete y lo paga, se
// registran dos movimientos en el libro, no uno neto. (1) La mercadería perdida, al costo, como merma (costo de ventas,
// en el EERR y fuera del flujo: ya se pagó al comprarla). (2) Lo que paga el repartidor, como otros ingresos (en el EERR
// y, si ya entró a una cuenta, en el flujo). Así el margen del producto no se ensucia y se ve cuánto se recupera de lo
// que se pierde. Si el pago lleva factura lo decide el contador. Lógica pura: la usa `paquete-extraviado-actions.ts`.

export const TIPO_MERCADERIA_EXTRAVIADA = "Mercadería extraviada";
export const TIPO_INDEMNIZACION = "Indemnización por paquete extraviado";
export const ORIGEN_EXTRAVIADO = "paquete_extraviado";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export interface DatosExtraviado {
  unidadId: string;
  /** Día en que se dio por perdido (su mes es el del EERR). */
  fecha: string;
  /** Número de pedido o guía, para encontrarlo después y no registrarlo dos veces. */
  pedido: string;
  repartidor: string;
  /** Costo de la mercadería perdida. 0 = no se registra la merma (ya se registró de otra forma). */
  costo: number;
  /** Lo que paga el repartidor. 0 = todavía no paga o no paga. */
  indemnizacion: number;
  /** Cuenta donde entró el pago; sin cuenta, el ingreso queda solo en el EERR (por cobrar). */
  cuentaId: string | null;
  fechaPago: string | null;
}

function monto(v: unknown): number | null {
  const s = typeof v === "string" ? v.trim().replace(/[$\s,]/g, "") : typeof v === "number" ? String(v) : "";
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? r2(n) : null;
}

export function leerExtraviado(get: (campo: string) => unknown): DatosExtraviado | { error: string } {
  const s = (k: string) => {
    const v = get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const unidadId = s("unidad_id");
  if (!UUID.test(unidadId)) return { error: "Elige la tienda." };
  const fecha = s("fecha");
  if (!FECHA.test(fecha)) return { error: "Elige el día en que se perdió." };
  const pedido = s("pedido").replace(/\s+/g, " ").slice(0, 60);
  if (!pedido) return { error: "Falta el número de pedido o guía." };
  const repartidor = s("repartidor").replace(/\s+/g, " ").slice(0, 80);
  const costo = monto(get("costo"));
  if (costo === null) return { error: "El costo de la mercadería no es un monto válido." };
  const indemnizacion = monto(get("indemnizacion"));
  if (indemnizacion === null) return { error: "Lo que paga el repartidor no es un monto válido." };
  if (costo === 0 && indemnizacion === 0) return { error: "Escribe el costo de la mercadería, lo que paga el repartidor o los dos." };
  const cuenta = s("cuenta_id");
  const cuentaId = UUID.test(cuenta) ? cuenta : null;
  const fp = s("fecha_pago");
  if (fp && !FECHA.test(fp)) return { error: "Fecha de pago inválida." };
  if (cuentaId && indemnizacion === 0) return { error: "Elegiste la cuenta del pago pero falta lo que paga el repartidor." };
  return { unidadId, fecha, pedido, repartidor, costo, indemnizacion, cuentaId, fechaPago: cuentaId ? fp || fecha : null };
}

/** La llave de cada movimiento: repetir el mismo pedido actualiza en vez de duplicar. */
export const claveExtraviado = (unidadId: string, pedido: string, parte: "merma" | "pago") =>
  `extraviado:${unidadId}:${pedido.toUpperCase().replace(/[^A-Z0-9-]/g, "")}:${parte}`;

export interface MovimientoExtraviado {
  parte: "merma" | "pago";
  tipo: string;
  periodo: string;
  descripcion: string;
  monto: number;
  en_eerr: boolean;
  en_flujo: boolean;
  cuenta_id: string | null;
  fecha_pago: string | null;
  origen_clave: string;
}

/** Los movimientos que deja el registro (uno o dos). Montos positivos: el signo lo da el tipo. */
export function movimientosExtraviado(d: DatosExtraviado): MovimientoExtraviado[] {
  const periodo = `${d.fecha.slice(0, 7)}-01`;
  const quien = d.repartidor ? ` · ${d.repartidor}` : "";
  const salida: MovimientoExtraviado[] = [];
  if (d.costo > 0) {
    salida.push({
      parte: "merma",
      tipo: TIPO_MERCADERIA_EXTRAVIADA,
      periodo,
      descripcion: `Paquete extraviado · pedido ${d.pedido}${quien}`,
      monto: d.costo,
      en_eerr: true,
      en_flujo: false,
      cuenta_id: null,
      fecha_pago: null,
      origen_clave: claveExtraviado(d.unidadId, d.pedido, "merma"),
    });
  }
  if (d.indemnizacion > 0) {
    salida.push({
      parte: "pago",
      tipo: TIPO_INDEMNIZACION,
      periodo,
      descripcion: `Pago del repartidor por paquete extraviado · pedido ${d.pedido}${quien}`,
      monto: d.indemnizacion,
      en_eerr: true,
      en_flujo: !!d.cuentaId,
      cuenta_id: d.cuentaId,
      fecha_pago: d.fechaPago,
      origen_clave: claveExtraviado(d.unidadId, d.pedido, "pago"),
    });
  }
  return salida;
}

/** Lo que queda de la pérdida después del pago (positivo = se perdió; negativo = el repartidor pagó más que el costo). */
export const perdidaNeta = (d: Pick<DatosExtraviado, "costo" | "indemnizacion">) => r2(d.costo - d.indemnizacion);
