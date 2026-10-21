import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";
import { estadoRuta, realQueManda, type EstadoRuta } from "@/lib/compras/estado-ruta";
import { etiquetaVia, VIAS_RUTA, type EnvioReal, type ResumenesReales } from "@/lib/compras/rutas-envio";

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
  real: ResumenesReales;
  /** Los envíos que ya llegaron por esta ruta (para juntar los de un país o los de todos por vía). */
  envios: EnvioReal[];
  incumple: boolean;
}

/** La tarifa que rige hoy de cada tipo de producto (la más nueva de cada uno). */
export function tarifasVigentes(tarifas: TarifaRuta[]): TarifaRuta[] {
  const vistos = new Set<string>();
  return tarifas.filter((t) => (vistos.has(t.tipo) ? false : (vistos.add(t.tipo), true)));
}

/** Lo que de verdad tarda una ruta (12 meses o, si no hay, el histórico) y cómo está contra lo que promete. */
export function medidaRuta(r: FilaRuta): { real: number | null; envios: number; estado: EstadoRuta; delta: number | null } {
  const real = realQueManda(r.real);
  return { real: real.promedio, envios: real.n, ...estadoRuta(r.diasMax, real.promedio) };
}

/** «10 d» o «45–55 d»; null si no se definió el plazo. */
export function plazoCorto(r: FilaRuta): string | null {
  if (r.diasMax === null && r.diasMin === null) return null;
  const min = r.diasMin ?? r.diasMax!;
  const max = r.diasMax ?? r.diasMin!;
  return min === max ? `${max} d` : `${min}–${max} d`;
}

export const textoTarifa = (t: TarifaRuta) => `$${t.precio.toLocaleString("es-PA", { maximumFractionDigits: 2 })} ${t.unidad === "cbm" ? "por CBM" : "por kg"}`;

/** Los datos de una ruta para «Descargar» (la lista de Envíos filtra y agrupa por su cuenta). */
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
    { id: "modalidad", etiqueta: "Modalidad", tipo: "texto", valor: (r) => [r.modalidad, r.courier].filter(Boolean).join(" ") },
    { id: "plazo_min", etiqueta: "Plazo mínimo (días)", tipo: "numero", valor: (r) => r.diasMin },
    { id: "plazo_max", etiqueta: "Plazo máximo (días)", tipo: "numero", valor: (r) => r.diasMax },
    { id: "real_12", etiqueta: "Real, últimos 12 meses (días)", tipo: "numero", valor: (r) => r.real.ultimos12.promedio },
    { id: "real_2", etiqueta: "Real, últimos 2 meses (días)", tipo: "numero", valor: (r) => r.real.ultimos2.promedio },
    { id: "real_hist", etiqueta: "Real, histórico (días)", tipo: "numero", valor: (r) => r.real.historico.promedio },
    { id: "envios", etiqueta: "Envíos medidos", tipo: "numero", valor: (r) => r.real.historico.n },
    { id: "tarifa", etiqueta: "Tarifa vigente", tipo: "texto", valor: (r) => tarifasVigentes(r.tarifas).map((t) => `${t.tipo}: ${textoTarifa(t)}`).join("; ") },
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
