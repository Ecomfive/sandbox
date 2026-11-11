"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TextoManual } from "@/app/(app)/ayuda/manuales/texto-manual";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { mesMedio } from "@/lib/af4/fecha";
import { MAX_NOTA } from "@/lib/finanzas/notas";
import { guardarNotaMes } from "@/lib/finanzas/notas-actions";

/**
 * Las notas a los estados financieros de un mes (`fin_notas_mes`): se leen en el EERR, el balance y el informe, y se
 * escriben aquí mismo con el formato simple de los manuales («## título», «- punto», «1. paso»), nunca HTML.
 */
export function NotasMes({
  id,
  periodo,
  texto,
  puedeEscribir,
  faltaMigracion = false,
}: {
  id: string;
  periodo: string;
  texto: string;
  puedeEscribir: boolean;
  faltaMigracion?: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(texto);
  const [pendiente, iniciar] = useTransition();
  const idCampo = `${id}-campo`;

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarNotaMes(periodo, borrador).catch(() => ({ error: "No se pudo guardar la nota." }));
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("Notas guardadas");
        setEditando(false);
        router.refresh();
      }
    });

  const accion =
    puedeEscribir && !faltaMigracion && !editando ? (
      <button
        type="button"
        onClick={() => {
          setBorrador(texto);
          setEditando(true);
        }}
        className={`${claseAccionAF4} h-7 ${anilloFoco}`}
      >
        {texto ? "Editar notas" : "Escribir notas"}
      </button>
    ) : undefined;

  return (
    <MarcoAF4 id={id} titulo="Notas a los estados financieros" detalle={mesMedio(periodo)} accion={accion}>
      {editando ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={idCampo} className="sr-only">
            Notas de {mesMedio(periodo)}
          </label>
          <textarea
            id={idCampo}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            rows={10}
            maxLength={MAX_NOTA}
            placeholder={"Ej: ## Ventas\n- Bajaron por la temporada\n1. Revisar el inventario"}
            className={`${fieldClass} w-full font-mono text-[13px]`}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pendiente} onClick={guardar} className={`rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50 ${anilloFoco}`}>
              {pendiente ? "Guardando…" : "Guardar notas"}
            </button>
            <button type="button" disabled={pendiente} onClick={() => setEditando(false)} className={`${claseAccionAF4} ${anilloFoco}`}>
              Cancelar
            </button>
          </div>
        </div>
      ) : texto ? (
        <TextoManual texto={texto} />
      ) : (
        <p className="text-sm text-muted-foreground">{faltaMigracion ? "Falta correr la migración 0929." : `Sin notas de ${mesMedio(periodo)}.`}</p>
      )}
    </MarcoAF4>
  );
}
