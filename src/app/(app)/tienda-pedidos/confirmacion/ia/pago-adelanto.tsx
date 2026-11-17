"use client";

import { useState, useTransition } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CerrarIcon, GastoIcon } from "@/lib/nav-icons";
import { SeccionCard } from "./seccion";
import { agregarZonaAdelanto, eliminarZonaAdelanto, guardarMetodosPago, listarZonasAdelanto, type MetodosPagoTienda, type ZonaAdelanto } from "../ia-actions";

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
 * «Pago por adelantado» (17 nov 2026, aclarado por el equipo): las zonas de difícil acceso o fronterizas (Bocas del Toro, Puerto Armuelles…) se pagan antes de enviar. El bot de iComfly las confirma igual;
 * aquí el pedido queda «en espera de pago», sin etiqueta, hasta que el asesor verifique el pago y ponga la etiqueta real. Se registran las zonas y, por tienda, cómo paga el cliente (va en el mensaje
 * que el asesor le manda con un botón).
 */
export function PagoPorAdelantado({ paisNombre, puedeEscribir, zonasIniciales, metodos }: { paisNombre: string; puedeEscribir: boolean; zonasIniciales: ZonaAdelanto[]; metodos: MetodosPagoTienda[] }) {
  const { mostrarToast } = useToast();
  const [zonas, setZonas] = useState(zonasIniciales);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  return (
    <SeccionCard
      id="adelanto"
      icono={GastoIcon}
      titulo="Pago por adelantado"
      derecha={
        <span className="text-xs text-muted-foreground">
          {paisNombre} · {zonas.length} {zonas.length === 1 ? "zona" : "zonas"}
        </span>
      }
      ayuda="Si una de estas zonas sale en la dirección o en la ciudad, el pedido queda «En espera de pago»: no se propone etiqueta y no se gastan las IA. El asesor le avisa al cliente y pone la etiqueta cuando llega el pago."
    >
      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-sm font-semibold">Zonas de pago por adelantado</h3>
        {puedeEscribir ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              empezar(async () => {
                const r = await agregarZonaAdelanto(texto);
                if (r.error) return setError(r.error);
                const lista = await listarZonasAdelanto();
                if (!lista.error) setZonas(lista.zonas);
                setTexto("");
                mostrarToast("Zona guardada.");
              });
            }}
          >
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
              <span className={labelClass}>Lugar (una palabra o varias juntas)</span>
              <input value={texto} maxLength={80} required onChange={(e) => setTexto(e.target.value)} placeholder="Ej: Bocas del Toro, o Puerto Armuelles" className={fieldClass} />
            </label>
            <button type="submit" disabled={pendiente || texto.trim().length < 2} className={`rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50 ${anilloFoco}`}>
              {pendiente ? "Guardando…" : "Agregar"}
            </button>
          </form>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">Solo lectura: tu rol no puede agregar zonas.</p>
        )}
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        {zonas.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Todavía no hay ninguna zona: mientras no haya, el pago por adelantado no se activa y todo sigue como antes.</p>
        ) : (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {zonas.map((z) => (
              <li key={z.id} className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-soft py-1 pr-1.5 pl-3 text-sm">
                <span>{z.texto}</span>
                {puedeEscribir && (
                  <button
                    type="button"
                    aria-label={`Quitar ${z.texto}`}
                    onClick={() =>
                      empezar(async () => {
                        const r = await eliminarZonaAdelanto(z.id);
                        if (r.error) return mostrarToast(r.error, "destructive");
                        setZonas((xs) => xs.filter((x) => x.id !== z.id));
                      })
                    }
                    className={`grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-card ${anilloFoco}`}
                  >
                    <CerrarIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-sm font-semibold">Cómo paga el cliente, por tienda</h3>
        <p className="m-0 text-sm text-muted-foreground">Cada tienda tiene sus métodos. Lo que escribas va tal cual en el mensaje que el asesor le manda al cliente.</p>
        {metodos.length === 0 ? <p className="m-0 text-sm text-muted-foreground">No hay tiendas para registrar.</p> : metodos.map((m) => <MetodosDeTienda key={m.tiendaId} m={m} puedeEscribir={puedeEscribir} />)}
      </div>
    </SeccionCard>
  );
}
