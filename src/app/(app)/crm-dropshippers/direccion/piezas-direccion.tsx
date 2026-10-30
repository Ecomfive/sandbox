"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";

/**
 * Piezas visuales del panel de Dirección, con el diseño del prototipo que aprobó Hernán (30 oct 2026,
 * https://claude.ai/artifact/EgMSyATkMEUXzk9LsX8Wkj): cifras grandes, tarjetas con título, chips de filtro y pestañas tipo píldora. Usan los
 * colores del sistema (claro y oscuro).
 */

export type TonoDireccion = "exito" | "aviso" | "peligro" | "info" | "neutro";

export const TEXTO_TONO: Record<TonoDireccion, string> = {
  exito: "text-success",
  aviso: "text-warning",
  peligro: "text-destructive",
  info: "text-primario",
  neutro: "text-muted-foreground",
};
export const FONDO_TONO: Record<TonoDireccion, string> = {
  exito: "bg-success",
  aviso: "bg-warning",
  peligro: "bg-destructive",
  info: "bg-primario",
  neutro: "bg-border-control",
};
export const SUAVE_TONO: Record<TonoDireccion, string> = {
  exito: "bg-success-soft text-success",
  aviso: "bg-warning-soft text-warning",
  peligro: "bg-destructive-soft text-destructive",
  info: "bg-accent text-primario",
  neutro: "bg-muted text-muted-foreground",
};

/** El encabezado del panel: título, de qué país son los datos y las pestañas (enlaces) tipo píldora. */
export function EncabezadoDireccion({ subtitulo, vistas, activa }: { subtitulo: string; vistas: { valor: string; etiqueta: string; href: string }[]; activa: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-foreground">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-background">
            <path d="M3 12h4l3 8 4-16 3 8h4" />
          </svg>
        </span>
        <div>
          <h1 className="m-0 text-xl font-bold tracking-tight">Panel de Dirección</h1>
          <p className="m-0 text-[13px] text-muted-foreground">{subtitulo}</p>
        </div>
      </div>
      <nav aria-label="Vistas de Dirección" className="flex flex-wrap gap-1.5">
        {vistas.map((v) => (
          <Link
            key={v.valor}
            href={v.href}
            aria-current={activa === v.valor ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-lg px-3.5 text-sm font-semibold ${
              activa === v.valor ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            } ${anilloFoco}`}
          >
            {v.etiqueta}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/** Una cifra grande con su nota de color. Con `alPulsar` es un botón que filtra (aria-pressed). */
export function Cifra({ titulo, valor, nota, tono = "neutro", activa, alPulsar }: { titulo: string; valor: ReactNode; nota?: ReactNode; tono?: TonoDireccion; activa?: boolean; alPulsar?: () => void }) {
  const contenido = (
    <>
      <span className="text-[13px] font-medium text-muted-foreground">{titulo}</span>
      <span className="text-[28px] leading-none font-bold tracking-tight tabular-nums">{valor}</span>
      {nota && <span className={`text-[13px] font-semibold ${TEXTO_TONO[tono]}`}>{nota}</span>}
    </>
  );
  const clase = `flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-left ${activa ? "border-foreground ring-1 ring-foreground" : "border-border"}`;
  return alPulsar ? (
    <button type="button" aria-pressed={!!activa} onClick={alPulsar} className={`${clase} hover:border-foreground/40 ${anilloFoco}`}>
      {contenido}
    </button>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

/** La fila de cifras: se reparten el ancho y bajan de línea en pantallas angostas. */
export function Cifras({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">{children}</div>;
}

/** Una tarjeta con título (y algo a la derecha, p. ej. «89 pendientes»). */
export function Tarjeta({ id, titulo, extra, children, className = "" }: { id: string; titulo: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="m-0 text-lg font-semibold">
          {titulo}
        </h2>
        {extra && <span className="text-[13px] text-muted-foreground">{extra}</span>}
      </div>
      {children}
    </section>
  );
}

/** Un chip de filtro redondo; marcado (aria-pressed) va relleno. */
export function Chip({ activo, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { activo: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${
        activo ? "border-primario bg-primario text-white" : "border-border bg-card text-foreground hover:bg-muted"
      } ${anilloFoco} ${className}`}
      {...props}
    />
  );
}

/** Un chip que es un enlace (los periodos, que van en la dirección). */
export function ChipEnlace({ href, activo, children }: { href: string; activo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${
        activo ? "border-primario bg-primario text-white" : "border-border bg-card text-foreground hover:bg-muted"
      } ${anilloFoco}`}
    >
      {children}
    </Link>
  );
}

/** Botón del panel: `principal` va relleno con el color de acento. */
export function Boton({ principal = false, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { principal?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center rounded-lg px-3.5 text-sm font-semibold disabled:opacity-50 ${
        principal ? "bg-primario text-white hover:opacity-90" : "border border-border bg-card text-foreground hover:bg-muted"
      } ${anilloFoco} ${className}`}
      {...props}
    />
  );
}

/** Insignia redonda con fondo suave del tono. */
export function Insignia({ tono, children }: { tono: TonoDireccion; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${SUAVE_TONO[tono]}`}>{children}</span>;
}

/** Una barra horizontal de 0 a 100 con el color del tono. */
export function Barra({ valor, tono, alto = "h-1.5" }: { valor: number; tono: TonoDireccion; alto?: string }) {
  return (
    <span aria-hidden="true" className={`block ${alto} w-full overflow-hidden rounded-full bg-muted`}>
      <span className={`block h-full rounded-full ${FONDO_TONO[tono]}`} style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} />
    </span>
  );
}

/** El tono de un puntaje de 0 a 100: verde desde 70, ámbar desde 40, rojo abajo. */
export const tonoPuntaje = (v: number | null): TonoDireccion => (v === null ? "neutro" : v >= 70 ? "exito" : v >= 40 ? "aviso" : "peligro");
