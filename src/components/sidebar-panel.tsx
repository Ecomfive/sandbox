"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ContadorMenu } from "@/components/sidebar-contador";
import type { ContadoresMenu } from "@/lib/contadores-menu";
import type { NavItem } from "@/lib/nav-data";

export interface GrupoPanel {
  /** Nombre del grupo (la plataforma); `null` en las secciones que no tienen grupos. */
  label: string | null;
  /** Solo las páginas que la persona puede ver. */
  items: NavItem[];
  /** Sin datos todavía: se muestra el nombre con «Pronto». */
  pronto: boolean;
}

const SEPARACION = 8;

/**
 * Panel de una sección del menú cuando el riel está colapsado: sale a la derecha del ícono con las páginas de esa
 * sección, para poder ir a ellas sin desplegar el menú. Va por portal a <body> (el riel recorta lo que sobresale).
 * Se cierra con Escape (el foco vuelve al ícono), al pulsar fuera, al salir el foco con Tab o al elegir una página;
 * al abrirse, el foco pasa a la primera página. El ícono que lo abre lleva `data-panel-abridor` para que pulsarlo
 * de nuevo lo cierre en vez de cerrarlo y abrirlo otra vez.
 */
export function PanelSeccion({
  titulo,
  grupos,
  contadores,
  pathname,
  ancla,
  abridor,
  alCerrar,
  alNavegar,
}: {
  titulo: string;
  grupos: GrupoPanel[];
  contadores: ContadoresMenu;
  pathname: string;
  /** Caja del ícono que lo abrió (a su derecha se coloca el panel). */
  ancla: DOMRect;
  /** El ícono, para devolverle el foco al cerrar con Escape. */
  abridor: HTMLElement | null;
  alCerrar: () => void;
  /** Se llama al elegir una página (p. ej. cerrar el menú de un teléfono). */
  alNavegar?: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Se coloca antes de pintar: a la derecha del ícono y sin salirse de la pantalla por abajo.
  useLayoutEffect(() => {
    const caja = panel.current;
    if (!caja) return;
    const alto = caja.offsetHeight;
    const arriba = Math.max(SEPARACION, Math.min(ancla.top, window.innerHeight - alto - SEPARACION));
    caja.style.top = `${arriba}px`;
    caja.style.left = `${ancla.right + SEPARACION}px`;
    caja.style.visibility = "visible";
  }, [ancla]);

  // Al abrirse, el foco pasa a la primera página (o al panel si no hay ninguna).
  useEffect(() => {
    const primero = panel.current?.querySelector<HTMLElement>("a[href]");
    (primero ?? panel.current)?.focus();
  }, []);

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      alCerrar();
      abridor?.focus();
    }
    function alPulsar(e: PointerEvent) {
      const objetivo = e.target as Element | null;
      if (!objetivo) return;
      if (panel.current?.contains(objetivo) || objetivo.closest("[data-panel-abridor]")) return;
      alCerrar();
    }
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("pointerdown", alPulsar);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("pointerdown", alPulsar);
    };
  }, [alCerrar, abridor]);

  return createPortal(
    <div
      ref={panel}
      tabIndex={-1}
      onKeyDown={(e) => {
        // El panel está al final del documento, pero en el orden de teclado debe seguir al ícono: al pasar la
        // última página (o volver atrás desde la primera) se cierra y el foco continúa desde el ícono.
        if (e.key !== "Tab" || !panel.current) return;
        const enlaces = panel.current.querySelectorAll<HTMLElement>("a[href]");
        const activo = document.activeElement;
        const primero = enlaces[0] ?? panel.current;
        const ultimo = enlaces[enlaces.length - 1] ?? panel.current;
        if (e.shiftKey && (activo === primero || activo === panel.current)) {
          e.preventDefault();
          alCerrar();
          abridor?.focus();
        } else if (!e.shiftKey && activo === ultimo) {
          alCerrar();
          abridor?.focus();
        }
      }}
      onBlur={(e) => {
        // El foco salió del panel (Tab hacia fuera): se cierra, salvo que vaya al ícono que lo abre.
        const destino = e.relatedTarget as Element | null;
        if (destino && (panel.current?.contains(destino) || destino.closest("[data-panel-abridor]"))) return;
        alCerrar();
      }}
      style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
      className="animate-fade-in z-50 max-h-[calc(100vh-1rem)] w-64 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-lg focus:outline-none"
    >
      <nav aria-label={titulo}>
        <p className="px-3 pt-1 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{titulo}</p>
        <div className="flex flex-col gap-2">
          {grupos.map((grupo) => (
            <div key={grupo.label ?? "sin-grupo"} className="flex flex-col gap-0.5">
              {grupo.label &&
                (grupo.pronto || grupo.items.length === 0 ? (
                  <span className="flex items-center justify-between px-3 py-1.5 text-[13px] text-muted-foreground/60">
                    {grupo.label}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Pronto</span>
                  </span>
                ) : (
                  <p className="px-3 pt-1 text-xs font-semibold text-foreground">{grupo.label}</p>
                ))}
              {grupo.items.map((item) =>
                item.href && !item.pronto ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={pathname === item.href ? "page" : undefined}
                    onClick={() => {
                      alNavegar?.();
                      alCerrar();
                    }}
                    className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none ${
                      pathname === item.href
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {item.label}
                    <ContadorMenu cantidad={contadores[item.href] ?? 0} />
                  </Link>
                ) : (
                  <span
                    key={item.label}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-[13px] text-muted-foreground/60"
                  >
                    {item.label}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Pronto</span>
                  </span>
                )
              )}
            </div>
          ))}
        </div>
      </nav>
    </div>,
    document.body
  );
}
