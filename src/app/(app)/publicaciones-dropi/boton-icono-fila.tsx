"use client";

import type { ComponentType } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";

export type ColorActivo = "rojo" | "verde" | "azul" | "violeta";

const FONDO_ACTIVO: Record<ColorActivo, string> = { rojo: "bg-destructive", verde: "bg-success", azul: "bg-azul", violeta: "bg-privado" };

/**
 * Un botón de ícono de la fila de Gestión de IDs Dropi. Nunca se esconde (27 oct 2026, pedido de Alcides: esconderlos dejaba la columna
 * desordenada): si no se puede usar va apagado y, al pasar el cursor o con el foco, dice el porqué (`motivo`). Sigue siendo enfocable
 * (`aria-disabled`, no `disabled`) para que el porqué también llegue por teclado y lector de pantalla.
 */
export function BotonIconoFila({
  texto,
  motivo,
  icono: Icono,
  nombre,
  onClick,
  ocupado = false,
  clase = "text-muted-foreground hover:bg-muted hover:text-foreground",
  activo,
}: {
  texto: string;
  motivo: string | null;
  icono: ComponentType<{ className?: string }>;
  /** El nombre de la publicación, para el nombre accesible. */
  nombre: string;
  onClick: () => void;
  ocupado?: boolean;
  /** Color del botón cuando se puede usar. */
  clase?: string;
  /**
   * Lo que el botón marca está puesto (en liquidación, pausada, archivada, pendiente en Dropi…): el ícono va en blanco dentro de un círculo de ese
   * color, para que resalte (28 oct 2026, pedido de Alcides). Sin él, el ícono va suelto.
   */
  activo?: ColorActivo;
}) {
  const apagado = motivo !== null;
  const ayuda = apagado ? `${texto}: ${motivo}` : texto;
  const marcado = activo && !apagado;
  return (
    <Tooltip texto={ayuda}>
      <button
        type="button"
        onClick={() => !apagado && !ocupado && onClick()}
        aria-disabled={apagado || ocupado || undefined}
        aria-label={`${ayuda} (${nombre})`}
        className={`group/icono inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors ${apagado ? "cursor-not-allowed text-muted-foreground opacity-35" : ocupado ? "opacity-50" : marcado ? "" : clase} ${anilloFoco}`}
      >
        {marcado ? (
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-white shadow-sm transition-opacity group-hover/icono:opacity-85 ${FONDO_ACTIVO[activo]}`}>
            <Icono className="h-3.5 w-3.5" />
          </span>
        ) : (
          <Icono className="h-4 w-4" />
        )}
      </button>
    </Tooltip>
  );
}

/**
 * Un botón grande de la ficha que no se puede usar: se ve apagado (no se esconde) y, al pasar el cursor o con el foco, dice el porqué.
 */
export function BotonAccionApagado({ icono, texto, motivo }: { icono: ComponentType<{ className?: string }>; texto: string; motivo: string }) {
  return (
    <Tooltip texto={`${texto}: ${motivo}`}>
      <BotonAccion icono={icono} aria-disabled="true" aria-label={`${texto}: ${motivo}`} className="cursor-not-allowed !border-transparent !bg-muted !text-muted-foreground" onClick={() => {}}>
        {texto}
      </BotonAccion>
    </Tooltip>
  );
}
