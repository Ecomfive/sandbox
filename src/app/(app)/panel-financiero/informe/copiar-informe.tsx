"use client";

import { useState } from "react";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { anilloFoco } from "@/components/ui/field";
import { CheckIcon, CopiarIcon } from "@/lib/nav-icons";

/** «Copiar informe»: el informe en texto, para pegarlo en un correo o en WhatsApp. Imprimir lo pone la barra AF4. */
export function CopiarInforme({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`${claseAccionAF4} ${anilloFoco}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            setCopiado(false);
          }
        }}
      >
        {copiado ? <CheckIcon className="h-4 w-4 text-success" aria-hidden="true" /> : <CopiarIcon className="h-4 w-4" aria-hidden="true" />}
        {copiado ? "Copiado" : "Copiar informe"}
      </button>
      <span aria-live="polite" className="sr-only">
        {copiado ? "Informe copiado" : ""}
      </span>
    </>
  );
}
