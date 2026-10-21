"use client";

import type { ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";

/** Copia un texto al portapapeles; si el navegador no deja usar la API moderna, cae al método antiguo. */
async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const campo = document.createElement("textarea");
      campo.value = texto;
      campo.setAttribute("readonly", "");
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      const ok = document.execCommand("copy");
      campo.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * El SKU de un producto: al pulsarlo se copia solo al portapapeles y sale un aviso. Sirve en la lista (el clic no abre la ficha de
 * la fila) y dentro de la ficha. No va dentro de otro botón o enlace: un botón no puede ir dentro de otro.
 */
export function SkuCopiable({ codigo, className = "", children }: { codigo: string; className?: string; children?: ReactNode }) {
  const { mostrarToast } = useToast();
  async function alPulsar(e: React.MouseEvent) {
    e.stopPropagation();
    if (await copiar(codigo)) mostrarToast(`SKU copiado: ${codigo}`);
    else mostrarToast("No se pudo copiar el SKU.", "destructive");
  }
  return (
    <Tooltip texto="Copiar SKU">
      <button
        type="button"
        onClick={alPulsar}
        aria-label={`Copiar el SKU ${codigo}`}
        className={`inline-flex max-w-full cursor-copy items-center rounded text-left underline-offset-4 hover:underline hover:decoration-dotted ${anilloFoco} ${className}`}
      >
        {children ?? <span className="truncate">{codigo}</span>}
      </button>
    </Tooltip>
  );
}
