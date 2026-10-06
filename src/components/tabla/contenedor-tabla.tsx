"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDensidad } from "./densidad";

/**
 * Caja de una tabla de datos: lleva la densidad de las filas que eligió la persona y decide cómo se
 * desplaza. Si la tabla es más ancha que su tarjeta se desplaza de lado (con teclado, como una región).
 * Si cabe, no es una caja con desplazamiento y su encabezado queda fijo bajo la barra de herramientas al
 * bajar la página (un encabezado fijo no funciona dentro de una caja que se desplaza de lado).
 * Cuando se desplaza de lado, su barra de desplazamiento no queda al final de la tabla (habría que bajar hasta abajo
 * para usarla): una barra propia queda pegada al borde de abajo de la pantalla mientras la tabla esté a la vista, y se
 * mueve junto con la tabla.
 * La tabla que va adentro lleva la clase `tabla-datos`; los estilos están en globals.css.
 */
export function ContenedorTabla({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  const [densidad] = useDensidad();
  const ref = useRef<HTMLDivElement>(null);
  // Hasta medir se asume que desborda: no hay encabezado fijo pero nada se corta.
  const [desborda, setDesborda] = useState(true);
  const barra = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    const caja = ref.current;
    const tabla = caja?.querySelector("table");
    const tarjeta = caja?.parentElement;
    if (!caja || !tabla || !tarjeta) return;
    const medir = () => {
      setDesborda(tabla.offsetWidth > tarjeta.clientWidth + 1);
      setAncho(tabla.offsetWidth);
    };
    const observador = new ResizeObserver(medir);
    observador.observe(tarjeta);
    observador.observe(tabla);
    return () => observador.disconnect();
  }, []);

  // La tabla y la barra de abajo se mueven juntas (asignar el mismo valor no vuelve a disparar el evento).
  const alMoverTabla = () => {
    if (barra.current && ref.current)
      barra.current.scrollLeft = ref.current.scrollLeft;
  };
  const alMoverBarra = () => {
    if (barra.current && ref.current)
      ref.current.scrollLeft = barra.current.scrollLeft;
  };

  return (
    <>
      <div
        ref={ref}
        onScroll={desborda ? alMoverTabla : undefined}
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
            ? "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none focus-visible:ring-inset"
            : ""
        }`}
      >
        {children}
      </div>
      {desborda && (
        <div
          ref={barra}
          aria-hidden="true"
          onScroll={alMoverBarra}
          className="sticky bottom-0 z-20 overflow-x-auto border-t border-border bg-card"
        >
          <div style={{ width: ancho, height: 1 }} />
        </div>
      )}
    </>
  );
}
