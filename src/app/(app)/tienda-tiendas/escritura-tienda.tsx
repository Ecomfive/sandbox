"use client";

import type { ResumenNotasBot } from "@/lib/tienda/notas-bot-resumen";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cambiarEscrituraShopify, cambiarIaPoneEtiqueta, cambiarPoneEnEspera, cambiarQuitarNotaBot } from "./actions";

/**
 * «Escribir en Shopify» de una tienda (19 nov 2026), solo para un administrador: encender revisa con Shopify que la tienda aprobó write_orders. Con la
 * escritura encendida, también «Quitar la nota del bot» de los pedidos nuevos y «Pedidos nuevos en espera» (26 nov 2026, manual ATC).
 */
export function EscrituraTienda({
  tiendaId,
  escribe,
  quitaNotaBot,
  notasBot,
  iaPoneEtiqueta,
  etiquetasIa,
  poneEnEspera,
}: {
  tiendaId: string;
  escribe: boolean;
  quitaNotaBot: boolean;
  notasBot: ResumenNotasBot | null;
  iaPoneEtiqueta: boolean;
  etiquetasIa: { hoy: number; conError: number } | null;
  poneEnEspera: boolean;
}) {
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
      {escribe && (
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={iaPoneEtiqueta} disabled={pendiente} onChange={(e) => hacer(() => cambiarIaPoneEtiqueta(tiendaId, e.target.checked))} />
          La IA pone la etiqueta de zona
        </label>
      )}
      {escribe && (
        <label className="flex items-center gap-1.5 text-xs" title="Cada pedido nuevo entra «En espera» y con «por confirmar datos»: despacho no lo prepara hasta que una asesora lo confirma desde la ficha.">
          <input
            type="checkbox"
            checked={poneEnEspera}
            disabled={pendiente}
            onChange={(e) => {
              if (e.target.checked && !window.confirm("Desde ahora cada pedido nuevo entra «En espera»: despacho no lo prepara hasta que una asesora lo confirme desde el sistema. ¿Encender?")) return;
              hacer(() => cambiarPoneEnEspera(tiendaId, e.target.checked));
            }}
          />
          Pedidos nuevos en espera
        </label>
      )}
      {etiquetasIa && (iaPoneEtiqueta || etiquetasIa.hoy > 0 || etiquetasIa.conError > 0) && (
        <p className="m-0 text-xs text-muted-foreground tabular-nums">
          Etiquetas de la IA hoy: {etiquetasIa.hoy}
          {etiquetasIa.conError > 0 ? ` · ${etiquetasIa.conError} con error` : ""}
        </p>
      )}
      {notasBot && (
        <p className="m-0 text-xs text-muted-foreground tabular-nums">
          Pedidos del bot: hoy {notasBot.hoy} · 7 días {notasBot.sieteDias}
          {notasBot.quitadas > 0 ? ` · ${notasBot.quitadas} sin nota` : ""}
          {notasBot.conError > 0 ? ` · ${notasBot.conError} con error` : ""}
        </p>
      )}
    </div>
  );
}
