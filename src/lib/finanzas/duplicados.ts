// Posibles duplicados del libro y montos atípicos por tipo. Lógica pura (sin Supabase): la usan la pestaña
// «Duplicados», la lista de movimientos y «Salud de datos». Prueba en `duplicados.test.ts`.

import { similitud } from "./similitud";

const DIA = 86_400_000;
const diasEntre = (a: string, b: string) => Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA);

export interface MovRevisable {
  id: string;
  /** La fecha que mejor ubica el movimiento: la de pago, la de registro o el primer día de su mes. */
  fecha: string;
  monto: number;
  descripcion: string;
  /** El proveedor canónico, si se reconoce: dos movimientos del mismo proveedor cuentan como parecidos. */
  proveedor?: string | null;
}

export interface ParDuplicado {
  a: string;
  b: string;
  /** «idMenor|idMayor»: la llave con que se guarda «no es duplicado». */
  clave: string;
  similitud: number;
  dias: number;
}

/** La llave de un par, sin importar el orden. */
export const clavePar = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export interface OpcionesDuplicados {
  /** Días de diferencia que se toleran (±). */
  dias?: number;
  /** Parecido mínimo de la descripción (0 a 1) cuando no se sabe el proveedor. */
  minSimilitud?: number;
  /** Montos más chicos que esto (comisiones de centavos que se repiten a diario) no se revisan. */
  montoMinimo?: number;
  /** Pares ya marcados como «no es duplicado». */
  descartados?: Set<string>;
}

/**
 * Pares de movimientos que pueden ser el mismo cargado dos veces: el mismo monto al centavo, fechas a 3 días o menos y
 * el mismo proveedor o una descripción parecida. Devuelve los pares más parecidos primero.
 */
export function posiblesDuplicados(movs: MovRevisable[], o: OpcionesDuplicados = {}): ParDuplicado[] {
  const { dias = 3, minSimilitud = 0.6, montoMinimo = 5, descartados = new Set<string>() } = o;
  const porMonto = new Map<string, MovRevisable[]>();
  for (const m of movs) {
    if (!m.fecha || Math.abs(m.monto) < montoMinimo) continue;
    const k = m.monto.toFixed(2);
    const l = porMonto.get(k) ?? [];
    l.push(m);
    porMonto.set(k, l);
  }
  const pares: ParDuplicado[] = [];
  for (const grupo of porMonto.values()) {
    if (grupo.length < 2) continue;
    grupo.sort((x, y) => x.fecha.localeCompare(y.fecha));
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        const d = diasEntre(grupo[i].fecha, grupo[j].fecha);
        if (d > dias) break;
        const clave = clavePar(grupo[i].id, grupo[j].id);
        if (descartados.has(clave)) continue;
        const mismoProveedor = !!grupo[i].proveedor && grupo[i].proveedor === grupo[j].proveedor;
        const sim = mismoProveedor ? 1 : similitud(grupo[i].descripcion, grupo[j].descripcion);
        if (sim < minSimilitud) continue;
        const [a, b] = clave.split("|");
        pares.push({ a, b, clave, similitud: Math.round(sim * 100) / 100, dias: d });
      }
    }
  }
  return pares.sort((x, y) => y.similitud - x.similitud || x.dias - y.dias);
}

export interface MovTipo {
  id: string;
  tipo_id: string | null;
  /** «AAAA-MM-01». */
  periodo: string;
  monto: number;
}

export interface Atipico {
  id: string;
  /** La mediana de su tipo en los meses anteriores. */
  mediana: number;
  /** Cuántas veces la mediana. */
  veces: number;
  /** z robusto (con la desviación absoluta mediana). */
  z: number | null;
  muestra: number;
}

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const restarMeses = (periodo: string, n: number) => {
  const [a, m] = periodo.split("-").map(Number);
  const t = a * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
};

export interface OpcionesAtipicos {
  /** Meses anteriores que forman la referencia del tipo. */
  meses?: number;
  /** Veces la mediana a partir de las cuales es atípico. */
  factor?: number;
  /** z robusto mínimo (además del factor). */
  z?: number;
  /** Movimientos mínimos en la referencia para juzgar. */
  minMuestra?: number;
}

/**
 * Montos atípicos: un movimiento es atípico si pasa de `factor` veces la mediana de su tipo en los `meses` anteriores
 * (sin contar su propio mes) y su z robusto pasa de `z`. Con menos de `minMuestra` movimientos de referencia no se juzga.
 * Se compara el valor absoluto (un reverso grande también se revisa).
 */
export function detectarAtipicos(movs: MovTipo[], o: OpcionesAtipicos = {}): Map<string, Atipico> {
  const { meses = 6, factor = 3, z = 3.5, minMuestra = 6 } = o;
  const porTipoMes = new Map<string, Map<string, number[]>>();
  for (const m of movs) {
    if (!m.tipo_id || !m.monto) continue;
    const t = porTipoMes.get(m.tipo_id) ?? new Map<string, number[]>();
    const l = t.get(m.periodo) ?? [];
    l.push(Math.abs(m.monto));
    t.set(m.periodo, l);
    porTipoMes.set(m.tipo_id, t);
  }
  const referencia = new Map<string, { med: number; mad: number; n: number } | null>();
  const refDe = (tipo: string, periodo: string) => {
    const k = `${tipo}|${periodo}`;
    if (referencia.has(k)) return referencia.get(k)!;
    const t = porTipoMes.get(tipo)!;
    const xs: number[] = [];
    for (let i = 1; i <= meses; i++) xs.push(...(t.get(restarMeses(periodo, i)) ?? []));
    const r = xs.length >= minMuestra ? (() => {
      const med = mediana(xs);
      return { med, mad: mediana(xs.map((x) => Math.abs(x - med))), n: xs.length };
    })() : null;
    referencia.set(k, r);
    return r;
  };
  const salida = new Map<string, Atipico>();
  for (const m of movs) {
    if (!m.tipo_id || !m.monto) continue;
    const r = refDe(m.tipo_id, m.periodo);
    if (!r || r.med <= 0) continue;
    const x = Math.abs(m.monto);
    const veces = x / r.med;
    if (veces < factor) continue;
    const zr = r.mad > 0 ? (0.6745 * (x - r.med)) / r.mad : null;
    if (zr !== null && zr < z) continue;
    salida.set(m.id, { id: m.id, mediana: r.med, veces: Math.round(veces * 10) / 10, z: zr === null ? null : Math.round(zr * 10) / 10, muestra: r.n });
  }
  return salida;
}
