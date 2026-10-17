import type { FilaPuesto } from "@/lib/puestos/datos";
import { AREAS_PUESTO } from "@/lib/puestos/puesto";
import type { DefTabla } from "@/lib/tabla/motor";

export const libres = (p: FilaPuesto) => Math.max(0, p.plazas - p.ocupantes.length);

/** Cómo se filtra y agrupa la lista de puestos; «Inactivos» es el botón de filas cerradas. Arranca agrupada por área. */
export const DEF_PUESTOS: DefTabla<FilaPuesto> = {
  clave: "puestos",
  campos: [
    {
      id: "area",
      etiqueta: "Área",
      tipo: "seleccion",
      valores: (p) => [p.area],
      opciones: () => AREAS_PUESTO.map((a) => ({ valor: a, etiqueta: a })),
      agrupable: true,
    },
    {
      id: "vacante",
      etiqueta: "Plazas",
      tipo: "seleccion",
      valores: (p) => [libres(p) > 0 ? "vacante" : "completo"],
      opciones: () => [
        { valor: "vacante", etiqueta: "Con vacante" },
        { valor: "completo", etiqueta: "Completo" },
      ],
      agrupable: true,
    },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (p) => [p.activo ? "activo" : "inactivo"],
      opciones: () => [
        { valor: "activo", etiqueta: "Activo" },
        { valor: "inactivo", etiqueta: "Inactivo" },
      ],
      agrupable: true,
    },
    { id: "nombre", etiqueta: "Puesto", tipo: "texto", valor: (p) => p.nombre },
    { id: "reporta", etiqueta: "Reporta a", tipo: "texto", valor: (p) => p.reportaANombre },
    { id: "personas", etiqueta: "Personas", tipo: "texto", valor: (p) => p.ocupantes.map((o) => o.nombre).join(", ") },
  ],
  cerrados: {
    etiqueta: "Inactivos",
    esCerrado: (p) => !p.activo,
    campoEstado: "estado",
    valoresCerrados: ["inactivo"],
    ocultosPorDefecto: true,
  },
  vistaInicial: { agrupar: "area" },
};
