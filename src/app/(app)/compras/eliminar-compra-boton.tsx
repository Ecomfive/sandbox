"use client";

import { useTransition } from "react";
import { anularCompra, restaurarCompra } from "./actions";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearFechaHora } from "@/lib/formato";
import { PapeleraIcon } from "@/lib/nav-icons";
import type { FilaCompra } from "./def-compras";

/**
 * Botón «Anular» de la ficha de una compra (antes «Eliminar»; pedido de Hernán, 9 oct 2026): pide el motivo y la anula. La
 * compra no se borra: conserva su N.º OC, su código, su actividad y sus productos, sale de la lista (se ve con «Anuladas») y se
 * puede restaurar.
 */
export function AnularCompraBoton({ id, nombre, alAnular }: { id: string; nombre: string; alAnular: () => void }) {
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();

  function alHacerClic() {
    const motivo = prompt(`¿Por qué se anula la compra «${nombre}»?\n\nNo se borra: queda en «Anuladas» con su código y su historial, y se puede restaurar.`);
    if (motivo === null) return;
    if (motivo.trim().length < 3) return mostrarToast("Escribe el motivo para anular la compra.", "destructive");
    startTransition(async () => {
      const r = await anularCompra(id, motivo).catch(() => ({ error: "No se pudo anular. Inténtalo de nuevo." }));
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast("Compra anulada: está en «Anuladas»");
      alAnular();
    });
  }

  return (
    <BotonAccion icono={PapeleraIcon} tono="peligro" onClick={alHacerClic} disabled={pending}>
      {pending ? "Anulando..." : "Anular"}
    </BotonAccion>
  );
}

/** El aviso de una compra anulada, arriba de su ficha: cuándo, quién y por qué, y el botón para restaurarla. */
export function AvisoAnulada({ compra, puedeEscribir }: { compra: FilaCompra; puedeEscribir: boolean }) {
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();
  if (!compra.anulada) return null;
  return (
    <div role="status" className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
      <span className="flex flex-col gap-0.5">
        <strong className="font-semibold text-destructive">Compra anulada</strong>
        <span className="text-muted-foreground">
          {formatearFechaHora(compra.anulada.en)}
          {compra.anulada.por ? ` · ${compra.anulada.por}` : ""}
          {compra.anulada.motivo ? ` · ${compra.anulada.motivo}` : ""}
        </span>
      </span>
      {puedeEscribir && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await restaurarCompra(compra.id).catch(() => ({ error: "No se pudo restaurar." }));
              if (r.error) mostrarToast(r.error, "destructive");
              else mostrarToast("Compra restaurada: vuelve a la lista");
            })
          }
          className={`rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
        >
          {pending ? "Restaurando…" : "Restaurar"}
        </button>
      )}
    </div>
  );
}
