import type { DefTabla } from "@/lib/tabla/motor";
import type { FilaLinea } from "@/lib/conciliacion/cargar";

const seleccion = <K extends keyof FilaLinea>(id: K, etiqueta: string, agrupable = true) => ({
  id,
  etiqueta,
  tipo: "seleccion" as const,
  valores: (l: FilaLinea) => [String(l[id])],
  agrupable,
});

/** Líneas del banco de una cuenta en un mes: se filtran y agrupan por estado, qué son, de dónde sale la propuesta y lo que marcó el Excel. */
export const DEF_LINEAS: DefTabla<FilaLinea> = {
  clave: "conciliacion-bancaria",
  campos: [
    seleccion("estado", "Estado"),
    seleccion("clase", "Qué es"),
    seleccion("fuente", "Fuente"),
    seleccion("excel", "En el Excel"),
    { id: "descripcion", etiqueta: "Descripción", tipo: "texto", valor: (l) => l.descripcion },
    { id: "referencia", etiqueta: "Referencia", tipo: "texto", valor: (l) => l.referencia },
    { id: "propuesta", etiqueta: "Propuesta", tipo: "texto", valor: (l) => l.propuesta },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (l) => l.monto },
    { id: "puntaje", etiqueta: "Puntaje", tipo: "numero", valor: (l) => l.puntaje ?? 0 },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (l) => l.fecha },
  ],
  total: (l) => l.monto,
};
