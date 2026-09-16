"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "@/lib/nav-data";

export function NavDrawer() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pathname = usePathname();

  function toggleSection(title: string) {
    setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => setOpen(true)}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-80 max-w-[85vw] overflow-y-auto bg-card p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <Link href="/" onClick={() => setOpen(false)} className="text-sm font-semibold">
                Gestión de Proveeduría
              </Link>
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <Link
              href="/"
              onClick={() => setOpen(false)}
              className={
                pathname === "/"
                  ? "block rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
                  : "block rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              }
            >
              Dashboard
            </Link>

            <p className="mt-6 mb-2 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Áreas de la empresa
            </p>

            <div className="flex flex-col gap-1">
              {NAV_SECTIONS.map((section) => {
                const isOpen = expanded[section.title] ?? true;
                return (
                  <div key={section.title}>
                    <button
                      type="button"
                      onClick={() => toggleSection(section.title)}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      {section.title}
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-3">
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
                              onClick={() => setOpen(false)}
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
          </div>
          <button
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/30"
          />
        </div>
      )}
    </>
  );
}
