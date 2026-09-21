"use client";

import { useState, useTransition } from "react";
import { agregarNovedadRetiro } from "./actions";
import { AvisoFaltante, BotonCrear } from "@/components/ui/boton-crear";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useFaltantes } from "@/components/ui/usar-faltantes";
import { AlertaIcon } from "@/lib/nav-icons";

/**
 * La nota de una novedad, al final de la ficha de un retiro abierto (el botón «Novedad» de la fila de acciones lo
 * despliega y lleva hasta aquí). Al agregarla el retiro pasa a «novedad» y la nota queda en su historial; entonces
 * aparece «Abrir», como en cualquier retiro con novedad. Mismo patrón que crear: el botón grande está apagado hasta
 * escribir la nota y, al pulsarlo así, lleva al campo.
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
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
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
        <form
          ref={formRef}
          onSubmit={alEnviar}
          onInput={revisar}
          onChange={revisar}
          aria-busy={pending}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="id" value={id} />

          <div className="flex flex-col gap-1">
            <label className={labelClassSm} htmlFor={idNota}>
              Nota de la novedad
              <span aria-hidden="true" className="text-destructive"> *</span>
            </label>
            <textarea
              id={idNota}
              name="novedad"
              required
              rows={4}
              maxLength={500}
              aria-invalid={faltante === idNota || undefined}
              placeholder="Ej: El banco devolvió la transferencia por número de cuenta incorrecto"
              className={`${fieldClass} w-full resize-y`}
            />
            <AvisoFaltante id={idNota} faltante={faltante} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <BotonCrear
            puede={completo}
            enviando={pending}
            etiqueta="Agregar novedad"
            etiquetaEnviando="Agregando..."
            alPulsarSinCompletar={señalarFaltante}
          />
          <Button type="button" variant="secondary" onClick={alCancelar} disabled={pending}>
            Cancelar
          </Button>
        </form>
      </Seccion>
    </div>
  );
}
