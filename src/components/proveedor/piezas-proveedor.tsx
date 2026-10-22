"use client";

import type { ReactNode } from "react";
import { CabeceraTarjeta } from "@/components/panel/piezas-panel";
import type { Tone } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import type { TonoCuota } from "@/lib/proveedor/cuotas";
import type { PedidoPortal } from "@/lib/proveedor/datos";
import { TEXTOS, fechaCorta, type Idioma } from "@/lib/proveedor/textos";
import { useIdioma } from "./idioma-contexto";

// Piezas que comparten las dos vistas del portal del proveedor (la de Ecomfive en /portal-proveedor y la de Chin en /proveedor):
// la interfaz del prototipo aprobado, con los tokens del sistema.

export const TONO: Record<TonoCuota, Tone> = { exito: "success", aviso: "warning", peligro: "destructive", info: "azul", neutro: "neutral" };
export const fecha = (d: string | null, idioma: Idioma = "es") => fechaCorta(d, idioma);
export const ent = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-PA", { maximumFractionDigits: 0 }));
export const dinero = (n: number | null, decimales = 0) => (n == null ? "—" : `$${n.toLocaleString("es-PA", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`);
export const VIA = { mar: "Marítimo", aire: "Aéreo" } as const;
export const viaTexto = (p: Pick<PedidoPortal, "via" | "modalidad">, idioma: Idioma = "es") =>
  `${p.via === "aire" ? TEXTOS[idioma].aereo : TEXTOS[idioma].maritimo}${p.modalidad ? ` ${p.modalidad}` : ""}`;

const claseBoton = `inline-flex h-8 items-center justify-center rounded-lg border px-3 text-[13px] font-medium whitespace-nowrap disabled:opacity-50 ${anilloFoco}`;
export const botonPrincipal = `${claseBoton} border-foreground bg-foreground text-background hover:opacity-90`;
export const botonNormal = `${claseBoton} border-border-control bg-card hover:bg-muted`;
export const botonPeligro = `${claseBoton} border-destructive/50 bg-card text-destructive hover:bg-destructive-soft`;

/** Foto de referencia (la de la compra) o la real (la que sube el proveedor). Sin foto, un recuadro con las iniciales o vacío. */
export function Foto({ url, nombre, real = false, grande = false, enBlanco = false }: { url: string | null; nombre: string; real?: boolean; grande?: boolean; enBlanco?: boolean }) {
  const { t } = useIdioma();
  const tamano = grande ? "aspect-square w-full rounded-lg" : "h-10 w-10 shrink-0 rounded-md";
  const etiqueta = grande && <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-px text-[10.5px] font-medium text-white">{real ? t.real : t.referencia}</span>;
  // Un espacio que todavía no lleva foto (la real de una cotización por decidir se agrega después): solo el marco y su etiqueta.
  if (enBlanco)
    return (
      <span role="img" aria-label={`${nombre}: ${t.fotoRealDespues}`} className={`relative block border border-dashed border-border-control bg-card ${tamano}`}>
        {etiqueta}
      </span>
    );
  if (url)
    return (
      <span className={`relative block overflow-hidden border border-border bg-muted ${tamano}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`${real ? t.real : t.referencia}: ${nombre}`} className="h-full w-full object-cover" loading="lazy" />
        {etiqueta}
      </span>
    );
  const iniciales = nombre.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span role="img" aria-label={`${nombre}: ${real ? t.sinFotoReal : t.sinFotoReferencia}`} className={`relative flex items-center justify-center border border-dashed border-border-control bg-muted text-muted-foreground ${grande ? "text-sm" : "text-[11px] font-semibold"} ${tamano}`}>
      {real ? (grande ? t.sinFotoReal : "—") : iniciales}
      {etiqueta}
    </span>
  );
}

/** El producto en una fila: foto de referencia, nombre y su código. */
export function Producto({ p }: { p: PedidoPortal }) {
  const { tr } = useIdioma();
  return (
    <span className="flex min-w-[14rem] items-center gap-2.5">
      <Foto url={p.fotoReferencia} nombre={p.producto} />
      <span className="min-w-0 whitespace-normal">
        <span className="block">{tr(p.producto)}</span>
        {p.referencia && <span className="block text-xs text-muted-foreground tabular-nums">{p.referencia}</span>}
      </span>
    </span>
  );
}

export function Tarjeta({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[10px] border border-border bg-card">
      <CabeceraTarjeta titulo={titulo}>{accion}</CabeceraTarjeta>
      {children}
    </section>
  );
}

export const Vacio = ({ children }: { children: ReactNode }) => <p className="m-0 px-4 py-4 text-sm text-muted-foreground">{children}</p>;

/** La franja de pestañas con su contador (el rosado es lo nuevo). */
export function Pestanas<T extends string>({ etiqueta, tabs, valor, alCambiar }: { etiqueta: string; tabs: { clave: T; titulo: string; cuenta: number; viva?: boolean }[]; valor: T; alCambiar: (t: T) => void }) {
  return (
    <div role="tablist" aria-label={etiqueta} className="flex gap-0.5 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.clave}
          role="tab"
          type="button"
          aria-selected={valor === t.clave}
          onClick={() => alCambiar(t.clave)}
          className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] whitespace-nowrap ${anilloFoco} ${valor === t.clave ? "border-primario font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {t.titulo}
          {t.cuenta > 0 && <span className={`rounded-full px-1.5 text-[11.5px] tabular-nums ${t.viva ? "bg-aviso text-white" : "bg-muted text-muted-foreground"}`}>{t.cuenta}</span>}
        </button>
      ))}
    </div>
  );
}
