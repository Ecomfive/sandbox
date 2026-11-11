"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { PapeleraIcon } from "@/lib/nav-icons";
import { cambiarActivoPrepago, eliminarAjuste, registrarDevengos, registrarProvisiones } from "./actions";

/** «Registrar» de las propuestas del mes (devengos o provisiones). */
export function RegistrarPropuestas({ periodo, que, pendientes }: { periodo: string; que: "devengos" | "provisiones"; pendientes: number }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={enviando || pendientes === 0}
        aria-busy={enviando}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = que === "devengos" ? await registrarDevengos(periodo) : await registrarProvisiones(periodo);
            if (r.error) return setError(r.error);
            mostrarToast(`${r.registrados ?? 0} ${(r.registrados ?? 0) === 1 ? "ajuste registrado" : "ajustes registrados"}`);
            router.refresh();
          });
        }}
        className={`h-8 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background disabled:opacity-50 ${anilloFoco}`}
      >
        {enviando ? "Registrando..." : pendientes ? `Registrar ${pendientes}` : "Todo registrado"}
      </button>
      {error && (
        <span role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
          <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          {error}
        </span>
      )}
    </span>
  );
}

/** Eliminar un ajuste, con confirmación en la misma celda. */
export function EliminarAjuste({ id, concepto }: { id: string; concepto: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  if (confirmar) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <button
          type="button"
          disabled={enviando}
          onClick={() =>
            startTransition(async () => {
              const r = await eliminarAjuste(id);
              if (r.error) {
                mostrarToast(r.error, "destructive");
                setConfirmar(false);
                return;
              }
              mostrarToast("Ajuste eliminado");
              router.refresh();
            })
          }
          className={`rounded-md bg-destructive px-2 py-1 font-medium text-white ${anilloFoco}`}
        >
          {enviando ? "Eliminando..." : "Eliminar"}
        </button>
        <button type="button" onClick={() => setConfirmar(false)} className={`rounded-md border border-border px-2 py-1 ${anilloFoco}`}>
          Cancelar
        </button>
      </span>
    );
  }
  return (
    <Tooltip texto="Eliminar ajuste">
      <button type="button" aria-label={`Eliminar el ajuste ${concepto}`} onClick={() => setConfirmar(true)} className={`rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}>
        <PapeleraIcon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

/** Activar o desactivar un gasto prepagado. */
export function InterruptorPrepago({ id, activo, concepto }: { id: string; activo: boolean; concepto: string }) {
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  return (
    <button
      type="button"
      aria-pressed={activo}
      aria-label={`${concepto}: ${activo ? "activo, pulsar para desactivar" : "inactivo, pulsar para activar"}`}
      disabled={enviando}
      onClick={() =>
        startTransition(async () => {
          const r = await cambiarActivoPrepago(id, !activo);
          if (r.error) return mostrarToast(r.error, "destructive");
          router.refresh();
        })
      }
      className={`rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted ${anilloFoco}`}
    >
      {activo ? "Activo" : "Inactivo"}
    </button>
  );
}
