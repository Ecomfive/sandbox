"use client";

import { useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { MAX_RAPIDA, type RespuestaRapida } from "@/lib/whatsapp/rapidas";
import { borrarRespuestaRapida, editarRespuestaRapida, guardarRespuestaRapida } from "./rapidas-actions";

const botonSecundario = `inline-flex min-h-9 items-center rounded-lg border border-border-control bg-card px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const botonOscuro = `inline-flex min-h-9 items-center rounded-lg bg-foreground px-3.5 text-[13px] font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`;

/**
 * «Mensajes rápidos» (29 oct 2026): la lista del equipo, para agregar uno nuevo, cambiar su texto o quitarlo. Los mensajes rápidos se ofrecen arriba del cuadro de texto de la
 * bandeja (los más usados, y los que se parecen a lo que se va escribiendo) y se guardan también desde lo escrito o desde un mensaje ya mandado.
 */
export function VentanaRapidas({ rapidas, setRapidas, puedeEditar, alCerrar }: { rapidas: RespuestaRapida[]; setRapidas: Dispatch<SetStateAction<RespuestaRapida[]>>; puedeEditar: boolean; alCerrar: () => void }) {
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();

  function agregar() {
    setError(null);
    empezar(async () => {
      const r = await guardarRespuestaRapida(nuevo).catch(() => ({ error: "No se pudo guardar." }));
      if ("error" in r) return setError(r.error);
      setRapidas((l) => [...l, r.respuesta]);
      setNuevo("");
    });
  }
  function guardarEdicion() {
    if (!editando) return;
    const { id, texto } = editando;
    setError(null);
    empezar(async () => {
      const r = await editarRespuestaRapida(id, texto).catch(() => ({ error: "No se pudo guardar." }));
      if ("error" in r) return setError(r.error);
      setRapidas((l) => l.map((x) => (x.id === id ? { ...x, texto: texto.replace(/\s+/g, " ").trim() } : x)));
      setEditando(null);
    });
  }
  function quitar(id: string) {
    setError(null);
    empezar(async () => {
      const r = await borrarRespuestaRapida(id).catch(() => ({ error: "No se pudo quitar." }));
      if ("error" in r) return setError(r.error);
      setRapidas((l) => l.filter((x) => x.id !== id));
      setQuitando(null);
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Mensajes rápidos" ancho="sm">
      <div className="flex flex-col gap-4 p-5">
        {puedeEditar && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              agregar();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Nuevo mensaje rápido</span>
              <textarea value={nuevo} onChange={(e) => setNuevo(e.target.value)} rows={2} maxLength={MAX_RAPIDA} data-enfocar placeholder="Ej: Hola, ¿cómo estás?" className={`${fieldClass} w-full resize-y`} />
            </label>
            <button type="submit" disabled={ocupado || nuevo.trim().length < 2} className={`${botonOscuro} self-end`}>
              Agregar
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {rapidas.length === 0 ? (
          <p className="m-0 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Todavía no hay mensajes rápidos.</p>
        ) : (
          <ul className="m-0 flex max-h-80 list-none flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border p-0">
            {rapidas.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-3 py-2.5">
                {editando?.id === r.id ? (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="sr-only">Texto del mensaje rápido</span>
                      <textarea value={editando.texto} onChange={(e) => setEditando({ id: r.id, texto: e.target.value })} rows={2} maxLength={MAX_RAPIDA} className={`${fieldClass} w-full resize-y`} />
                    </label>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => setEditando(null)} disabled={ocupado} className={botonSecundario}>
                        Cancelar
                      </button>
                      <button type="button" onClick={guardarEdicion} disabled={ocupado || editando.texto.trim().length < 2} className={botonOscuro}>
                        Guardar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">{r.texto}</span>
                    {puedeEditar && (
                      <div className="flex flex-wrap items-center gap-2">
                        {r.usos > 0 && <span className="mr-auto text-xs text-muted-foreground tabular-nums">Usado {r.usos} {r.usos === 1 ? "vez" : "veces"}</span>}
                        {quitando === r.id ? (
                          <>
                            <span className="ml-auto text-xs text-muted-foreground">¿Quitarlo?</span>
                            <button type="button" onClick={() => quitar(r.id)} disabled={ocupado} className={botonOscuro}>
                              Sí, quitar
                            </button>
                            <button type="button" onClick={() => setQuitando(null)} disabled={ocupado} className={botonSecundario}>
                              No
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => setEditando({ id: r.id, texto: r.texto })} className={`${botonSecundario} ml-auto`}>
                              Editar
                            </button>
                            <button type="button" onClick={() => setQuitando(r.id)} className={botonSecundario}>
                              Quitar
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Ventana>
  );
}
