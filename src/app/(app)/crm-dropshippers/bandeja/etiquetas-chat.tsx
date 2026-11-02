"use client";

import { useRef, useState, type RefObject } from "react";
import { PanelEtiquetas, PastillaEtiqueta } from "@/components/etiquetas/etiquetas";
import { anilloFoco } from "@/components/ui/field";
import { EtiquetaIcon } from "@/lib/nav-icons";

/** Lo que la Bandeja le pasa a las etiquetas de un chat: las que existen, sus colores y cómo se guardan. */
export interface ManejoEtiquetas {
  todas: string[];
  colores: Record<string, string>;
  cambiar: (conversacionId: string, etiquetas: string[]) => void;
  cambiarColor: (nombre: string, color: string) => void;
}

/** Las pastillas de las etiquetas de un chat, solo para ver (en la lista y en la vista previa). */
export function PastillasEtiquetas({ etiquetas, colores }: { etiquetas: string[]; colores: Record<string, string> }) {
  if (!etiquetas.length) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {etiquetas.map((e) => (
        <PastillaEtiqueta key={e} nombre={e} color={colores[e]} />
      ))}
    </span>
  );
}

/** El selector de etiquetas de un chat, abierto bajo `ancla` (lo usa también el menú del clic derecho de la lista). */
export function SelectorEtiquetasChat({
  ancla,
  conversacionId,
  etiquetas,
  manejo,
  alCerrar,
}: {
  ancla: RefObject<HTMLElement | null>;
  conversacionId: string;
  etiquetas: string[];
  manejo: ManejoEtiquetas;
  alCerrar: (motivo: "escape" | "fuera") => void;
}) {
  return (
    <PanelEtiquetas
      ancla={ancla}
      titulo="Etiquetas del chat"
      puestas={etiquetas}
      todas={manejo.todas}
      colores={manejo.colores}
      alCambiar={(nuevas) => manejo.cambiar(conversacionId, nuevas)}
      alColor={manejo.cambiarColor}
      alCerrar={alCerrar}
    />
  );
}

/**
 * Las etiquetas de un chat en su ficha, como en ClickUp (29 oct 2026, pedido de Alcides): sus pastillas de color y «Etiqueta» para abrir el
 * selector, donde se ponen, se quitan, se crean y se les elige color. Se guardan al momento. Sin permiso de escritura, solo se ven.
 */
export function EtiquetasChat({ conversacionId, etiquetas, manejo, escribe }: { conversacionId: string; etiquetas: string[]; manejo: ManejoEtiquetas; escribe: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  if (!escribe && !etiquetas.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <PastillasEtiquetas etiquetas={etiquetas} colores={manejo.colores} />
      {escribe && (
        <button
          ref={boton}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
          className={`inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-[var(--wa-sec)] px-2 text-[11.5px] font-medium text-[var(--wa-sec)] hover:bg-[var(--wa-hover)] hover:text-[var(--wa-texto)] ${anilloFoco}`}
        >
          <EtiquetaIcon aria-hidden="true" className="h-3 w-3" />
          {etiquetas.length ? "Editar etiquetas" : "Agregar etiqueta"}
        </button>
      )}
      {abierto && (
        <SelectorEtiquetasChat
          ancla={boton}
          conversacionId={conversacionId}
          etiquetas={etiquetas}
          manejo={manejo}
          alCerrar={(m) => {
            setAbierto(false);
            if (m === "escape") boton.current?.focus();
          }}
        />
      )}
    </div>
  );
}
