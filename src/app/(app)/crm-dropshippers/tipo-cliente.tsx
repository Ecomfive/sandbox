"use client";

import { useRef, useState } from "react";
import { claseOpcionPanel, PanelCelda } from "@/app/(app)/compras/panel-celda";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cambiarTipoCliente } from "./tareas/actions";
import { NIVELES, etiquetaNivel } from "./def-crm";

/** El color de cada tipo: Rookie azul claro, VIP dorado y Black negro (los rellenos salen de los tokens: en el tema oscuro se invierten). */
const CLASE: Record<string, string> = {
  regular: "bg-azul-soft text-azul",
  vip: "bg-warning-soft text-warning",
  black: "bg-foreground text-background",
};

/** Cuándo pasa a cada tipo, en pedidos al mes (promedio de los últimos 3 meses): lo mismo que `crm_recalcular_tipo_cliente` (migración 0196). */
const DESDE: Record<string, string> = { regular: "menos de 500 al mes", vip: "desde 500 al mes", black: "desde 1 000 al mes" };

/** La pastilla del tipo de cliente («VIP», «BLACK»), solo para ver. Un ROOKIE no lleva pastilla en las listas (`soloDestacados`). */
export function PastillaTipo({ nivel, soloDestacados = false }: { nivel: string | null | undefined; soloDestacados?: boolean }) {
  const n = nivel ?? "regular";
  if (soloDestacados && n !== "vip" && n !== "black") return null;
  return <span className={`inline-flex flex-none items-center rounded-full px-1.5 py-px text-[10.5px] font-bold tracking-wide uppercase ${CLASE[n] ?? CLASE.regular}`}>{etiquetaNivel(n)}</span>;
}

const cifra = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });

/**
 * «Tipo de cliente» (29 oct 2026, pedido de Alcides), como una etiqueta: ROOKIE, VIP o BLACK. **Se calcula solo** con el promedio de pedidos al mes de
 * los últimos 3 meses (menos de 500, desde 500, desde 1 000; migración 0196). Al pulsar la pastilla se ve el promedio y se puede fijar a mano (el
 * cálculo ya no lo toca) o volver a «Automático». Queda en la Actividad. Sin permiso, solo se ve.
 */
export function TipoCliente({
  dropshipperId,
  nivel,
  manual,
  promedio,
  puede,
  alCambiar,
}: {
  dropshipperId: string;
  nivel: string;
  manual: boolean;
  promedio: number | null;
  puede: boolean;
  alCambiar?: (nivel: string) => void;
}) {
  const { mostrarToast } = useToast();
  const [actual, setActual] = useState({ nivel, manual });
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  function elegir(nuevo: string) {
    setAbierto(false);
    if (nuevo === "auto" ? !actual.manual : actual.manual && nuevo === actual.nivel) return;
    const antes = actual;
    if (nuevo !== "auto") setActual({ nivel: nuevo, manual: true });
    void cambiarTipoCliente(dropshipperId, nuevo)
      .then((r) => {
        if ("error" in r) {
          setActual(antes);
          mostrarToast(r.error, "destructive");
        } else {
          setActual({ nivel: r.nivel, manual: r.manual });
          alCambiar?.(r.nivel);
        }
      })
      .catch(() => {
        setActual(antes);
        mostrarToast("No se pudo cambiar el tipo de cliente.", "destructive");
      });
  }

  if (!puede) return <PastillaTipo nivel={actual.nivel} />;
  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={`Tipo de cliente: ${etiquetaNivel(actual.nivel)}${actual.manual ? ", fijado a mano" : ", automático"}. Cambiar`}
        onClick={() => setAbierto((x) => !x)}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold tracking-wide uppercase ${CLASE[actual.nivel] ?? CLASE.regular} ${anilloFoco}`}
      >
        {etiquetaNivel(actual.nivel)}
        {actual.manual && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {abierto && (
        <PanelCelda ancla={boton} etiqueta="Tipo de cliente" ancho={260} alCerrar={(m) => (setAbierto(false), m === "escape" && boton.current?.focus())}>
          <p className="m-0 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            Promedio de los últimos 3 meses: <strong className="text-foreground tabular-nums">{promedio === null ? "sin datos" : `${cifra(promedio)} pedidos al mes`}</strong>
          </p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-1.5">
            <li>
              <button type="button" role="menuitemradio" aria-checked={!actual.manual} onClick={() => elegir("auto")} className={`${claseOpcionPanel} hover:bg-muted ${anilloFoco}`}>
                <span className="flex flex-col">
                  <span className="font-medium">Automático</span>
                  <span className="text-xs text-muted-foreground">Según el promedio de pedidos</span>
                </span>
                {!actual.manual && <span className="text-xs text-primario">✓</span>}
              </button>
            </li>
            <li className="px-2 pt-1.5 pb-0.5 text-xs text-muted-foreground">Fijar a mano</li>
            {NIVELES.map((n) => (
              <li key={n.valor}>
                <button type="button" role="menuitemradio" aria-checked={actual.manual && actual.nivel === n.valor} onClick={() => elegir(n.valor)} className={`${claseOpcionPanel} hover:bg-muted ${anilloFoco}`}>
                  <span className="flex items-center gap-2">
                    <PastillaTipo nivel={n.valor} />
                    <span className="text-xs text-muted-foreground">{DESDE[n.valor]}</span>
                  </span>
                  {actual.manual && actual.nivel === n.valor && <span className="text-xs text-primario">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </PanelCelda>
      )}
    </>
  );
}
