// Los hilos de comentarios en cifras según las tiendas permitidas (auditoría de seguridad, 18 nov 2026). Quien tiene tiendas
// limitadas no lee ni escribe los hilos de toda la empresa ni los de otras tiendas: sus «Todas» (la suma de sus tiendas) y
// los bloques del Panel llevan su propio tramo, «suyas-<huella de su lista>». Lógica pura; la usan las acciones de
// `comentarios-actions.ts` y las páginas del EERR y del Panel. Prueba en `comentarios-tienda.test.ts`.

import type { PaginaComentarios } from "./comentarios";
import { huella } from "./libro-excel";
import { puedeVerUnidad } from "./tiendas-permitidas";

/** El tramo de quien tiene tiendas limitadas: el mismo para todas las personas con la misma lista. */
export const tramoSuyas = (permitidas: string[]) => `suyas-${huella([...new Set(permitidas.map((x) => x.toLowerCase()))].sort().join(","))}`;

/** El tramo de tienda del ámbito del EERR: la tienda elegida; sin elegir, «todas» (toda la empresa) o, con límite, el suyo. */
export function tramoTiendaEerr(unidadId: string | null, permitidas: string[] | null): string {
  if (unidadId) return unidadId;
  return permitidas === null ? "todas" : tramoSuyas(permitidas);
}

/** La clave de un bloque del Panel: con límite lleva su tramo (lo que ve es la suma de sus tiendas, no la empresa). */
export const clavePanel = (clave: string, permitidas: string[] | null) => (permitidas === null ? clave : `${clave}~${tramoSuyas(permitidas)}`);

// El ámbito del EERR: «<entidad>-<moneda>-<tienda>[-vista…]», y la celda va después de «:».
const AMBITO_EERR = /^[^-:]+-[^-:]+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|suyas-[0-9a-f]{24})(?:-[^:]*)?:/i;

/** Si la persona puede leer y escribir el hilo de esa clave. Sin límite, todos. */
export function puedeVerHilo(pagina: PaginaComentarios, clave: string, permitidas: string[] | null): boolean {
  if (permitidas === null) return true;
  const suyas = tramoSuyas(permitidas);
  if (pagina === "panel-financiero") return clave.endsWith(`~${suyas}`);
  const m = clave.match(AMBITO_EERR);
  if (!m) return false;
  const tramo = m[1].toLowerCase();
  return tramo === suyas || (!tramo.startsWith("suyas-") && puedeVerUnidad(permitidas, tramo));
}

/** Los conteos de hilos que la persona puede ver (los demás no se mandan al navegador). */
export function filtrarHilos(hilos: Record<string, number>, pagina: PaginaComentarios, permitidas: string[] | null): Record<string, number> {
  if (permitidas === null) return hilos;
  return Object.fromEntries(Object.entries(hilos).filter(([clave]) => puedeVerHilo(pagina, clave, permitidas)));
}
