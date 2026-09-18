"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS, moduloDeHref, type NavSectionAnidada } from "@/lib/nav-data";
import { DashboardIcon, ChevronRightIcon, SECTION_ICONS } from "@/lib/nav-icons";
import { ConTooltip } from "@/components/sidebar-tooltip";
import { AvatarUpload } from "@/components/avatar-upload";
import { cerrarSesion } from "@/app/login/actions";
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

function LogoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function puedeVer(modulosPermitidos: string[] | null | undefined, href?: string) {
  if (!href) return true;
  if (!modulosPermitidos) return true;
  return modulosPermitidos.includes(moduloDeHref(href));
}

function SidebarContents({
  expanded,
  onToggle,
  onNavigate,
  modulosPermitidos,
  seccionesPlataforma,
}: {
  expanded: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  modulosPermitidos?: string[] | null;
  seccionesPlataforma: NavSectionAnidada[];
}) {
  const pathname = usePathname();
  const [seccionAbierta, setSeccionAbierta] = useState<string | null>(null);
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);
  const primeraSeccion = seccionesPlataforma[0]?.title ?? NAV_SECTIONS[0]?.title ?? null;

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
      {onToggle && (
        <ConTooltip etiqueta={expanded ? "Colapsar menú" : "Desplegar el menú"} mostrar={!expanded}>
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ToggleIcon className="h-5 w-5 shrink-0" />
            {expanded && <span className="text-sm font-medium">Colapsar menú</span>}
          </button>
        </ConTooltip>
      )}

      {expanded && (
        <p className="mt-1 mb-2 px-3 text-sm font-medium text-foreground">
          Sistema Gestión de Plataformas
        </p>
      )}

      {puedeVer(modulosPermitidos, "/") && (
        <ConTooltip etiqueta="Dashboard" mostrar={!expanded}>
          <Link
            href="/"
            onClick={onNavigate}
            className={
              pathname === "/"
                ? "flex w-full items-center gap-3 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
                : "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            }
          >
            <DashboardIcon className="h-5 w-5 shrink-0" />
            {expanded && <span>Dashboard</span>}
          </Link>
        </ConTooltip>
      )}

      {expanded && (
        <p className="mt-4 mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Áreas de la empresa
        </p>
      )}

      {seccionesPlataforma.map((section) => {
        const SectionIcon = SECTION_ICONS[section.title] ?? DashboardIcon;
        const isOpen = expanded && (seccionAbierta ?? primeraSeccion) === section.title;

        return (
          <div key={section.title} className={expanded ? "" : "py-0.5"}>
            <ConTooltip etiqueta={section.title} mostrar={!expanded}>
              <button
                type="button"
                onClick={() =>
                  setSeccionAbierta((prev) => (prev === section.title ? null : section.title))
                }
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
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
                        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                      >
                        <span>{grupo.label}</span>
                        <ChevronRightIcon
                          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${grupoOpen ? "rotate-90" : ""}`}
                        />
                      </button>
                      {grupoOpen && (
                        <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-4">
                          {itemsVisibles.map((item) => {
                            const active = pathname === item.href;
                            return (
                              <Link
                                key={item.label}
                                href={item.href!}
                                onClick={onNavigate}
                                className={
                                  active
                                    ? "rounded-md bg-accent px-3 py-1.5 text-sm text-accent-foreground"
                                    : "rounded-md px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                                }
                              >
                                {item.label}
                              </Link>
                            );
                          })}
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
        const isOpen = expanded && (seccionAbierta ?? primeraSeccion) === section.title;

        return (
          <div key={section.title} className={expanded ? "" : "py-0.5"}>
            <ConTooltip etiqueta={section.title} mostrar={!expanded}>
              <button
                type="button"
                onClick={() =>
                  setSeccionAbierta((prev) => (prev === section.title ? null : section.title))
                }
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
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
                {itemsVisibles.map((item) => {
                  if (item.pronto || !item.href) {
                    return (
                      <span
                        key={item.label}
                        className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm text-muted-foreground/60"
                      >
                        {item.label}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Pronto
                        </span>
                      </span>
                    );
                  }
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onNavigate}
                      className={
                        active
                          ? "rounded-md bg-accent px-3 py-1.5 text-sm text-accent-foreground"
                          : "rounded-md px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                      }
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function UsuarioFooter({ usuario, expanded }: { usuario: UsuarioActual; expanded: boolean }) {
  return (
    <div
      className={`flex border-t border-border py-3 ${expanded ? "flex-col gap-2 px-3" : "flex-col items-center gap-3"}`}
    >
      <div className={expanded ? "flex items-center gap-2" : ""}>
        <ConTooltip
          etiqueta={`${usuario.nombre ?? usuario.email}${usuario.rolNombre ? ` · ${usuario.rolNombre}` : ""}`}
          mostrar={!expanded}
        >
          <AvatarUpload nombre={usuario.nombre} email={usuario.email} avatarUrl={usuario.avatarUrl} />
        </ConTooltip>
        {expanded && (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{usuario.nombre ?? usuario.email}</p>
            {usuario.rolNombre && <p className="truncate text-xs text-muted-foreground">{usuario.rolNombre}</p>}
          </div>
        )}
      </div>
      <ConTooltip etiqueta="Cerrar sesión" mostrar={!expanded}>
        <form action={cerrarSesion} className="w-full">
          <button
            type="submit"
            className={
              expanded
                ? "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                : "flex w-full items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            }
          >
            <LogoutIcon className="h-5 w-5 shrink-0" />
            {expanded && <span>Cerrar sesión</span>}
          </button>
        </form>
      </ConTooltip>
    </div>
  );
}

export function Sidebar({
  modulosPermitidos,
  usuario,
  seccionesPlataforma,
}: {
  modulosPermitidos?: string[] | null;
  usuario: UsuarioActual | null;
  seccionesPlataforma: NavSectionAnidada[];
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
        />
        {usuario && <UsuarioFooter usuario={usuario} expanded={expanded} />}
      </aside>

      {/* Botón hamburguesa — móvil */}
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-40 rounded-md bg-card p-2 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground md:hidden"
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
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
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
            />
            {usuario && <UsuarioFooter usuario={usuario} expanded />}
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
