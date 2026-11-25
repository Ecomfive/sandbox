import { dolares } from "@/lib/meta-ads/metricas";
import type { GuiaDeTope } from "@/lib/meta-ads/limite";

/** El aviso en una línea, para tarjetas y filas: por qué el tope es más bajo y desde cuánto vigilar y apagar. */
export function GuiaEnLinea({ guia, className = "" }: { guia: GuiaDeTope; className?: string }) {
  return (
    <span className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs ${className}`}>
      <span className="rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">{guia.causa}</span>
      <span className="tabular-nums">
        Vigilar desde <span className="font-semibold">{dolares(guia.vigilar)}</span> · apagar desde <span className="font-semibold text-destructive">{dolares(guia.apagar)}</span>
        <span className="sr-only">
          {" "}
          de CPA, porque {guia.motivo}.
        </span>
      </span>
    </span>
  );
}

/** El aviso completo, para una ficha: el motivo y los dos puntos (desde cuándo vigilar y desde cuándo apagar), comparados con los del tope general. */
export function AvisoDeTope({ guia }: { guia: GuiaDeTope }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">{guia.causa}</span>
        <span>
          Este producto {guia.motivo}: su CPA tope es <span className="font-semibold tabular-nums">{dolares(guia.tope)}</span>.
        </span>
      </p>
      <dl className="m-0 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-warning-soft px-3 py-2">
          <dt className="text-xs font-medium text-warning">Empezar a vigilarlo desde</dt>
          <dd className="m-0 text-lg font-semibold tabular-nums">{dolares(guia.vigilar)}</dd>
          <dd className="m-0 text-xs text-muted-foreground">con el tope general sería {dolares(guia.vigilarGeneral)}</dd>
        </div>
        <div className="rounded-md bg-destructive-soft px-3 py-2">
          <dt className="text-xs font-medium text-destructive">Apagarlo desde</dt>
          <dd className="m-0 text-lg font-semibold tabular-nums">{dolares(guia.apagar)}</dd>
          <dd className="m-0 text-xs text-muted-foreground">si en 4 días no baja; con el general sería {dolares(guia.apagarGeneral)}</dd>
        </div>
      </dl>
    </div>
  );
}
