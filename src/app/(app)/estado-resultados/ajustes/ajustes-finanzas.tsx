"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cambiarAjusteFinanzas } from "./actions";

export interface AjusteVista {
  clave: string;
  nombre: string;
  activo: boolean;
  /** «18 oct 2026 · Majo», o null si nunca se cambió. */
  ultimoCambio: string | null;
  /** Lo que pasa al cambiarlo (se muestra al confirmar). */
  efectoAlEncender: string;
  efectoAlApagar: string;
}

function Ajuste({ ajuste, puedeEscribir }: { ajuste: AjusteVista; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  const nuevo = !ajuste.activo;
  const idTitulo = `ajuste-${ajuste.clave}`;

  function aplicar() {
    empezar(async () => {
      const r = await cambiarAjusteFinanzas(ajuste.clave, nuevo).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(`${ajuste.nombre}: ${nuevo ? "encendido" : "apagado"}`);
        setConfirmar(false);
        router.refresh();
      }
    });
  }

  return (
    <li className="flex flex-col gap-3 border-t border-border p-4 first:border-t-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={idTitulo} className="text-sm font-medium">{ajuste.nombre}</h3>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ajuste.activo ? "bg-success" : "bg-muted-foreground"}`} />
              {ajuste.activo ? "Encendido" : "Apagado"}
            </span>
            {ajuste.ultimoCambio && <span>· {ajuste.ultimoCambio}</span>}
          </p>
        </div>
        {puedeEscribir && (
          <button
            type="button"
            role="switch"
            aria-checked={ajuste.activo}
            aria-labelledby={idTitulo}
            disabled={pendiente}
            onClick={() => setConfirmar((v) => !v)}
            className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${anilloFoco} ${
              ajuste.activo ? "border-primario bg-primario" : "border-border-control bg-muted"
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${ajuste.activo ? "left-[1.1rem] bg-background" : "left-0.5 bg-muted-foreground"}`}
            />
          </button>
        )}
      </div>

      {confirmar && (
        <div role="group" aria-label={`Confirmar: ${nuevo ? "encender" : "apagar"} ${ajuste.nombre}`} className="flex flex-col gap-3 rounded-lg border border-border p-3 text-sm">
          <p className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
            <span>{nuevo ? ajuste.efectoAlEncender : ajuste.efectoAlApagar}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={aplicar} disabled={pendiente}>
              {pendiente ? "Guardando…" : nuevo ? "Encender" : "Apagar"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirmar(false)} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function AjustesFinanzas({ ajustes, puedeEscribir }: { ajustes: AjusteVista[]; puedeEscribir: boolean }) {
  return (
    <ul className="m-0 list-none p-0">
      {ajustes.map((a) => (
        <Ajuste key={a.clave} ajuste={a} puedeEscribir={puedeEscribir} />
      ))}
    </ul>
  );
}
