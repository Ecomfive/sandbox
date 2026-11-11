"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/**
 * Si una caja que se desplaza de lado tiene más contenido a la derecha y si ya se desplazó (para la sombra de la
 * columna fija). Se vuelve a medir al desplazarse y cuando cambia de tamaño la caja o su contenido.
 */
export function useSombrasX(ref: RefObject<HTMLElement | null>, activo = true): { masDerecha: boolean; desplazada: boolean } {
  const [estado, setEstado] = useState({ masDerecha: false, desplazada: false });
  useEffect(() => {
    const el = ref.current;
    if (!el || !activo) {
      setEstado({ masDerecha: false, desplazada: false });
      return;
    }
    const medir = () => {
      const max = el.scrollWidth - el.clientWidth;
      const masDerecha = el.scrollLeft < max - 1;
      const desplazada = el.scrollLeft > 1;
      setEstado((e) => (e.masDerecha === masDerecha && e.desplazada === desplazada ? e : { masDerecha, desplazada }));
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    if (el.firstElementChild) observador.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", medir);
      observador.disconnect();
    };
  }, [ref, activo]);
  return estado;
}

/** La sombra del borde derecho que dice «hay más columnas»: va dentro de un contenedor `relative`, sobre la caja. */
export function SombraDerecha({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 right-0 z-[12] w-8 bg-gradient-to-l from-[color-mix(in_oklab,var(--foreground)_14%,transparent)] to-transparent transition-opacity duration-150 motion-reduce:transition-none ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

/**
 * Una caja que se desplaza de lado (una tabla ancha) sin empujar la página: región con teclado, sombra en el borde
 * derecho mientras haya más contenido y `data-desplazada` cuando ya se movió (la columna fija de la izquierda dibuja su
 * sombra con eso, en globals.css). La caja es `relative`, así que lo que va con posición absoluta adentro (un texto
 * `sr-only`) no se sale de ella.
 */
export function DesplazableX({
  ariaLabel,
  className = "",
  primeraFija = true,
  children,
}: {
  ariaLabel: string;
  className?: string;
  /** La primera columna de la `tabla-datos` de adentro queda fija a la izquierda mientras haya algo que desplazar. */
  primeraFija?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { masDerecha, desplazada } = useSombrasX(ref);
  const hayMas = masDerecha || desplazada;
  return (
    <div className="relative min-w-0">
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        data-desplazada={desplazada ? "" : undefined}
        data-primera-fija={primeraFija && hayMas ? "" : undefined}
        className={`relative overflow-x-auto focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none focus-visible:ring-inset ${className}`}
      >
        {children}
      </div>
      <SombraDerecha visible={masDerecha} />
    </div>
  );
}
