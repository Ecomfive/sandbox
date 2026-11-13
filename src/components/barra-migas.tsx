"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { BotonAccesos } from "@/components/accesos/boton-accesos";
import { BotonTareaModulo } from "@/components/tareas/boton-tarea-modulo";
import { FavoritoToggle } from "@/components/favorito-toggle";
import { useContadoresPestanas } from "@/components/migas/contador-pestana";
import { useEtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { MODULOS_CON_GUIA } from "@/lib/ayuda/guias-indice";
import { construirMigas } from "@/lib/migas";
import { moduloDeHref, type NavSection } from "@/lib/nav-data";
import { textoContador, textoPendientes } from "@/lib/contadores-menu";
import { gruposDePestanas, pestanaActiva, pestanasDe, type Pestana } from "@/lib/pestanas";
import { ChevronRightIcon, FlechaIzquierdaIcon } from "@/lib/nav-icons";

/** La API de navegación solo cuenta entradas del mismo sitio; sin ella se cae al largo del historial. */
function hayPaginaAnteriorDeLaApp(): boolean {
  const navegacion = (window as unknown as { navigation?: { canGoBack?: boolean } }).navigation;
  if (navegacion && typeof navegacion.canGoBack === "boolean") return navegacion.canGoBack;
  return window.history.length > 1;
}

/**
 * Franja fija bajo la barra global, igual en todas las páginas: migas de pan a la izquierda
 * (Área › Módulo) con la estrella de favorito pegada a la página actual. A la
 * derecha queda el sitio de las acciones de la página, siempre en la misma posición.
 * Las migas salen solas del menú y de la ruta: las páginas no las dibujan.
 */
export function BarraMigas({
  areas,
  favoritos,
  pestanasOcultas = [],
  verAccesos = false,
  verTarea = false,
  rutaActual,
}: {
  areas: NavSection[];
  favoritos: string[];
  /** Las pestañas que esta persona no debe ver (las que su rol o su ficha esconden con «Afinar»). */
  pestanasOcultas?: string[];
  /** El botón «Accesos» (quién tiene acceso a la sección): solo para un administrador (29 oct 2026, pedido de Hernán). */
  verAccesos?: boolean;
  /** El botón «Asignar tarea» (una tarea del tablero del equipo con el módulo ya puesto): quien puede escribir en Equipo › Tareas (9 nov 2026). */
  verTarea?: boolean;
  /** Solo para pruebas visuales: fuerza la ruta en vez de leerla del navegador. */
  rutaActual?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const etiquetaDetalle = useEtiquetaMiga();
  const contadores = useContadoresPestanas();
  const ruta = rutaActual ?? pathname;
  const { migas, favoritoHref, moduloHref, moduloEtiqueta } = useMemo(
    () => construirMigas(ruta, areas, etiquetaDetalle),
    [ruta, areas, etiquetaDetalle]
  );

  if (migas.length === 0) return null;

  const pestanas = pestanasDe(moduloHref).filter((p) => !pestanasOcultas.includes(p.href));
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
    <div data-sin-imprimir className="border-b border-border bg-card">
      <div className="flex min-h-11 items-center justify-between gap-2 py-1 pr-4 pl-14 sm:gap-3 sm:pr-6 md:pl-6">
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
                // En el celular solo cabe la miga actual (el botón de volver lleva a la anterior); desde sm, también su anterior.
                const ocultaEnMovil = i < migas.length - 1;
                const ocultaEnTableta = i < migas.length - 2;
                return (
                  <li
                    key={`${i}-${miga.etiqueta}`}
                    className={`min-w-0 items-center gap-1 ${ocultaEnTableta ? "hidden md:flex" : ocultaEnMovil ? "hidden sm:flex" : "flex"}`}
                  >
                    {i > 0 && (
                      <ChevronRightIcon
                        aria-hidden="true"
                        className={`h-3.5 w-3.5 shrink-0 text-muted-foreground ${i === migas.length - 1 ? "max-sm:hidden" : i === migas.length - 2 ? "max-md:hidden" : ""}`}
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
          {moduloHref && MODULOS_CON_GUIA[moduloHref] && (
            <Tooltip texto="Ayuda de esta página">
              <Link
                href={`/ayuda/guias/${MODULOS_CON_GUIA[moduloHref]}`}
                aria-label={`Ayuda de ${moduloEtiqueta ?? "esta página"}`}
                className={`flex h-8 w-8 items-center justify-center rounded-full border border-border text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${anilloFoco}`}
              >
                ?
              </Link>
            </Tooltip>
          )}
          {verTarea && moduloHref && moduloEtiqueta && moduloHref !== "/" && moduloHref !== "/ayuda" && moduloHref !== "/tareas" && (
            <BotonTareaModulo key={`tarea:${moduloHref}`} moduloClave={moduloDeHref(moduloHref)} moduloEtiqueta={moduloEtiqueta} />
          )}
          {verAccesos && moduloHref && moduloEtiqueta && moduloHref !== "/ayuda" && (
            <BotonAccesos key={`accesos:${ruta}`} moduloHref={moduloHref} moduloEtiqueta={moduloEtiqueta} />
          )}
        </div>
      </div>

      {/* Pestañas del módulo (como las vistas de ClickUp): solo si tiene subpáginas. Con grupos (Rentabilidad), una
          franja de grupos y, debajo, las páginas del grupo elegido: así todo entra sin desplazar en ~1 200 px. */}
      {pestanas.length > 1 &&
        (() => {
          const grupos = gruposDePestanas(pestanas);
          const franja = (lista: Pestana[], activaHref: string | null, etiqueta: string, chica = false, grupo = false) => (
            <nav aria-label={etiqueta} className="pr-4 pl-4 sm:pr-6 md:pl-6">
              <ul className="desplazable-x flex gap-1 overflow-x-auto">
                {lista.map((pestana) => {
                  const activa = pestana.href === activaHref;
                  return (
                    <li key={pestana.href} className="shrink-0">
                      <Link
                        href={pestana.href}
                        aria-current={activa ? (grupo ? "true" : "page") : undefined}
                        className={`relative inline-flex items-center whitespace-nowrap transition-colors ${chica ? "min-h-8 px-2.5 text-[13px]" : "min-h-9 px-3 text-sm"} ${anilloFoco} ${
                          activa
                            ? "font-semibold text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:[background-image:var(--neon)]"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {pestana.etiqueta}
                        {(contadores[pestana.href] ?? 0) > 0 && (
                          <>
                            <span
                              aria-hidden="true"
                              className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] leading-none font-semibold text-background tabular-nums"
                            >
                              {textoContador(contadores[pestana.href])}
                            </span>
                            <span className="sr-only">, {textoPendientes(contadores[pestana.href])}</span>
                          </>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          );
          if (!grupos) return franja(pestanas, pestanaActual, `Secciones de ${moduloEtiqueta}`);
          const grupoActivo = grupos.find((g) => g.pestanas.some((p) => p.href === pestanaActual)) ?? null;
          const cabezas = grupos.map((g) => ({ etiqueta: g.etiqueta, href: g.href }));
          return (
            <>
              {franja(cabezas, grupoActivo?.href ?? null, `Secciones de ${moduloEtiqueta}`, false, (grupoActivo?.pestanas.length ?? 0) > 1)}
              {grupoActivo &&
                grupoActivo.pestanas.length > 1 &&
                franja(grupoActivo.pestanas, pestanaActual, `Páginas de ${grupoActivo.etiqueta}`, true)}
            </>
          );
        })()}
    </div>
  );
}
