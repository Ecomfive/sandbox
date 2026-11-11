// Datos de identidad de la nómina: cómo se muestran fuera de la ficha de la persona. Prueba en `documento.test.ts`.

/**
 * Cédula o pasaporte enmascarado para listas, descargas y avisos: solo el primer tramo y los tres últimos caracteres.
 * «8-846-2312» → «8-***-312», «E-8-239396» → «E-***-396», «BE473085» → «BE***085». Uno muy corto queda «***».
 */
export function enmascararDocumento(documento: string | null | undefined): string {
  const d = (documento ?? "").replace(/\s+/g, "").trim();
  if (!d) return "";
  const tramos = d.split("-").filter(Boolean);
  if (tramos.length >= 2) {
    const ultimo = tramos[tramos.length - 1];
    return `${tramos[0]}-***-${ultimo.slice(-3)}`;
  }
  if (d.length <= 5) return "***";
  return `${d.slice(0, 2)}***${d.slice(-3)}`;
}

/** «E» / «P» de la planilla, para leer. */
export function etiquetaNacionalidad(n: string | null | undefined): string {
  const v = (n ?? "").trim().toUpperCase();
  if (v === "E") return "Extranjera";
  if (v === "P") return "Panameña";
  return n?.trim() ?? "";
}
