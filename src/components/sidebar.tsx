"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "@/lib/nav-data";
import { DashboardIcon, ChevronRightIcon, SECTION_ICONS } from "@/lib/nav-icons";

const STORAGE_KEY = "sidebar_expandido";

function SidebarContents({
  expanded,
  onNavigate,
}: {
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [seccionAbierta, setSeccionAbierta] = useState<string | null>(null);

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
      <Link
        href="/"
        onClick={onNavigate}
        title="Dashboard"
        className={
          pathname === "/"
            ? "flex items-center gap-3 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
            : "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        }
      >
        <DashboardIcon className="h-5 w-5 shrink-0" />
        {expanded && <span>Dashboard</span>}
      </Link>

      {expanded && (
        <p className="mt-4 mb-1 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Áreas de la empresa
        </p>
      )}

      {NAV_SECTIONS.map((section) => {
        const SectionIcon = SECTION_ICONS[section.title] ?? DashboardIcon;
        const isOpen = expanded && (seccionAbierta ?? NAV_SECTIONS[0].title) === section.title;

        return (
          <div key={section.title} className={expanded ? "" : "py-0.5"}>
            <button
              type="button"
              title={section.title}
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
            {expanded && isOpen && (
              <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-6">
                {section.items.map((item) => {
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

export function Sidebar() {
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
        className={`hidden shrink-0 flex-col border-r border-border bg-card md:flex ${
          expanded ? "w-64" : "w-16"
        } transition-[width] duration-150`}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <button
            type="button"
            onClick={toggleExpanded}
            title={expanded ? "Colapsar menú" : "Desplegar el menú"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
              <path d="M9.5 4.5v15" />
            </svg>
          </button>
          {expanded && (
            <Image
              src="/brand/ecomfive-rojo.png"
              alt="Ecomfive"
              width={161}
              height={44}
              className="h-5 w-auto"
            />
          )}
        </div>
        <SidebarContents expanded={expanded} />
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
            <SidebarContents expanded onNavigate={() => setMobileOpen(false)} />
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
