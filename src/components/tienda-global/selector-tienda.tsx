"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { MenuDesplegable, TituloGrupoMenu, claseOpcionMenu } from "@/components/ui/menu-desplegable";
import { setTiendaActual } from "@/lib/finanzas/tienda-actions";
import { claveDeRuta, TODAS_TIENDAS } from "@/lib/finanzas/tienda-elegida";
import { CheckIcon, ChevronRightIcon } from "@/lib/nav-icons";

function TiendaIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 9.5 5.5 4h13L20 9.5" />
      <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
      <path d="M5.5 12v8h13v-8M10 20v-4.5h4V20" />
    </svg>
  );
}

/**
 * Tienda global de Finanzas en la barra de arriba (como el país). Solo aparece en las páginas que la usan
 * (`RUTAS_CON_TIENDA`); muestra la de la dirección si la trae y, si no, la global. Al elegir otra, la guarda y vuelve a
 * abrir la página sin la tienda en la dirección, así arranca con la nueva.
 */
export function SelectorTienda({ tiendas, global }: { tiendas: { id: string; nombre: string }[]; global: string | null }) {
  const ruta = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const clave = claveDeRuta(ruta);
  if (!clave || !tiendas.length) return null;

  const deLaDireccion = params.get(clave);
  const actual = deLaDireccion ?? global ?? TODAS_TIENDAS;
  const nombre = actual === TODAS_TIENDAS ? "Todas las tiendas" : (tiendas.find((t) => t.id === actual)?.nombre ?? "Todas las tiendas");

  const elegir = (valor: string) =>
    startTransition(async () => {
      await setTiendaActual(valor);
      const p = new URLSearchParams(params.toString());
      p.delete(clave);
      const q = p.toString();
      router.replace(q ? `${ruta}?${q}` : ruta);
      router.refresh();
    });

  const opciones = [{ id: TODAS_TIENDAS, nombre: "Todas las tiendas" }, ...tiendas];
  return (
    <MenuDesplegable
      etiqueta={`Tienda: ${nombre}`}
      claseBoton={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border border-border-control bg-card py-1 text-sm hover:bg-muted max-sm:w-8 sm:px-3 ${pendiente ? "opacity-60" : ""}`}
      contenidoBoton={
        <>
          <TiendaIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="hidden max-w-40 truncate sm:inline">{nombre}</span>
          <ChevronRightIcon className="h-3.5 w-3.5 rotate-90 text-muted-foreground max-sm:hidden" aria-hidden="true" />
        </>
      }
      claseMenu="w-60"
    >
      {(cerrar) => (
        <>
          <TituloGrupoMenu>Tienda</TituloGrupoMenu>
          {opciones.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={t.id === actual}
              onClick={() => {
                cerrar(true);
                if (t.id !== actual || deLaDireccion !== null) elegir(t.id);
              }}
              className={claseOpcionMenu}
            >
              <span className={t.id === actual ? "font-semibold" : ""}>{t.nombre}</span>
              {t.id === actual && <CheckIcon className="ml-auto h-4 w-4 text-success" aria-hidden="true" />}
            </button>
          ))}
        </>
      )}
    </MenuDesplegable>
  );
}
