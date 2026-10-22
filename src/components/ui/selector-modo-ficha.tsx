"use client";

import { useSyncExternalStore } from "react";
import { MenuDesplegable } from "@/components/ui/menu-desplegable";
import { almacen } from "@/components/tabla/almacen";
import { ETIQUETA_MODO, modoEfectivo, type ModoFicha } from "@/lib/ficha/modo";

// La elección de cada persona vive en su navegador, como el resto de lo que configura (tema, columnas): vale para todas las fichas.
const ALMACEN = almacen("modo-ficha-v1", "local");

/** Cómo debe abrirse una ficha de este tipo: lo que eligió la persona o, sin elección, su modo por defecto. */
export function useModoFicha(lado: "centro" | "derecha"): ModoFicha {
  const guardado = useSyncExternalStore(ALMACEN.suscribir, ALMACEN.leer, () => "");
  return modoEfectivo(guardado, lado);
}

// Dibujos de cada opción (la ventana entera y dónde queda la ficha), como los del selector de ClickUp.
function Miniatura({ modo }: { modo: ModoFicha }) {
  return (
    <svg viewBox="0 0 56 38" aria-hidden="true" className="h-9 w-14">
      <rect x="1" y="1" width="54" height="36" rx="3.5" className="fill-muted stroke-border-control" strokeWidth="1.2" />
      {modo === "lateral" && <rect x="34" y="1" width="21" height="36" rx="3.5" className="fill-foreground/70" />}
      {modo === "centro" && <rect x="10" y="6" width="36" height="26" rx="2.5" className="fill-foreground/70" />}
      {modo === "completa" && <rect x="3" y="3" width="50" height="32" rx="2.5" className="fill-foreground/70" />}
    </svg>
  );
}

const ORDEN: ModoFicha[] = ["centro", "completa", "lateral"];

/**
 * El botón de la cabecera de una ficha que deja elegir cómo se abre: cuadro de diálogo al centro, pantalla completa o barra lateral
 * (como el de una tarea de ClickUp). La elección vale para todas las fichas de esta persona.
 */
export function SelectorModoFicha({ modo }: { modo: ModoFicha }) {
  return (
    // Escape con el menú abierto solo lo cierra: sin esto también cerraría la ficha (que escucha Escape en todo el documento).
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape" && e.currentTarget.querySelector('[aria-expanded="true"]')) e.stopPropagation();
      }}
    >
      <MenuDesplegable
        etiqueta="Cómo se abre la ficha"
        claseBoton="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted"
        contenidoBoton={<Miniatura modo={modo} />}
        claseMenu="w-max"
      >
        {(cerrar) => (
          <div className="flex gap-1">
            {ORDEN.map((m) => (
              <button
                key={m}
                type="button"
                role="menuitemradio"
                aria-checked={modo === m}
                onClick={() => {
                  ALMACEN.guardar(m);
                  cerrar(true);
                }}
                className={`flex w-28 flex-col items-center gap-1.5 rounded-lg border p-2 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primario ${
                  modo === m ? "border-primario bg-primario-suave" : "border-transparent hover:bg-muted"
                }`}
              >
                <Miniatura modo={m} />
                {ETIQUETA_MODO[m]}
              </button>
            ))}
          </div>
        )}
      </MenuDesplegable>
    </div>
  );
}
