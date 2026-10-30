"use client";

import { useState, useTransition } from "react";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { bandera } from "@/lib/whatsapp/origen-chat";
import { guardarUmbralesTipoCliente } from "./actions";

export interface UmbralPais {
  paisId: string;
  codigo: string;
  nombre: string;
  vipDesde: number;
  blackDesde: number;
}

/** Una fila: el país y sus dos umbrales; «Guardar» aparece solo con cambios. */
function FilaUmbral({ u, puedeEscribir }: { u: UmbralPais; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [vip, setVip] = useState(String(u.vipDesde));
  const [black, setBlack] = useState(String(u.blackDesde));
  const [guardado, setGuardado] = useState({ vip: u.vipDesde, black: u.blackDesde });
  const [pendiente, empezar] = useTransition();
  const cambio = Number(vip) !== guardado.vip || Number(black) !== guardado.black;

  function guardar() {
    empezar(async () => {
      const r = await guardarUmbralesTipoCliente(u.paisId, Number(vip), Number(black)).catch(() => ({ error: "No se pudieron guardar los umbrales." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      setGuardado({ vip: Number(vip), black: Number(black) });
      mostrarToast(r.cambiados ? `Guardado. ${r.cambiados} ${r.cambiados === 1 ? "cliente cambió" : "clientes cambiaron"} de tipo.` : "Guardado. Ningún cliente cambió de tipo.");
    });
  }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 text-sm">
        <span aria-hidden="true">{bandera(u.codigo)}</span> {u.nombre}
      </td>
      <td className="px-3 py-2 text-sm text-muted-foreground">menos de {Number(vip) || "—"}</td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={vip}
          disabled={!puedeEscribir}
          onChange={(e) => setVip(e.target.value)}
          aria-label={`VIP desde, ${u.nombre}`}
          className={`${fieldClassSm} w-24 tabular-nums`}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={black}
          disabled={!puedeEscribir}
          onChange={(e) => setBlack(e.target.value)}
          aria-label={`BLACK desde, ${u.nombre}`}
          className={`${fieldClassSm} w-24 tabular-nums`}
        />
      </td>
      <td className="px-3 py-2 text-right">
        {puedeEscribir && cambio && (
          <button type="button" onClick={guardar} disabled={pendiente} className={`rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60 ${anilloFoco}`}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * Tipo de cliente del CRM por país (29 oct 2026, pedido de Alcides): desde cuántos pedidos al mes (promedio de los últimos 3 meses, sin cancelados) un
 * cliente es VIP o BLACK; por debajo es ROOKIE. Al guardar se recalcula el tipo de todos. Los que alguien fijó a mano no cambian.
 */
export function UmbralesTipoCliente({ umbrales, puedeEscribir }: { umbrales: UmbralPais[]; puedeEscribir: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full">
        <thead className="bg-muted text-left text-xs font-medium text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">País</th>
            <th scope="col" className="px-3 py-2 font-medium">Rookie</th>
            <th scope="col" className="px-3 py-2 font-medium">VIP desde</th>
            <th scope="col" className="px-3 py-2 font-medium">Black desde</th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Guardar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {umbrales.map((u) => (
            <FilaUmbral key={u.paisId} u={u} puedeEscribir={puedeEscribir} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
