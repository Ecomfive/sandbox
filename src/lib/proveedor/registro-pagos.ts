// Portal del proveedor › «Registro de pagos» (23 oct 2026, pedido de Hernán): los envíos con las columnas de la hoja «payment record»
// de Chin (Product, Quantity, Amount, Delivery Time, Down payment, Paid amount, Payment Time, Unpaid Amount, Due date for payment,
// Balance payment, Arrival Time, Paid Time). Chin (en su portal) y Ecomfive (en el Tablero de Chin) cambian cualquier celda: lo editado
// vive en `proveedor_registro` (migración 0142), aparte de la compra (Compras lo actualiza Francis a mano). Una celda vacía vuelve al
// valor de siempre (de la compra, de la hoja o calculado). Lógica pura, con prueba.

import { estadoCuota, type EstadoCuota } from "./cuotas";
import type { EnvioConCuotas } from "./resumen-pagos";

export const CAMPOS_REGISTRO = ["producto", "unidades", "monto", "fecha_envio", "anticipo", "pagado", "fecha_pago", "sin_pagar", "vence", "saldo", "llegada", "fecha_pago_saldo"] as const;
export type CampoRegistro = (typeof CAMPOS_REGISTRO)[number];

export const TIPO_CAMPO: Record<CampoRegistro, "texto" | "numero" | "fecha"> = {
  producto: "texto",
  unidades: "numero",
  monto: "numero",
  fecha_envio: "fecha",
  anticipo: "numero",
  pagado: "numero",
  fecha_pago: "fecha",
  sin_pagar: "numero",
  vence: "fecha",
  saldo: "numero",
  llegada: "fecha",
  fecha_pago_saldo: "fecha",
};

/** Las que normalmente se calculan solas (se pueden fijar a mano; vacías vuelven a calcularse). */
export const CAMPOS_CALCULADOS: readonly CampoRegistro[] = ["anticipo", "sin_pagar", "vence", "saldo"];

/** El nombre de cada columna en la hoja de Chin (va debajo del nombre en el idioma de la pantalla). */
export const COLUMNA_HOJA: Record<CampoRegistro, string> = {
  producto: "Product",
  unidades: "Quantity",
  monto: "Amount",
  fecha_envio: "Delivery Time",
  anticipo: "Down payment",
  pagado: "Paid amount",
  fecha_pago: "Payment Time",
  sin_pagar: "Unpaid Amount",
  vence: "Due date for payment",
  saldo: "Balance payment",
  llegada: "Arrival Time",
  fecha_pago_saldo: "Paid Time",
};

/** Lo editado de una fila (null o ausente = el valor de siempre). */
export type Registro = Partial<Record<CampoRegistro, string | number | null>>;

/** La clave de una fila: el pedido del espejo o, para una fila de las hojas de Chin sin compra, su clave de la hoja. */
export const filaDePedido = (pedidoId: string) => pedidoId;
export const filaDeHoja = (clave: string) => `hoja:${clave}`;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Lee lo que se escribió en una celda: vacío = null (vuelve al valor de siempre). Devuelve el error como valor. */
export function leerCelda(campo: CampoRegistro, valor: unknown): { valor: string | number | null } | { error: string } {
  const texto = valor === null || valor === undefined ? "" : String(valor).trim();
  if (!texto) return { valor: null };
  const tipo = TIPO_CAMPO[campo];
  if (tipo === "texto") return texto.length > 200 ? { error: "El texto es muy largo." } : { valor: texto };
  if (tipo === "fecha") {
    if (!FECHA.test(texto) || Number.isNaN(Date.parse(texto)) || texto < "2020-01-01" || texto > "2100-12-31") return { error: "Fecha no válida." };
    return { valor: texto };
  }
  const n = Number(texto.replace(/[$\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n >= 1e9) return { error: "Escribe un número mayor o igual que cero." };
  return { valor: campo === "unidades" ? Math.round(n) : Math.round(n * 100) / 100 };
}

const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
const txt = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : String(v));

export interface FilaRegistro {
  fila: string;
  pedidoId: string | null;
  referencia: string | null;
  foto: string | null;
  paisCodigo: string | null;
  /** El valor que se ve en cada columna (ya con lo editado). */
  valores: Record<CampoRegistro, string | number | null>;
  /** Las columnas con un valor escrito a mano. */
  editadas: CampoRegistro[];
  estadoAnticipo: EstadoCuota | null;
}

/** Una fila por envío, del más nuevo al más viejo (como `enviosConCuotas`, que ya aplicó lo editado que cuenta para las cuotas). */
export function filasRegistro(envios: EnvioConCuotas[], datos: { registro: Record<string, Registro>; llegadaProveedor: Record<string, string> }, hoy: string): FilaRegistro[] {
  return envios.map((e) => {
    const r = datos.registro[e.fila] ?? {};
    const anticipo = e.cuotas.find((c) => c.cuota === "anticipo") ?? null;
    const saldo = e.cuotas.find((c) => c.cuota === "saldo") ?? null;
    const sinPagar = Math.round((anticipo?.pendiente ?? 0) * 100) / 100;
    const valores: Record<CampoRegistro, string | number | null> = {
      producto: txt(r.producto) ?? e.producto,
      unidades: num(r.unidades) ?? e.unidades,
      monto: e.montoTotal,
      fecha_envio: e.fechaEnvio,
      anticipo: anticipo?.monto ?? 0,
      pagado: anticipo && anticipo.pagado > 0 ? anticipo.pagado : null,
      fecha_pago: anticipo && anticipo.pagado > 0 ? anticipo.fechaPago : null,
      sin_pagar: num(r.sin_pagar) ?? sinPagar,
      vence: txt(r.vence) ?? (sinPagar > 0 && anticipo ? anticipo.vence : null),
      saldo: num(r.saldo) ?? Math.round((saldo?.pendiente ?? 0) * 100) / 100,
      llegada: txt(r.llegada) ?? (e.pedidoId ? (datos.llegadaProveedor[e.pedidoId] ?? null) : null) ?? e.fechaLlegada,
      fecha_pago_saldo: saldo && saldo.pagado > 0 ? saldo.fechaPago : null,
    };
    return {
      fila: e.fila,
      pedidoId: e.pedidoId,
      referencia: e.referencia,
      foto: e.fotoReferencia,
      paisCodigo: e.paisCodigo,
      valores,
      editadas: CAMPOS_REGISTRO.filter((c) => r[c] !== null && r[c] !== undefined && r[c] !== ""),
      estadoAnticipo: anticipo ? estadoCuota(anticipo, hoy) : null,
    };
  });
}

/** Los totales de la última fila de la hoja: lo que falta de anticipos y de saldos. */
export function totalesRegistro(filas: FilaRegistro[]) {
  const suma = (c: CampoRegistro) => Math.round(filas.reduce((s, f) => s + Number(f.valores[c] ?? 0), 0) * 100) / 100;
  return { sinPagar: suma("sin_pagar"), saldo: suma("saldo") };
}
