"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { DescargarIcon } from "@/lib/nav-icons";
import { filasACsv, nombreArchivoCsv } from "@/lib/tabla/csv";
import type { DefTabla } from "@/lib/tabla/motor";

/** Piezas visuales del CRM (diseño de la maqueta): insignias redondas, puntos de estado, botones de la barra y tarjetas. */

type TonoPastilla = "neutro" | "exito" | "aviso" | "peligro" | "oscuro";

const TONOS_PASTILLA: Record<TonoPastilla, string> = {
  neutro: "border border-border bg-muted text-foreground",
  exito: "bg-success-soft text-success",
  aviso: "bg-warning-soft text-warning",
  peligro: "bg-destructive-soft text-destructive",
  oscuro: "bg-foreground text-background",
};

/** Insignia redonda de estado, nivel o prioridad. */
export function Pastilla({ tono = "neutro", children }: { tono?: TonoPastilla; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-px text-xs font-medium whitespace-nowrap ${TONOS_PASTILLA[tono]}`}>
      {children}
    </span>
  );
}

/** Punto de color junto a un título o a una fila: la alerta es el punto, no la caja. */
export function Punto({ tono = "aviso", className = "" }: { tono?: "aviso" | "peligro" | "exito" | "gris"; className?: string }) {
  const color = { aviso: "bg-warning", peligro: "bg-destructive", exito: "bg-success", gris: "bg-border-control" }[tono];
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${color} ${className}`} />;
}

/** Etiqueta pequeña con borde (las etiquetas del dropshipper). */
export function Etiqueta({ children }: { children: ReactNode }) {
  return <span className="mr-1 rounded border border-border px-1.5 py-px text-[11px] whitespace-nowrap text-muted-foreground">{children}</span>;
}

/** Botón de la barra de herramientas; con `activo` (aria-pressed) queda marcado. */
export function BotonBarra({
  activo,
  principal = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { activo?: boolean; principal?: boolean }) {
  const aspecto = principal
    ? "border-foreground bg-foreground font-medium text-background hover:opacity-90"
    : activo
      ? "border-accent bg-accent text-foreground"
      : "border-border bg-card text-foreground hover:bg-muted";
  return (
    <button
      type="button"
      aria-pressed={activo}
      className={`inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3 text-[13px] ${aspecto} ${anilloFoco} ${className}`}
      {...props}
    />
  );
}

/** Franja de título de una tarjeta (MAYÚSCULAS pequeñas) con algo a la derecha. */
export function CabeceraTarjeta({ id, titulo, children }: { id?: string; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-2 rounded-t-[10px] border-b border-border bg-muted px-3.5 py-1.5">
      <h2 id={id} className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
        {titulo}
      </h2>
      {children}
    </div>
  );
}

/** Dos o tres opciones excluyentes, en una cápsula (Ventas | Pedidos). */
export function Segmentado<T extends string>({
  etiqueta,
  opciones,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  alCambiar: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex gap-0.5 rounded-[7px] border border-border bg-card p-0.5">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => alCambiar(o.valor)}
          className={`rounded-[5px] px-2 py-0.5 text-xs ${anilloFoco} ${valor === o.valor ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

/** Envoltura de una tabla: borde, esquinas y desplazamiento lateral si no cabe. */
export function MarcoTabla({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={ariaLabel} tabIndex={0} className={`overflow-x-auto rounded-[10px] border border-border bg-card ${anilloFoco}`}>
      {children}
    </div>
  );
}

export const claseTh =
  "border-r border-b border-border bg-muted px-3 py-2.5 text-left text-[11px] font-semibold tracking-[0.05em] whitespace-nowrap text-muted-foreground uppercase last:border-r-0";
export const claseTd = "border-r border-b border-border px-3 py-2.5 text-[13px] whitespace-nowrap last:border-r-0";
/** Las mismas celdas con aspecto de lista (como ClickUp): sin rayas entre columnas, encabezado sin fondo ni mayúsculas
 * y apenas una línea suave entre filas. */
export const claseThLista = "border-b border-border px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";
export const claseTdLista = "border-b border-border/45 px-3 py-2.5 text-[13px] whitespace-nowrap";

/** Botón «Descargar»: baja como CSV lo que se ve (con los filtros), con la definición de la tabla. */
export function BotonDescargar<F>({ def, filas }: { def: DefTabla<F>; filas: F[] }) {
  function descargar() {
    const blob = new Blob(["﻿" + filasACsv(def, filas)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoCsv(def.clave, new Date());
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <BotonBarra onClick={descargar} disabled={filas.length === 0} className="disabled:opacity-40">
      <DescargarIcon className="h-4 w-4" />
      Descargar
    </BotonBarra>
  );
}

/** Dos columnas: lo principal y la ficha fija a la derecha (en pantallas anchas); en angostas, la ficha va debajo. */
export const claseConFicha = "grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_420px]";
/** Lo mismo con la ficha minimizada: queda una franja angosta a la derecha para volver a abrirla. */
export const claseFichaMinimizada = "grid grid-cols-1 items-start gap-3 min-[1100px]:grid-cols-[minmax(0,1fr)_36px]";

/** «+12,4 %»; sin dato anterior no se dibuja nada. `inverso`: bajar es mejorar (costos, tiempos). */
export function Delta({ valor, sufijo, prefijo = "", inverso = false, decimales = 1 }: { valor: number | null; sufijo: string; prefijo?: string; inverso?: boolean; decimales?: number }) {
  if (valor === null) return null;
  const mejora = inverso ? valor < 0 : valor > 0;
  const texto = `${valor > 0 ? "+" : valor < 0 ? "−" : ""}${prefijo}${Math.abs(valor).toLocaleString("es-CR", { maximumFractionDigits: decimales })}${sufijo}`;
  return <b className={`font-medium ${mejora ? "text-success" : valor === 0 ? "" : "text-destructive"}`}>{texto}</b>;
}

/** Una celda de la barra de indicadores; con `href` es un enlace a la página que lista lo que cuenta. */
export function Indicador({
  titulo,
  punto,
  valor,
  detalle,
  href,
}: {
  titulo: string;
  punto?: "aviso" | "peligro" | "exito";
  valor: string;
  detalle: ReactNode;
  href?: string;
}) {
  const contenido = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {punto && <Punto tono={punto} />}
        {titulo}
      </span>
      <span className="mt-0.5 block text-[22px] leading-tight font-semibold tracking-tight tabular-nums">{valor}</span>
      <span className="block text-xs text-muted-foreground">{detalle}</span>
    </>
  );
  const clase = "-mr-px -mb-px block min-w-0 flex-[1_1_10.5rem] border-r border-b border-border px-3.5 py-3 text-left";
  return href ? (
    <Link href={href} className={`${clase} hover:bg-muted ${anilloFoco}`}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}
