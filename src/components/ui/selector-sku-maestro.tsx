"use client";

import { FotoAmpliable } from "@/components/ui/foto-ampliable";
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fieldClass } from "@/components/ui/field";
import { buscarProductos, numeroComoTexto } from "@/lib/wms/buscar-sku";

/** Un producto (SKU maestro) para elegir: su SKU es la identidad del producto en todo el sistema. */
export interface OpcionSkuMaestro {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  /** El N.º correlativo del producto, si se cargó. */
  numero?: number | null;
  /** El código de barras del producto (del fabricante o interno), si tiene. */
  barras?: string | null;
  /** La foto del producto, si tiene. */
  foto?: string | null;
  /** Si es un compuesto (no puede ser componente de otro compuesto). */
  compuesto?: boolean;
  /** Si es una variante, el producto al que pertenece: la lista la muestra debajo de él, nunca suelta (9 nov 2026). */
  padreId?: string | null;
}

const SkusMaestrosContext = createContext<OpcionSkuMaestro[]>([]);

/** Pone a disposición de los campos de producto (Compras, fichas de Shopify y Dropi) los productos que se pueden elegir. */
export function ProveedorSkusMaestros({ opciones, children }: { opciones: OpcionSkuMaestro[]; children: ReactNode }) {
  return <SkusMaestrosContext.Provider value={opciones}>{children}</SkusMaestrosContext.Provider>;
}

/** Los productos que ofrece el `ProveedorSkusMaestros` de arriba (para sumarle uno recién creado). */
export const useOpcionesSkuMaestro = () => useContext(SkusMaestrosContext);

const etiqueta = (s: OpcionSkuMaestro) => `${s.codigo} · ${s.nombre}`;
const numeroTexto = numeroComoTexto;
const buscar = buscarProductos;

/** Miniatura de 32 × 32 (o un cuadro vacío del mismo tamaño). */
function Miniatura({ foto }: { foto?: string | null }) {
  return foto ? (
    <FotoAmpliable toque={false} src={foto} alt="" className="h-8 w-8 shrink-0 rounded-md border border-border object-cover" />
  ) : (
    <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-md border border-dashed border-border" />
  );
}

/**
 * Elige un producto: mientras se escribe (parte del SKU, del nombre, el N.º o el código de barras) se abre la lista de sugerencias con la foto en
 * miniatura, el SKU, el nombre y el N.º; se elige con el ratón o con flechas y Enter (Escape cierra). No acepta texto libre:
 * si lo escrito no es uno de la lista, al salir del campo se vuelve al que estaba.
 */
export function CampoSkuMaestro({
  valor,
  alCambiar,
  etiquetaAria = "SKU maestro",
  placeholder = "Código o nombre del SKU maestro",
  className = "",
  claseContenedor = "",
  deshabilitado,
}: {
  valor: string | null;
  alCambiar: (sku: OpcionSkuMaestro | null) => void;
  etiquetaAria?: string;
  placeholder?: string;
  className?: string;
  /** Clases del contenedor (la miniatura y el campo): para que ocupe todo el ancho de una fila, `min-w-0 flex-1` o `w-full`. */
  claseContenedor?: string;
  deshabilitado?: boolean;
}) {
  const opciones = useContext(SkusMaestrosContext);
  const id = useId();
  const actual = useMemo(() => opciones.find((o) => o.id === valor) ?? null, [opciones, valor]);
  const [texto, setTexto] = useState<string | null>(null); // null = mostrar el elegido
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const mostrado = texto ?? (actual ? etiqueta(actual) : "");
  const sugerencias = useMemo(() => (abierto ? buscar(opciones, texto ?? "") : []), [abierto, opciones, texto]);

  // La lista va en <body> (una tabla o una ficha con scroll la recortaría) y se ubica bajo el campo.
  useLayoutEffect(() => {
    if (!abierto) return;
    const ubicar = () => {
      const r = campo.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 320) });
    };
    ubicar();
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
    };
  }, [abierto]);

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${activa}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activa]);

  function elegir(o: OpcionSkuMaestro) {
    alCambiar(o);
    setTexto(null);
    setAbierto(false);
  }

  return (
    <>
      <span className={`flex items-center gap-2 ${claseContenedor}`.trim()}>
        {actual && texto === null && <Miniatura foto={actual.foto} />}
        <input
          ref={campo}
          type="text"
          role="combobox"
          aria-expanded={abierto && sugerencias.length > 0}
          aria-controls={`${id}-lista`}
          aria-activedescendant={abierto && sugerencias.length ? `${id}-o${activa}` : undefined}
          aria-autocomplete="list"
          value={mostrado}
          disabled={deshabilitado}
          autoComplete="off"
          aria-label={etiquetaAria}
          placeholder={placeholder}
          onFocus={() => {
            setAbierto(true);
            setActiva(0);
          }}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
            setActiva(0);
            if (e.target.value.trim() === "") alCambiar(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setAbierto(true);
              const n = sugerencias.length;
              if (n) setActiva((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
            } else if (e.key === "Enter" && abierto && sugerencias[activa]) {
              e.preventDefault();
              elegir(sugerencias[activa].o);
            } else if (e.key === "Escape" && abierto) {
              e.preventDefault();
              e.stopPropagation();
              setAbierto(false);
              setTexto(null);
            }
          }}
          onBlur={() => {
            setAbierto(false);
            setTexto(null);
          }}
          className={`${fieldClass} w-full ${className}`.trim()}
        />
      </span>
      {abierto &&
        pos &&
        createPortal(
          <ul
            ref={lista}
            id={`${id}-lista`}
            role="listbox"
            aria-label="Productos sugeridos"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="fixed z-[70] m-0 flex max-h-80 list-none flex-col overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
          >
            {sugerencias.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Ningún producto coincide.</li>
            ) : (
              sugerencias.map(({ o, variante }, i) => (
                <li
                  key={o.id}
                  id={`${id}-o${i}`}
                  data-indice={i}
                  role="option"
                  aria-selected={i === activa}
                  onMouseEnter={() => setActiva(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(o)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg py-1.5 pr-2 ${variante ? "pl-9" : "pl-2"} ${i === activa ? "bg-primario-suave" : ""}`}
                >
                  <Miniatura foto={o.foto} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {variante && <span className="font-normal text-muted-foreground">Variante · </span>}
                      {o.nombre}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      <span className="font-medium text-foreground-soft">{o.codigo}</span>
                      {o.numero !== undefined && o.numero !== null ? ` · ${numeroTexto(o.numero)}` : ""}
                      {o.barras ? ` · ${o.barras}` : ""}
                      {o.estado === "test" ? " · Test" : o.estado === "inactivo" ? " · Inactivo" : o.estado === "descontinuado" ? " · Descontinuado" : ""}
                    </span>
                  </span>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </>
  );
}
