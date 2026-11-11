"use client";

import { useState, useTransition } from "react";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { generarExplicacion, guardarExplicacion, guardarVersionInforme } from "./actions";

/**
 * «Explicación del mes»: el texto que acompaña al informe (y al correo). Con la clave de Anthropic, «Generar borrador»
 * propone uno con las cifras agregadas del mes; la persona lo edita y lo guarda. «Guardar versión» deja una foto del
 * informe en Versiones.
 */
export function ExplicacionInforme({ mes, inicial, iaDisponible, puedeEditar }: { mes: string; inicial: string | null; iaDisponible: boolean; puedeEditar: boolean }) {
  const { mostrarToast } = useToast();
  const [texto, setTexto] = useState(inicial ?? "");
  const [guardado, setGuardado] = useState(inicial ?? "");
  const [deIa, setDeIa] = useState(false);
  const [editando, setEditando] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const cambiado = texto.trim() !== guardado.trim();

  const generar = () =>
    startTransition(async () => {
      const r = await generarExplicacion(mes.slice(0, 7));
      if (r.error || !r.texto) return mostrarToast(r.error ?? "No se pudo generar.", "destructive");
      setTexto(r.texto);
      setDeIa(true);
      setEditando(true);
    });
  const guardar = () =>
    startTransition(async () => {
      const r = await guardarExplicacion(mes.slice(0, 7), texto, deIa);
      if (r.error) return mostrarToast(r.error, "destructive");
      setGuardado(texto.trim());
      setEditando(false);
      mostrarToast("Explicación guardada");
    });
  const version = () =>
    startTransition(async () => {
      const r = await guardarVersionInforme(mes.slice(0, 7));
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast("Versión guardada");
    });

  return (
    <MarcoAF4
      id="informe-explicacion"
      titulo="Explicación del mes"
      accion={
        puedeEditar ? (
          <div className="flex flex-wrap items-center gap-2" data-sin-imprimir>
            {iaDisponible ? (
              <button type="button" onClick={generar} disabled={pendiente} className={`${claseAccionAF4} h-7 ${anilloFoco}`}>
                {pendiente ? "Generando…" : "Generar borrador"}
              </button>
            ) : (
              <Tooltip texto="IA sin configurar">
                <button type="button" aria-disabled="true" aria-label="Generar borrador: falta la clave de Anthropic" className={`${claseAccionAF4} h-7 cursor-not-allowed opacity-50 ${anilloFoco}`}>
                  Generar borrador
                </button>
              </Tooltip>
            )}
            {!editando && (
              <button type="button" onClick={() => setEditando(true)} className={`${claseAccionAF4} h-7 ${anilloFoco}`}>
                {guardado ? "Editar" : "Escribir"}
              </button>
            )}
            <button type="button" onClick={version} disabled={pendiente} className={`${claseAccionAF4} h-7 ${anilloFoco}`}>
              Guardar versión
            </button>
          </div>
        ) : undefined
      }
    >
      {editando ? (
        <div className="flex flex-col gap-2" data-sin-imprimir>
          <textarea
            aria-label="Explicación del mes"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            maxLength={4000}
            className={fieldClass}
            placeholder="Ej: Los ingresos subieron por la campaña de mitad de mes; el margen bajó por el costo de envío…"
          />
          {deIa && <p className="m-0 text-xs text-muted-foreground">Borrador de la IA: revisalo antes de guardar.</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setTexto(guardado);
                setDeIa(false);
                setEditando(false);
              }}
              className={`${claseAccionAF4} ${anilloFoco}`}
            >
              Cancelar
            </button>
            <button type="button" onClick={guardar} disabled={pendiente || !cambiado} className={`${claseAccionAF4} !border-foreground !bg-foreground !text-background disabled:opacity-50 ${anilloFoco}`}>
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      ) : guardado ? (
        <p className="m-0 whitespace-pre-line text-sm text-pretty">{guardado}</p>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">Sin explicación para este mes.</p>
      )}
    </MarcoAF4>
  );
}
