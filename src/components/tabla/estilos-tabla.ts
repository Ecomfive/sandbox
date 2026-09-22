// Clases del encabezado y las celdas de una tabla de datos — las mismas en todos los módulos (estilo ClickUp
// que ya tenía Retiros): mayúsculas pequeñas para el nombre de columna, un filete vertical entre columnas y
// celdas más espaciadas. Antes cada tabla las escribía a mano (y Retiros no coincidía con las demás); ahora
// las comparten `TablaDatos` y las tablas que arman la suya propia (Retiros, Pedidos, Alertas, Productos).
export const claseFilaEncabezado = "border-b border-border bg-muted text-left text-muted-foreground";
export const claseEncabezadoColumna = "border-r border-border/60 px-4 py-3 text-xs font-semibold tracking-wide uppercase";
export const claseCeldaColumna = "border-r border-border/40 px-4 py-3";
/** La celda de una casilla de selección al inicio de la fila (más angosta, sin mayúsculas). */
export const claseEncabezadoCasilla = "w-10 border-r border-border/60 px-2 py-3";
export const claseCeldaCasilla = "relative z-10 w-10 border-r border-border/40 px-2 py-3";
