"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { almacen } from "@/components/tabla/almacen";
import { anilloFoco } from "@/components/ui/field";
import { ETIQUETA_MODO, modoEfectivo, type ModoFicha } from "@/lib/ficha/modo";

// La elección de cada persona vive en su navegador, como el resto de lo que configura (tema, columnas): vale para todas las fichas.
const ALMACEN = almacen("modo-ficha-v1", "local");

/** Cómo debe abrirse una ficha de este tipo: lo que eligió la persona o, sin elección, su modo por defecto. */
export function useModoFicha(lado: "centro" | "derecha"): ModoFicha {
  const guardado = useSyncExternalStore(ALMACEN.suscribir, ALMACEN.leer, () => "");
  return modoEfectivo(guardado, lado);
}

// El ícono del botón, como el «Cambiar diseño» de ClickUp: un marco con dos flechas que apuntan al centro.
function IconoDiseno() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
      <path d="M4.6 6.2 6.4 8l-1.8 1.8M11.4 6.2 9.6 8l1.8 1.8" />
    </svg>
  );
}

// Dibujos de cada opción (una ventana con sus tres puntos y dónde queda la ficha), como las vistas previas de ClickUp.
function Miniatura({ modo }: { modo: ModoFicha }) {
  return (
    <svg viewBox="0 0 56 38" aria-hidden="true" className="h-9 w-14">
      <rect x="1" y="1" width="54" height="36" rx="3.5" className="fill-card stroke-border-control" strokeWidth="1.2" />
      <circle cx="6" cy="5.5" r="1.1" className="fill-destructive" />
      <circle cx="9.6" cy="5.5" r="1.1" className="fill-warning" />
      <circle cx="13.2" cy="5.5" r="1.1" className="fill-success" />
      {modo === "lateral" && <rect x="34" y="9" width="19" height="26" rx="2" className="fill-muted-foreground/70" />}
      {modo === "centro" && <rect x="9" y="11" width="38" height="22" rx="2" className="fill-muted-foreground/70" />}
      {modo === "completa" && <rect x="4" y="9" width="48" height="26" rx="2" className="fill-muted-foreground/70" />}
    </svg>
  );
}

const ORDEN: ModoFicha[] = ["centro", "completa", "lateral"];

// Lo que se espera antes de replegar el menú al sacar el cursor: da tiempo a cruzar del botón a las opciones.
const RETARDO_REPLEGAR = 160;

/**
 * El botón de la cabecera de una ficha que deja elegir cómo se abre: cuadro de diálogo al centro, pantalla completa o barra lateral
 * (como el «Cambiar diseño» de una tarea de ClickUp). Las opciones se despliegan al pasar el cursor por el ícono (o con Enter, clic o
 * flecha abajo) y se repliegan solas al elegir una o al sacar el cursor; el ícono queda solo. La elección vale para todas las fichas de
 * esta persona.
 */
export function SelectorModoFicha({ modo }: { modo: ModoFicha }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tras elegir, el cursor sigue encima del ícono: no se vuelve a desplegar hasta que salga y entre otra vez.
  const suprimido = useRef(false);
  const idMenu = useId();
  const idBoton = `${idMenu}-boton`;

  function cancelar() {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  }
  useEffect(() => cancelar, []);

  function cerrar(devolverFoco = false) {
    cancelar();
    setAbierto(false);
    if (devolverFoco) document.getElementById(idBoton)?.focus();
  }

  useEffect(() => {
    if (!abierto) return;
    function alHacerClicFuera(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, [abierto]);

  // Con teclado el foco pasa a la opción elegida; con el cursor no se roba el foco.
  function abrirConTeclado() {
    cancelar();
    setAbierto(true);
    requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }

  function alTeclearEnMenu(e: React.KeyboardEvent) {
    const opciones = [...(raiz.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const actual = opciones.indexOf(document.activeElement as HTMLElement);
    const ir = (i: number) => {
      e.preventDefault();
      opciones[(i + opciones.length) % opciones.length]?.focus();
    };
    if (e.key === "ArrowRight" || e.key === "ArrowDown") ir(actual + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") ir(actual - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(opciones.length - 1);
    else if (e.key === "Tab") cerrar(false);
  }

  return (
    <div
      ref={raiz}
      className="relative shrink-0"
      onKeyDown={(e) => {
        // Escape con el menú abierto solo lo cierra: sin esto también cerraría la ficha (que escucha Escape en todo el documento).
        if (e.key === "Escape" && abierto) {
          e.preventDefault();
          e.stopPropagation();
          cerrar(true);
        }
      }}
      onMouseEnter={() => {
        cancelar();
        if (!suprimido.current) setAbierto(true);
      }}
      onMouseLeave={() => {
        suprimido.current = false;
        cancelar();
        temporizador.current = setTimeout(() => setAbierto(false), RETARDO_REPLEGAR);
      }}
    >
        <button
          id={idBoton}
          type="button"
          aria-label="Cambiar diseño de la ficha"
          aria-haspopup="menu"
          aria-expanded={abierto}
          aria-controls={abierto ? idMenu : undefined}
          onClick={(e) => {
            // Con el cursor el menú ya se desplegó al entrar; el clic lo deja abierto (con teclado, `detail` es 0).
            if (e.detail === 0) abrirConTeclado();
            else setAbierto(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !abierto) {
              e.preventDefault();
              abrirConTeclado();
            }
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted ${anilloFoco}`}
        >
          <IconoDiseno />
        </button>
      {abierto && (
        // Sin separación con el botón (el relleno de arriba es parte del menú): el cursor no sale de la zona al bajar a las opciones.
        <div id={idMenu} role="menu" aria-label="Cómo se abre la ficha" onKeyDown={alTeclearEnMenu} className="absolute right-0 top-full z-40 w-max pt-1.5">
          <div className="animate-fade-in flex gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg">
            {ORDEN.map((m) => (
              <button
                key={m}
                type="button"
                role="menuitemradio"
                aria-checked={modo === m}
                onClick={() => {
                  ALMACEN.guardar(m);
                  suprimido.current = true;
                  cerrar(false);
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
        </div>
      )}
    </div>
  );
}
