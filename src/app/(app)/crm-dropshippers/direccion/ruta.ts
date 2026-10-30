// Dónde vive el panel de Dirección (30 oct 2026, pedido de Hernán): ya no es una pestaña del CRM, es lo que ve Dirección al abrir la Bandeja.

/** La Bandeja: para quien tiene «CRM: dirección (CEO)» abre el panel; «Chats» lleva a la bandeja de WhatsApp de siempre. */
export const RUTA_DIRECCION = "/crm-dropshippers/bandeja";

/** Las vistas del panel de Dirección en la Bandeja, en el orden de sus pestañas. «Chats» es la bandeja de WhatsApp. */
export const VISTAS_DIRECCION = [
  { valor: "resumen", etiqueta: "Resumen" },
  { valor: "clientes", etiqueta: "Clientes" },
  { valor: "productos", etiqueta: "Productos" },
  { valor: "entregas", etiqueta: "Entregas" },
  { valor: "equipo", etiqueta: "Equipo" },
  { valor: "duplicados", etiqueta: "Duplicados" },
  { valor: "automatizaciones", etiqueta: "Automatizaciones" },
  { valor: "chats", etiqueta: "Chats" },
] as const;
export type VistaDireccion = (typeof VISTAS_DIRECCION)[number]["valor"];

/** La dirección de una vista (con sus parámetros, como `dias` o `segmento`). */
export function rutaVista(vista: VistaDireccion, extra: Record<string, string | number> = {}): string {
  const q = new URLSearchParams({ vista, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) });
  return `${RUTA_DIRECCION}?${q.toString()}`;
}
