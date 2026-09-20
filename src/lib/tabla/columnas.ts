/**
 * Orden de columnas a partir del que guardó la persona. Las columnas nuevas (agregadas después de que
 * alguien ya guardó su orden) se insertan junto a donde irían por defecto —después de la columna por
 * defecto más cercana hacia atrás que ya esté en el orden guardado— en vez de siempre al final.
 */
export function ordenConColumnasNuevas(idsPorDefecto: string[], guardado: string[]): string[] {
  const conocidas = guardado.filter((id, i) => idsPorDefecto.includes(id) && guardado.indexOf(id) === i);
  const resultado = [...conocidas];
  idsPorDefecto.forEach((id, indiceDefecto) => {
    if (resultado.includes(id)) return;
    let posicion = resultado.length;
    for (let i = indiceDefecto - 1; i >= 0; i--) {
      const indice = resultado.indexOf(idsPorDefecto[i]);
      if (indice !== -1) {
        posicion = indice + 1;
        break;
      }
    }
    resultado.splice(posicion, 0, id);
  });
  return resultado;
}
