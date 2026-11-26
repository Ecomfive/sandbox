"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { editarDireccionPedido } from "../gestion-actions";

/**
 * «Editar dirección» en Datos del cliente (26 nov 2026, aviso de atención al cliente: el bot todavía no entiende las direcciones enredadas que escribe
 * el cliente). La asesora corrige el corregimiento y la dirección exacta; se cambia en Shopify y, si entró, en el sistema, con su línea en la cronología.
 */
export function EditarDireccion({ ordenId, direccion, corregimiento }: { ordenId: string; direccion: string | null; corregimiento: string | null }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [dir, setDir] = useState(direccion ?? "");
  const [corr, setCorr] = useState(corregimiento ?? "");
  const [pendiente, start] = useTransition();

  if (!abierto)
    return (
      <button
        type="button"
        onClick={() => {
          setDir(direccion ?? "");
          setCorr(corregimiento ?? "");
          setAbierto(true);
        }}
        className={`flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted ${anilloFoco}`}
      >
        Editar dirección
      </button>
    );

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await editarDireccionPedido(ordenId, dir, corr);
      if ("error" in r) {
        mostrarToast(r.error, "destructive");
        return;
      }
      mostrarToast(r.texto);
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={guardar} className="flex w-full flex-col gap-2 rounded-lg border border-primario/30 bg-primario-suave p-3">
      <label className="flex flex-col gap-1 text-xs font-medium">
        Corregimiento
        <input value={corr} onChange={(e) => setCorr(e.target.value)} maxLength={120} className={fieldClassSm} placeholder="Ej.: Bella Vista" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Dirección exacta
        <textarea value={dir} onChange={(e) => setDir(e.target.value)} required minLength={5} maxLength={255} rows={2} className={`${fieldClassSm} h-auto py-1.5`} placeholder="Calle, casa o edificio, punto de referencia" />
      </label>
      <p className="m-0 text-xs text-muted-foreground">Se cambia en Shopify (así le sale a despacho en el ticket) y queda en la cronología del pedido.</p>
      <div className="flex gap-2">
        <button type="submit" disabled={pendiente} aria-busy={pendiente} className={`rounded-md bg-primario px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${anilloFoco}`}>
          {pendiente ? "Guardando…" : "Guardar en Shopify"}
        </button>
        <button type="button" disabled={pendiente} onClick={() => setAbierto(false)} className={`rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted ${anilloFoco}`}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
