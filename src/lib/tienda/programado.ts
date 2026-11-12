// La fecha en que el cliente quiere su pedido, leída de la nota del pedido en Shopify (12 nov 2026). Así trabaja el equipo de Kenku: al confirmar
// deja en la nota «para el jueves 19/11», «a partir del lunes 16/11», «pedido sería para el viernes 13»; despacho prepara en las mañanas según esa
// fecha. En Mi Reto Digital la fecha sale de la conversación de WhatsApp; aquí, de la nota. Solo se reconocen fechas claras (16/11, «viernes 13»,
// «15 de noviembre»); las horas («de 8am a 4pm») y lo relativo («mañana», «la próxima semana») no. Sin base: con prueba.

export interface Programado {
  /** El día (AAAA-MM-DD). */
  fecha: string;
  /** «para» ese día, o «desde» ese día en adelante («a partir del…»). */
  tipo: "para" | "desde";
  /** El pedazo de la nota donde está la fecha. */
  cita: string;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_SEMANA = "lunes|martes|miercoles|jueves|viernes|sabado|domingo";

/** Hasta cuántos días después del pedido se cree una fecha (más lejos es otra cosa: un número de casa, un lugar). */
const MAX_DIAS = 45;

const sinTildes =(s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dosCifras = (n: number) => String(n).padStart(2, "0");
const aTexto = (a: number, m: number, d: number) => `${a}-${dosCifras(m)}-${dosCifras(d)}`;

function valida(a: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** El día y mes en el año que corresponde: el del pedido, o el siguiente si ya pasó hace más de un mes (una nota de diciembre que pide enero). */
function conAnio(dia: number, mes: number, pedido: string): string | null {
  const [a] = pedido.split("-").map(Number);
  for (const anio of [a, a + 1]) {
    if (!valida(anio, mes, dia)) continue;
    const t = aTexto(anio, mes, dia);
    const diasAntes = (Date.parse(pedido) - Date.parse(t)) / 86_400_000;
    if (diasAntes <= 31) return t;
  }
  return null;
}

/** Solo el día («viernes 13»): ese día del mes del pedido o, si ya pasó, del mes siguiente. */
function soloDia(dia: number, pedido: string): string | null {
  const [a, m, d] = pedido.split("-").map(Number);
  if (dia >= d && valida(a, m, dia)) return aTexto(a, m, dia);
  const [a2, m2] = m === 12 ? [a + 1, 1] : [a, m + 1];
  return valida(a2, m2, dia) ? aTexto(a2, m2, dia) : null;
}

/** El trozo de la nota alrededor de la fecha (la frase), para mostrarlo tal cual. */
function citaDe(nota: string, inicio: number, fin: number): string {
  const corte = /[.;\n]/;
  let i = inicio;
  while (i > 0 && !corte.test(nota[i - 1]) && inicio - i < 80) i--;
  let j = fin;
  while (j < nota.length && !corte.test(nota[j]) && j - fin < 60) j++;
  return nota.slice(i, j).replace(/^[\s,]+|[\s,]+$/g, "").replace(/\s+/g, " ");
}

/** La fecha que pidió el cliente, según la nota del pedido (`pedido` = el día del pedido, AAAA-MM-DD). null si no hay una clara. */
export function fechaProgramada(nota: string | null | undefined, pedido: string): Programado | null {
  if (!nota) return null;
  const n = sinTildes(nota);
  const candidatos: { inicio: number; fin: number; fecha: string | null }[] = [];
  // 16/11 o 16/11/2026 (con «/»: un «-» puede ser parte de un teléfono).
  for (const m of n.matchAll(/(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?(?![\d/])/g)) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    const anio = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    candidatos.push({ inicio: m.index, fin: m.index + m[0].length, fecha: anio ? (valida(anio, mes, dia) ? aTexto(anio, mes, dia) : null) : conAnio(dia, mes, pedido) });
  }
  // 15 de noviembre
  for (const m of n.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})\\s+de\\s+(${MESES.join("|")}|setiembre)\\b`, "g"))) {
    const mes = m[2] === "setiembre" ? 9 : MESES.indexOf(m[2]) + 1;
    candidatos.push({ inicio: m.index, fin: m.index + m[0].length, fecha: conAnio(Number(m[1]), mes, pedido) });
  }
  // viernes 13 (no «viernes 8am»; si sigue «/11» ya lo tomó el primero).
  for (const m of n.matchAll(new RegExp(`\\b(${DIAS_SEMANA})\\s+(\\d{1,2})(?!\\d)(?!\\s*(?:[/:]|am\\b|pm\\b|a\\.m|p\\.m|h\\b|hrs?\\b|de\\s))`, "g"))) {
    candidatos.push({ inicio: m.index, fin: m.index + m[0].length, fecha: soloDia(Number(m[2]), pedido) });
  }
  // Una fecha a más de 45 días del pedido es otra cosa («casa 24 / 9»), y «24 de Diciembre» suele ser el corregimiento, salvo «el / para el 24 de…».
  const creible = (c: (typeof candidatos)[number]) =>
    !!c.fecha &&
    diasHasta(c.fecha, pedido) <= MAX_DIAS &&
    !(/^24\s+de\s+diciembre/.test(n.slice(c.inicio)) && !/\b(el|para)\s+$/.test(n.slice(Math.max(0, c.inicio - 10), c.inicio)));
  const primero = candidatos.filter(creible).sort((a, b) => a.inicio - b.inicio)[0];
  if (!primero) return null;
  const antes = n.slice(Math.max(0, primero.inicio - 30), primero.inicio);
  const tipo = /(a\s*par?tir|desde|despues\s+de)/.test(antes) ? "desde" : "para";
  return { fecha: primero.fecha!, tipo, cita: citaDe(nota, primero.inicio, primero.fin) };
}

/** Cuántos días faltan (negativo: ya pasó) de `hoy` a la fecha (los dos AAAA-MM-DD). */
export function diasHasta(fecha: string, hoy: string): number {
  return Math.round((Date.parse(fecha) - Date.parse(hoy)) / 86_400_000);
}

/** «hoy», «mañana», «en 3 días», «hace 2 días» (para Programados). */
export function cuandoProgramado(fecha: string, hoy: string): string {
  const d = diasHasta(fecha, hoy);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}
