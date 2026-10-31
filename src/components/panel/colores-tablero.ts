/**
 * Los colores de las tarjetas de tablero (Gestión de IDs Dropi, CRM y Compras): el del ícono (sobre su fondo suave), el del número y el del
 * borde cuando la tarjeta está filtrando. Sin React, para que lo usen las tarjetas de cualquier módulo.
 */
export const COLORES = {
  verde: { icono: "bg-success-soft text-success", numero: "text-success", activa: "border-success ring-success/30" },
  ambar: { icono: "bg-warning-soft text-warning", numero: "text-warning", activa: "border-warning ring-warning/30" },
  rojo: { icono: "bg-destructive-soft text-destructive", numero: "text-destructive", activa: "border-destructive ring-destructive/30" },
  azul: { icono: "bg-azul-soft text-azul", numero: "text-azul", activa: "border-azul ring-azul/30" },
  violeta: { icono: "bg-primario-suave text-primario", numero: "text-primario", activa: "border-primario ring-primario/30" },
} as const;
export type Color = keyof typeof COLORES;
