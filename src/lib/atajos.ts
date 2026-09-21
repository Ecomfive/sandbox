// Atajos de teclado de una tecla, al estilo ClickUp: `g` y luego una letra va a una página, `/` busca y `?` los
// lista. Sin React, para poder probar la lógica. La regla de oro: nunca robar teclas a quien está escribiendo.

export interface AtajoIr {
  tecla: string;
  href: string;
  etiqueta: string;
}

/** A dónde lleva cada letra (después de `g`). Solo se ofrecen las páginas a las que la persona puede ir. */
const ATAJOS_IR: AtajoIr[] = [
  { tecla: "d", href: "/", etiqueta: "Dashboard" },
  { tecla: "r", href: "/retiros", etiqueta: "Retiros" },
  { tecla: "p", href: "/pedidos-dropi", etiqueta: "Pedidos Dropi" },
  { tecla: "a", href: "/alertas", etiqueta: "Alertas de inventario" },
  { tecla: "i", href: "/inventario", etiqueta: "Inventario" },
  { tecla: "o", href: "/productos", etiqueta: "Productos" },
  { tecla: "m", href: "/catalogo-maestro", etiqueta: "Catálogo maestro" },
  { tecla: "s", href: "/gastos", etiqueta: "Gastos" },
  { tecla: "e", href: "/extractos", etiqueta: "Extractos" },
  { tecla: "n", href: "/notificaciones", etiqueta: "Notificaciones" },
  { tecla: "u", href: "/usuarios", etiqueta: "Usuarios y roles" },
  { tecla: "c", href: "/configuracion", etiqueta: "Configuración" },
];

/** Los atajos de «ir a» que valen para esta persona: los de las páginas que puede abrir. */
export function atajosParaIr(hrefsPermitidos: string[]): AtajoIr[] {
  const permitidos = new Set(hrefsPermitidos);
  return ATAJOS_IR.filter((a) => permitidos.has(a.href));
}

/** Cuánto espera el atajo `g` a la segunda tecla antes de olvidarse. */
export const ESPERA_SEGUNDA_TECLA_MS = 1500;

export type AccionAtajo =
  | { tipo: "ninguna" }
  | { tipo: "esperar-ir" }
  | { tipo: "cancelar-ir" }
  | { tipo: "ir"; href: string }
  | { tipo: "buscar" }
  | { tipo: "ayuda" };

export interface TeclaPulsada {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Se está escribiendo en un campo (o hay una ventana abierta): no se toca nada. */
  enCampoEditable: boolean;
  /** El navegador ya usó la tecla (repetición o un componente la atendió). */
  yaAtendida?: boolean;
}

/**
 * Qué hace una tecla. `esperandoIr` es que la anterior fue `g`. Con Ctrl, ⌘ o Alt no se hace nada (son del
 * navegador y del sistema); `?` sí lleva Mayús, así que Mayús no cuenta.
 */
export function interpretarTecla(
  tecla: TeclaPulsada,
  esperandoIr: boolean,
  atajos: AtajoIr[],
  activados: boolean
): AccionAtajo {
  if (tecla.enCampoEditable || tecla.ctrlKey || tecla.metaKey || tecla.altKey || tecla.yaAtendida) return { tipo: "ninguna" };
  if (tecla.key === "?") return { tipo: "ayuda" };
  if (!activados) return { tipo: "ninguna" };

  if (esperandoIr) {
    const atajo = atajos.find((a) => a.tecla === tecla.key.toLowerCase());
    return atajo ? { tipo: "ir", href: atajo.href } : { tipo: "cancelar-ir" };
  }
  if (tecla.key === "g") return { tipo: "esperar-ir" };
  if (tecla.key === "/") return { tipo: "buscar" };
  return { tipo: "ninguna" };
}

/** ¿Estas teclas se escriben en algo? (campos de texto, listas, texto editable). */
export function esCampoEditable(elemento: { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null): boolean {
  if (!elemento) return false;
  if (elemento.isContentEditable) return true;
  const etiqueta = (elemento.tagName ?? "").toUpperCase();
  if (etiqueta === "TEXTAREA" || etiqueta === "SELECT") return true;
  if (etiqueta === "INPUT") {
    const tipo = (elemento.getAttribute?.("type") ?? "text").toLowerCase();
    // Una casilla o un botón no reciben texto: ahí los atajos pueden funcionar.
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"].includes(tipo);
  }
  const rol = elemento.getAttribute?.("role");
  return rol === "textbox" || rol === "combobox" || rol === "searchbox";
}
