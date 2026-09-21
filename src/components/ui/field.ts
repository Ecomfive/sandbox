// El borde de los campos usa border-control (3:1 contra el fondo), no el border de divisores.
// `aria-invalid` (lo pone un formulario de creación al señalar el dato obligatorio que falta) pinta el borde de error.
export const fieldClass =
  "rounded-md border border-border-control bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground focus:border-foreground aria-invalid:border-destructive";

export const fieldClassSm =
  "rounded border border-border-control bg-card px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-foreground focus:border-foreground aria-invalid:border-destructive";

/** Anillo de foco visible para botones y enlaces (2px, contraste 17:1 con el fondo). */
export const anilloFoco =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded";

export const labelClass = "text-sm font-medium text-foreground";

export const labelClassSm = "text-xs text-muted-foreground";
