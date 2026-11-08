"use client";

import { createContext, useContext, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { leerOrden, moverUnPaso, soltarSobre } from "@/lib/orden/orden-guardado";

/** Lo guardado de cada fila, por su clave de `localStorage`. Si el navegador no deja guardar, vale mientras la página está abierta. */
const oyentes = new Map<string, Set<() => void>>();
const enMemoria = new Map<string, string | null>();

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave) ?? enMemoria.get(clave) ?? null;
  } catch {
    return enMemoria.get(clave) ?? null;
  }
}

function escribir(clave: string, valor: string | null) {
  enMemoria.set(clave, valor);
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento: queda en memoria.
  }
  oyentes.get(clave)?.forEach((f) => f());
}

function suscribirA(clave: string) {
  return (avisar: () => void) => {
    const lista = oyentes.get(clave) ?? new Set();
    lista.add(avisar);
    oyentes.set(clave, lista);
    const deOtraPestana = (e: StorageEvent) => {
      if (e.key === clave) avisar();
    };
    window.addEventListener("storage", deOtraPestana);
    return () => {
      lista.delete(avisar);
      window.removeEventListener("storage", deOtraPestana);
    };
  };
}

interface Contexto {
  orden: string[];
  arrastrando: string | null;
  setArrastrando: (id: string | null) => void;
  sobre: string | null;
  setSobre: (id: string | null) => void;
  guardar: (orden: string[], movido: string) => void;
  visibles: () => string[];
}

const Ctx = createContext<Contexto | null>(null);

/**
 * Una fila de elementos que cada persona ordena a su gusto (8 nov 2026, pedido de Alcides): cada `ItemArrastrable` se arrastra a donde se quiera, o se mueve
 * con Alt + flecha izquierda o derecha teniendo el foco dentro de él. Se ordena con `order` de CSS (sirve en una fila flex o en una rejilla) y el orden queda
 * en el navegador de la persona con `clave`. Lo que no va en un `ItemArrastrable` queda primero.
 */
export function OrdenArrastrable({
  clave,
  ids,
  etiquetas,
  queSon,
  className,
  children,
  etiqueta,
}: {
  clave: string;
  /** Los ids en su orden de siempre. Uno nuevo se agrega aquí y aparece al final del orden de cada persona. */
  ids: readonly string[];
  /** El nombre de cada uno, para el aviso del lector de pantalla. */
  etiquetas: Readonly<Record<string, string>>;
  /** «los botones», «las tarjetas»: para los textos. */
  queSon: string;
  className: string;
  children: ReactNode;
  /** El nombre de la región (`aria-label`), si es una. */
  etiqueta?: string;
}) {
  const suscribir = useMemo(() => suscribirA(clave), [clave]);
  const crudo = useSyncExternalStore(
    suscribir,
    () => leer(clave),
    () => null,
  );
  const orden = useMemo(() => leerOrden(crudo, ids), [crudo, ids]);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  const idAyuda = useId();

  const visibles = () => [...(caja.current?.querySelectorAll<HTMLElement>("[data-orden-id]") ?? [])].map((e) => e.dataset.ordenId!).sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
  const guardar = (nuevo: string[], movido: string) => {
    escribir(clave, JSON.stringify(nuevo));
    const vistos = nuevo.filter((x) => visibles().includes(x));
    setAviso(`${etiquetas[movido] ?? movido}: lugar ${vistos.indexOf(movido) + 1} de ${vistos.length}.`);
  };

  return (
    <Ctx.Provider value={{ orden, arrastrando, setArrastrando, sobre, setSobre, guardar, visibles }}>
      <div ref={caja} role={etiqueta ? "region" : undefined} aria-label={etiqueta} aria-describedby={idAyuda} className={className}>
        {children}
      </div>
      <p id={idAyuda} className="sr-only">
        Puedes ordenar {queSon}: arrástralos, o con el foco en uno pulsa Alt y la flecha izquierda o derecha.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </Ctx.Provider>
  );
}

/** Un elemento que se puede mover dentro de `OrdenArrastrable`. Si no hay nada que mostrar (no aplica), no dibuja nada. */
export function ItemArrastrable({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  const c = useContext(Ctx);
  if (!children) return null;
  if (!c) return <>{children}</>;
  const { orden, arrastrando, setArrastrando, sobre, setSobre, guardar, visibles } = c;
  // Un botón que abre una ventana en un portal recibe aquí sus eventos (suben por el árbol de React): solo cuenta lo que pasa dentro del elemento.
  const deAqui = (e: { currentTarget: HTMLElement; target: EventTarget }) => e.currentTarget.contains(e.target as Node);
  return (
    <div
      data-orden-id={id}
      // Después de lo que no se mueve (orden 0).
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
        const desde = arrastrando;
        setArrastrando(null);
        setSobre(null);
        if (desde && desde !== id) guardar(soltarSobre(orden, desde, id), desde);
      }}
      onKeyDown={(e) => {
        if (!deAqui(e) || !e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
        e.preventDefault();
        guardar(moverUnPaso(orden, id, e.key === "ArrowLeft" ? -1 : 1, visibles()), id);
      }}
      className={`rounded-2xl transition-opacity motion-reduce:transition-none ${arrastrando === id ? "opacity-40" : ""} ${sobre === id ? "ring-2 ring-primario ring-offset-2 ring-offset-background" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
