"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NAV_SECTIONS,
  moduloDeHref,
  encontrarSeccionActiva,
  type NavSectionAnidada,
  type NavItem,
} from "@/lib/nav-data";
import { DashboardIcon, ChevronRightIcon, NotificacionesIcon, SECTION_ICONS } from "@/lib/nav-icons";
import { ConTooltip } from "@/components/sidebar-tooltip";
import { CuentaFooter } from "@/components/cuenta-footer";
import { FavoritoToggle } from "@/components/favorito-toggle";
import type { UsuarioActual } from "@/lib/auth";

const STORAGE_KEY = "sidebar_expandido";

function ToggleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </svg>
  );
}

function puedeVer(modulosPermitidos: string[] | null | undefined, href?: string) {
  if (!href) return true;
  if (!modulosPermitidos) return true;
  return modulosPermitidos.includes(moduloDeHref(href));
}

/** Fila de un ítem hoja (Link) con su estrella de favorito al lado — usada tanto en los
 * grupos por plataforma como en las secciones planas de NAV_SECTIONS. */
function ItemHoja({
  item,
  activo,
  esFavorito,
  onNavigate,
}: {
  item: NavItem;
  activo: boolean;
  esFavorito: boolean;
  onNavigate?: () => void;
}) {
  if (item.pronto || !item.href) {
    return (
      <span className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm text-muted-foreground/60">
        {item.label}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Pronto</span>
      </span>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      <Link
        href={item.href}
        onClick={onNavigate}
        className={
          activo
            ? "flex-1 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-foreground"
            : "flex-1 rounded-md px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
        }
      >
        {item.label}
      </Link>
      <FavoritoToggle href={item.href} activo={esFavorito} />
    </div>
  );
}

function SidebarContents({
  expanded,
  onToggle,
  onNavigate,
  modulosPermitidos,
  seccionesPlataforma,
  favoritos,
  totalPendientes,
}: {
  expanded: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  modulosPermitidos?: string[] | null;
  seccionesPlataforma: NavSectionAnidada[];
  favoritos: string[];
  totalPendientes: number;
}) {
  const pathname = usePathname();
  const primeraSeccion = seccionesPlataforma[0]?.title ?? NAV_SECTIONS[0]?.title ?? null;
  const seccionActiva = encontrarSeccionActiva(pathname, seccionesPlataforma, NAV_SECTIONS);
  const [seccionAbierta, setSeccionAbierta] = useState<string | null>(seccionActiva?.seccionTitle ?? primeraSeccion);
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(seccionActiva?.grupoLabel ?? null);

  const todosLosItems: NavItem[] = [
    ...seccionesPlataforma.flatMap((s) => s.groups.flatMap((g) => g.items)),
    ...NAV_SECTIONS.flatMap((s) => s.items),
  ];
  const favoritosVisibles = favoritos
    .map((href) => todosLosItems.find((i) => i.href === href))
    .filter((i): i is NavItem => i !== undefined && puedeVer(modulosPermitidos, i.href));

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
      {onToggle && (
        <ConTooltip etiqueta={expanded ? "Colapsar menú" : "Desplegar el menú"} mostrar={!expanded}>
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ToggleIcon className="h-5 w-5 shrink-0" />
            {expanded && <span className="text-sm font-medium">Colapsar menú</span>}
          </button>
        </ConTooltip>
      )}

      {puedeVer(modulosPermitidos, "/") && (
        <ConTooltip etiqueta="Dashboard" mostrar={!expanded}>
          <Link
            href="/"
            onClick={onNavigate}
            className={
              pathname === "/"
                ? "flex w-full items-center gap-3 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
                : "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            }
          >
            <DashboardIcon className="h-5 w-5 shrink-0" />
            {expanded && <span>Dashboard</span>}
          </Link>
        </ConTooltip>
      )}

      {puedeVer(modulosPermitidos, "/notificaciones") && (
        <ConTooltip etiqueta="Centro de notificaciones" mostrar={!expanded}>
          <Link
            href="/notificaciones"
            onClick={onNavigate}
            className={
              pathname === "/notificaciones"
                ? "flex w-full items-center gap-3 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
                : "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            }
          >
            <NotificacionesIcon className="h-5 w-5 shrink-0" />
            {expanded && <span className="flex-1">Centro de notificaciones</span>}
            {totalPendientes > 0 && (
              <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning tabular-nums">
                {totalPendientes}
              </span>
            )}
          </Link>
        </ConTooltip>
      )}

      {expanded && (
        <>
          <p className="mt-4 mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Accesos rápidos
          </p>
          {favoritosVisibles.length === 0 ? (
            <p className="px-3 text-xs text-muted-foreground">Marca una página con ☆ para tenerla aquí.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {favoritosVisibles.map((item) => (
                <ItemHoja
                  key={item.href}
                  item={item}
                  activo={pathname === item.href}
                  esFavorito
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </>
      )}

      {expanded && (
        <p className="mt-4 mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Áreas de la empresa
        </p>
      )}

      {seccionesPlataforma.map((section) => {
        const SectionIcon = SECTION_ICONS[section.title] ?? DashboardIcon;
        const isOpen = expanded && seccionAbierta === section.title;

        return (
          <div key={section.title} className={expanded ? "" : "py-0.5"}>
            <ConTooltip etiqueta={section.title} mostrar={!expanded}>
              <button
                type="button"
                onClick={() =>
                  setSeccionAbierta((prev) => (prev === section.title ? null : section.title))
                }
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <SectionIcon className="h-5 w-5 shrink-0" />
                {expanded && (
                  <>
                    <span className="flex-1 text-left">{section.title}</span>
                    <ChevronRightIcon
                      className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                  </>
                )}
              </button>
            </ConTooltip>
            {expanded && isOpen && (
              <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-6">
                {section.groups.map((grupo) => {
                  if (grupo.items.length === 0) {
                    return (
                      <span
                        key={grupo.label}
                        className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm text-muted-foreground/60"
                      >
                        {grupo.label}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Pronto
                        </span>
                      </span>
                    );
                  }
                  const itemsVisibles = grupo.items.filter((item) => puedeVer(modulosPermitidos, item.href));
                  if (itemsVisibles.length === 0) return null;
                  const grupoOpen = grupoAbierto === grupo.label;
                  return (
                    <div key={grupo.label}>
                      <button
                        type="button"
                        onClick={() =>
                          setGrupoAbierto((prev) => (prev === grupo.label ? null : grupo.label))
                        }
                        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        <span>{grupo.label}</span>
                        <ChevronRightIcon
                          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${grupoOpen ? "rotate-90" : ""}`}
                        />
                      </button>
                      {grupoOpen && (
                        <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-4">
                          {itemsVisibles.map((item) => (
                            <ItemHoja
                              key={item.label}
                              item={item}
                              activo={pathname === item.href}
                              esFavorito={!!item.href && favoritos.includes(item.href)}
                              onNavigate={onNavigate}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {NAV_SECTIONS.map((section) => {
        const itemsVisibles = section.items.filter((item) => puedeVer(modulosPermitidos, item.href));
        if (itemsVisibles.length === 0) return null;

        const SectionIcon = SECTION_ICONS[section.title] ?? DashboardIcon;
        const isOpen = expanded && seccionAbierta === section.title;

        return (
          <div key={section.title} className={expanded ? "" : "py-0.5"}>
            <ConTooltip etiqueta={section.title} mostrar={!expanded}>
              <button
                type="button"
                onClick={() =>
                  setSeccionAbierta((prev) => (prev === section.title ? null : section.title))
                }
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <SectionIcon className="h-5 w-5 shrink-0" />
                {expanded && (
                  <>
                    <span className="flex-1 text-left">{section.title}</span>
                    <ChevronRightIcon
                      className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                  </>
                )}
              </button>
            </ConTooltip>
            {expanded && isOpen && (
              <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-6">
                {itemsVisibles.map((item) => (
                  <ItemHoja
                    key={item.label}
                    item={item}
                    activo={pathname === item.href}
                    esFavorito={!!item.href && favoritos.includes(item.href)}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar({
  modulosPermitidos,
  usuario,
  seccionesPlataforma,
  favoritos,
  totalPendientes,
}: {
  modulosPermitidos?: string[] | null;
  usuario: UsuarioActual | null;
  seccionesPlataforma: NavSectionAnidada[];
  favoritos: string[];
  totalPendientes: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setExpanded(saved === "1");
  }, []);

  function toggleExpanded() {
    setExpanded((prev) => {
      window.localStorage.setItem(STORAGE_KEY, prev ? "0" : "1");
      return !prev;
    });
  }

  return (
    <>
      {/* Riel persistente — escritorio */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card md:flex ${
          expanded ? "w-64" : "w-16"
        } transition-[width] duration-150`}
      >
        <Link href="/" className="flex items-center justify-center border-b border-border px-2 py-3">
          <Image
            src="/brand/ecomfive-rojo.png"
            alt="Ecomfive"
            width={161}
            height={44}
            className={expanded ? "h-5 w-auto" : "h-3 w-auto"}
          />
        </Link>
        <SidebarContents
          expanded={expanded}
          onToggle={toggleExpanded}
          modulosPermitidos={modulosPermitidos}
          seccionesPlataforma={seccionesPlataforma}
          favoritos={favoritos}
          totalPendientes={totalPendientes}
        />
        {usuario && <CuentaFooter usuario={usuario} expanded={expanded} />}
      </aside>

      {/* Botón hamburguesa — móvil */}
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-40 rounded-md bg-card p-2 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground transition-colors md:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay — móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="flex w-72 max-w-[85vw] flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-3">
              <Image
                src="/brand/ecomfive-rojo.png"
                alt="Ecomfive"
                width={161}
                height={44}
                className="h-5 w-auto"
              />
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <SidebarContents
              expanded
              onNavigate={() => setMobileOpen(false)}
              modulosPermitidos={modulosPermitidos}
              seccionesPlataforma={seccionesPlataforma}
              favoritos={favoritos}
              totalPendientes={totalPendientes}
            />
            {usuario && <CuentaFooter usuario={usuario} expanded />}
          </div>
          <button
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className="flex-1 bg-black/30"
          />
        </div>
      )}
    </>
  );
}
