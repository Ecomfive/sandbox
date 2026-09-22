"use client";

import { useState, useTransition } from "react";
import { agregarNovedadRetiro } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { AlertaIcon } from "@/lib/nav-icons";

/** Cuántos caracteres admite la nota — igual que en el servidor (`agregarNovedadRetiro`). */
const MAX_NOVEDAD = 500;

/**
 * La nota de una novedad, al final de la ficha de un retiro abierto (el botón «Novedad» de la fila de acciones lo
 * despliega y lleva hasta aquí). **La nota no es obligatoria**: creación rápida, se puede marcar la novedad sin
 * escribir nada y agregarla después (o corregirla) desde «Ver novedad» — sus campos son editables, no quedan
 * bloqueados (`SeccionResolverNovedad`). Al agregarla el retiro pasa a «novedad» y la nota (si la hay) queda en su
 * historial; entonces aparece «Ver novedad» en el lugar de este botón.
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
              maxLength={MAX_NOVEDAD}
              placeholder="Ej: El banco devolvió la transferencia por número de cuenta incorrecto"
              className={`${fieldClass} w-full resize-y`}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Agregando..." : "Agregar novedad"}
          </Button>
          <Button type="button" variant="secondary" onClick={alCancelar} disabled={pending}>
            Cancelar
          </Button>
        </form>
      </Seccion>
    </div>
  );
}
