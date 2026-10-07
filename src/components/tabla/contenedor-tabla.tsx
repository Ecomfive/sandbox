"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDensidad } from "./densidad";
import { claseEncabezadoColumna } from "./estilos-tabla";

/** Una celda de una fila que se repite fija (el encabezado o los totales): su contenido y, si hace falta, su clase. */
export interface CeldaFija {
  contenido: ReactNode;
  clase?: string;
}

/**
 * Caja de una tabla de datos: lleva la densidad de las filas que eligió la persona y decide cómo se
 * desplaza. Si la tabla es más ancha que su tarjeta se desplaza de lado (con teclado, como una región).
 * Si cabe, no es una caja con desplazamiento y su encabezado queda fijo bajo la barra de herramientas al
 * bajar la página (un encabezado fijo no funciona dentro de una caja que se desplaza de lado).
 * Cuando se desplaza de lado, su barra de desplazamiento no queda al final de la tabla (habría que bajar hasta abajo
 * para usarla): una barra propia queda pegada al borde de abajo de la pantalla mientras la tabla esté a la vista, y se
 * mueve junto con la tabla.
 *
 * Aun así el encabezado se queda quieto al bajar: con `encabezadoFijo`, cuando el encabezado de verdad sale de la pantalla
 * por arriba aparece una copia suya (mismos anchos, siguiendo el desplazamiento de lado) pegada bajo la barra de herramientas,
 * y las filas son las que se mueven, como en ClickUp. Con `totales`, una fila de sumas queda pegada abajo, encima de la barra
 * de desplazamiento, mientras la tabla esté a la vista. Las dos copias son solo para ver (`aria-hidden`): la tabla real sigue
 * siendo la que lee un lector de pantalla.
 * La tabla que va adentro lleva la clase `tabla-datos`; los estilos están en globals.css.
 */
