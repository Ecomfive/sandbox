// Portal AF4 360° › Entidades y multimoneda (migración 0923). Lógica pura: qué entidad y qué moneda se ven en una
// página, cómo se resuelve el nombre de una unidad al importar el libro de otra entidad y las tasas de cada mes.
// Sirve en el servidor y en el cliente. Prueba en `entidades.test.ts`.

/** Una empresa del grupo (`fin_entidades`). */
export interface Entidad {
  id: string;
  /** Código del país: PA, CR. */
  codigo: string;
  razon_social: string;
  /** Moneda funcional: USD, CRC. */
  moneda: string;
  orden: number;
}

/** El valor de `?entidad=` para ver todo junto, siempre en dólares. */
export const CONSOLIDADO = "consolidado";
/** Los valores de `?moneda=`: la de la entidad o dólares. */
export const MONEDA_LOCAL = "local";
export const MONEDA_USD = "usd";

export const MONEDA_BASE = "USD";
/** La entidad de los movimientos que no dicen otra (el libro de Panamá). */
export const ENTIDAD_BASE = "PA";

/** Lo que se ve en una página: la entidad (null = consolidado) y la moneda. */
export interface VistaEntidad {
  entidad: Entidad | null;
  /** Código de la moneda en que se muestran los montos. */
  moneda: string;
  /** Si los montos van en la moneda de la entidad (no en dólares). */
  local: boolean;
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * La entidad que se pide en la dirección (`consolidado` o su código). Sin parámetro, la del país de la barra de arriba;
 * si ese país no tiene entidad, el consolidado.
 */
export function elegirEntidad(param: unknown, entidades: Entidad[], paisActual: string | null): Entidad | null {
  const p = texto(param).toUpperCase();
  if (p === CONSOLIDADO.toUpperCase()) return null;
  const pedida = entidades.find((e) => e.codigo === p);
  if (pedida) return pedida;
  return entidades.find((e) => e.codigo === (paisActual ?? "").toUpperCase()) ?? null;
}

/**
 * La moneda en que se ve: el consolidado y una entidad en dólares, siempre USD. Una entidad con otra moneda se ve en la
 * suya salvo que se pida `?moneda=usd`.
 */
export function elegirVista(paramEntidad: unknown, paramMoneda: unknown, entidades: Entidad[], paisActual: string | null): VistaEntidad {
  const entidad = elegirEntidad(paramEntidad, entidades, paisActual);
  const local = !!entidad && entidad.moneda !== MONEDA_BASE && texto(paramMoneda).toLowerCase() !== MONEDA_USD;
  return { entidad, moneda: local ? entidad!.moneda : MONEDA_BASE, local };
}

/** Las opciones del selector de entidad: Consolidado y cada entidad activa. */
export function opcionesEntidad(entidades: Entidad[]): { valor: string; etiqueta: string }[] {
  return [{ valor: CONSOLIDADO, etiqueta: "Consolidado" }, ...[...entidades].sort((a, b) => a.orden - b.orden).map((e) => ({ valor: e.codigo, etiqueta: e.razon_social }))];
}

/** Los parámetros de la dirección que fijan la vista (para que los demás filtros los conserven). */
export function parametrosVista(v: VistaEntidad): Record<string, string> {
  const p: Record<string, string> = { entidad: v.entidad?.codigo ?? CONSOLIDADO };
  if (v.entidad && v.entidad.moneda !== MONEDA_BASE) p.moneda = v.local ? MONEDA_LOCAL : MONEDA_USD;
  return p;
}

/** Arma `ruta?…` con los parámetros que no están vacíos. */
export function conParametros(ruta: string, params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${ruta}?${s}` : ruta;
}

// ---------------------------------------------------------------------------------------------
// Unidades del libro de otra entidad
// ---------------------------------------------------------------------------------------------

export interface UnidadCatalogo {
  nombre: string;
  /** Código de la entidad (`fin_unidades.pais`, que la 0136 mantiene igual a la entidad). */
  entidad: string;
  clase: string;
}

const clave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/**
 * El nombre con que se guarda una unidad del libro de la entidad `codigo`. El nombre de una unidad es único en todo el
 * portal, así que si ya existe en otra entidad (A DISTRIBUIR, CORPORATIVO…) se usa «NOMBRE CR», creado con la misma clase.
 * En la entidad base (Panamá) el nombre no cambia nunca. Devuelve también si hay que crearla y con qué clase.
 */
export function unidadEnEntidad(
  nombre: string,
  codigo: string,
  catalogo: UnidadCatalogo[],
): { nombre: string; crear: { clase: string } | null } {
  const porClave = new Map(catalogo.map((u) => [clave(u.nombre), u]));
  const propia = porClave.get(clave(nombre));
  if (codigo === ENTIDAD_BASE) return { nombre: propia?.nombre ?? nombre, crear: propia ? null : { clase: "tienda" } };
  if (propia && propia.entidad === codigo) return { nombre: propia.nombre, crear: null };
  const sufijo = `${nombre.trim()} ${codigo}`;
  const conSufijo = porClave.get(clave(sufijo));
  if (conSufijo) return { nombre: conSufijo.nombre, crear: null };
  if (propia) return { nombre: sufijo, crear: { clase: propia.clase } };
  return { nombre: nombre.trim(), crear: { clase: "tienda" } };
}

// ---------------------------------------------------------------------------------------------
// Tipos de cambio por mes
// ---------------------------------------------------------------------------------------------

/** Una fila de `fin_tipos_cambio_mes`: unidades de la moneda por 1 USD. */
export interface TasaMes {
  moneda: string;
  /** AAAA-MM-01. */
  periodo: string;
  promedio: number;
  cierre: number;
}

/**
 * La tasa de un mes, como `fin_tasa` en la base: USD = 1; el promedio solo el del mes; el cierre, el del mes o el último
 * anterior (y si no hay ninguno anterior, el primero que haya). Null si no hay.
 */
export function tasaDelMes(tasas: TasaMes[], moneda: string, mes: string, clase: "promedio" | "cierre"): number | null {
  if (moneda === MONEDA_BASE) return 1;
  const propias = tasas.filter((t) => t.moneda === moneda).sort((a, b) => a.periodo.localeCompare(b.periodo));
  if (clase === "promedio") return propias.find((t) => t.periodo === mes)?.promedio ?? null;
  const antes = propias.filter((t) => t.periodo <= mes).at(-1);
  return (antes ?? propias[0])?.cierre ?? null;
}

/** Un monto en su moneda pasado a dólares (2 decimales), o null sin tasa. */
export function aDolares(original: number, tasa: number | null): number | null {
  if (!tasa || tasa <= 0) return null;
  return Math.round((original / tasa) * 100) / 100;
}

/** Cuántas unidades de `destino` vale 1 unidad de `origen` en un mes (con las tasas por USD de cada una), o null. */
export function factorEntre(tasas: TasaMes[], origen: string, destino: string, mes: string, clase: "promedio" | "cierre"): number | null {
  if (origen === destino) return 1;
  const o = tasaDelMes(tasas, origen, mes, clase);
  const d = tasaDelMes(tasas, destino, mes, clase);
  return o && d ? d / o : null;
}

/** Revisa una tasa escrita a mano: número positivo y razonable (de 0,0001 a 100.000.000 por dólar). */
export function leerTasa(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n < 0.0001 || n > 100_000_000) return null;
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Nombre del país de cada código, para reconocerlo en el nombre de un archivo. */
const NOMBRE_PAIS: Record<string, string> = { PA: "PANAMA", CR: "COSTA RICA" };

/** La entidad de un libro por el nombre del archivo (GASTOS_COSTA_RICA_2026.xlsx → Costa Rica) o null si no lo dice. */
export function entidadDeArchivo(nombre: string, entidades: Entidad[]): Entidad | null {
  const n = ` ${clave(nombre).replace(/[^A-Z0-9]+/g, " ")} `;
  return (
    entidades.find((e) => {
      const nombres = [NOMBRE_PAIS[e.codigo], e.razon_social].filter(Boolean).map((x) => clave(x!).replace(/[^A-Z0-9]+/g, " "));
      return nombres.some((x) => n.includes(` ${x} `));
    }) ?? null
  );
}
