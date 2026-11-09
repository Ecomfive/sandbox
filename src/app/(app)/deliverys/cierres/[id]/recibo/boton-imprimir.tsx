"use client";

import { ImprimirIcon } from "@/components/af4/iconos-af4";
import { anilloFoco } from "@/components/ui/field";

/** La acción principal del recibo: imprimirlo (o guardarlo en PDF) para firmarlo. Solo sale el recibo. */
export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-background transition-colors hover:bg-foreground/85 ${anilloFoco}`}
    >
      <ImprimirIcon className="h-4 w-4" />
      Imprimir recibo
    </button>
  );
}
