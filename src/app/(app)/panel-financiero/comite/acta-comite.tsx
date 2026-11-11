"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { fechaCorta, mesCorto } from "@/lib/af4/fecha";
import type { Decision } from "@/lib/finanzas/comite";
import { cambiarEstadoDecision, crearDecision, eliminarDecision, guardarSeguimiento } from "./actions";

/** Una decisión del acta: texto simple (nunca HTML), con su estado y, editable, el seguimiento. */
function FilaDecision({ d, puedeEditar, deOtroMes }: { d: Decision; puedeEditar: boolean; deOtroMes: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [seguimiento, setSeguimiento] = useState(d.seguimiento ?? "");
  const [confirmar, setConfirmar] = useState(false);
  const hecha = d.estado === "hecha";
  const correr = (fn: () => Promise<{ error?: string }>, exito: string) =>
    empezar(async () => {
      const r = await fn().catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(exito);
        router.refresh();
      }
    });
  return (
    <li className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-start gap-2 text-sm font-medium">
            <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${hecha ? "bg-success" : "bg-warning"}`} />
            <span className="whitespace-pre-line">{d.decision}</span>
          </p>
          <p className="pl-3.5 text-xs text-muted-foreground">
            {[
              hecha ? "Hecha" : "Pendiente",
              d.responsable ? `Responsable: ${d.responsable}` : null,
              d.fechaCompromiso ? `Para el ${fechaCorta(d.fechaCompromiso)}` : null,
              deOtroMes ? `Comité de ${mesCorto(d.periodo)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {puedeEditar && (
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button
              type="button"
              variant="secondary"
              disabled={pendiente}
              onClick={() => correr(() => cambiarEstadoDecision(d.id, hecha ? "pendiente" : "hecha"), hecha ? "Vuelve a pendiente" : "Marcada como hecha")}
            >
              {hecha ? "Volver a pendiente" : "Marcar hecha"}
            </Button>
            {confirmar ? (
              <>
                <Button type="button" variant="primary" disabled={pendiente} onClick={() => correr(() => eliminarDecision(d.id), "Decisión eliminada")}>
                  Confirmar
                </Button>
                <Button type="button" variant="secondary" disabled={pendiente} onClick={() => setConfirmar(false)}>
                  No eliminar
                </Button>
              </>
            ) : (
              <Button type="button" variant="secondary" disabled={pendiente} onClick={() => setConfirmar(true)}>
                Eliminar
              </Button>
            )}
          </div>
        )}
      </div>
      {puedeEditar ? (
        <div className="flex flex-wrap items-end gap-2 pl-3.5 print:hidden">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={labelClass}>Seguimiento</span>
            <textarea
              rows={2}
              maxLength={1000}
              value={seguimiento}
              placeholder="Ej: Se bajó el presupuesto diario; revisar el próximo comité"
              onChange={(e) => setSeguimiento(e.target.value)}
              className={`${fieldClass} min-h-[2.75rem]`}
            />
          </label>
          {seguimiento !== (d.seguimiento ?? "") && (
            <Button type="button" disabled={pendiente} onClick={() => correr(() => guardarSeguimiento(d.id, seguimiento), "Seguimiento guardado")}>
              Guardar
            </Button>
          )}
        </div>
      ) : null}
      {d.seguimiento && <p className={`pl-3.5 text-sm text-foreground-soft whitespace-pre-line ${puedeEditar ? "hidden print:block" : ""}`}>Seguimiento: {d.seguimiento}</p>}
    </li>
  );
}

/** El acta del comité: lo decidido en el mes y lo que sigue pendiente de comités anteriores. */
export function ActaComite({
  periodo,
  delMes,
  seguimiento,
  puedeEditar,
}: {
  periodo: string;
  delMes: Decision[];
  seguimiento: Decision[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="titulo-acta-mes" className="flex flex-col">
        <h3 id="titulo-acta-mes" className="text-xs font-semibold text-muted-foreground">
          Decisiones de {mesCorto(periodo)}
        </h3>
        {delMes.length ? (
          <ul>
            {delMes.map((d) => (
              <FilaDecision key={d.id} d={d} puedeEditar={puedeEditar} deOtroMes={false} />
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">Sin decisiones registradas</p>
        )}
      </section>
      {seguimiento.length > 0 && (
        <section aria-labelledby="titulo-acta-seguimiento" className="flex flex-col">
          <h3 id="titulo-acta-seguimiento" className="text-xs font-semibold text-muted-foreground">
            Pendientes de comités anteriores
          </h3>
          <ul>
            {seguimiento.map((d) => (
              <FilaDecision key={d.id} d={d} puedeEditar={puedeEditar} deOtroMes />
            ))}
          </ul>
        </section>
      )}
      {puedeEditar && (
        <form
          ref={formRef}
          className="flex flex-col gap-3 border-t border-border pt-4 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            const datos = new FormData(e.currentTarget);
            empezar(async () => {
              const r = await crearDecision(datos).catch(() => ({ error: "No se pudo guardar." }));
              if (r.error) {
                setError(r.error);
                mostrarToast(r.error, "destructive");
              } else {
                setError(null);
                setDecision("");
                formRef.current?.reset();
                mostrarToast("Decisión agregada");
                router.refresh();
              }
            });
          }}
        >
          <input type="hidden" name="periodo" value={periodo} />
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Decisión *</span>
            <textarea
              name="decision"
              rows={2}
              required
              maxLength={1000}
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              placeholder="Ej: Bajar la pauta de la tienda al 22 % antes de fin de mes"
              className={fieldClass}
            />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-48 flex-1 flex-col gap-1">
              <span className={labelClass}>Responsable</span>
              <input name="responsable" type="text" maxLength={120} placeholder="Ej: Marketing" className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Fecha comprometida</span>
              <input name="fecha_compromiso" type="date" className={fieldClass} />
            </label>
            <Button type="submit" disabled={pendiente || !decision.trim()}>
              {pendiente ? "Agregando…" : "Agregar decisión"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
