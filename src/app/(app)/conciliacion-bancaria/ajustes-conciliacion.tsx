"use client";

import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { guardarAjustesConciliacion } from "./actions";

/**
 * Los dos ajustes de la conciliación (migración 0986): hasta cuántos centavos de diferencia con el libro se ajustan solos
 * al confirmar y a los cuántos días sin conciliar una cuenta sale como atrasada.
 */
export function AjustesConciliacion({ toleranciaCent, diasAlerta }: { toleranciaCent: number; diasAlerta: number }) {
  const { mostrarToast } = useToast();
  const [tope, setTope] = useState((toleranciaCent / 100).toFixed(2));
  const [dias, setDias] = useState(String(diasAlerta));
  const [pendiente, empezar] = useTransition();
  const cambio = tope !== (toleranciaCent / 100).toFixed(2) || dias !== String(diasAlerta);
  return (
    <form
      className="flex flex-wrap items-end gap-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        empezar(async () => {
          const r = await guardarAjustesConciliacion(tope, dias).catch(() => ({ error: "Se cortó la conexión." }));
          mostrarToast("error" in r ? r.error : "Ajustes guardados", "error" in r ? "destructive" : "success");
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Diferencia que se ajusta sola (USD)</span>
        <input inputMode="decimal" value={tope} onChange={(e) => setTope(e.target.value)} className={`${fieldClassSm} w-24 text-right ${claseCifra}`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Aviso a los días sin conciliar</span>
        <input inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} className={`${fieldClassSm} w-20 text-right ${claseCifra}`} />
      </label>
      {cambio && (
        <button type="submit" disabled={pendiente} className={`h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      )}
    </form>
  );
}
