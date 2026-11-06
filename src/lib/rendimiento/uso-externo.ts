// Lo que manda la extensión «Ecomfive · Uso» (migración 0240): en qué plataforma estaba la persona y en qué sección. La extensión ya limpia la sección; aquí se
// revisa de nuevo porque la ruta es pública para quien tenga sesión. Nunca entra un número, un id ni el nombre de una tienda. Sin base ni React, con prueba.

export const PLATAFORMAS_EXTERNAS = [
  { id: "dropi", etiqueta: "Dropi" },
  { id: "effi", etiqueta: "Effi" },
  { id: "drop", etiqueta: "Drop" },
  { id: "shopify", etiqueta: "Shopify" },
] as const;

export type PlataformaExterna = (typeof PLATAFORMAS_EXTERNAS)[number]["id"];

export const esPlataformaExterna = (v: unknown): v is PlataformaExterna => PLATAFORMAS_EXTERNAS.some((p) => p.id === v);

const PARTE = /^[a-z_-]{1,30}$/;

/** La sección, solo con palabras: lo que traiga un número o caracteres raros se descarta, y como mucho dos partes. */
export function limpiarSeccion(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .toLowerCase()
    .split("/")
    .filter((p) => PARTE.test(p))
    .slice(0, 2)
    .join("/");
}

export type LatidoExterno = { tipo: "minuto"; plataforma: PlataformaExterna; seccion: string; version: string | null } | { tipo: "senal"; version: string | null };

/** Lo que llegó a la ruta, ya revisado. `null` si no sirve. */
export function revisarLatidoExterno(cuerpo: unknown): LatidoExterno | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  const c = cuerpo as Record<string, unknown>;
  const version = typeof c.version === "string" && /^[0-9.]{1,20}$/.test(c.version) ? c.version : null;
  if (c.plataforma === undefined || c.plataforma === null) return { tipo: "senal", version };
  if (!esPlataformaExterna(c.plataforma)) return null;
  return { tipo: "minuto", plataforma: c.plataforma, seccion: limpiarSeccion(c.seccion), version };
}
