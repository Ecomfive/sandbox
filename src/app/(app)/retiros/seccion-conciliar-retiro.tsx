"use client";

import { useState, useTransition } from "react";
import { conciliarRetiro } from "./actions";
import { AvisoFaltante, BotonCrear } from "@/components/ui/boton-crear";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useFaltantes } from "@/components/ui/usar-faltantes";
import { formatearMoneda } from "@/lib/formato";
import { ConciliarIcon } from "@/lib/nav-icons";

/**
 * Lo que se pide para conciliar un retiro, al final de su ficha (el botón «Conciliar» lleva hasta aquí; ya no se abre
 * una ventana en el medio). Lo demás (plataforma, cuenta destino, montos, fechas) ya está en la ficha.
 *  - **Recibido** (obligatorio): lo que llegó de verdad. Se compara con «A recibir»; si se aleja más de lo tolerado, el
 *    servidor no concilia y lo dice (`conciliarRetiro`).
 *  - **ID / Referencia** y **Soporte** (comprobante, imagen o PDF): opcionales; el soporte ya guardado se conserva si no
 *    se sube otro.
 * El botón grande de abajo sigue la misma regla que los de crear (`useFaltantes`): apagado mientras falte el recibido y,
 * al pulsarlo así, lleva a ese campo. Al conciliar el retiro queda cerrado y consolidado.
 */
export function SeccionConciliarRetiro({
  id,
  paisId,
  codigoPais,
  aRecibir,
  soporteNumero,
  montoRecibido,
  alCancelar,
  alConciliado,
}: {
  id: string;
  paisId: string;
  codigoPais: string;
  /** Lo esperado (monto menos comisión): se muestra para comparar con lo recibido. */
  aRecibir: number;
  soporteNumero: string | null;
  montoRecibido: number | null;
  alCancelar: () => void;
  alConciliado: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
  const idRecibido = `campo-recibido-${id}`;

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const resultado = await conciliarRetiro(formData).catch(() => ({ error: "No se pudo conciliar. Inténtalo de nuevo." }));
      if (resultado?.error) setError(resultado.error);
      else alConciliado();
    });
  }

  return (
    <div id={`panel-retiro-${id}`} className="scroll-mt-40 border-t border-border p-4">
      <Seccion icono={ConciliarIcon} titulo="Conciliar retiro">
        <form
          ref={formRef}
          onSubmit={alEnviar}
          onInput={revisar}
          onChange={revisar}
          aria-busy={pending}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="pais_id" value={paisId} />

          <div className="flex flex-col gap-0.5">
            <span className={labelClassSm}>A recibir</span>
            <span className="text-sm font-semibold tabular-nums">{formatearMoneda(aRecibir, codigoPais)}</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClassSm} htmlFor={idRecibido}>
              Recibido
              <span aria-hidden="true" className="text-destructive"> *</span>
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                id={idRecibido}
                type="number"
                step="0.01"
                min="0"
                name="monto_recibido"
                required
                aria-invalid={faltante === idRecibido || undefined}
                defaultValue={montoRecibido ?? ""}
                placeholder="Ej: 1500.00"
                className={`${fieldClass} w-full min-w-0 tabular-nums`}
              />
            </div>
            <AvisoFaltante id={idRecibido} faltante={faltante} />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClassSm} htmlFor={`campo-referencia-${id}`}>
              ID / Referencia
            </label>
            <input
              id={`campo-referencia-${id}`}
              type="text"
              name="soporte_numero"
              defaultValue={soporteNumero ?? ""}
              placeholder="Ej: 4839201756"
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClassSm} htmlFor={`campo-soporte-${id}`}>
              Soporte
            </label>
            <input id={`campo-soporte-${id}`} type="file" name="comprobante" accept="image/*,application/pdf" className="text-sm" />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <BotonCrear
            puede={completo}
            enviando={pending}
            etiqueta="Conciliar retiro"
            etiquetaEnviando="Conciliando..."
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
