"use client";

import { useState, useTransition } from "react";
import { agregarNovedadRetiro } from "./actions";
import { BotonCrear } from "@/components/ui/boton-crear";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { AlertaIcon } from "@/lib/nav-icons";

/**
 * La nota de una novedad, al final de la ficha de un retiro abierto (el botón «Novedad» de la fila de acciones lo
 * despliega y lleva hasta aquí). Al agregarla el retiro pasa a «novedad» y, si se escribió algo, la nota queda en su
 * historial; entonces aparece «Abrir», como en cualquier retiro con novedad. La nota es opcional: se puede marcar la
 * novedad sin escribirla (`SeccionResolverNovedad` avisa cuando no hay una).
 */
export function SeccionNovedadRetiro({
  id,
  alCancelar,
  alAgregada,
}: {
  id: string;
  alCancelar: () => void;
  alAgregada: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const idNota = `campo-novedad-${id}`;

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const resultado = await agregarNovedadRetiro(formData).catch(() => ({ error: "No se pudo agregar la novedad. Inténtalo de nuevo." }));
      if (resultado?.error) setError(resultado.error);
      else alAgregada();
    });
  }

  return (
    <div id={`panel-retiro-${id}`} className="scroll-mt-40 border-t border-border p-4">
      <Seccion icono={AlertaIcon} titulo="Novedad">
        <form onSubmit={alEnviar} aria-busy={pending} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />

          <div className="flex flex-col gap-1">
            <label className={labelClassSm} htmlFor={idNota}>
              Nota de la novedad
            </label>
            <textarea
              id={idNota}
              name="novedad"
              rows={4}
              maxLength={500}
              placeholder="Ej: El banco devolvió la transferencia por número de cuenta incorrecto"
              className={`${fieldClass} w-full resize-y`}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <BotonCrear puede enviando={pending} etiqueta="Agregar novedad" etiquetaEnviando="Agregando..." alPulsarSinCompletar={() => {}} />
          <Button type="button" variant="secondary" onClick={alCancelar} disabled={pending}>
            Cancelar
          </Button>
        </form>
      </Seccion>
    </div>
  );
}
