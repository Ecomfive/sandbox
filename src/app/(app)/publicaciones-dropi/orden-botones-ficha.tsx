"use client";

import type { ReactNode } from "react";
import { ItemArrastrable, OrdenArrastrable } from "@/components/ui/orden-arrastrable";
import { ETIQUETAS_BOTONES, ORDEN_DEFECTO, type BotonFicha } from "@/lib/publicaciones/orden-botones";

/**
 * La fila de botones de la ficha de Gestión de IDs Dropi que cada persona ordena (8 nov 2026, pedido de Alcides): arrastrándolos o con Alt + flechas, guardado
 * en su navegador. «Guardar cambios» y «Cancelar» van fuera de `ItemOrden`: siempre primero.
 */
export function BarraOrdenable({ children }: { children: ReactNode }) {
  return (
    <OrdenArrastrable clave="publicaciones-ficha-botones-v1" ids={ORDEN_DEFECTO} etiquetas={ETIQUETAS_BOTONES} queSon="los botones" className="flex flex-wrap gap-2">
      {children}
    </OrdenArrastrable>
  );
}

/** Un botón de esa fila. Si no aplica a esta publicación, no dibuja nada. */
export function ItemOrden({ id, children }: { id: BotonFicha; children: ReactNode }) {
  return (
    <ItemArrastrable id={id} className="!rounded-lg">
      {children}
    </ItemArrastrable>
  );
}
