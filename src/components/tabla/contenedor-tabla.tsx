"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDensidad } from "./densidad";

/**
 * Caja de una tabla de datos: lleva la densidad de las filas que eligió la persona y decide cómo se
 * desplaza. Si la tabla es más ancha que su tarjeta se desplaza de lado (con teclado, como una región).
 * Si cabe, no es una caja con desplazamiento y su encabezado queda fijo bajo la barra de herramientas al
 * bajar la página (un encabezado fijo no funciona dentro de una caja que se desplaza de lado).
 * La tabla que va adentro lleva la clase `tabla-datos`; los estilos están en globals.css.
 */
export function ContenedorTabla({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  const [densidad] = useDensidad();
  const ref = useRef<HTMLDivElement>(null);
  // Hasta medir se asume que desborda: no hay encabezado fijo pero nada se corta.
  const [desborda, setDesborda] = useState(true);

  useEffect(() => {
    const caja = ref.current;
    const tabla = caja?.querySelector("table");
    const tarjeta = caja?.parentElement;
    if (!caja || !tabla || !tarjeta) return;
    const medir = () => setDesborda(tabla.offsetWidth > tarjeta.clientWidth + 1);
    const observador = new ResizeObserver(medir);
    observador.observe(tarjeta);
    observador.observe(tabla);
    return () => observador.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-densidad={densidad}
      data-encabezado-fijo={desborda ? undefined : ""}
      {...(desborda
        ? {
            role: "region",
            tabIndex: 0,
            "aria-label": `${ariaLabel}, desplazable horizontalmente con las flechas izquierda y derecha`,
          }
        : {})}
      className={`min-w-0 ${
        desborda
          ? "overflow-x-auto focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none focus-visible:ring-inset"
          : ""
      }`}
    >
      {children}
    </div>
  );
}
