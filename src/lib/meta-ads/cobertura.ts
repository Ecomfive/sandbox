// Anuncios Meta › Cuentas › Historial: qué fechas de cada cuenta ya se trajeron de Meta. Una lectura que llegó completa deja su rango en `meta_lecturas_tramos` (migración 0346); lo leído antes de ese
// registro solo se ve por los días que tienen resultados (`meta_resultados_dia`). Lógica pura, con prueba.

const DIA = 86_400_000;
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const aMs = (fecha: string) => new Date(`${fecha}T00:00:00Z`).getTime();

/** Lo que dice la base de una cuenta: los rangos que se leyeron completos y los días con resultados. */
export interface CoberturaBruta {
  tramos: [string, string][];
  dias: string[];
}

export interface CoberturaCuenta {
  /** Días dentro de un rango leído por completo (registro de lecturas). */
  registrados: Set<string>;
  /** Días con al menos un resultado guardado. */
  conDatos: Set<string>;
}

export type EstadoMes = "completo" | "parcial" | "sin_leer";

export interface MesCubierto {
  /** AAAA-MM */
  mes: string;
  /** Cuántos días del mes cuentan (el mes actual, hasta hoy). */
  dias: number;
  registrados: number;
  conDatos: number;
  estado: EstadoMes;
}

/** Cada día entre dos fechas, ambas incluidas. */
export function diasEntre(desde: string, hasta: string): string[] {
  const salida: string[] = [];
  for (let t = aMs(desde); t <= aMs(hasta) && salida.length < 4_000; t += DIA) salida.push(aIso(t));
  return salida;
}

export function coberturaDe(bruta: CoberturaBruta): CoberturaCuenta {
  const registrados = new Set<string>();
  for (const [desde, hasta] of bruta.tramos) for (const d of diasEntre(desde, hasta)) registrados.add(d);
  return { registrados, conDatos: new Set(bruta.dias) };
}

/**
 * Los últimos `meses` meses (el actual incluido), del más nuevo al más viejo. «Completo» = cada día del mes está dentro de una lectura registrada; «parcial» = hay algo (días registrados o con resultados) pero no todo;
 * «sin leer» = nada. Una cuenta que no gastó algunos días y se leyó antes del registro sale «parcial» aunque esté bien: solo se ven los días con gasto.
 */
export function mesesCubiertos(c: CoberturaCuenta, hoy: string, meses = 13): MesCubierto[] {
  const [anioHoy, mesHoy] = hoy.split("-").map(Number);
  const salida: MesCubierto[] = [];
  for (let k = 0; k < meses; k++) {
    const total = anioHoy * 12 + (mesHoy - 1) - k;
    const anio = Math.floor(total / 12);
    const mes = (total % 12) + 1;
    const clave = `${anio}-${String(mes).padStart(2, "0")}`;
    const primero = `${clave}-01`;
    const ultimoDelMes = aIso(Date.UTC(anio, mes, 0));
    const ultimo = ultimoDelMes < hoy ? ultimoDelMes : hoy;
    const dias = diasEntre(primero, ultimo);
    const registrados = dias.filter((d) => c.registrados.has(d)).length;
    const conDatos = dias.filter((d) => c.conDatos.has(d)).length;
    const estado: EstadoMes = dias.length > 0 && registrados === dias.length ? "completo" : registrados > 0 || conDatos > 0 ? "parcial" : "sin_leer";
    salida.push({ mes: clave, dias: dias.length, registrados, conDatos, estado });
  }
  return salida;
}

/** Un tramo ya está traído si todos sus días están en una lectura registrada o si casi todos (70 %) tienen resultados (lo leído antes del registro). */
export function tramoYaTraido(t: { desde: string; hasta: string }, c: CoberturaCuenta): boolean {
  const dias = diasEntre(t.desde, t.hasta);
  if (!dias.length) return true;
  if (dias.every((d) => c.registrados.has(d))) return true;
  return dias.filter((d) => c.conDatos.has(d)).length / dias.length >= 0.7;
}

/** Parte un tramo en dos mitades, la más nueva primero. Null si ya es de un solo día. */
export function partirTramo(t: { desde: string; hasta: string }): [{ desde: string; hasta: string }, { desde: string; hasta: string }] | null {
  const n = diasEntre(t.desde, t.hasta).length;
  if (n <= 1) return null;
  const mitad = Math.floor(n / 2);
  const corte = aIso(aMs(t.desde) + (n - mitad) * DIA);
  return [
    { desde: corte, hasta: t.hasta },
    { desde: t.desde, hasta: aIso(aMs(corte) - DIA) },
  ];
}

/** El texto corto de un mes: «nov 25». */
export function nombreCortoDeMes(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  return `${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1]} ${String(anio).slice(2)}`;
}
