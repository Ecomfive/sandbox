"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { ETIQUETA_ACCION } from "@/lib/auditoria-cambios";
import { CalendarioIcon, EstadoIcon, ExtractoIcon, PersonaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { DEF_AUDITORIA, type FilaAuditoria } from "./def-auditoria";

const NOMBRE: NombreFilas = { singular: "movimiento", plural: "movimientos" };
const ICONOS: Record<string, IconoComp> = {
  usuario: PersonaIcon,
  accion: EstadoIcon,
  fecha: CalendarioIcon,
  detalle: ExtractoIcon,
};

const COLUMNAS: ColumnaTabla<FilaAuditoria>[] = [
  { id: "fecha", label: "Fecha", ocultable: false, clase: "whitespace-nowrap align-top", render: (e) => e.fechaTexto },
  { id: "usuario", label: "Usuario", ocultable: true, clase: "font-medium align-top", render: (e) => e.usuario ?? "—" },
  { id: "accion", label: "Acción", ocultable: true, clase: "align-top", render: (e) => ETIQUETA_ACCION[e.accion] ?? e.accion },
  {
    id: "detalle",
    label: "Detalle",
    ocultable: true,
    clase: "text-muted-foreground",
    render: (e) =>
      e.cambios.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {e.cambios.map((c) => (
            <li key={c.campo}>
              <span className="text-foreground">{c.campo}</span>: {c.antes} <span aria-hidden="true">→</span>
              <span className="sr-only"> cambió a </span> {c.despues}
            </li>
          ))}
        </ul>
      ) : (
        e.detalle
      ),
  },
];

/** Historial de auditoría con la barra de herramientas común (agrupar por usuario o acción, filtros y columnas). */
export function TablaAuditoria({ eventos }: { eventos: FilaAuditoria[] }) {
  return (
    <TablaDatos
      def={DEF_AUDITORIA}
      filas={eventos}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(e) => e.id}
      etiquetaGrupo={(campo, grupo) => <span className="font-semibold">{campo === "accion" ? (ETIQUETA_ACCION[grupo.clave] ?? grupo.etiqueta) : grupo.etiqueta}</span>}
      ariaLabel="Tabla del historial de auditoría"
      anchoMinimo="48rem"
      vacio="Todavía no hay movimientos registrados en el historial de auditoría."
    />
  );
}
