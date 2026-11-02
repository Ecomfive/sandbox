"use client";

import { useRef, useState } from "react";
import { PanelEtiquetas, PastillaEtiqueta } from "@/components/etiquetas/etiquetas";
import { anilloFoco } from "@/components/ui/field";
import { EtiquetaIcon } from "@/lib/nav-icons";
import type { FilaCompra } from "./def-compras";
import type { GuardarCelda } from "./celda-editable";

// Las piezas de las etiquetas son comunes (también las usa la Bandeja de WhatsApp): `src/components/etiquetas/etiquetas.tsx`.
export { colorEtiqueta, COLORES_ETIQUETA, PastillaEtiqueta } from "@/components/etiquetas/etiquetas";

/**
 * Las etiquetas de una compra junto a su nombre, como en ClickUp: pastillas de color y, al pasar por la fila, un ícono que
 * abre el selector («Buscar o añadir etiquetas…»): pulsar una la pone o la quita; escribir una nueva y Enter la crea. Se
 * guarda al instante (igual que una celda) y queda en la Actividad. Sin permiso de escritura, solo se ven.
 */
export function EtiquetasCompra({
  compra,
  todas,
  colores,
  puedeEscribir,
  guardar,
  cambiarColor,
  sinPastillas = false,
}: {
  compra: FilaCompra;
  todas: string[];
  /** El color elegido de cada etiqueta (por su nombre). */
  colores: Record<string, string>;
  puedeEscribir: boolean;
  guardar: GuardarCelda;
  cambiarColor: (nombre: string, color: string) => void;
  /** Solo el botón: las pastillas ya se ven en otro lado (junto al nombre de la compra, dentro de su botón). */
  sinPastillas?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {!sinPastillas && compra.etiquetas.map((e) => <PastillaEtiqueta key={e} nombre={e} color={colores[e]} />)}
      {puedeEscribir && (
        <button
          ref={boton}
          type="button"
          aria-label={`Etiquetas de ${compra.nombre}`}
          title="Etiquetas"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          onClick={(ev) => {
            ev.stopPropagation();
            setAbierto((v) => !v);
          }}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground hover:text-foreground ${
            abierto ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          } ${anilloFoco}`}
        >
          <EtiquetaIcon className="h-3 w-3" />
        </button>
      )}
      {abierto && (
        <PanelEtiquetas
          ancla={boton}
          titulo="Etiquetas de la compra"
          puestas={compra.etiquetas}
          todas={todas}
          colores={colores}
          alCambiar={(etiquetas) => guardar(compra, "etiquetas", etiquetas)}
          alColor={cambiarColor}
          alCerrar={(m) => {
            setAbierto(false);
            if (m === "escape") boton.current?.focus();
          }}
        />
      )}
    </span>
  );
}
