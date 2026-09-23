"use client";

import { useEffect, useState, useTransition } from "react";
import { actualizarNovedadRetiro, resolverNovedadRetiro } from "./actions";
import { obtenerActividadRetiro } from "./actividad";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { formatearFechaHoraCompleta } from "@/lib/formato";
import { AlertaIcon } from "@/lib/nav-icons";
import { novedadVigente } from "@/lib/retiros/novedad";

/** Cuántos caracteres admite la nota — igual que en el servidor. */
const MAX_NOVEDAD = 500;

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Lo que hay al final de la ficha de un retiro con novedad cuando se pulsa «Ver novedad»: **la nota de la novedad**
 * (sacada de su historial), editable ahí mismo — no queda bloqueada — con su propio botón «Guardar»
 * (`actualizarNovedadRetiro`, deja otra línea en el historial sin borrar el rastro de la edición), y el botón
 * **«Resolver»**. Nada quita la novedad hasta que alguien pulsa «Resolver» (`resolverNovedadRetiro`): el retiro queda
 * «Cerrado», con la etapa Recibido y Consolidado y la Consolidación «Novedad resuelta». Para eso pide dos fechas: la de
 * recibido (cuándo llegó el dinero) y la de consolidación (arranca en hoy), ambas editables.
 */
export function SeccionResolverNovedad({
  id,
  codigoPais,
  fechaRecibido: fechaRecibidaInicial,
  alCancelar,
  alNotaGuardada,
  alResuelta,
}: {
  id: string;
  codigoPais: string;
  /** La fecha de recibido que ya tenga el retiro; sin ella arranca en hoy. */
  fechaRecibido: string | null;
  alCancelar: () => void;
  /** Se llama al guardar la nota sin resolver la novedad (la sección sigue abierta): para que el historial de la
   * ficha se vuelva a pedir. */
  alNotaGuardada: () => void;
  alResuelta: () => void;
}) {
  const { mostrarToast } = useToast();
  const [nota, setNota] = useState<string | null>(null);
  const [fechaNota, setFechaNota] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pending, startTransition] = useTransition();
  const [pendingGuardar, startTransitionGuardar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fechaRecibido, setFechaRecibido] = useState(fechaRecibidaInicial ?? hoy());
  const [fechaConsolidacion, setFechaConsolidacion] = useState(hoy());

  useEffect(() => {
    let vigente = true;
    obtenerActividadRetiro(id)
      .then((r) => {
        if (!vigente) return;
        const actual = "eventos" in r ? novedadVigente(r.eventos) : null;
        setNota(actual?.nota ?? "");
        setFechaNota(actual?.creadoEn ?? null);
        setCargando(false);
      })
      .catch(() => {
        if (!vigente) return;
        setNota("");
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [id]);

  function alGuardarNota(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransitionGuardar(async () => {
      const resultado = await actualizarNovedadRetiro(formData).catch(() => ({ error: "No se pudo guardar la nota. Inténtalo de nuevo." }));
      if (resultado?.error) setError(resultado.error);
      else {
        mostrarToast("Nota guardada");
        alNotaGuardada();
      }
    });
  }

  function alResolver() {
    setError(null);
    const formData = new FormData();
    formData.set("id", id);
    formData.set("fecha_recibido", fechaRecibido);
    formData.set("fecha_cierre", fechaConsolidacion);
    if (!fechaRecibido || !fechaConsolidacion) {
      setError(!fechaRecibido ? "Falta la fecha de recibido." : "Falta la fecha de consolidación.");
      return;
    }
    startTransition(async () => {
      const resultado = await resolverNovedadRetiro(formData).catch(() => ({ error: "No se pudo resolver la novedad. Inténtalo de nuevo." }));
      if (resultado?.error) setError(resultado.error);
      else alResuelta();
    });
  }

  const ocupado = pending || pendingGuardar;

  return (
    <div id={`panel-retiro-${id}`} className="scroll-mt-40 border-t border-border p-4">
      <Seccion icono={AlertaIcon} titulo="Novedad">
        <form onSubmit={alGuardarNota} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />

          <div className="flex flex-col gap-1">
            <label className={labelClassSm} htmlFor={`campo-nota-novedad-${id}`}>
              Nota de la novedad
            </label>
            <textarea
              id={`campo-nota-novedad-${id}`}
              name="novedad"
              rows={4}
              maxLength={MAX_NOVEDAD}
              data-foco-panel
              disabled={ocupado}
              value={nota ?? ""}
              onChange={(e) => setNota(e.target.value)}
              placeholder={cargando ? "Cargando…" : "Ej: El banco devolvió la transferencia por número de cuenta incorrecto"}
              className={`${fieldClass} w-full resize-y`}
            />
            {fechaNota && (
              <span className="text-xs text-muted-foreground">{formatearFechaHoraCompleta(fechaNota, codigoPais)}</span>
            )}
          </div>

          <Button type="submit" variant="secondary" disabled={cargando || ocupado} className="self-start">
            {pendingGuardar ? "Guardando..." : "Guardar nota"}
          </Button>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>
              Fecha de recibido
              <span aria-hidden="true" className="text-destructive"> *</span>
            </span>
            <input
              type="date"
              required
              value={fechaRecibido}
              disabled={ocupado}
              onChange={(e) => setFechaRecibido(e.target.value)}
              className={`${fieldClass} w-full min-w-0`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>
              Fecha de consolidación
              <span aria-hidden="true" className="text-destructive"> *</span>
            </span>
            <input
              type="date"
              required
              value={fechaConsolidacion}
              disabled={ocupado}
              onChange={(e) => setFechaConsolidacion(e.target.value)}
              className={`${fieldClass} w-full min-w-0`}
            />
          </label>
          <Button type="button" onClick={alResolver} disabled={cargando || ocupado}>
            {pending ? "Resolviendo..." : "Resolver"}
          </Button>
          <Button type="button" variant="secondary" onClick={alCancelar} disabled={ocupado}>
            Cancelar
          </Button>
        </div>
      </Seccion>
    </div>
  );
}
