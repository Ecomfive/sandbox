"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

// Lo que comparten las pantallas de los pedidos a inventario: los colores de sus botones y cómo corren una acción.

const BOTON = "inline-flex min-h-9 items-center justify-center rounded-md px-3 text-sm font-semibold whitespace-nowrap disabled:opacity-50";

// Los botones de los pedidos que se confunden entre sí llevan su propio color (23 nov 2026, pedido de Jhokser): descargar = azul, archivar = violeta, deshacer o volver atrás = ámbar.
export const BOTON_PEDIDO = {
  principal: `${BOTON} bg-primario text-white`,
  secundario: `${BOTON} border border-border bg-card text-foreground hover:bg-muted`,
  descarga: `${BOTON} border border-azul/30 bg-azul-soft text-azul hover:brightness-95`,
  archivo: `${BOTON} border border-primario/30 bg-primario-suave text-primario hover:brightness-95`,
  deshacer: `${BOTON} border border-warning/30 bg-warning-soft text-warning hover:brightness-95`,
};

export type Resultado = { ok: true; mensaje?: string } | { error: string };

/** Corre una acción del servidor: muestra su error o su mensaje y refresca la página. */
export function useAccion() {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [ocupado, iniciar] = useTransition();
  const correr = (hacer: () => Promise<Resultado>, alTerminar?: () => void) =>
    iniciar(async () => {
      const r = await hacer().catch(() => ({ error: "No se pudo guardar. Intenta otra vez." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      if (r.mensaje) mostrarToast(r.mensaje);
      alTerminar?.();
      router.refresh();
    });
  return { ocupado, correr };
}
