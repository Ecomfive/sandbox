"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { combinarLista } from "@/lib/compras/lote";
import { CerrarIcon, MasIcon } from "@/lib/nav-icons";
import { PanelLista } from "./selector-lista";

/**
 * Una lista de nombres dentro de la ficha de una compra (la tienda): los nombres puestos como pastillas, cada una con su ✕, y
 * un botón «Añadir» que abre el mismo panel de la columna (se busca, se pulsa para poner o quitar, y lo que no existe se crea
 * ahí mismo). Va con el resto del formulario: viaja en un campo con `nombre` (los nombres separados por comas) y mover algo
 * enciende «Guardar cambios». `todas` son los nombres que ya existen en otras compras.
 */
export function CampoLista({
  id,
  nombre,
  etiqueta,
  inicial,
  todas,
}: {
  /** El `id` del botón «Añadir» (la etiqueta del campo apunta a él). */
  id: string;
  /** El `name` con que viaja al guardar. */
  nombre: string;
  /** Cómo se llama lo que se añade («tienda»), para el botón y los avisos. */
  etiqueta: string;
  inicial: string[];
  todas: string[];
}) {
  const [valores, setValores] = useState(inicial);
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const oculto = useRef<HTMLInputElement>(null);
  const primera = useRef(true);

  // Cada cambio se le avisa al formulario como si se hubiera escrito en un campo, para que lo vea modificado.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const campo = oculto.current;
    if (!campo) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(campo, valores.join(", "));
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  }, [valores]);

  const hay = (n: string) => valores.some((v) => v.toLowerCase() === n.toLowerCase());

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {/* El valor que viaja al guardar; no se ve ni se usa con el teclado. */}
      <input ref={oculto} type="text" name={nombre} aria-label={etiqueta} defaultValue={inicial.join(", ")} tabIndex={-1} readOnly aria-hidden="true" className="sr-only" />
      {valores.map((v) => (
        <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted py-0.5 pr-1 pl-2.5 text-xs">
          <span className="truncate">{v}</span>
          <Tooltip texto={`Quitar ${v}`}>
            <button
              type="button"
              aria-label={`Quitar ${v}`}
              onClick={() => setValores((a) => a.filter((x) => x !== v))}
              className={`flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground ${anilloFoco}`}
            >
              <CerrarIcon className="h-3 w-3" />
            </button>
          </Tooltip>
        </span>
      ))}
      <button
        ref={boton}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={`${fieldClass} !w-auto inline-flex min-h-8 items-center gap-1 !px-2.5 !py-1 text-xs`}
      >
        <MasIcon className="h-3 w-3" />
        Añadir {etiqueta}
      </button>
      {abierto && (
        <PanelLista
          ancla={boton}
          etiqueta={`Elegir ${etiqueta}`}
          opciones={[...todas, ...valores]}
          marca={(n) => (hay(n) ? "si" : "no")}
          placeholder={`Buscar o añadir ${etiqueta}…`}
          alAlternar={(n) => setValores((a) => combinarLista(a, hay(n) ? "quitar" : "agregar", [n]))}
          alCrear={(n) => setValores((a) => combinarLista(a, "agregar", [n]))}
          alCerrar={(m) => {
            setAbierto(false);
            if (m === "escape") boton.current?.focus();
          }}
        />
      )}
    </div>
  );
}
