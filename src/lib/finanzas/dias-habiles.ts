// Días hábiles de Panamá (lunes a viernes sin feriados nacionales). Lógica pura, fechas «AAAA-MM-DD» en UTC (sin hora).
// La usan la fecha objetivo del cierre de mes y el calendario fiscal (si un vencimiento cae en día inhábil, pasa al
// siguiente hábil). Prueba en `dias-habiles.test.ts`.
//
// Feriados (Código de Trabajo y leyes posteriores): 1 ene, 9 ene (Mártires), lunes y martes de Carnaval, Viernes Santo,
// 1 may, 3, 4, 5, 10 y 28 nov, 8 dic (Madres), 20 dic (Duelo nacional) y 25 dic. Un feriado que cae en domingo se pasa
// al lunes.

const FIJOS = ["01-01", "01-09", "05-01", "11-03", "11-04", "11-05", "11-10", "11-28", "12-08", "12-20", "12-25"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fecha = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
export function pascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function sumarDias(f: string, n: number): string {
  const d = fecha(f);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

const cache = new Map<number, Set<string>>();

/** Los feriados (días no laborables) de un año, ya con el traslado del domingo al lunes. */
export function feriadosPanama(anio: number): Set<string> {
  const guardado = cache.get(anio);
  if (guardado) return guardado;
  const p = pascua(anio);
  const base = [...FIJOS.map((x) => `${anio}-${x}`), sumarDias(p, -48), sumarDias(p, -47), sumarDias(p, -2)];
  const salida = new Set<string>();
  for (const f of base) {
    salida.add(f);
    if (fecha(f).getUTCDay() === 0) salida.add(sumarDias(f, 1));
  }
  cache.set(anio, salida);
  return salida;
}

export function esDiaHabil(f: string): boolean {
  const d = fecha(f);
  const dia = d.getUTCDay();
  return dia !== 0 && dia !== 6 && !feriadosPanama(d.getUTCFullYear()).has(f.slice(0, 10));
}

/** La misma fecha si es hábil; si no, el siguiente día hábil. */
export function siguienteDiaHabil(f: string): string {
  let x = f.slice(0, 10);
  for (let i = 0; i < 15 && !esDiaHabil(x); i++) x = sumarDias(x, 1);
  return x;
}

/** El día hábil número `n` (1 = el primero) del mes `periodo` («AAAA-MM-01»). */
export function diaHabilDelMes(periodo: string, n: number): string {
  let x = `${periodo.slice(0, 7)}-01`;
  let cuenta = 0;
  for (let i = 0; i < 62; i++) {
    if (esDiaHabil(x)) {
      cuenta++;
      if (cuenta >= Math.max(1, n)) return x;
    }
    const sig = sumarDias(x, 1);
    // Más días hábiles pedidos que los que tiene el mes: el último hábil del mes.
    if (sig.slice(0, 7) !== periodo.slice(0, 7)) return x;
    x = sig;
  }
  return x;
}

/**
 * Días hábiles de `desde` a `hasta`: positivo si `hasta` es posterior (cuenta los hábiles en (desde, hasta]), negativo si
 * es anterior, 0 si es el mismo día.
 */
export function diasHabilesEntre(desde: string, hasta: string): number {
  if (desde === hasta) return 0;
  const signo = hasta > desde ? 1 : -1;
  const [a, b] = signo > 0 ? [desde, hasta] : [hasta, desde];
  let n = 0;
  for (let x = sumarDias(a, 1), i = 0; x <= b && i < 4000; x = sumarDias(x, 1), i++) if (esDiaHabil(x)) n++;
  return n * signo;
}
