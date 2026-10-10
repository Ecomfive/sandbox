"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fieldClass } from "@/components/ui/field";

/** Un producto (SKU maestro) para elegir: su SKU es la identidad del producto en todo el sistema. */
export interface OpcionSkuMaestro {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  /** El N.º correlativo del producto, si se cargó. */
  numero?: number | null;
  /** La foto del producto, si tiene. */
  foto?: string | null;
}

const SkusMaestrosContext = createContext<OpcionSkuMaestro[]>([]);

/** Pone a disposición de los campos de producto (Compras, fichas de Shopify y Dropi) los productos que se pueden elegir. */
export function ProveedorSkusMaestros({ opciones, children }: { opciones: OpcionSkuMaestro[]; children: ReactNode }) {
  return <SkusMaestrosContext.Provider value={opciones}>{children}</SkusMaestrosContext.Provider>;
}

const etiqueta = (s: OpcionSkuMaestro) => `${s.codigo} · ${s.nombre}`;
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const numeroTexto = (n?: number | null) => (n === null || n === undefined ? "" : `#${String(n).padStart(4, "0")}`);

/** Los que coinciden con lo escrito, los mejores primero: SKU que empieza igual, nombre que empieza igual, y luego el resto. */
function buscar(opciones: OpcionSkuMaestro[], texto: string, limite = 8): OpcionSkuMaestro[] {
  const q = normal(texto);
  if (!q) return opciones.slice(0, limite);
  const palabras = q.split(/\s+/);
  return opciones
    .map((o) => {
      const codigo = normal(o.codigo);
      const nombre = normal(o.nombre);
      const numero = numeroTexto(o.numero).slice(1).replace(/^0+/, "");
      const todo = `${codigo} ${nombre} ${numero}`;
      if (!palabras.every((p) => todo.includes(p))) return null;
      const puntos = (codigo.startsWith(q) ? 4 : 0) + (nombre.startsWith(q) ? 3 : 0) + (numero === q ? 5 : 0) + (codigo.includes(q) ? 1 : 0);
      return { o, puntos };
    })
    .filter((x): x is { o: OpcionSkuMaestro; puntos: number } => x !== null)
    .sort((a, b) => b.puntos - a.puntos || a.o.nombre.localeCompare(b.o.nombre, "es"))
    .slice(0, limite)
    .map((x) => x.o);
}

/** Miniatura de 32 × 32 (o un cuadro vacío del mismo tamaño). */
function Miniatura({ foto }: { foto?: string | null }) {
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={foto} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-md border border-border object-cover" />
  ) : (
    <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-md border border-dashed border-border" />
  );
}

/**
 * Elige un producto: mientras se escribe (parte del SKU, del nombre o el N.º) se abre la lista de sugerencias con la foto en
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
              elegir(sugerencias[activa]);
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
              sugerencias.map((o, i) => (
                <li
                  key={o.id}
                  id={`${id}-o${i}`}
                  data-indice={i}
                  role="option"
                  aria-selected={i === activa}
                  onMouseEnter={() => setActiva(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(o)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 ${i === activa ? "bg-primario-suave" : ""}`}
                >
                  <Miniatura foto={o.foto} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{o.nombre}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      <span className="font-medium text-foreground-soft">{o.codigo}</span>
                      {o.numero !== undefined && o.numero !== null ? ` · ${numeroTexto(o.numero)}` : ""}
                      {o.estado === "test" ? " · Test" : ""}
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
