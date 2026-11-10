/**
 * Los botones de la ficha de Gestión de IDs Dropi que cada persona ordena (8 nov 2026, pedido de Alcides; ver `components/ui/orden-arrastrable.tsx` y
 * `lib/orden/orden-guardado.ts`). «Guardar cambios» y «Cancelar» no se mueven. Un botón nuevo de la barra se agrega aquí y en un `ItemOrden`.
 */
export const BOTONES_FICHA = [
  { id: "publicar", texto: "Publicar en Dropi" },
  { id: "eliminar", texto: "Eliminar" },
  { id: "republicar", texto: "Republicar" },
  { id: "apagar", texto: "Apagar en Dropi" },
  { id: "privatizar", texto: "Privatizar" },
  { id: "reservar", texto: "Privatizar a un correo" },
  { id: "pausar", texto: "Pausar" },
  { id: "liquidacion", texto: "Liquidación" },
  { id: "archivar", texto: "Archivar" },
] as const;

export type BotonFicha = (typeof BOTONES_FICHA)[number]["id"];

export const ORDEN_DEFECTO: readonly BotonFicha[] = BOTONES_FICHA.map((b) => b.id);

export const ETIQUETAS_BOTONES: Readonly<Record<string, string>> = Object.fromEntries(BOTONES_FICHA.map((b) => [b.id, b.texto]));
