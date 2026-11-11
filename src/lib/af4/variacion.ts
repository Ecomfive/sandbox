// Variación de un indicador contra una referencia (el período anterior, el presupuesto), con su dirección, si es buena o
// mala y el texto para leer y para lectores de pantalla. Lógica pura: la dibuja `<Variacion>` (src/components/af4).

import { dinero, porcentaje, puntos, type Moneda } from "./formato";

/** Si subir es bueno (ingresos, EBITDA, caja) o malo (gastos, días de cobro). */
export type Sentido = "mas-es-mejor" | "menos-es-mejor" | "neutro";
export type Direccion = "sube" | "baja" | "igual";

export interface Variacion {
  actual: number;
  referencia: number;
  /** actual − referencia. */
  diferencia: number;
  /** Cambio relativo en % (sobre el valor absoluto de la referencia); null si la referencia es cero. */
  pct: number | null;
  direccion: Direccion;
  /** true = bueno, false = malo, null = sin juicio (neutro o igual). */
  favorable: boolean | null;
}

/** Debajo de esto (en % o, sin %, en unidades) se considera que no cambió. */
const UMBRAL_IGUAL = 0.05;

export function calcularVariacion(actual: number, referencia: number, sentido: Sentido = "mas-es-mejor"): Variacion {
  const diferencia = actual - referencia;
  const pct = referencia === 0 ? null : (diferencia / Math.abs(referencia)) * 100;
  const medida = pct ?? diferencia;
  const direccion: Direccion = Math.abs(medida) < UMBRAL_IGUAL ? "igual" : diferencia > 0 ? "sube" : "baja";
  const favorable =
    direccion === "igual" || sentido === "neutro" ? null : (direccion === "sube") === (sentido === "mas-es-mejor");
  return { actual, referencia, diferencia, pct, direccion, favorable };
}

export type ModoVariacion = "pct" | "dinero" | "puntos";

/** El número de la variación: «+12.4 %», «−$1,200» o «+1.2 pp». Sin % calculable (referencia cero) cae a la diferencia. */
export function textoVariacion(v: Variacion, modo: ModoVariacion = "pct", moneda: Moneda = "USD"): string {
  if (modo === "puntos") return puntos(v.diferencia);
  if (modo === "dinero" || v.pct === null) return dinero(v.diferencia, moneda, { conSigno: true });
  return porcentaje(v.pct, { conSigno: true });
}

/** El tono del punto: verde si es favorable, rojo si no, neutro si no hay juicio. */
export const tonoVariacion = (v: Variacion): "success" | "destructive" | "neutral" =>
  v.favorable === true ? "success" : v.favorable === false ? "destructive" : "neutral";

/** Texto completo para lectores de pantalla: «Sube 12.4 % frente a mes anterior, favorable». */
export function textoLectorVariacion(v: Variacion, contra: string, modo: ModoVariacion = "pct", moneda: Moneda = "USD"): string {
  const verbo = v.direccion === "sube" ? "Sube" : v.direccion === "baja" ? "Baja" : "Sin cambio";
  const cifra = v.direccion === "igual" ? "" : ` ${textoVariacion(v, modo, moneda).replace(/^[+−]/, "")}`;
  const juicio = v.favorable === true ? ", favorable" : v.favorable === false ? ", desfavorable" : "";
  return `${verbo}${cifra} frente a ${contra}${juicio}`;
}
