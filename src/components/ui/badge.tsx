import type { CSSProperties, ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "destructive" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  destructive: "bg-destructive-soft text-destructive",
  info: "bg-accent text-accent-foreground",
};

/** Texto blanco o casi negro según qué tanto contraste da cada uno sobre `fondo`, para que un color exacto
 * (traído de ClickUp, por ejemplo) siempre quede legible sin tener que fijarlo a mano caso por caso. */
function textoLegibleSobre(fondo: string): string {
  const hex = fondo.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? "#1a1a1a" : "#ffffff";
}

/**
 * Insignia cuadrada (border-radius de 5px, igual que las etiquetas de ClickUp). Con `tone` usa la paleta
 * neutral/success/warning/destructive/info de siempre; con `color` (un hex exacto, para Etapa/Estado de
 * Compras calcados de ClickUp) pinta ese color de fondo y calcula el texto blanco/negro según su contraste.
 */
export function Badge({ tone = "neutral", color, children }: { tone?: Tone; color?: string; children: ReactNode }) {
  const estilo: CSSProperties | undefined = color
    ? { backgroundColor: color, color: textoLegibleSobre(color) }
    : undefined;
  return (
    <span
      style={estilo}
      className={`inline-flex items-center rounded-[5px] px-2 py-0.5 text-xs font-medium whitespace-nowrap ${color ? "" : tones[tone]}`}
    >
      {children}
    </span>
  );
}
