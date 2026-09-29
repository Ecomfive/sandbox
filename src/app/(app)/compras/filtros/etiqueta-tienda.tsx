import { colorTienda, etiquetaTienda } from "./def-filtros";

/**
 * La etiqueta de tienda («Etiquetas» de ClickUp) junto al nombre del producto: a diferencia de las demás
 * insignias, cada una tiene su propio color de fondo Y de texto calcados tal cual de ClickUp (no uno
 * calculado a partir del otro), y es redonda como las etiquetas de ClickUp, no cuadrada como las demás.
 */
export function EtiquetaTienda({ valor }: { valor: string }) {
  const { fondo, texto } = colorTienda(valor);
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: fondo, color: texto }}
    >
      {etiquetaTienda(valor)}
    </span>
  );
}
