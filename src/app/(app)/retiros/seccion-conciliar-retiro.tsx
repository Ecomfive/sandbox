"use client";

import { useState, useTransition } from "react";
import { conciliarRetiro } from "./actions";
import { BotonAdjuntar } from "@/components/ui/boton-adjuntar";
import { AvisoFaltante, BotonCrear } from "@/components/ui/boton-crear";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useFaltantes } from "@/components/ui/usar-faltantes";
import { formatearMoneda } from "@/lib/formato";
import { ConciliarIcon } from "@/lib/nav-icons";

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Lo que se pide para conciliar un retiro, al final de su ficha (el botón «Conciliar» lleva hasta aquí; ya no se abre
 * una ventana en el medio). Lo demás (plataforma, cuenta destino, montos, fechas) ya está en la ficha. **Recibido**,
 * **Fecha de recibido** e **ID / Referencia** son obligatorios:
 *  - **Recibido**: lo que llegó de verdad. Se compara con «A recibir»; si se aleja más de lo tolerado, el servidor no
 *    concilia y lo dice (`conciliarRetiro`).
 *  - **Fecha de recibido**: cuándo llegó de verdad el dinero al banco — arranca en hoy, pero se puede cambiar a mano
 *    al validarlo contra el banco (puede ser otro día que cuando se hace la conciliación). Distinta de la fecha de
 *    consolidado (`fecha_cierre`, siempre hoy, la pone el servidor): esa es cuándo se concilió el retiro en el
 *    sistema, no cuándo llegó el dinero.
 *  - **ID / Referencia**: el número de la transferencia.
 * **Soporte** (comprobante, imagen o PDF) es opcional: se adjunta con un botón que es solo un ícono, sin texto
 * (`BotonAdjuntar`), pero no bloquea conciliar si no se adjunta uno.
 * El botón grande de abajo sigue la misma regla que los de crear (`useFaltantes`): apagado mientras falte algo
 * obligatorio y, al pulsarlo así, lleva al primero que falta. Al conciliar el retiro queda cerrado y consolidado.
 */
export function SeccionConciliarRetiro({
  id,
  paisId,
  codigoPais,
  aRecibir,
  soporteNumero,
  montoRecibido,
  fechaRecibido,
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
  fechaRecibido: string | null;
  alCancelar: () => void;
  alConciliado: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
  const idRecibido = `campo-recibido-${id}`;
  const idFechaRecibido = `campo-fecha-recibido-${id}`;
  const idReferencia = `campo-referencia-${id}`;
  const idSoporte = `campo-soporte-${id}`;

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
            <label className={labelClassSm} htmlFor={idFechaRecibido}>
              Fecha de recibido
              <span aria-hidden="true" className="text-destructive"> *</span>
            </label>
            <input
              id={idFechaRecibido}
              type="date"
              name="fecha_recibido"
              required
              aria-invalid={faltante === idFechaRecibido || undefined}
              defaultValue={fechaRecibido ?? hoy()}
              className={`${fieldClass} w-full min-w-0`}
            />
            <AvisoFaltante id={idFechaRecibido} faltante={faltante} />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClassSm} htmlFor={idReferencia}>
              ID / Referencia
              <span aria-hidden="true" className="text-destructive"> *</span>
            </label>
            <input
              id={idReferencia}
              type="text"
              name="soporte_numero"
              required
              aria-invalid={faltante === idReferencia || undefined}
              defaultValue={soporteNumero ?? ""}
              placeholder="Ej: 4839201756"
              className={fieldClass}
            />
            <AvisoFaltante id={idReferencia} faltante={faltante} />
          </div>

          {/* El soporte se adjunta con solo un ícono (sin texto): imagen o PDF. Opcional. */}
          <div className="flex flex-col gap-1">
            <BotonAdjuntar id={idSoporte} name="comprobante" accept="image/*,application/pdf" nombreAccesible="Adjuntar soporte" />
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
