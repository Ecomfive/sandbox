"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cambiarEscrituraShopify, cambiarQuitarNotaBot } from "./actions";

/**
 * «Escribir en Shopify» de una tienda (19 nov 2026), solo para un administrador: encender revisa con Shopify que la tienda aprobó write_orders. Con la
 * escritura encendida, también «Quitar la nota del bot» de los pedidos nuevos.
 */
export function EscrituraTienda({ tiendaId, escribe, quitaNotaBot }: { tiendaId: string; escribe: boolean; quitaNotaBot: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();
  function hacer(accion: () => Promise<{ error?: string; resumen?: string }>) {
    start(async () => {
      const r = await accion();
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(r.resumen ?? "Listo.");
        router.refresh();
      }
    });
  }
  const boton = `rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${anilloFoco}`;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={pendiente}
        aria-busy={pendiente}
        onClick={() => hacer(() => cambiarEscrituraShopify(tiendaId, !escribe))}
        className={`${boton} ${escribe ? "border-border bg-card hover:bg-muted" : "border-primario bg-primario text-white"}`}
      >
        {pendiente ? "Revisando…" : escribe ? "Volver a solo lectura" : "Encender escritura"}
      </button>
      {escribe && (
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={quitaNotaBot} disabled={pendiente} onChange={(e) => hacer(() => cambiarQuitarNotaBot(tiendaId, e.target.checked))} />
          Quitar la nota del bot
        </label>
      )}
    </div>
  );
}
