"use client";

import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { TasaParte } from "@/lib/finanzas/cargar-prestamos-grupo";
import { guardarTasaFinancista } from "../grupo-actions";

const pct = (v: number | null) => (v === null ? "" : String(Math.round(v * 10_000) / 100));

function FilaTasa({ t, puedeEscribir }: { t: TasaParte; puedeEscribir: boolean }) {
  const [tasa, setTasa] = useState(pct(t.tasaCiclo));
  const [dias, setDias] = useState(t.diasCiclo ? String(t.diasCiclo) : "");
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const cambio = tasa !== pct(t.tasaCiclo) || dias !== (t.diasCiclo ? String(t.diasCiclo) : "");
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
      <span className="min-w-0 flex-1 font-medium">{t.nombre}</span>
      {puedeEscribir ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            empezar(async () => {
              const r = await guardarTasaFinancista(t.id, tasa, dias).catch(() => ({ error: "Se cortó la conexión." }));
              mostrarToast(r.error ?? "Tasa guardada", r.error ? "destructive" : "success");
            });
          }}
        >
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Tasa por ciclo</span>
            <input
              inputMode="decimal"
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
              placeholder="Ej: 20"
              aria-label={`Tasa por ciclo de ${t.nombre}, en porcentaje`}
              className={`${fieldClassSm} w-16 text-right ${claseCifra}`}
            />
            <span aria-hidden="true">%</span>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Días del ciclo</span>
            <input
              inputMode="numeric"
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              placeholder="Plazo"
              aria-label={`Días del ciclo de ${t.nombre}; vacío = el plazo de cada préstamo`}
              className={`${fieldClassSm} w-20 text-right ${claseCifra}`}
            />
          </label>
          {cambio && (
            <button type="submit" disabled={pendiente} className={`h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}>
              Guardar
            </button>
          )}
        </form>
      ) : (
        <span className={claseCifra}>
          {t.tasaCiclo === null ? "Sin tasa" : `${pct(t.tasaCiclo)} % por ciclo`}
          {t.diasCiclo ? ` · ${t.diasCiclo} días` : ""}
        </span>
      )}
    </li>
  );
}

/** La tasa de cada financista: la usa Compras y costos para estimar el costo de financiamiento de cada OC. */
export function TasasFinancistas({ tasas, puedeEscribir }: { tasas: TasaParte[]; puedeEscribir: boolean }) {
  if (!tasas.length) return <p className="px-4 py-6 text-sm text-muted-foreground">No hay financistas en las partes.</p>;
  return (
    <ul className="divide-y divide-border">
      {tasas.map((t) => (
        <FilaTasa key={t.id} t={t} puedeEscribir={puedeEscribir} />
      ))}
    </ul>
  );
}
