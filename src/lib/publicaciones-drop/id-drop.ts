// Gestión de IDs Drop: el ID corto de una publicación («ID-BRIAH»). Drop lo muestra en su lista cuando el producto es simple; en un producto con variantes la lista no trae un ID general (solo uno por variante), así que
// se escribe a mano desde la ficha (17 nov 2026, pedido de Hernán). Lógica pura, con prueba.

/** Cómo es un ID de Drop: «ID-» y de 3 a 12 letras o números (igual que la restricción de la base). */
const ID_DROP = /^ID-[A-Z0-9]{3,12}$/;

/**
 * Lo que escribió la persona, como ID de Drop: acepta «ID-BRIAH», «id-briah», «ID BRIAH» o solo «BRIAH». Vacío = quitar el ID (`null`). Devuelve el error en palabras si no tiene la forma de un ID.
 */
export function normalizarIdDrop(texto: unknown): { id: string | null } | { error: string } {
  const crudo = String(texto ?? "").trim().toUpperCase();
  if (crudo === "") return { id: null };
  // Con el prefijo («ID-BRIAH» o «ID BRIAH») se toma lo que sigue; sin él, todo es el código («BRIAH»).
  const cuerpo = (/^ID[\s-]+(.+)$/.exec(crudo)?.[1] ?? crudo).replace(/\s+/g, "");
  const id = `ID-${cuerpo}`;
  return ID_DROP.test(id) ? { id } : { error: "El ID de Drop es «ID-» y de 3 a 12 letras o números, por ejemplo ID-ABCDE." };
}
