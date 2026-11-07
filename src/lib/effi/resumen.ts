import type { ResumenLecturaEffi } from "./sincronizar";

/** El aviso de una lectura de Effi: artículos, ventas y precios del análisis. Si algo de lo extra falló, lo dice y el aviso sale como error. */
export function textoLecturaEffi(r: ResumenLecturaEffi): { texto: string; error: boolean } {
  const v = r.ventas;
  const p = r.preciosCompetencia;
  const ventas = !v ? "" : "error" in v ? ` Las ventas no se pudieron leer: ${v.error}` : ` Ventas: ${v.filas} filas de ${v.dias} días.`;
  const precios = !p ? "" : "error" in p ? ` Los precios del análisis no se pusieron al día: ${p.error}` : p.cambiaron ? ` ${p.cambiaron} precios nuestros del análisis de competencia se pusieron al día.` : "";
  return {
    texto: `Effi leído: ${r.articulos} artículos, ${r.nuevos} nuevos, ${r.yaNoEstan} ya no aparecen.${ventas}${precios}`,
    error: !!((v && "error" in v) || (p && "error" in p)),
  };
}
