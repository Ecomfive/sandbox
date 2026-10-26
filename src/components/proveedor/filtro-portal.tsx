"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { BuscarIcon, CerrarIcon } from "@/lib/nav-icons";
import { FILTRO_VACIO, filtroActivo, pasaFiltro, type FiltroPortal } from "@/lib/proveedor/filtro";
import { useIdioma } from "./idioma-contexto";

// El buscador y el país del portal del proveedor (26 oct 2026): uno solo para todas las pestañas, también el Registro de pagos, que
// se dibuja dentro del portal (en el Tablero de Shen Zhen llega como `pagosEcomfive`) y lo lee de aquí. Sin proveedor de contexto, no filtra.

interface Contexto {
  filtro: FiltroPortal;
  setFiltro: (f: FiltroPortal) => void;
}

const FiltroCtx = createContext<Contexto>({ filtro: FILTRO_VACIO, setFiltro: () => {} });

export function FiltroPortalProveedor({ children }: { children: ReactNode }) {
  const [filtro, setFiltro] = useState<FiltroPortal>(FILTRO_VACIO);
  return <FiltroCtx.Provider value={{ filtro, setFiltro }}>{children}</FiltroCtx.Provider>;
}

/** El filtro y si una fila lo pasa (busca en el nombre original, en su traducción y en el código). */
export function useFiltroPortal() {
  const { filtro, setFiltro } = useContext(FiltroCtx);
  const { tr } = useIdioma();
  return {
    filtro,
    setFiltro,
    activo: filtroActivo(filtro),
    pasa: (producto: string | null | undefined, referencia: string | null | undefined, paisCodigo: string | null) => pasaFiltro(filtro, [producto, tr(producto), referencia], paisCodigo),
    quitar: () => setFiltro(FILTRO_VACIO),
  };
}

/** La franja con el buscador y un botón por país (solo si hay más de uno). */
export function BarraFiltroPortal({ paises }: { paises: string[] }) {
  const { t } = useIdioma();
  const { filtro, setFiltro } = useFiltroPortal();
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="relative flex min-w-0 flex-[1_1_18rem] items-center sm:max-w-sm">
        <span className="sr-only">{t.buscarPedido}</span>
        <BuscarIcon aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={filtro.buscar}
          onChange={(e) => setFiltro({ ...filtro, buscar: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape" && filtro.buscar) {
              e.preventDefault();
              setFiltro({ ...filtro, buscar: "" });
            }
          }}
          placeholder={t.buscarPedido}
          className="min-h-9 w-full rounded-lg border border-border-control bg-card py-1.5 pr-9 pl-9 text-sm placeholder:text-muted-foreground focus:border-foreground focus:ring-2 focus:ring-foreground focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {filtro.buscar && (
          <button
            type="button"
            aria-label={t.borrarBusqueda}
            onClick={() => setFiltro({ ...filtro, buscar: "" })}
            className={`absolute right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
          >
            <CerrarIcon aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
      {paises.length > 1 && (
        <span role="group" aria-label={t.filtrarPais} className="flex flex-wrap gap-1.5">
          {[null, ...paises].map((p) => (
            <button
              key={p ?? "todos"}
              type="button"
              aria-pressed={filtro.pais === p}
              onClick={() => setFiltro({ ...filtro, pais: p })}
              className={`min-h-9 rounded-full border px-3.5 text-xs font-semibold tabular-nums ${filtro.pais === p ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"} ${anilloFoco}`}
            >
              {p ?? t.todosPaises}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

/** Lo que se ve cuando el filtro deja una pestaña vacía (en vez del «no hay nada» de siempre). */
export function SinResultados() {
  const { t } = useIdioma();
  const { quitar } = useFiltroPortal();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-card px-4 py-4">
      <p className="m-0 text-sm text-muted-foreground">{t.sinResultados}</p>
      <button type="button" onClick={quitar} className={`min-h-9 rounded-lg border border-border-control bg-card px-3.5 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
        {t.quitarFiltros}
      </button>
    </div>
  );
}
