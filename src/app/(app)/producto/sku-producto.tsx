"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cambiarSkuProducto, revisarSku } from "./actions";

/**
 * El SKU en la ficha del producto. Con permiso de escritura, «Cambiar» abre el campo: avisa al momento si el SKU ya lo tiene
 * otro producto y, al guardar, recuerda cambiarlo también en Dropi y Shopify (las ventas buscan el producto por su SKU).
 */
export function SkuProducto({ id, codigo, puedeEscribir }: { id: string; codigo: string; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(codigo);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (!editando)
    return (
      <span className="flex items-center gap-2">
        <span className="font-medium">{codigo}</span>
        {puedeEscribir && (
          <button type="button" onClick={() => setEditando(true)} className={`rounded text-xs text-primario hover:underline ${anilloFoco}`}>
            Cambiar
          </button>
        )}
      </span>
    );

  function cancelar() {
    setTexto(codigo);
    setOcupado(null);
    setEditando(false);
  }

  function guardar() {
    const nuevo = texto.trim();
    if (!nuevo || nuevo === codigo) return cancelar();
    if (!confirm(`¿Cambiar el SKU de «${codigo}» a «${nuevo}»?\n\nCámbialo también en Dropi, Shopify y las tiendas: las ventas buscan el producto por su SKU.`)) return;
    startTransition(async () => {
      const r = await cambiarSkuProducto(id, nuevo);
      if (r.error) return setOcupado(r.error);
      mostrarToast("SKU cambiado.");
      setEditando(false);
      router.refresh();
    });
  }

  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <input
          aria-label="SKU nuevo"
          value={texto}
          maxLength={60}
          disabled={pendiente}
          autoFocus
          onChange={(e) => {
            setTexto(e.target.value.replace(/\s/g, ""));
            setOcupado(null);
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== codigo) void revisarSku(v, id).then((r) => setOcupado(r.error ?? null));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              guardar();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelar();
            }
          }}
          aria-invalid={!!ocupado}
          className={`${fieldClassSm} w-48`}
        />
        <BotonBarra principal onClick={guardar} disabled={pendiente || !!ocupado || !texto.trim()}>
          {pendiente ? "Guardando…" : "Guardar"}
        </BotonBarra>
        <BotonBarra onClick={cancelar} disabled={pendiente}>
          Cancelar
        </BotonBarra>
      </span>
      {ocupado && (
        <span role="alert" className="text-xs text-destructive">
          {ocupado}
        </span>
      )}
    </span>
  );
}
