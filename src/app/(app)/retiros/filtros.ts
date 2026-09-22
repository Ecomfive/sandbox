import { ETIQUETA_ESTADO_DROPI } from "@/lib/dropi/emparejar-retiros";
import { ESTADO_ETIQUETA } from "@/lib/retiros/estados";
import {
  SIN_VALOR,
  filtrarFilas,
  filtroVacio as filtroVacioDe,
  opcionesDeSeleccion as opcionesDe,
  parsearFiltros as parsearFiltrosDe,
  type DefTabla,
  type Filtro,
} from "@/lib/tabla/motor";
import type { FilaRetiro } from "./tabla-retiros";

export { SIN_VALOR, ESTADO_ETIQUETA };
export {
  PRESETS_FECHA,
  filtroActivo,
  normalizar,
  rangoDePreset,
  type Filtro,
  type Opcion,
  type PresetFechaId,
  type TipoCampo,
  type ValorFiltro,
} from "@/lib/tabla/motor";

/** Cómo se filtra, agrupa y oculta cerrados en la tabla de Conciliación de Retiros. */
export const DEF_RETIROS: DefTabla<FilaRetiro> = {
  clave: "retiros",
  // El número del retiro no es un filtro, pero es lo primero que se busca en el CSV: «#0007».
  csvAntes: [{ etiqueta: "N.º de retiro", valor: (f) => `#${String(f.numeroCorrelativo).padStart(4, "0")}` }],
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.estado],
      opciones: () => Object.entries(ESTADO_ETIQUETA).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
      // Para agrupar, por urgencia de conciliación y no alfabéticamente.
      ordenGrupos: ["abierto", "novedad", "cerrado", "novedad_resuelta", "cancelado"],
    },
    {
      id: "plataforma",
      etiqueta: "Plataforma",
      tipo: "seleccion",
      valores: (f) => [f.plataformaNombre ?? SIN_VALOR],
      etiquetaSinValor: "Sin plataforma",
      agrupable: true,
    },
    {
      id: "destino",
      etiqueta: "Destino",
      tipo: "seleccion",
      valores: (f) => [f.destino === "—" ? SIN_VALOR : f.destino],
      etiquetaSinValor: "Sin destino",
      agrupable: true,
    },
    {
      id: "dropi",
      etiqueta: "Estado en Dropi",
      tipo: "seleccion",
      valores: (f) => [f.estadoDropi ?? SIN_VALOR],
      opciones: () => [
        ...Object.entries(ETIQUETA_ESTADO_DROPI).map(([valor, etiqueta]) => ({ valor, etiqueta })),
        { valor: SIN_VALOR, etiqueta: "Sin vincular" },
      ],
      agrupable: true,
    },
    {
      id: "asignado",
      etiqueta: "Creado por",
      tipo: "seleccion",
      valores: (f) => [f.asignadoNombre ?? SIN_VALOR],
      etiquetaSinValor: "Desconocido",
      agrupable: true,
    },
    { id: "creacion", etiqueta: "Fecha de creación", tipo: "fecha", valor: (f) => f.fecha },
    { id: "cierre", etiqueta: "Fecha de cierre", tipo: "fecha", valor: (f) => f.fechaCierre },
    { id: "limite", etiqueta: "Fecha límite", tipo: "fecha", valor: (f) => f.fechaLimite },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (f) => f.monto },
    { id: "comision", etiqueta: "Comisión", tipo: "numero", valor: (f) => f.comision },
    { id: "arecibir", etiqueta: "A recibir", tipo: "numero", valor: (f) => f.aRecibir },
    { id: "recibido", etiqueta: "Monto recibido", tipo: "numero", valor: (f) => f.montoRecibido },
    { id: "notas", etiqueta: "Notas", tipo: "texto", valor: (f) => f.notas ?? "" },
    { id: "soporte", etiqueta: "N.º de soporte", tipo: "texto", valor: (f) => f.soporteNumero ?? "" },
  ],
  cerrados: {
    etiqueta: "Cerrados",
    // Una novedad resuelta no sigue el flujo normal (no cuenta como pendiente ni como conciliado):
    // se oculta por defecto junto con lo cerrado, para no dejar el listado lleno de novedades viejas.
    esCerrado: (f) => f.estado === "cerrado" || f.estado === "novedad_resuelta",
    campoEstado: "estado",
    valoresCerrados: ["cerrado", "novedad_resuelta"],
    ocultosPorDefecto: true,
    // Aislado, como Cuentas destino: el botón «Cerrados» muestra solo lo cerrado (o solo lo abierto),
    // nunca los dos juntos.
    exclusivo: true,
  },
  total: (f) => f.monto,
};

export const CAMPOS = DEF_RETIROS.campos;

export const filtroVacio = (campo: string): Filtro => filtroVacioDe(DEF_RETIROS, campo);
export const opcionesDeSeleccion = (filas: FilaRetiro[], campo: string) => opcionesDe(DEF_RETIROS, filas, campo);
export const filtrarRetiros = (filas: FilaRetiro[], filtros: Filtro[]) => filtrarFilas(DEF_RETIROS, filas, filtros);
export const parsearFiltros = (json: string): Filtro[] => parsearFiltrosDe(DEF_RETIROS, json);
