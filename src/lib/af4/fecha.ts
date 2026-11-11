// Fechas y meses del Portal AF4 360°, en español de Panamá y en la hora de Panamá. Un solo `hoyPanama()` para todo el
// portal (antes había una copia en cada página). Sirve en el servidor y en el cliente.
//
// Convenciones: un día es «AAAA-MM-DD» y un mes (período) es «AAAA-MM-01», igual que `fin_movimientos.periodo`.

export const ZONA_PANAMA = "America/Panama";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Hoy en Panamá, «AAAA-MM-DD». `ahora` es para las pruebas. */
export const hoyPanama = (ahora: Date = new Date()): string => ahora.toLocaleDateString("en-CA", { timeZone: ZONA_PANAMA });

/** El primer día del mes de una fecha («2026-10-23» → «2026-10-01»). */
export const inicioDeMes = (fecha: string): string => `${fecha.slice(0, 7)}-01`;

/** El mes en curso en Panamá («AAAA-MM-01»). */
export const mesEnCursoPanama = (ahora: Date = new Date()): string => inicioDeMes(hoyPanama(ahora));

const mesDe = (periodo: string) => Number(periodo.slice(5, 7)) - 1;

/** «sep 26»: columnas y ejes. */
export const mesCorto = (periodo: string): string => `${MESES_CORTOS[mesDe(periodo)]} ${periodo.slice(2, 4)}`;

/** «Sep 2026»: títulos de tarjetas y selectores. */
export const mesMedio = (periodo: string): string => {
  const m = MESES_CORTOS[mesDe(periodo)];
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${periodo.slice(0, 4)}`;
};

/** «septiembre de 2026»: texto corrido. */
export const mesLargo = (periodo: string): string => `${MESES_LARGOS[mesDe(periodo)]} de ${periodo.slice(0, 4)}`;

/** «14 sep 2026». */
export const fechaCorta = (fecha: string): string => `${Number(fecha.slice(8, 10))} ${MESES_CORTOS[mesDe(fecha)]} ${fecha.slice(0, 4)}`;

/** «14 sep»: semanas de la proyección. */
export const diaMes = (fecha: string): string => `${Number(fecha.slice(8, 10))} ${MESES_CORTOS[mesDe(fecha)]}`;

/** «14 sep 2026, 10:32» en la hora de Panamá, de un instante ISO (`actualizado_en`). */
export function fechaHora(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const dia = hoyPanama(d);
  const hora = d.toLocaleTimeString("en-GB", { timeZone: ZONA_PANAMA, hour: "2-digit", minute: "2-digit" });
  return `${fechaCorta(dia)}, ${hora}`;
}

/** «sep 25 – ago 26» (o un solo mes). */
export function rangoMeses(meses: string[]): string {
  if (!meses.length) return "—";
  const ordenados = [...meses].sort();
  const a = ordenados[0];
  const b = ordenados[ordenados.length - 1];
  return a === b ? mesCorto(a) : `${mesCorto(a)} – ${mesCorto(b)}`;
}

/** Suma (o resta) meses a un período. */
export function sumarMeses(periodo: string, n: number): string {
  const total = Number(periodo.slice(0, 4)) * 12 + mesDe(periodo) + n;
  const anio = Math.floor(total / 12);
  const mes = total - anio * 12 + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-01`;
}

/** Los últimos `n` meses hasta el de `hoy` inclusive, del más viejo al más nuevo. */
export function ultimosMeses(hoy: string, n: number): string[] {
  const fin = inicioDeMes(hoy);
  return Array.from({ length: n }, (_, i) => sumarMeses(fin, i - n + 1));
}

/** Acepta «AAAA-MM» o «AAAA-MM-01» y devuelve el período, o null si no tiene esa forma. */
export function leerPeriodo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(v);
  return m ? `${m[1]}-${m[2]}-01` : null;
}
