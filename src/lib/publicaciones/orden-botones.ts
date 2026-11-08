/**
 * El orden de los botones de la ficha de Gestión de IDs Dropi (8 nov 2026, pedido de Alcides: «sostener el botón y moverlo según la prioridad que yo crea»).
 * Cada persona los arrastra (o los mueve con Alt + flechas) y el orden se guarda en su navegador. «Guardar cambios» y «Cancelar» no se mueven. Lógica pura, con prueba.
 */

/** Los botones que se pueden mover, en el orden de siempre. Un botón nuevo de la barra se agrega aquí. */
export const BOTONES_FICHA = [
  { id: "publicar", texto: "Publicar en Dropi" },
  { id: "eliminar", texto: "Eliminar" },
  { id: "republicar", texto: "Republicar" },
  { id: "apagar", texto: "Apagar en Dropi" },
  { id: "privatizar", texto: "Privatizar" },
  { id: "pausar", texto: "Pausar" },
  { id: "liquidacion", texto: "Liquidación" },
  { id: "archivar", texto: "Archivar" },
] as const;

export type BotonFicha = (typeof BOTONES_FICHA)[number]["id"];

export const ORDEN_DEFECTO: BotonFicha[] = BOTONES_FICHA.map((b) => b.id);

const ES_BOTON = new Set<string>(ORDEN_DEFECTO);

/** Lee el orden guardado: solo ids conocidos, sin repetir, y los que falten (un botón nuevo) al final en su orden de siempre. Lo que no se entienda da el de siempre. */
export function leerOrden(crudo: unknown): BotonFicha[] {
  let lista: unknown = crudo;
  if (typeof crudo === "string") {
    try {
      lista = JSON.parse(crudo);
    } catch {
      return ORDEN_DEFECTO;
    }
  }
  if (!Array.isArray(lista)) return ORDEN_DEFECTO;
  const vistos = new Set<string>();
  const orden: BotonFicha[] = [];
  for (const x of lista) {
    if (typeof x !== "string" || !ES_BOTON.has(x) || vistos.has(x)) continue;
    vistos.add(x);
    orden.push(x as BotonFicha);
  }
  for (const id of ORDEN_DEFECTO) if (!vistos.has(id)) orden.push(id);
  return orden;
}

/** ¿Es el de siempre? (para no mostrar «Restablecer»). */
export const esOrdenDefecto = (orden: readonly BotonFicha[]) =>
  orden.every((id, i) => id === ORDEN_DEFECTO[i]);

/** Pone `id` justo antes de `antesDe` (o al final si `antesDe` es null). */
export function moverAntes(
  orden: readonly BotonFicha[],
  id: BotonFicha,
  antesDe: BotonFicha | null,
): BotonFicha[] {
  if (id === antesDe) return [...orden];
  const sin = orden.filter((x) => x !== id);
  const i = antesDe === null ? -1 : sin.indexOf(antesDe);
  if (i < 0) return [...sin, id];
  return [...sin.slice(0, i), id, ...sin.slice(i)];
}

/** Mueve `id` un lugar entre los que se ven (`visibles`, en el orden actual): −1 a la izquierda, +1 a la derecha. Los ocultos no cuentan como un paso. */
export function moverUnPaso(
  orden: readonly BotonFicha[],
  id: BotonFicha,
  paso: -1 | 1,
  visibles: readonly BotonFicha[],
): BotonFicha[] {
  const vistos = orden.filter((x) => visibles.includes(x));
  const i = vistos.indexOf(id);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= vistos.length) return [...orden];
  if (paso === -1) return moverAntes(orden, id, vistos[j]);
  // A la derecha: antes del que sigue al vecino (o al final).
  return moverAntes(orden, id, vistos[j + 1] ?? null);
}
