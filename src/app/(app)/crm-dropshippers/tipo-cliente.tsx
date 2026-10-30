"use client";

import { useRef, useState } from "react";
import { claseOpcionPanel, PanelCelda } from "@/app/(app)/compras/panel-celda";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cambiarTipoCliente } from "./tareas/actions";
import { NIVELES, etiquetaNivel } from "./def-crm";

/** El color de cada tipo: Rookie azul claro, VIP dorado y Black negro (los rellenos salen de los tokens: en el tema oscuro se invierten). */
const CLASE: Record<string, string> = {
  regular: "bg-azul-soft text-azul",
  vip: "bg-warning-soft text-warning",
  black: "bg-foreground text-background",
};

/** La pastilla del tipo de cliente («VIP», «Black»), solo para ver. Un Rookie no lleva pastilla en las listas (`soloDestacados`). */
export function PastillaTipo({ nivel, soloDestacados = false }: { nivel: string | null | undefined; soloDestacados?: boolean }) {
  const n = nivel ?? "regular";
  if (soloDestacados && n !== "vip" && n !== "black") return null;
  return <span className={`inline-flex flex-none items-center rounded-full px-1.5 py-px text-[10.5px] font-bold tracking-wide uppercase ${CLASE[n] ?? CLASE.regular}`}>{etiquetaNivel(n)}</span>;
}

/**
 * «Tipo de cliente» (29 oct 2026, pedido de Alcides), como una etiqueta: Rookie, VIP o Black. Al pulsar la pastilla se elige otro y se guarda al
 * momento; queda en la Actividad. Un VIP o Black tiene un plazo de respuesta más corto en la bandeja. Sin permiso, solo se ve.
 */
export function TipoCliente({ dropshipperId, nivel, puede, alCambiar }: { dropshipperId: string; nivel: string; puede: boolean; alCambiar?: (nivel: string) => void }) {
  const { mostrarToast } = useToast();
  const [actual, setActual] = useState(nivel);
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  function elegir(nuevo: string) {
    setAbierto(false);
    if (nuevo === actual) return;
    const antes = actual;
    setActual(nuevo);
    void cambiarTipoCliente(dropshipperId, nuevo)
      .then((r) => {
        if ("error" in r) {
          setActual(antes);
          mostrarToast(r.error, "destructive");
        } else alCambiar?.(nuevo);
      })
      .catch(() => {
        setActual(antes);
        mostrarToast("No se pudo cambiar el tipo de cliente.", "destructive");
      });
  }

  if (!puede) return <PastillaTipo nivel={actual} />;
  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={`Tipo de cliente: ${etiquetaNivel(actual)}. Cambiar`}
        onClick={() => setAbierto((x) => !x)}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold tracking-wide uppercase ${CLASE[actual] ?? CLASE.regular} ${anilloFoco}`}
      >
        {etiquetaNivel(actual)}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {abierto && (
        <PanelCelda ancla={boton} etiqueta="Tipo de cliente" ancho={200} alCerrar={(m) => (setAbierto(false), m === "escape" && boton.current?.focus())}>
          <p className="m-0 px-3 pt-2 pb-1 text-xs text-muted-foreground">Tipo de cliente</p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-1.5 pt-0">
            {NIVELES.map((n) => (
              <li key={n.valor}>
                <button type="button" role="menuitemradio" aria-checked={actual === n.valor} onClick={() => elegir(n.valor)} className={`${claseOpcionPanel} hover:bg-muted ${anilloFoco}`}>
                  <PastillaTipo nivel={n.valor} />
                  {actual === n.valor && <span className="text-xs text-primario">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </PanelCelda>
      )}
    </>
  );
}
