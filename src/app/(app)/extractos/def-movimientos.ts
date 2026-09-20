import { formatearFechaHoraCompleta } from "@/lib/formato";
import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export interface FilaMovimientoBanco {
  id: string;
  /** Momento en que se cargó el extracto (ISO): agrupa los movimientos por archivo cargado. */
  extracto: string;
  fecha: string;
  monto: number;
  tipo: string;
  descripcion: string | null;
  plataformaId: string | null;
  plataforma: string | null;
}

const porPais = new Map<string, DefTabla<FilaMovimientoBanco>>();

/**
 * Filtros y agrupación de los movimientos de los últimos extractos. Arranca agrupada por extracto
 * (el más reciente primero), como se veía antes; la hora de carga se muestra en la zona del país, así
 * que hay una definición por país (siempre la misma, para no recalcular la tabla en cada render).
 */
export function defMovimientosBanco(codigoPais: string): DefTabla<FilaMovimientoBanco> {
  const existente = porPais.get(codigoPais);
  if (existente) return existente;

  const def: DefTabla<FilaMovimientoBanco> = {
    clave: "extractos-movimientos",
    campos: [
      {
        id: "extracto",
        etiqueta: "Extracto cargado",
        tipo: "seleccion",
        valores: (m) => [m.extracto],
        formatearValor: (iso) => formatearFechaHoraCompleta(iso, codigoPais),
        agrupable: true,
      },
      {
        id: "plataforma",
        etiqueta: "Plataforma",
        tipo: "seleccion",
        valores: (m) => [m.plataforma ?? SIN_VALOR],
        etiquetaSinValor: "Sin plataforma",
        agrupable: true,
      },
      { id: "tipo", etiqueta: "Tipo", tipo: "seleccion", valores: (m) => [m.tipo], agrupable: true },
      { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (m) => m.fecha },
      { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (m) => m.monto },
      { id: "descripcion", etiqueta: "Descripción", tipo: "texto", valor: (m) => m.descripcion ?? "" },
    ],
    vistaInicial: { agrupar: "extracto", orden: "desc" },
  };
  porPais.set(codigoPais, def);
  return def;
}
