/** Avisos de WhatsApp del pedido (sin código de servidor: la pantalla también lo importa). */
export type PlantillaAviso = "confirmar" | "confirmada" | "despachada" | "guia" | "fallida" | "entregada";
export const PLANTILLAS: { id: PlantillaAviso; nombre: string; fase?: "confirmada" | "despachada" | "fallida" | "entregada" }[] = [
  { id: "confirmar", nombre: "Pedir confirmación" },
  { id: "confirmada", nombre: "Pedido confirmado", fase: "confirmada" },
  { id: "despachada", nombre: "Pedido en camino", fase: "despachada" },
  { id: "guia", nombre: "Número de guía" },
  { id: "fallida", nombre: "Entrega no lograda", fase: "fallida" },
  { id: "entregada", nombre: "Pedido entregado", fase: "entregada" },
];

