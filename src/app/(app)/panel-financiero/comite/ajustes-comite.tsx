"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ClaveIndicador } from "@/lib/finanzas/comite";
import { guardarConfigComite, guardarTechoPauta } from "./actions";

export interface IndicadorAjuste {
  clave: ClaveIndicador;
  etiqueta: string;
  /** «%», «días» o «día». */
  unidad: string;
  meta: number;
  partida: number | null;
  conPartida: boolean;
}

export interface TiendaAjuste {
  id: string;
  nombre: string;
  propia: boolean;
  /** Techo propio (null = usa el general). */
  techo: number | null;
}

function AvisoError({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="flex items-center gap-2 text-sm">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
      {texto}
    </p>
  );
}

/** Un formulario que solo muestra Guardar y Descartar con cambios; Descartar vuelve a montar los campos. */
function FormularioAjuste({
  accion,
  exito,
  children,
}: {
  accion: (datos: FormData) => Promise<{ error?: string }>;
  exito: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [cambiado, setCambiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    empezar(async () => {
      const r = await accion(datos).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) {
        setError(r.error);
        mostrarToast(r.error, "destructive");
      } else {
        setError(null);
        setCambiado(false);
        mostrarToast(exito);
        router.refresh();
      }
    });
  };
  return (
    <form key={version} onSubmit={enviar} onChange={() => setCambiado(true)} onInput={() => setCambiado(true)} className="flex flex-col gap-4">
      {children}
      <AvisoError texto={error} />
      {cambiado && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pendiente}
            onClick={() => {
              setCambiado(false);
              setError(null);
              setVersion((v) => v + 1);
            }}
          >
            Descartar
          </Button>
        </div>
      )}
    </form>
  );
}

/** Metas a 6 meses, valor de partida y qué tiendas cuentan como propias. */
export function MetasComite({ indicadores, tiendas }: { indicadores: IndicadorAjuste[]; tiendas: TiendaAjuste[] }) {
  return (
    <FormularioAjuste accion={guardarConfigComite} exito="Metas guardadas">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">Meta y valor de partida de cada indicador</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1 pr-3 font-medium">
                Indicador
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Meta a 6 meses
              </th>
              <th scope="col" className="py-1 font-medium">
                Valor de partida
              </th>
            </tr>
          </thead>
          <tbody>
            {indicadores.map((d) => (
              <tr key={d.clave} className="border-t border-border">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {d.etiqueta} <span className="font-normal text-muted-foreground">({d.unidad})</span>
                </th>
                <td className="py-2 pr-3">
                  <input
                    name={`meta:${d.clave}`}
                    aria-label={`Meta de ${d.etiqueta}`}
                    type="text"
                    inputMode="decimal"
                    required
                    defaultValue={String(d.meta)}
                    placeholder="Ej: 28"
                    className={`${fieldClass} w-28 tabular-nums`}
                  />
                </td>
                <td className="py-2">
                  {d.conPartida ? (
                    <input
                      name={`partida:${d.clave}`}
                      aria-label={`Valor de partida de ${d.etiqueta}`}
                      type="text"
                      inputMode="decimal"
                      defaultValue={d.partida === null ? "" : String(d.partida)}
                      placeholder="Ej: 15"
                      className={`${fieldClass} w-28 tabular-nums`}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Tiendas propias (las que hacen pauta)</legend>
        <input type="hidden" name="tiendas_elegidas" value="1" />
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {tiendas.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="tienda" value={t.id} defaultChecked={t.propia} className="h-4 w-4 accent-foreground" />
              {t.nombre}
            </label>
          ))}
        </div>
      </fieldset>
    </FormularioAjuste>
  );
}

/** El techo de pauta general y el propio de cada tienda (vacío = el general). */
export function TechoPautaAjuste({ general, tiendas }: { general: number; tiendas: TiendaAjuste[] }) {
  return (
    <FormularioAjuste accion={guardarTechoPauta} exito="Techo de pauta guardado">
      <label className="flex max-w-xs flex-col gap-1">
        <span className={labelClass}>Techo general (% de las ventas)</span>
        <input name="general" type="text" inputMode="decimal" required defaultValue={String(general)} placeholder="Ej: 22" className={`${fieldClass} tabular-nums`} />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiendas
          .filter((t) => t.propia)
          .map((t) => (
            <label key={t.id} className="flex flex-col gap-1">
              <span className={labelClass}>{t.nombre}</span>
              <input
                name={`tienda:${t.id}`}
                type="text"
                inputMode="decimal"
                defaultValue={t.techo === null ? "" : String(t.techo)}
                placeholder={`Ej: ${general}`}
                className={`${fieldClass} tabular-nums`}
              />
            </label>
          ))}
      </div>
    </FormularioAjuste>
  );
}
