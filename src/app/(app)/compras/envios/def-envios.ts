import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";
import { etiquetaVia, VIAS_RUTA, type ResumenReal } from "@/lib/compras/rutas-envio";

export interface TarifaRuta {
  id: string;
  tipo: string;
  precio: number;
  unidad: string;
  vigenteDesde: string;
  creadoPor: string | null;
}

/** Una ruta de envío: lo que promete un agente para un país por una vía, sus tarifas y lo que de verdad tardó. */
export interface FilaRuta {
  id: string;
  agente: string | null;
  paisCodigo: string;
  paisNombre: string;
  via: string;
  modalidad: string | null;
  courier: string | null;
  diasMin: number | null;
  diasMax: number | null;
  activo: boolean;
  nota: string | null;
  url: string | null;
  /** Todas sus tarifas, de la más nueva a la más vieja. */
  tarifas: TarifaRuta[];
  real: { historico: ResumenReal; ultimos12: ResumenReal; anioActual: ResumenReal };
  incumple: boolean;
}

/** La tarifa que rige hoy de cada tipo de producto (la más nueva de cada uno). */
export function tarifasVigentes(tarifas: TarifaRuta[]): TarifaRuta[] {
  const vistos = new Set<string>();
  return tarifas.filter((t) => (vistos.has(t.tipo) ? false : (vistos.add(t.tipo), true)));
}

export const textoTarifa = (t: TarifaRuta) => `$${t.precio.toLocaleString("es-PA", { maximumFractionDigits: 2 })} ${t.unidad === "cbm" ? "por CBM" : "por kg"}`;

/** Cómo se filtra y agrupa la lista de rutas; arranca agrupada por país. «Inactivas» muestra los canales cerrados. */
export const DEF_ENVIOS: DefTabla<FilaRuta> = {
  clave: "compras-envios",
  campos: [
    { id: "pais", etiqueta: "País", tipo: "seleccion", valores: (r) => [r.paisNombre], agrupable: true },
    { id: "agente", etiqueta: "Agente", tipo: "seleccion", valores: (r) => [r.agente ?? SIN_VALOR], etiquetaSinValor: "Sin agente", agrupable: true },
    {
      id: "via",
      etiqueta: "Vía",
      tipo: "seleccion",
      valores: (r) => [r.via],
      opciones: () => VIAS_RUTA.map((v) => ({ valor: v.valor, etiqueta: v.etiqueta })),
      formatearValor: etiquetaVia,
      agrupable: true,
    },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (r) => [r.activo ? "activa" : "inactiva"],
      opciones: () => [
        { valor: "activa", etiqueta: "Activa" },
        { valor: "inactiva", etiqueta: "Inactiva" },
      ],
      agrupable: true,
    },
    {
      id: "cumple",
      etiqueta: "Cumplimiento",
      tipo: "seleccion",
      valores: (r) => [r.incumple ? "tarda_mas" : r.real.historico.n ? "cumple" : "sin_datos"],
      opciones: () => [
        { valor: "tarda_mas", etiqueta: "Tarda más de lo prometido" },
        { valor: "cumple", etiqueta: "Cumple" },
        { valor: "sin_datos", etiqueta: "Sin envíos para medir" },
      ],
      agrupable: true,
    },
    { id: "nota", etiqueta: "Nota", tipo: "texto", valor: (r) => r.nota ?? "" },
  ],
  cerrados: {
    etiqueta: "Inactivas",
    esCerrado: (r) => !r.activo,
    campoEstado: "estado",
    valoresCerrados: ["inactiva"],
    ocultosPorDefecto: false,
  },
  vistaInicial: { agrupar: "pais" },
};
