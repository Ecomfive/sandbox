"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { TEXTOS, errorEn, fechaCorta, textoCuota, textoTransito, type Idioma } from "@/lib/proveedor/textos";
import type { EstadoCuota } from "@/lib/proveedor/cuotas";
import type { EstadoTransito } from "@/lib/proveedor/transito";

// El idioma de las pantallas del portal del proveedor: Chin las ve en chino y Ecomfive en español. Sin proveedor de contexto, español.
// `traducciones` trae lo escrito por personas ya traducido al idioma de la pantalla (texto original → traducción, de traducir.ts).

interface Contexto {
  idioma: Idioma;
  traducciones: Record<string, string>;
}

const IdiomaCtx = createContext<Contexto>({ idioma: "es", traducciones: {} });

export function IdiomaProveedor({ idioma, traducciones, children }: { idioma: Idioma; traducciones: Record<string, string>; children: ReactNode }) {
  return <IdiomaCtx.Provider value={{ idioma, traducciones }}>{children}</IdiomaCtx.Provider>;
}

export function useIdioma() {
  const { idioma, traducciones } = useContext(IdiomaCtx);
  return {
    idioma,
    t: TEXTOS[idioma],
    /** Lo escrito por una persona en el idioma de la pantalla (si ya está traducido; si no, el original). */
    tr: (texto: string | null | undefined) => (texto ? (traducciones[texto.trim()] ?? texto) : ""),
    /** La traducción, si la hay y es distinta del original. */
    traduccion: (texto: string | null | undefined) => {
      const tr = texto ? traducciones[texto.trim()] : undefined;
      return tr && tr !== texto ? tr : null;
    },
    fecha: (d: string | null) => fechaCorta(d, idioma),
    cuota: (e: Pick<EstadoCuota, "clave" | "n">) => textoCuota(e, idioma),
    transito: (e: Pick<EstadoTransito, "clave" | "n">) => textoTransito(e, idioma),
    error: (mensaje: string) => errorEn(mensaje, idioma),
    /** Números en el formato del idioma («1,000» en los dos). */
    numero: (n: number | null, decimales = 0) => (n == null ? "—" : n.toLocaleString(idioma === "zh" ? "zh-CN" : "es-PA", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })),
  };
}

/** Un texto escrito por una persona: la traducción y, a un clic, el original. */
export function Traducido({ texto, className = "" }: { texto: string | null | undefined; className?: string }) {
  const { traduccion, t } = useIdioma();
  const [original, setOriginal] = useState(false);
  if (!texto) return null;
  const tr = traduccion(texto);
  if (!tr) return <span className={className}>{texto}</span>;
  return (
    <span className={className}>
      {original ? texto : tr}{" "}
      <button type="button" onClick={() => setOriginal((v) => !v)} className={`rounded text-[11px] text-muted-foreground underline-offset-2 hover:underline ${anilloFoco}`} aria-pressed={original}>
        {original ? `(${t.original.toLowerCase()} · ←)` : `(${t.verOriginal})`}
      </button>
    </span>
  );
}
