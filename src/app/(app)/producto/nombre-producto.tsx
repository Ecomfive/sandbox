"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { renombrarProducto } from "./actions";

/**
 * El nombre del producto en su ficha: se ve como texto y, con permiso de escritura, «Cambiar» abre el campo (como el SKU y la
 * categoría; pedido de Alcides, 25 oct 2026). Se guarda con «Guardar» o Enter; Escape o «Cancelar» lo dejan como estaba. El
 * cambio queda en la actividad del producto.
 */
export function NombreProducto({ id, nombre, puedeEscribir }: { id: string; nombre: string; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nombre);
  const [pendiente, startTransition] = useTransition();

  if (!editando)
    return (
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="font-medium [overflow-wrap:anywhere]">{nombre}</span>
        {puedeEscribir && (
          <button type="button" onClick={() => setEditando(true)} className={`rounded text-xs text-primario hover:underline ${anilloFoco}`}>
            Cambiar
          </button>
        )}
      </span>
    );

  function cancelar() {
    setTexto(nombre);
    setEditando(false);
  }

  function guardar() {
    const limpio = texto.trim().replace(/\s+/g, " ");
    if (limpio === nombre) return cancelar();
    if (!limpio) return mostrarToast("El nombre no puede quedar vacío.", "destructive");
    startTransition(async () => {
      const r = await renombrarProducto(id, limpio);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast("Nombre guardado.");
      setEditando(false);
      router.refresh();
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        aria-label="Nombre del producto"
        value={texto}
        maxLength={200}
        disabled={pendiente}
        autoFocus
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            guardar();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelar();
          }
        }}
        className={`${fieldClassSm} min-w-0 flex-1`}
      />
      <BotonBarra principal onClick={guardar} disabled={pendiente || !texto.trim()}>
        {pendiente ? "Guardando…" : "Guardar"}
      </BotonBarra>
      <BotonBarra onClick={cancelar} disabled={pendiente}>
        Cancelar
      </BotonBarra>
    </span>
  );
}
