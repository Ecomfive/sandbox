"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { anilloFoco } from "@/components/ui/field";
import { MasIcon } from "@/lib/nav-icons";
import type { AccionCrear } from "@/lib/crear-global";

/**
 * Botón «Crear» de la barra de arriba (estilo «+ Crear» de ClickUp): las cosas que se crean a menudo, desde
 * cualquier página. Cada opción lleva a donde se crea; las que abren un formulario llegan con `?nuevo=1` y la
 * página lo abre sola. Es un menú de botón (flechas, Inicio, Fin, Escape y clic fuera).
 */
export function MenuCrear({ acciones }: { acciones: AccionCrear[] }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!abierto) return;
    function alHacerClicFuera(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, [abierto]);

  // Al abrir, el foco pasa a la primera opción.
  useEffect(() => {
    if (abierto) raiz.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [abierto]);

  if (acciones.length === 0) return null;

  function cerrar(devolverFoco: boolean) {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  function alTeclearEnMenu(e: React.KeyboardEvent) {
    const opciones = [...(raiz.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const actual = opciones.indexOf(document.activeElement as HTMLElement);
    const ir = (i: number) => {
      e.preventDefault();
      opciones[(i + opciones.length) % opciones.length]?.focus();
    };
    if (e.key === "ArrowDown") ir(actual + 1);
    else if (e.key === "ArrowUp") ir(actual - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(opciones.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      cerrar(true);
    } else if (e.key === "Tab") cerrar(false);
  }

  return (
    <div ref={raiz} className="relative shrink-0">
      <button
        ref={boton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !abierto) {
            e.preventDefault();
            setAbierto(true);
          }
        }}
        className={`inline-flex min-h-8 items-center gap-1 rounded-full bg-foreground px-3 py-1 text-sm font-medium text-background hover:opacity-90 ${anilloFoco}`}
      >
        <MasIcon className="h-4 w-4" />
        Crear
      </button>
      {abierto && (
        <div
          id={idMenu}
          role="menu"
          aria-label="Crear"
          onKeyDown={alTeclearEnMenu}
          className="absolute top-full right-0 z-40 mt-1 w-72 rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {acciones.map((a) => (
            <Link
              key={a.id}
              role="menuitem"
              href={a.href}
              onClick={() => cerrar(false)}
              className={`flex flex-col gap-0.5 rounded-md px-3 py-2 text-sm hover:bg-muted focus:bg-muted ${anilloFoco}`}
            >
              <span className="font-medium">{a.etiqueta}</span>
              <span className="text-xs text-muted-foreground">{a.detalle}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