export function ContenedorTabla({
  ariaLabel,
  children,
  aspecto,
  encabezadoFijo,
  totales,
}: {
  ariaLabel: string;
  children: ReactNode;
  /** El `data-aspecto` de la tabla («lista»), para que las copias se vean igual. */
  aspecto?: string;
  /** Una celda por cada `<th>` de la tabla, en el mismo orden. */
  encabezadoFijo?: CeldaFija[];
  /** Una celda por cada columna de la tabla, en el mismo orden (la primera suele decir «Total»). */
  totales?: CeldaFija[];
}) {
  const [densidad] = useDensidad();
  const ref = useRef<HTMLDivElement>(null);
  // Hasta medir se asume que desborda: no hay encabezado fijo pero nada se corta.
  const [desborda, setDesborda] = useState(true);
  const barra = useRef<HTMLDivElement>(null);
  const copiaEncabezado = useRef<HTMLDivElement>(null);
  const copiaTotales = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  // El ancho real de cada columna, para que las copias queden alineadas con la tabla.
  const [anchos, setAnchos] = useState<number[]>([]);
  // El encabezado de verdad ya salió de la pantalla por arriba: toca mostrar la copia.
  const [encabezadoFuera, setEncabezadoFuera] = useState(false);
  // Lo que mide la barra de herramientas fija de arriba: la copia del encabezado se pega justo debajo de ella.
  const [altoBarra, setAltoBarra] = useState(0);
  const columnas = encabezadoFijo?.length ?? totales?.length ?? 0;

  useEffect(() => {
    const caja = ref.current;
    const tabla = caja?.querySelector("table");
    const tarjeta = caja?.parentElement;
    if (!caja || !tabla || !tarjeta) return;
    const medir = () => {
      setDesborda(tabla.offsetWidth > tarjeta.clientWidth + 1);
      setAncho(tabla.getBoundingClientRect().width);
      const barraFija = tarjeta.firstElementChild as HTMLElement | null;
      if (barraFija && getComputedStyle(barraFija).position === "sticky") setAltoBarra(barraFija.offsetHeight);
      if (columnas > 0) setAnchos([...tabla.querySelectorAll("thead th")].map((th) => th.getBoundingClientRect().width));
    };
    const observador = new ResizeObserver(medir);
    observador.observe(tarjeta);
    observador.observe(tabla);
    // Una columna puede cambiar de ancho sin que la tabla cambie (otras filas, otro filtro).
    if (columnas > 0) for (const th of tabla.querySelectorAll("thead th")) observador.observe(th);
    return () => observador.disconnect();
  }, [columnas]);

  // La copia del encabezado solo se ve cuando el encabezado de verdad quedó arriba, fuera de la pantalla.
  const hayEncabezadoFijo = !!encabezadoFijo;
  useEffect(() => {
    const encabezado = ref.current?.querySelector("thead");
    if (!encabezado || !hayEncabezadoFijo) return;
    const observador = new IntersectionObserver(
      ([entrada]) => setEncabezadoFuera(!entrada.isIntersecting && entrada.boundingClientRect.bottom <= (altoBarra || 45) + 15),
      { threshold: [0, 1], rootMargin: `-${(altoBarra || 45) + 1}px 0px 0px 0px` },
    );
    observador.observe(encabezado);
    return () => observador.disconnect();
  }, [hayEncabezadoFijo, altoBarra]);

  // La tabla, la barra de abajo y las copias se mueven juntas (asignar el mismo valor no vuelve a disparar el evento).
  const alMoverTabla = () => {
    const x = ref.current?.scrollLeft ?? 0;
    if (barra.current) barra.current.scrollLeft = x;
    if (copiaEncabezado.current) copiaEncabezado.current.scrollLeft = x;
    if (copiaTotales.current) copiaTotales.current.scrollLeft = x;
  };
  const alMoverBarra = () => {
    if (barra.current && ref.current) ref.current.scrollLeft = barra.current.scrollLeft;
  };

  const tablaCopia = (filas: CeldaFija[], tipo: "encabezado" | "totales") => {
    const celdas = filas.map((c, i) =>
      tipo === "encabezado" ? (
        <th key={i} scope="col" className={c.clase ?? claseEncabezadoColumna}>
          {c.contenido}
        </th>
      ) : (
        <td key={i} className={c.clase ?? "border-r border-border/40 px-4 py-3 tabular-nums"}>
          {c.contenido}
        </td>
      ),
    );
    return (
      <table data-aspecto={aspecto} className="tabla-datos border-collapse text-sm" style={{ width: ancho, tableLayout: "fixed" }}>
        <colgroup>
          {anchos.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        {tipo === "encabezado" ? (
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">{celdas}</tr>
          </thead>
        ) : (
          <tbody>
            <tr>{celdas}</tr>
          </tbody>
        )}
      </table>
    );
  };
  const copiasListas = anchos.length > 0 && anchos.length === columnas;

  return (
    <>
      {encabezadoFijo && desborda && copiasListas && (
        // Sin alto propio: se pega bajo la barra de herramientas y la copia flota encima de las primeras filas.
        <div data-densidad={densidad} aria-hidden="true" style={altoBarra ? { top: altoBarra } : undefined} className="sticky top-[var(--alto-barra-tabla)] z-[15] h-0">
          <div ref={copiaEncabezado} className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden border-b border-border bg-card ${encabezadoFuera ? "" : "hidden"}`}>
            {tablaCopia(encabezadoFijo, "encabezado")}
          </div>
        </div>
      )}
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
      {(desborda || (totales && copiasListas)) && (
        <div data-densidad={densidad} className="sticky bottom-0 z-20 bg-card">
          {totales && copiasListas && (
            <div ref={copiaTotales} aria-hidden="true" className="overflow-hidden border-t border-border bg-muted text-[13px] font-medium">
              {tablaCopia(totales, "totales")}
            </div>
          )}
          {desborda && (
            <div ref={barra} aria-hidden="true" onScroll={alMoverBarra} className="overflow-x-auto border-t border-border">
              <div style={{ width: ancho, height: 1 }} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
