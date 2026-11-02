/**
 * La ciudad de un dropshipper con su país («Santiago de Cali, Colombia»), para saber dónde vive y poder verlo en un evento o un viaje (30 oct 2026, pedido
 * de Alcides). Al escribirla en la ficha se buscan las ciudades del mundo en el buscador público de Open-Meteo (sin clave; `buscarCiudades`,
 * `dato-actions.ts`) y aquí se lee y se ordena lo que devuelve: primero las ciudades grandes (de los países donde trabajamos antes que las demás) y después
 * los pueblos, para que «Caracas» dé Caracas, Venezuela y no un caserío de Colombia que se llama igual. Lógica pura, con prueba.
 */
import { normalPais } from "@/lib/paises-mundo";

export interface CiudadSugerida {
  /** Lo que se guarda: «Santiago de Cali, Colombia». */
  etiqueta: string;
  nombre: string;
  /** El departamento, estado o provincia («Valle del Cauca»), para distinguir dos ciudades con el mismo nombre. */
  region: string | null;
  pais: string;
  /** Código ISO del país («CO»), para su bandera. */
  codigo: string;
}

/** Los países donde están los dropshippers, en orden: sus ciudades van primero («San José» → Costa Rica antes que California). */
export const PAISES_CERCANOS = ["PA", "CR", "CO", "VE", "MX", "HN", "GT", "SV", "NI", "EC", "PE", "DO", "BO", "CL", "AR", "PY", "UY", "PR", "CU"];

/** Desde cuántos habitantes una ciudad va en el primer grupo. */
export const CIUDAD_GRANDE = 50_000;

export const MIN_BUSQUEDA = 2;
export const MAX_BUSQUEDA = 60;

/** Lo escrito, listo para buscar, o `null` si es muy corto, muy largo o no tiene letras. */
export function textoParaBuscar(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length < MIN_BUSQUEDA || limpio.length > MAX_BUSQUEDA || !/\p{L}/u.test(limpio)) return null;
  return limpio;
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, 80) : null);

/**
 * Las ciudades de la respuesta de Open-Meteo (`{ results: [{ name, admin1, country, country_code, population }] }`), sin repetir y ordenadas: primero las
 * de `CIUDAD_GRANDE` habitantes o más, después las demás; dentro de cada grupo, los países de `PAISES_CERCANOS` (en su orden) y luego por población. Todo
 * lo que no tenga nombre, país y código se descarta.
 */
export function leerCiudades(respuesta: unknown, max = 6): CiudadSugerida[] {
  const filas = respuesta && typeof respuesta === "object" && Array.isArray((respuesta as { results?: unknown }).results) ? (respuesta as { results: unknown[] }).results : [];
  const vistas = new Set<string>();
  const ciudades: (CiudadSugerida & { poblacion: number; orden: number })[] = [];
  filas.forEach((f, i) => {
    if (!f || typeof f !== "object") return;
    const r = f as Record<string, unknown>;
    const nombre = texto(r.name);
    const pais = texto(r.country);
    const codigo = typeof r.country_code === "string" && /^[A-Za-z]{2}$/.test(r.country_code) ? r.country_code.toUpperCase() : null;
    if (!nombre || !pais || !codigo) return;
    const region = texto(r.admin1);
    const clave = `${nombre}|${region ?? ""}|${codigo}`.toLowerCase();
    if (vistas.has(clave)) return;
    vistas.add(clave);
    const poblacion = typeof r.population === "number" && Number.isFinite(r.population) ? r.population : 0;
    ciudades.push({ etiqueta: `${nombre}, ${pais}`, nombre, region, pais, codigo, poblacion, orden: i });
  });
  const cercania = (codigo: string) => {
    const i = PAISES_CERCANOS.indexOf(codigo);
    return i < 0 ? PAISES_CERCANOS.length : i;
  };
  return ciudades
    .sort(
      (a, b) =>
        Number(b.poblacion >= CIUDAD_GRANDE) - Number(a.poblacion >= CIUDAD_GRANDE) ||
        cercania(a.codigo) - cercania(b.codigo) ||
        b.poblacion - a.poblacion ||
        a.orden - b.orden,
    )
    .slice(0, max)
    .map(({ etiqueta, nombre, region, pais, codigo }) => ({ etiqueta, nombre, region, pais, codigo }));
}

/**
 * El código del país de una ciudad guardada como «Ciudad, País» («Santiago de Cali, Colombia» → «CO»), para dibujar su bandera. Compara el país (lo que va
 * después de la última coma) sin mayúsculas ni acentos contra `paises` (la lista de `paisesDelMundo`). Sin coma o sin país conocido, `null`.
 */
export function codigoPaisDeCiudad(ciudad: string | null, paises: readonly { codigo: string; nombre: string }[]): string | null {
  if (!ciudad || !ciudad.includes(",")) return null;
  const pais = normalPais(ciudad.slice(ciudad.lastIndexOf(",") + 1));
  if (!pais) return null;
  return paises.find((p) => normalPais(p.nombre) === pais)?.codigo ?? null;
}
