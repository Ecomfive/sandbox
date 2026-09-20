"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const RETARDO_MOSTRAR = 450;
const RETARDO_OCULTAR = 120;
const SEPARACION = 6;
const MARGEN = 8;

/**
 * Descripción breve de lo que hace un botón (una frase, como en ClickUp: "Filtra rápidamente los
 * retiros"), en una burbuja oscura sobre el elemento. Aparece con el cursor (con un instante de
 * espera) y con el foco de teclado; Escape la cierra, y se puede pasar el cursor sobre ella sin
 * que desaparezca. Envuelve UN elemento enfocable (botón o enlace); nunca pongas aquí lo único que
 * explica un control: el nombre accesible del elemento sigue siendo su texto o su `aria-label`.
 *
 * Va por portal a <body> para que ningún contenedor con overflow (tablas, menús) la recorte.
 */
export function Tooltip({
  texto,
  children,
}: {
  texto: string;
  children: ReactNode;
}) {
  const id = useId();
  const envolturaRef = useRef<HTMLSpanElement>(null);
  const burbujaRef = useRef<HTMLDivElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tras un clic (p. ej. al abrir un menú) no vuelve a aparecer hasta que el cursor salga.
  const suprimido = useRef(false);
  const [visible, setVisible] = useState(false);

  const cancelar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  }, []);

  const mostrar = useCallback(
    (retardo: number) => {
      cancelar();
      if (suprimido.current) return;
      temporizador.current = setTimeout(() => setVisible(true), retardo);
    },
    [cancelar]
  );

  const ocultar = useCallback(
    (retardo: number = RETARDO_OCULTAR) => {
      cancelar();
      temporizador.current = setTimeout(() => setVisible(false), retardo);
    },
    [cancelar]
  );

  useEffect(() => cancelar, [cancelar]);

  useEffect(() => {
    if (!visible) return;
    function cerrar() {
      cancelar();
      setVisible(false);
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    document.addEventListener("keydown", alTeclear);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [visible, cancelar]);

  // Mientras se ve, el elemento enfocable queda descrito por la burbuja (para lectores de pantalla).
  // Se hace en el DOM y no con cloneElement porque el hijo puede llegar de un Server Component,
  // donde React no expone sus props.
  useEffect(() => {
    if (!visible) return;
    const elemento = envolturaRef.current?.firstElementChild;
    if (!elemento) return;
    const previo = elemento.getAttribute("aria-describedby");
    elemento.setAttribute("aria-describedby", previo ? `${previo} ${id}` : id);
    return () => {
      if (previo) elemento.setAttribute("aria-describedby", previo);
      else elemento.removeAttribute("aria-describedby");
    };
  }, [visible, id]);

  // Se coloca antes de pintar: arriba del elemento (o debajo si no cabe) y sin salirse de la pantalla.
  useLayoutEffect(() => {
    if (!visible) return;
    const envoltura = envolturaRef.current;
    const burbuja = burbujaRef.current;
    if (!envoltura || !burbuja) return;
    const caja = envoltura.getBoundingClientRect();
    const ancho = burbuja.offsetWidth;
    const alto = burbuja.offsetHeight;
    const izquierda = Math.min(Math.max(caja.left + caja.width / 2 - ancho / 2, MARGEN), window.innerWidth - ancho - MARGEN);
    const cabeArriba = caja.top - alto - SEPARACION >= MARGEN;
    burbuja.style.left = `${izquierda}px`;
    burbuja.style.top = `${cabeArriba ? caja.top - alto - SEPARACION : caja.bottom + SEPARACION}px`;
    burbuja.style.visibility = "visible";
  }, [visible, texto]);

  return (
    <span
      ref={envolturaRef}
      className="inline-flex"
      onMouseEnter={() => mostrar(RETARDO_MOSTRAR)}
      onMouseLeave={() => {
        suprimido.current = false;
        ocultar();
      }}
      onMouseDown={() => {
        suprimido.current = true;
        cancelar();
        setVisible(false);
      }}
      onFocus={(e) => {
        // Solo con teclado: al enfocar con el ratón ya lo maneja el cursor.
        if (e.target.matches(":focus-visible")) mostrar(0);
      }}
      onBlur={() => ocultar(0)}
    >
      {children}
      {visible &&
        createPortal(
          <div
            ref={burbujaRef}
            id={id}
            role="tooltip"
            onMouseEnter={cancelar}
            onMouseLeave={() => ocultar()}
            style={{ position: "fixed", left: 0, top: 0, visibility: "hidden" }}
            className="animate-fade-in z-50 max-w-72 rounded-md bg-foreground px-2.5 py-1.5 text-xs leading-snug text-background shadow-md"
          >
            {texto}
          </div>,
          document.body
        )}
    </span>
  );
}
