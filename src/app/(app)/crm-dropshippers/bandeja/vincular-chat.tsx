"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { buscarDropshippersParaVincular, desvincularChat, sugerirDropshippersParaChat, vincularChat, type CandidatoVinculo } from "./vincular-actions";

const botonSecundario = `inline-flex min-h-9 items-center rounded-lg border border-border-control bg-card px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const botonOscuro = `inline-flex min-h-9 items-center rounded-lg bg-foreground px-3.5 text-[13px] font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`;

function Datos({ c }: { c: CandidatoVinculo }) {
  const detalle = [c.codigo, ...c.tiendas, ...c.cuentas].filter(Boolean).join(" · ");
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-medium">{c.nombre}</span>
      {detalle && <span className="truncate text-xs text-muted-foreground">{detalle}</span>}
    </span>
  );
}

/**
 * «Vincular con un dropshipper» (29 oct 2026): busca en el CRM por nombre, tienda, código, correo o ID de usuario de Dropi y vincula el chat. Con un chat ya vinculado
 * deja cambiar el vínculo o quitarlo (era otra persona). El número del chat se guarda en la ficha del dropshipper en el servidor: aquí nunca se ve.
 */
export function VentanaVincular({
  conversacionId,
  actual,
  alCerrar,
  alListo,
}: {
  conversacionId: string;
  actual: { id: string; nombre: string } | null;
  alCerrar: () => void;
  alListo: (mensaje: string) => void;
}) {
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<CandidatoVinculo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();
  const pedido = useRef(0);

  useEffect(() => {
    const t = consulta.trim();
    if (t.length < 2) {
      pedido.current++;
      return;
    }
    const mio = ++pedido.current;
    const espera = setTimeout(() => {
      buscarDropshippersParaVincular(conversacionId, t)
        .then((r) => {
          if (mio !== pedido.current) return;
          if ("error" in r) setError(r.error);
          else {
            setError(null);
            setResultados(r.candidatos);
          }
        })
        .catch(() => mio === pedido.current && setError("No se pudo buscar."));
    }, 300);
    return () => clearTimeout(espera);
  }, [consulta, conversacionId]);

  function hacer(accion: () => Promise<{ ok: true; mensaje: string } | { error: string }>) {
    setError(null);
    empezar(async () => {
      const r = await accion().catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if ("error" in r) setError(r.error);
      else alListo(r.mensaje);
    });
  }

  const buscando = consulta.trim().length >= 2;
  return (
    <Ventana abierto alCerrar={alCerrar} titulo={actual ? "Cambiar el dropshipper del chat" : "Vincular con un dropshipper"} ancho="sm">
      <div className="flex flex-col gap-4 p-5">
        {actual && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs text-muted-foreground">Ahora está vinculado con</span>
              <span className="truncate text-sm font-semibold">{actual.nombre}</span>
            </span>
            <button type="button" disabled={ocupado} onClick={() => hacer(() => desvincularChat(conversacionId))} className={botonSecundario}>
              Quitar vínculo
            </button>
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Buscar dropshipper</span>
          <input value={consulta} onChange={(e) => setConsulta(e.target.value)} maxLength={80} data-enfocar placeholder="Nombre, tienda, código o ID de Dropi" className={`${fieldClass} w-full`} />
        </label>
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {buscando && resultados && (
          <ul className="m-0 flex max-h-72 list-none flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border p-0">
            {resultados.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">No hay dropshippers con ese dato.</li>}
            {resultados.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <Datos c={c} />
                <button type="button" disabled={ocupado || c.id === actual?.id} onClick={() => hacer(() => vincularChat(conversacionId, c.id))} className={botonOscuro}>
                  {c.id === actual?.id ? "Vinculado" : "Vincular"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Ventana>
  );
}

/**
 * El bloque «No está en el CRM» de la ficha del chat: propone los dropshippers que se parecen al nombre del perfil de WhatsApp («¿Es alguno de estos?», un clic
 * confirma; nunca se vincula solo) y abre la búsqueda completa. Solo se ofrece a quien puede escribir en el chat.
 */
export function SugerenciasDeVinculo({ conversacionId, escribe, alAbrirBusqueda, alListo }: { conversacionId: string; escribe: boolean; alAbrirBusqueda: () => void; alListo: (mensaje: string) => void }) {
  const [sugeridos, setSugeridos] = useState<CandidatoVinculo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();

  useEffect(() => {
    if (!escribe) return;
    let vigente = true;
    sugerirDropshippersParaChat(conversacionId)
      .then((r) => vigente && setSugeridos("error" in r ? [] : r.candidatos))
      .catch(() => vigente && setSugeridos([]));
    return () => {
      vigente = false;
    };
  }, [conversacionId, escribe]);

  if (!escribe) return null;
  return (
    <div className="flex flex-col gap-2">
      {sugeridos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--wa-sec)]">¿Es alguno de estos?</span>
          {sugeridos.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-[var(--wa-borde)] px-2.5 py-1.5">
              <Datos c={c} />
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  setError(null);
                  empezar(async () => {
                    const r = await vincularChat(conversacionId, c.id).catch(() => ({ error: "No se pudo vincular." }));
                    if ("error" in r) setError(r.error);
                    else alListo(r.mensaje);
                  });
                }}
                className={`flex-none rounded-full bg-[var(--wa-acento)] px-3 py-1 text-[12.5px] font-semibold text-[var(--wa-acento-texto)] hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}
              >
                Sí, vincular
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      )}
      <button type="button" onClick={alAbrirBusqueda} className={`self-start text-[14px] font-medium text-[var(--wa-acento)] hover:underline ${anilloFoco}`}>
        Vincular con un dropshipper
      </button>
    </div>
  );
}
