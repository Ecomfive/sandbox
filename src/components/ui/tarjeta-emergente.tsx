"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const RETARDO_MOSTRAR = 200;
const RETARDO_OCULTAR = 150;
const SEPARACION = 6;
const MARGEN = 8;

/**
 * Como `Tooltip`, pero para contenido con estructura (no solo una frase): una tarjeta flotante que
 * aparece al pasar el cursor sobre el elemento envuelto, con cualquier JSX adentro. Va por portal a
 * <body> para que no la recorten los contenedores con overflow (como una tabla).
 */
export function TarjetaEmergente({
  contenido,
  ancho,
  clase = "rounded-lg border border-border bg-card p-3 shadow-lg",
  children,
}: {
  contenido: ReactNode;
  ancho?: string;
  clase?: string;
  children: ReactNode;
}) {
  const envolturaRef = useRef<HTMLSpanElement>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);

  const cancelar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  }, []);

  const mostrar = useCallback(
    (retardo: number) => {
      cancelar();
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

  useLayoutEffect(() => {
    if (!visible) return;
    const envoltura = envolturaRef.current;
    const tarjeta = tarjetaRef.current;
    if (!envoltura || !tarjeta) return;
    const caja = envoltura.getBoundingClientRect();
    const anchoTarjeta = tarjeta.offsetWidth;
    const altoTarjeta = tarjeta.offsetHeight;
    const izquierda = Math.min(Math.max(caja.left + caja.width / 2 - anchoTarjeta / 2, MARGEN), window.innerWidth - anchoTarjeta - MARGEN);
    const cabeArriba = caja.top - altoTarjeta - SEPARACION >= MARGEN;
    tarjeta.style.left = `${izquierda}px`;
    tarjeta.style.top = `${cabeArriba ? caja.top - altoTarjeta - SEPARACION : caja.bottom + SEPARACION}px`;
    tarjeta.style.visibility = "visible";
  }, [visible]);

  return (
    <span ref={envolturaRef} className="inline-flex" onMouseEnter={() => mostrar(RETARDO_MOSTRAR)} onMouseLeave={() => ocultar()}>
      {children}
      {visible &&
        createPortal(
          <div
            ref={tarjetaRef}
            onMouseEnter={cancelar}
            onMouseLeave={() => ocultar()}
            style={{ position: "fixed", left: 0, top: 0, visibility: "hidden", ...(ancho ? { width: ancho } : {}) }}
            className={`animate-fade-in z-50 ${clase}`}
          >
            {contenido}
          </div>,
          document.body
        )}
    </span>
  );
}
