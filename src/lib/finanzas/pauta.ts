// Portal AF4 360° › Techo de pauta por tienda (mejora 6) y la base por tienda y mes del Comité de dirección (mejora 5).
// Lógica pura: las filas salen de `fin_comite_tiendas_mes` (migración 0942). La pauta de una tienda en un mes es el mayor
// entre el marketing del libro y el gasto de las campañas de Meta importadas (el mismo criterio que la unidad económica,
// 0147); las ventas son lo entregado más lo que sigue en tránsito por la tasa con que esa tienda resuelve sus envíos
// (entregadas ÷ entregadas + devueltas), para que un mes reciente no parezca peor solo porque sus pedidos no llegaron
// todavía. El techo se guarda en `fin_config` (clave `techo_pauta`). Prueba en `pauta.test.ts`.

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Una tienda en un mes (una fila de `fin_comite_tiendas_mes`). */
export interface FilaTiendaMes {
  periodo: string;
  unidadId: string;
  ordenes: number;
  enviadas: number;
  entregadas: number;
  devueltas: number;
  enTransito: number;
  ventasEntregadas: number;
  ventasTransito: number;
  /** Enviados hace más de 10 días (a la fecha de corte). */
  elegiblesEstado: number;
  /** De esos, sin estado final. */
  sinEstado: number;
  marketingLibro: number;
  gastoMeta: number;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export function filaTiendaMes(r: Record<string, unknown>): FilaTiendaMes {
  return {
    periodo: String(r.periodo ?? "").slice(0, 10),
    unidadId: String(r.unidad_id ?? ""),
    ordenes: num(r.ordenes),
    enviadas: num(r.enviadas),
    entregadas: num(r.entregadas),
    devueltas: num(r.devueltas),
    enTransito: num(r.en_transito),
    ventasEntregadas: num(r.ventas_entregadas),
    ventasTransito: num(r.ventas_transito),
    elegiblesEstado: num(r.elegibles_estado),
    sinEstado: num(r.sin_estado),
    marketingLibro: num(r.marketing_libro),
    gastoMeta: num(r.gasto_meta),
  };
}

/** La pauta del mes: el mayor entre el libro y Meta (como la unidad económica). */
export const pautaDe = (f: Pick<FilaTiendaMes, "marketingLibro" | "gastoMeta">) => Math.max(f.marketingLibro, f.gastoMeta);

/** Con qué tasa resuelve sus envíos cada tienda (entregadas ÷ entregadas + devueltas) en las filas dadas. */
export function tasasResolucion(filas: FilaTiendaMes[]): Map<string, number> {
  const acc = new Map<string, { e: number; d: number }>();
  for (const f of filas) {
    const x = acc.get(f.unidadId) ?? { e: 0, d: 0 };
    x.e += f.entregadas;
    x.d += f.devueltas;
    acc.set(f.unidadId, x);
  }
  return new Map([...acc].filter(([, x]) => x.e + x.d > 0).map(([id, x]) => [id, x.e / (x.e + x.d)]));
}

/** Las ventas que se esperan del mes: lo entregado más lo que sigue en tránsito por la tasa de resolución (sin tasa, 0). */
export const ventasEsperadas = (f: Pick<FilaTiendaMes, "ventasEntregadas" | "ventasTransito">, tasa: number | undefined) =>
  f.ventasEntregadas + f.ventasTransito * (tasa ?? 0);

// ---------------------------------------------------------------------------------------------------------------------
// Tiendas propias (las que hacen pauta)
// ---------------------------------------------------------------------------------------------------------------------

export interface UnidadPauta {
  id: string;
  nombre: string;
  clase: string;
  canal?: string | null;
}

/**
 * Las tiendas que cuentan como «propias» si no se eligió otra cosa: las de clase tienda que no son la proveeduría de
 * Dropi (ECOMFIVE vende a dropshippers, sin pauta) ni Clicksi (tienda de un tercero a quien solo se le presta el servicio).
 */
export function tiendasPropiasPredeterminadas(unidades: UnidadPauta[]): string[] {
  return unidades
    .filter((u) => {
      if (u.clase !== "tienda") return false;
      const n = u.nombre.toUpperCase();
      if (u.canal === "dropi" || u.canal === "clicksi") return false;
      return !n.startsWith("ECOMFIVE") && !n.includes("DROPI") && !n.includes("CLICKSI") && !n.startsWith("SIN ASIGNAR");
    })
    .map((u) => u.id);
}

/** Las propias guardadas (solo las que existen) o, sin elección, las de por defecto. */
export function tiendasPropias(unidades: UnidadPauta[], elegidas: string[] | null): string[] {
  if (!elegidas) return tiendasPropiasPredeterminadas(unidades);
  const validas = new Set(unidades.filter((u) => u.clase === "tienda").map((u) => u.id));
  return elegidas.filter((id) => validas.has(id));
}

// ---------------------------------------------------------------------------------------------------------------------
// Techo de pauta
// ---------------------------------------------------------------------------------------------------------------------

export const CLAVE_TECHO_PAUTA = "techo_pauta";
/** % de las ventas. */
export const TECHO_PREDETERMINADO = 22;
export const TECHO_MIN = 1;
export const TECHO_MAX = 80;
/** El mes en curso se proyecta recién desde este día (antes hay muy poco del mes para decir algo). */
export const DIA_MINIMO_PROYECCION = 7;
/** Una tienda supera el techo por mucho (alerta crítica) con estos puntos de más. */
export const PUNTOS_CRITICOS = 10;

export interface ConfigTecho {
  general: number;
  /** Techo propio de una tienda (id → %). */
  porTienda: Record<string, number>;
}

const enRango = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= TECHO_MIN && n <= TECHO_MAX;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leerTecho(v: unknown): ConfigTecho {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const g = typeof o.general === "string" ? Number(o.general) : o.general;
  const porTienda: Record<string, number> = {};
  const crudo = o.por_tienda && typeof o.por_tienda === "object" ? (o.por_tienda as Record<string, unknown>) : {};
  for (const [id, x] of Object.entries(crudo)) {
    const n = typeof x === "string" ? Number(x) : x;
    if (UUID.test(id) && enRango(n)) porTienda[id] = n;
  }
  return { general: enRango(g) ? g : TECHO_PREDETERMINADO, porTienda };
}

export const techoAGuardar = (c: ConfigTecho) => ({ general: c.general, por_tienda: c.porTienda });

const leerNumero = (t: unknown): number | null => {
  const s = String(t ?? "").replace(/\s/g, "").replace(",", ".").replace(/%$/, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

/**
 * Lo que llega del formulario: `general` y, por tienda, `tienda:<id>` (vacío = usa el general). Solo tiendas de la lista
 * dada.
 */
export function validarTecho(leer: (campo: string) => unknown, tiendas: string[]): { techo: ConfigTecho } | { error: string } {
  const g = leerNumero(leer("general"));
  if (g === null || !enRango(g)) return { error: `Techo general: un número de ${TECHO_MIN} a ${TECHO_MAX}.` };
  const porTienda: Record<string, number> = {};
  for (const id of tiendas) {
    const crudo = leer(`tienda:${id}`);
    if (crudo === null || crudo === undefined || String(crudo).trim() === "") continue;
    const n = leerNumero(crudo);
    if (n === null || !enRango(n)) return { error: `El techo de cada tienda: un número de ${TECHO_MIN} a ${TECHO_MAX}, o vacío.` };
    if (n !== g) porTienda[id] = n;
  }
  return { techo: { general: g, porTienda } };
}

export const techoDe = (c: ConfigTecho, unidadId: string) => c.porTienda[unidadId] ?? c.general;

/** Días del mes (`AAAA-MM-01`). */
export function diasDelMes(periodo: string): number {
  const [a, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Por cuánto se multiplica lo que va del mes para llevarlo a fin de mes (1 si el mes ya terminó). */
export function factorProyeccion(periodo: string, hoy: string): number {
  if (hoy.slice(0, 7) !== periodo.slice(0, 7)) return 1;
  const dia = Math.max(1, Number(hoy.slice(8, 10)));
  return diasDelMes(periodo) / dia;
}

export interface PautaTienda {
  unidadId: string;
  pauta: number;
  ventas: number;
  /** Pauta ÷ ventas en % (null sin ventas). */
  pct: number | null;
  techo: number;
  /** Pauta por encima del techo (0 si está dentro). */
  excedente: number;
  /** El excedente llevado a un año (excedente por mes × 12). */
  excedenteAnual: number;
  /** Meses que se sumaron. */
  meses: number;
  /** Si incluye el mes en curso proyectado a fin de mes. */
  proyectado: boolean;
}

/**
 * La pauta de cada tienda en los meses dados (sumados) contra su techo. El mes en curso, si está entre ellos, se proyecta a
 * fin de mes (pauta y ventas por el mismo factor). Las tasas de resolución salen de `tasas` (o de las mismas filas).
 */
export function pautaPorTienda(
  filas: FilaTiendaMes[],
  meses: string[],
  tiendas: string[],
  techo: ConfigTecho,
  hoy: string,
  tasas: Map<string, number> = tasasResolucion(filas),
): PautaTienda[] {
  const enMeses = new Set(meses);
  const deTiendas = new Set(tiendas);
  const acc = new Map<string, { pauta: number; ventas: number; meses: Set<string>; proyectado: boolean }>();
  for (const f of filas) {
    if (!enMeses.has(f.periodo) || !deTiendas.has(f.unidadId)) continue;
    const factor = factorProyeccion(f.periodo, hoy);
    const x = acc.get(f.unidadId) ?? { pauta: 0, ventas: 0, meses: new Set<string>(), proyectado: false };
    x.pauta += pautaDe(f) * factor;
    x.ventas += ventasEsperadas(f, tasas.get(f.unidadId)) * factor;
    x.meses.add(f.periodo);
    if (factor !== 1) x.proyectado = true;
    acc.set(f.unidadId, x);
  }
  return [...acc]
    .filter(([, x]) => x.pauta > 0 || x.ventas > 0)
    .map(([unidadId, x]) => {
      const t = techoDe(techo, unidadId);
      const excedente = Math.max(0, x.pauta - (t / 100) * x.ventas);
      const n = Math.max(1, x.meses.size);
      return {
        unidadId,
        pauta: r2(x.pauta),
        ventas: r2(x.ventas),
        pct: x.ventas > 0 ? (x.pauta / x.ventas) * 100 : null,
        techo: t,
        excedente: r2(excedente),
        excedenteAnual: r2((excedente / n) * 12),
        meses: n,
        proyectado: x.proyectado,
      };
    })
    .sort((a, b) => b.excedente - a.excedente || b.pauta - a.pauta);
}

/** Si la tienda está sobre su techo (con ventas, por el %; sin ventas, si gastó algo en pauta). */
export const sobreTecho = (p: Pick<PautaTienda, "pct" | "techo" | "pauta">) => (p.pct === null ? p.pauta > 0 : p.pct > p.techo + 1e-9);

// ---------------------------------------------------------------------------------------------------------------------
// Alertas (tarea diaria «alertas»)
// ---------------------------------------------------------------------------------------------------------------------

export interface AlertaPauta {
  clave: string;
  severidad: "aviso" | "critica";
  mensaje: string;
  monto: number;
  unidadId: string;
  periodo: string;
}

const usd = (v: number) => `US$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesTexto = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const pctTexto = (v: number) => `${v.toFixed(1)} %`;

/** El mes anterior a `AAAA-MM-01`. */
export function mesPrevio(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Las alertas de techo de pauta: por cada tienda propia, el último mes cerrado y el mes en curso proyectado (desde el día
 * `DIA_MINIMO_PROYECCION`). El monto es la pauta excedente del mes; el mensaje dice también lo que vale al año.
 */
export function alertasPauta(
  filas: FilaTiendaMes[],
  tiendas: string[],
  techo: ConfigTecho,
  hoy: string,
  nombre: (id: string) => string,
): AlertaPauta[] {
  const enCurso = `${hoy.slice(0, 7)}-01`;
  const cerrado = mesPrevio(enCurso);
  const tasas = tasasResolucion(filas);
  const meses = Number(hoy.slice(8, 10)) >= DIA_MINIMO_PROYECCION ? [cerrado, enCurso] : [cerrado];
  const out: AlertaPauta[] = [];
  for (const mes of meses) {
    for (const p of pautaPorTienda(filas, [mes], tiendas, techo, hoy, tasas)) {
      if (!sobreTecho(p) || p.excedente < 1) continue;
      const proy = mes === enCurso;
      const critica = p.pct === null || p.pct > p.techo + PUNTOS_CRITICOS;
      out.push({
        clave: `pauta:${p.unidadId}:${mes.slice(0, 7)}`,
        severidad: critica ? "critica" : "aviso",
        mensaje:
          `${nombre(p.unidadId)} · ${mesTexto(mes)}${proy ? " (proyectado)" : ""}: pauta ${p.pct === null ? "sin ventas" : `${pctTexto(p.pct)} de las ventas`} ` +
          `(techo ${pctTexto(p.techo)}). Bajar al techo vale ${usd(p.excedente)} en el mes, ${usd(p.excedente * 12)} al año`,
        monto: r2(p.excedente),
        unidadId: p.unidadId,
        periodo: mes,
      });
    }
  }
  return out;
}
