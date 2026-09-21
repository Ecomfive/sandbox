"use client";

import { useEffect, useState, useTransition } from "react";
import { reabrirRetiro } from "./actions";
import { obtenerActividadRetiro } from "./actividad";
import { BotonCrear } from "@/components/ui/boton-crear";
import { Button } from "@/components/ui/button";
import { labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { formatearFechaHoraCompleta } from "@/lib/formato";
import { AlertaIcon } from "@/lib/nav-icons";
import { novedadVigente } from "@/lib/retiros/novedad";

/**
 * Lo que hay al final de la ficha de un retiro con novedad cuando se pulsa «Abrir»: **la nota de la novedad** (sacada de
 * su historial) y el botón **«Resuelto»**. «Abrir» ya no reabre el retiro de golpe; la novedad solo se quita cuando
 * alguien pulsa «Resuelto» (`reabrirRetiro`), y el retiro vuelve a estar abierto. Si la novedad no tiene una nota
 * registrada (se puso el estado a mano), se dice y el botón sigue ahí.
 */
export function SeccionResolverNovedad({
  id,
  codigoPais,
  alCancelar,
  alResuelta,
}: {
  id: string;
  codigoPais: string;
  alCancelar: () => void;
  alResuelta: () => void;
}) {
  const [novedad, setNovedad] = useState<{ nota: string; creadoEn: string } | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerActividadRetiro(id)
      .then((r) => vigente && setNovedad("eventos" in r ? novedadVigente(r.eventos) : null))
      .catch(() => vigente && setNovedad(null));
    return () => {
      vigente = false;
    };
  }, [id]);

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const resultado = await reabrirRetiro(formData).catch(() => ({ error: "No se pudo resolver la novedad. Inténtalo de nuevo." }));
      if (resultado?.error) setError(resultado.error);
      else alResuelta();
    });
  }

  return (
    <div id={`panel-retiro-${id}`} className="scroll-mt-40 border-t border-border p-4">
      <Seccion icono={AlertaIcon} titulo="Novedad">
        <form onSubmit={alEnviar} aria-busy={pending} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />

          <div className="flex flex-col gap-1">
            <span className={labelClassSm}>Nota de la novedad</span>
            {/* Foco de la sección al llegar con «Abrir»: la nota es lo primero que hay que leer. */}
            <div
              tabIndex={-1}
              data-foco-panel
              aria-live="polite"
              className="rounded-md border border-border bg-muted px-3 py-2 text-sm whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            >
              {novedad === undefined ? (
                <span className="text-muted-foreground">Cargando…</span>
              ) : novedad ? (
                novedad.nota
              ) : (
                <span className="text-muted-foreground">Esta novedad no tiene una nota registrada.</span>
              )}
            </div>
            {novedad && (
              <span className="text-xs text-muted-foreground">{formatearFechaHoraCompleta(novedad.creadoEn, codigoPais)}</span>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <BotonCrear puede enviando={pending} etiqueta="Resuelto" etiquetaEnviando="Resolviendo..." alPulsarSinCompletar={() => {}} />
          <Button type="button" variant="secondary" onClick={alCancelar} disabled={pending}>
            Cancelar
          </Button>
        </form>
      </Seccion>
    </div>
  );
}
