import { ETIQUETA_ACCION } from "@/lib/auditoria-cambios";
import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

/** Un movimiento del historial ya resuelto en el servidor (fecha con zona horaria del país, cambios calculados). */
export interface FilaAuditoria {
  id: string;
  /** ISO, para filtrar por fecha. */
  creadoEn: string;
  fechaTexto: string;
  usuario: string | null;
  accion: string;
  cambios: { campo: string; antes: string; despues: string }[];
  detalle: string | null;
}

/** Texto que se busca en la columna Detalle: los cambios (campo, antes, después) o la frase libre. */
const textoDetalle = (e: FilaAuditoria) =>
  e.cambios.length > 0 ? e.cambios.map((c) => `${c.campo} ${c.antes} ${c.despues}`).join(" ") : (e.detalle ?? "");

/** Cómo se filtra y agrupa el historial de auditoría (más recientes primero: el orden lo pone el servidor). */
export const DEF_AUDITORIA: DefTabla<FilaAuditoria> = {
  clave: "auditoria",
  campos: [
    {
      id: "usuario",
      etiqueta: "Usuario",
      tipo: "seleccion",
      valores: (e) => [e.usuario?.trim() || SIN_VALOR],
      etiquetaSinValor: "Sin usuario",
      agrupable: true,
    },
    {
      id: "accion",
      etiqueta: "Acción",
      tipo: "seleccion",
      valores: (e) => [e.accion],
      opciones: () => Object.entries(ETIQUETA_ACCION).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
    },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (e) => e.creadoEn },
    { id: "detalle", etiqueta: "Detalle", tipo: "texto", valor: textoDetalle },
  ],
};
