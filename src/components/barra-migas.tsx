"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { BotonAccesos } from "@/components/accesos/boton-accesos";
import { FavoritoToggle } from "@/components/favorito-toggle";
import { useEtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { construirMigas } from "@/lib/migas";
import { NAV_SECTIONS, type NavSectionAnidada } from "@/lib/nav-data";
import { pestanaActiva, pestanasDe } from "@/lib/pestanas";
import { ChevronRightIcon, FlechaIzquierdaIcon } from "@/lib/nav-icons";

/** La API de navegación solo cuenta entradas del mismo sitio; sin ella se cae al largo del historial. */
function hayPaginaAnteriorDeLaApp(): boolean {
  const navegacion = (window as unknown as { navigation?: { canGoBack?: boolean } }).navigation;
  if (navegacion && typeof navegacion.canGoBack === "boolean") return navegacion.canGoBack;
  return window.history.length > 1;
}

/**
 * Franja fija bajo la barra global, igual en todas las páginas: migas de pan a la izquierda
 * (Sección › Plataforma › Módulo) con la estrella de favorito pegada a la página actual. A la
 * derecha queda el sitio de las acciones de la página, siempre en la misma posición.
 * Las migas salen solas del menú y de la ruta: las páginas no las dibujan.
 */
export function BarraMigas({
  seccionesPlataforma,
  favoritos,
  rutaActual,
}: {
  seccionesPlataforma: NavSectionAnidada[];
  favoritos: string[];
  /** Solo para pruebas visuales: fuerza la ruta en vez de leerla del navegador. */
  rutaActual?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const etiquetaDetalle = useEtiquetaMiga();
  const ruta = rutaActual ?? pathname;
  const { migas, favoritoHref, moduloHref, moduloEtiqueta } = useMemo(
    () => construirMigas(ruta, seccionesPlataforma, NAV_SECTIONS, etiquetaDetalle),
    [ruta, seccionesPlataforma, etiquetaDetalle]
  );

  if (migas.length === 0) return null;

  const pestanas = pestanasDe(moduloHref);
  const pestanaActual = pestanaActiva(pestanas, ruta);

  // Volver = la página anterior del historial (respeta el botón "atrás" del navegador). Si esta
  // página se abrió directo (sin página anterior de la plataforma), sube al módulo padre de las
  // migas o, en su defecto, al dashboard, en vez de sacar a la persona del sistema.
  const padreHref = [...migas].reverse().find((m) => m.href)?.href ?? "/";
  function volver() {
    if (hayPaginaAnteriorDeLaApp()) router.back();
    else router.push(padreHref);
  }

  return (
    <div className="border-b border-border bg-card">
      <div className="flex min-h-11 items-center justify-between gap-3 py-1 pr-6 pl-14 md:pl-6">
        <div className="flex min-w-0 items-center gap-1">
          {ruta !== "/" && (
            <Tooltip texto="Volver">
              <button
                type="button"
                onClick={volver}
                aria-label="Volver a la página anterior"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${anilloFoco}`}
              >
                <FlechaIzquierdaIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
          <nav aria-label="Migas de pan" className="min-w-0">
            <ol className="flex min-w-0 items-center gap-1 text-sm">
              {migas.map((miga, i) => {
                const ultima = i === migas.length - 1;
                // En pantallas angostas solo caben la miga actual y su anterior.
                const ocultaEnMovil = i < migas.length - 2;
                return (
                  <li
                    key={`${i}-${miga.etiqueta}`}
                    className={`min-w-0 items-center gap-1 ${ocultaEnMovil ? "hidden md:flex" : "flex"}`}
                  >
                    {i > 0 && (
                      <ChevronRightIcon
                        aria-hidden="true"
                        className={`h-3.5 w-3.5 shrink-0 text-muted-foreground ${i === migas.length - 2 ? "max-md:hidden" : ""}`}
                      />
                    )}
                    {miga.href ? (
                      <Link
                        href={miga.href}
                        className={`truncate rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${anilloFoco}`}
                      >
                        {miga.etiqueta}
                      </Link>
                    ) : (
                      <span
                        aria-current={ultima ? "page" : undefined}
                        className={`truncate px-1 py-0.5 ${ultima ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                      >
                        {miga.etiqueta}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          {favoritoHref && (
            <FavoritoToggle href={favoritoHref} activo={favoritos.includes(favoritoHref)} variante="miga" />
          )}
        </div>
        {/* Acciones de la página: mismo lugar en todas las secciones; Accesos siempre es la última. */}
        <div className="flex shrink-0 items-center gap-2">
          <div id="acciones-encabezado" className="flex items-center gap-2" />
          {moduloHref && moduloEtiqueta && (
            <BotonAccesos key={ruta} moduloHref={moduloHref} moduloEtiqueta={moduloEtiqueta} />
          )}
        </div>
      </div>

      {/* Pestañas del módulo (como las vistas de ClickUp): solo si tiene subpáginas. */}
      {pestanas.length > 1 && (
        <nav aria-label={`Secciones de ${moduloEtiqueta}`} className="pr-6 pl-14 md:pl-6">
          <ul className="flex gap-1 overflow-x-auto">
            {pestanas.map((pestana) => {
              const activa = pestana.href === pestanaActual;
              return (
                <li key={pestana.href} className="shrink-0">
                  <Link
                    href={pestana.href}
                    aria-current={activa ? "page" : undefined}
                    className={`relative inline-flex min-h-9 items-center px-3 text-sm whitespace-nowrap transition-colors ${anilloFoco} ${
                      activa
                        ? "font-semibold text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {pestana.etiqueta}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
