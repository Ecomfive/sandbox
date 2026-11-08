"use client";

import {
  createContext,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { anilloFoco } from "@/components/ui/field";
import {
  BOTONES_FICHA,
  esOrdenDefecto,
  leerOrden,
  moverAntes,
  moverUnPaso,
  type BotonFicha,
} from "@/lib/publicaciones/orden-botones";

/** El orden de cada persona, en su navegador (no viaja a otro equipo). Si el navegador no deja guardar, vale mientras la página está abierta. */
const CLAVE = "publicaciones-ficha-botones-v1";
const oyentes = new Set<() => void>();
let enMemoria: string | null = null;

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  const deOtraPestana = (e: StorageEvent) => {
    if (e.key === CLAVE) avisar();
  };
  window.addEventListener("storage", deOtraPestana);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", deOtraPestana);
  };
}

function leer(): string | null {
  try {
    return localStorage.getItem(CLAVE) ?? enMemoria;
  } catch {
    return enMemoria;
  }
}

function escribir(valor: string | null) {
  enMemoria = valor;
  try {
    if (valor === null) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, valor);
  } catch {
    // Sin almacenamiento: queda en memoria.
  }
  oyentes.forEach((f) => f());
}

const texto = (id: BotonFicha) =>
  BOTONES_FICHA.find((b) => b.id === id)?.texto ?? id;

interface Contexto {
  orden: BotonFicha[];
  arrastrando: BotonFicha | null;
  setArrastrando: (id: BotonFicha | null) => void;
  sobre: BotonFicha | null;
  setSobre: (id: BotonFicha | null) => void;
  guardar: (orden: BotonFicha[], movido: BotonFicha) => void;
  visibles: () => BotonFicha[];
}

const Ctx = createContext<Contexto | null>(null);

/**
 * La fila de botones de la ficha de Gestión de IDs Dropi que se puede ordenar (8 nov 2026, pedido de Alcides): cada botón se arrastra a donde se quiera,
 * o se mueve con Alt + flecha izquierda o derecha teniendo el foco en él. El orden se guarda en el navegador de cada persona y «Orden de siempre» lo
 * deshace. «Guardar cambios» y «Cancelar» van fuera de `ItemOrden`: siempre primero.
 */
export function BarraOrdenable({ children }: { children: ReactNode }) {
  const crudo = useSyncExternalStore(suscribir, leer, () => null);
  const orden = useMemo(() => leerOrden(crudo), [crudo]);
  const [arrastrando, setArrastrando] = useState<BotonFicha | null>(null);
  const [sobre, setSobre] = useState<BotonFicha | null>(null);
  const [aviso, setAviso] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  const idAyuda = useId();

  const visibles = () =>
    [
      ...(caja.current?.querySelectorAll<HTMLElement>("[data-boton-ficha]") ??
        []),
    ]
      .map((e) => e.dataset.botonFicha as BotonFicha)
      .sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
  const guardar = (nuevo: BotonFicha[], movido: BotonFicha) => {
    escribir(JSON.stringify(nuevo));
    const vistos = nuevo.filter((x) => visibles().includes(x));
    setAviso(
      `${texto(movido)}: lugar ${vistos.indexOf(movido) + 1} de ${vistos.length}.`,
    );
  };

  return (
    <Ctx.Provider
      value={{
        orden,
        arrastrando,
        setArrastrando,
        sobre,
        setSobre,
        guardar,
        visibles,
      }}
    >
      <div
        ref={caja}
        aria-describedby={idAyuda}
        className="flex flex-wrap gap-2"
      >
        {children}
        {!esOrdenDefecto(orden) && (
          <button
            type="button"
            style={{ order: 99 }}
            onClick={() => {
              escribir(null);
              setAviso("Los botones volvieron al orden de siempre.");
            }}
            className={`self-center rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
          >
            Orden de siempre
          </button>
        )}
      </div>
      <p id={idAyuda} className="sr-only">
        Puedes ordenar los botones: arrástralos, o con el foco en uno pulsa Alt
        y la flecha izquierda o derecha.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </Ctx.Provider>
  );
}

/** Un botón que se puede mover dentro de `BarraOrdenable`. Si no hay botón (no aplica a esta publicación), no dibuja nada. */
export function ItemOrden({
  id,
  children,
}: {
  id: BotonFicha;
  children: ReactNode;
}) {
  const c = useContext(Ctx);
  if (!children) return null;
  if (!c) return <>{children}</>;
  const {
    orden,
    arrastrando,
    setArrastrando,
    sobre,
    setSobre,
    guardar,
    visibles,
  } = c;
  // Apagar y Privatizar abren ventanas en un portal: sus eventos suben por el árbol de React hasta aquí. Solo cuenta lo que pasa dentro del botón.
  const deAqui = (e: { currentTarget: HTMLElement; target: EventTarget }) => e.currentTarget.contains(e.target as Node);
  const soltar = () => {
    const desde = arrastrando;
    setArrastrando(null);
    setSobre(null);
    if (!desde || desde === id) return;
    // Si viene de la izquierda queda después de este; si viene de la derecha, antes.
    const despues = orden.indexOf(desde) < orden.indexOf(id);
    guardar(
      despues
        ? moverAntes(orden, desde, orden[orden.indexOf(id) + 1] ?? null)
        : moverAntes(orden, desde, id),
      desde,
    );
  };
  return (
    <div
      data-boton-ficha={id}
      // Después de «Guardar cambios» y «Cancelar», que no tienen orden (0).
      style={{ order: orden.indexOf(id) + 1 }}
      draggable
      onDragStart={(e) => {
        if (!deAqui(e)) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        setArrastrando(id);
      }}
      onDragEnd={() => {
        setArrastrando(null);
        setSobre(null);
      }}
      onDragOver={(e) => {
        if (!deAqui(e) || !arrastrando || arrastrando === id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (sobre !== id) setSobre(id);
      }}
      onDrop={(e) => {
        if (!deAqui(e)) return;
        e.preventDefault();
        soltar();
      }}
      onKeyDown={(e) => {
        if (!deAqui(e) || !e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight"))
          return;
        e.preventDefault();
        guardar(
          moverUnPaso(orden, id, e.key === "ArrowLeft" ? -1 : 1, visibles()),
          id,
        );
      }}
      className={`rounded-lg transition-opacity motion-reduce:transition-none ${arrastrando === id ? "opacity-40" : ""} ${sobre === id ? "ring-2 ring-primario ring-offset-2 ring-offset-card" : ""}`}
    >
      {children}
    </div>
  );
}
