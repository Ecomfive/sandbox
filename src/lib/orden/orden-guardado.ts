/**
 * El orden que cada persona elige para una fila de elementos (tarjetas de un tablero, botones de una ficha): se arrastran o se mueven con Alt + flechas
 * y el orden se guarda en su navegador (8 nov 2026, pedido de Alcides). Lógica pura, con prueba; la pantalla está en `components/ui/orden-arrastrable.tsx`.
 */

/** Lee el orden guardado: solo ids conocidos, sin repetir, y los que falten (uno nuevo) al final en su orden de siempre. Lo que no se entienda da el de siempre. */
export function leerOrden(crudo: unknown, defecto: readonly string[]): string[] {
  let lista: unknown = crudo;
  if (typeof crudo === "string") {
    try {
      lista = JSON.parse(crudo);
    } catch {
      return [...defecto];
    }
  }
  if (!Array.isArray(lista)) return [...defecto];
  const conocidos = new Set(defecto);
  const vistos = new Set<string>();
  const orden: string[] = [];
  for (const x of lista) {
    if (typeof x !== "string" || !conocidos.has(x) || vistos.has(x)) continue;
    vistos.add(x);
    orden.push(x);
  }
  for (const id of defecto) if (!vistos.has(id)) orden.push(id);
  return orden;
}

/** ¿Es el de siempre? (para no mostrar «Orden de siempre»). */
export const esOrdenDefecto = (orden: readonly string[], defecto: readonly string[]) => orden.length === defecto.length && orden.every((id, i) => id === defecto[i]);

/** Pone `id` justo antes de `antesDe` (o al final si `antesDe` es null). */
export function moverAntes(orden: readonly string[], id: string, antesDe: string | null): string[] {
  if (id === antesDe) return [...orden];
  const sin = orden.filter((x) => x !== id);
  const i = antesDe === null ? -1 : sin.indexOf(antesDe);
  if (i < 0) return [...sin, id];
  return [...sin.slice(0, i), id, ...sin.slice(i)];
}

/** Lo que pasa al soltar `desde` sobre `sobre`: si venía de antes queda después de él; si venía de después, antes. */
export function soltarSobre(orden: readonly string[], desde: string, sobre: string): string[] {
  if (desde === sobre) return [...orden];
  const despues = orden.indexOf(desde) < orden.indexOf(sobre);
  return despues ? moverAntes(orden, desde, orden[orden.indexOf(sobre) + 1] ?? null) : moverAntes(orden, desde, sobre);
}

/** Mueve `id` un lugar entre los que se ven (`visibles`): −1 hacia atrás, +1 hacia adelante. Los ocultos no cuentan como un paso. */
export function moverUnPaso(orden: readonly string[], id: string, paso: -1 | 1, visibles: readonly string[]): string[] {
  const vistos = orden.filter((x) => visibles.includes(x));
  const i = vistos.indexOf(id);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= vistos.length) return [...orden];
  if (paso === -1) return moverAntes(orden, id, vistos[j]);
  return moverAntes(orden, id, vistos[j + 1] ?? null);
}
