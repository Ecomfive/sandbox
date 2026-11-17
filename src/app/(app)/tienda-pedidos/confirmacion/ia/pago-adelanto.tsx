"use client";

import { useState, useTransition } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { GastoIcon } from "@/lib/nav-icons";
import { SeccionCard } from "./seccion";
import { guardarMetodosPago, type MetodosPagoTienda } from "../ia-actions";

/** Cómo paga el cliente en una tienda: el texto que va tal cual en el mensaje. */
function MetodosDeTienda({ m, puedeEscribir }: { m: MetodosPagoTienda; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [texto, setTexto] = useState(m.texto);
  const [guardado, setGuardado] = useState(m.texto);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const cambio = texto.trim() !== guardado.trim();
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{m.tienda}</span>
        <textarea
          rows={3}
          maxLength={1000}
          value={texto}
          disabled={!puedeEscribir}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={"Ej:\nYappy: 6000-0000 (a nombre de la tienda)\nTransferencia: Banco General, cuenta 04-00-00-000000"}
          className={fieldClass}
        />
      </label>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-destructive">
          {error}
        </p>
      )}
      {puedeEscribir && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pendiente || !cambio}
            onClick={() =>
              empezar(async () => {
                setError(null);
                const r = await guardarMetodosPago(m.tiendaId, texto);
                if (r.error) return setError(r.error);
                setGuardado(texto);
                mostrarToast(texto.trim() ? "Métodos de pago guardados." : "Se quitaron los métodos de pago.");
              })
            }
            className={`rounded-md bg-foreground px-3 py-1.5 text-sm font-semibold text-background disabled:opacity-50 ${anilloFoco}`}
          >
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
          {!guardado.trim() && <span className="text-xs text-muted-foreground">Sin métodos de pago: el mensaje al cliente dice que un asesor le indica cómo pagar.</span>}
        </div>
      )}
    </div>
  );
}

/**
 * «Pago por adelantado: cómo paga el cliente» (17 nov 2026): las zonas de difícil acceso o fronterizas (Bocas del Toro, Puerto Armuelles…) se registran como «Pago por adelantado» en las palabras de zona, los ejemplos y
 * la revisión. El bot de iComfly las confirma igual; aquí el pedido queda «en espera de pago», sin etiqueta, hasta que el asesor verifique el pago. Esta sección guarda, por tienda, cómo paga el cliente (va en el
 * mensaje que el asesor le manda con un botón).
 */
export function PagoPorAdelantado({ paisNombre, puedeEscribir, metodos }: { paisNombre: string; puedeEscribir: boolean; metodos: MetodosPagoTienda[] }) {
  return (
    <SeccionCard
      id="adelanto"
      icono={GastoIcon}
      titulo="Pago por adelantado: cómo paga el cliente"
      derecha={<span className="text-xs text-muted-foreground">{paisNombre}</span>}
      ayuda="Las zonas de pago por adelantado se registran en «Palabras de zona». Aquí va, por tienda, cómo paga el cliente (Yappy, cuenta…): el asesor lo manda en el mensaje con un botón."
    >
      <div className="flex flex-col gap-3">
        {metodos.length === 0 ? <p className="m-0 text-sm text-muted-foreground">No hay tiendas para registrar.</p> : metodos.map((m) => <MetodosDeTienda key={m.tiendaId} m={m} puedeEscribir={puedeEscribir} />)}
      </div>
    </SeccionCard>
  );
}
