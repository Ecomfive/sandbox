"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { CerrarIcon } from "@/lib/nav-icons";
import type { FilaLinea } from "@/lib/conciliacion/cargar";
import { entero } from "@/lib/af4/formato";
import { confirmarPropuestas, crearEnLibro, ignorarLineas, reabrirLineas, registrarIngresos } from "./actions";

const botonBarra = `inline-flex min-h-8 items-center gap-1.5 !rounded-md border border-border bg-card px-2.5 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`;

/**
 * La barra de las líneas marcadas (fija abajo): confirmar la propuesta de cada una (o solo las de Deliverys), crear en el
 * libro lo que falta, registrar el ingreso de lo cobrado en su cuenta, ignorar con un motivo o volver a pendiente. Cada
 * botón dice a cuántas de las marcadas aplica.
 */
export function BarraLote({ marcadas, quitar, puedeCrear }: { marcadas: FilaLinea[]; quitar: () => void; puedeCrear: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const [ignorando, setIgnorando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const sugeridas = marcadas.filter((l) => l.estadoClave === "sugerida");
  const deDeliverys = sugeridas.filter((l) => l.fuente === "Deliverys");
  const paraIngreso = marcadas.filter((l) => l.ingreso === "disponible");
  const abiertas = marcadas.filter((l) => l.estadoClave === "pendiente" || l.estadoClave === "sugerida");
  const cerradas = marcadas.filter((l) => l.estadoClave === "conciliada" || l.estadoClave === "ignorada");

  function hacer<T extends { ok: true }>(accion: () => Promise<{ error: string } | T>, mensaje: (r: T) => string) {
    iniciar(async () => {
      const r = await accion().catch(() => ({ error: "No se pudo completar. Inténtalo de nuevo." }) as const);
      if ("error" in r) {
        mostrarToast(r.error, "destructive");
        return;
      }
      mostrarToast(mensaje(r));
      quitar();
      setIgnorando(false);
      setMotivo("");
      router.refresh();
    });
  }

  const n = entero;

  return (
    <div
      role="region"
      aria-label="Líneas seleccionadas"
      className="sticky bottom-24 z-30 mx-auto my-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-control bg-card px-3 py-2 text-sm shadow-lg"
    >
      <p role="status" className="m-0 font-medium tabular-nums">
        {n(marcadas.length)} {marcadas.length === 1 ? "seleccionada" : "seleccionadas"}
      </p>
      <span className="h-5 w-px bg-border" aria-hidden="true" />
      {ignorando ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            hacer(() => ignorarLineas(abiertas.map((l) => l.id), motivo), (r) => `${n(r.ignoradas)} ignoradas`);
          }}
        >
          <input
            data-enfocar
            autoFocus
            aria-label="Motivo para ignorar"
            placeholder="Ej: traspaso entre cuentas propias"
            maxLength={200}
            required
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className={`${fieldClassSm} w-64`}
            disabled={pendiente}
          />
          <button type="submit" className={botonBarra} disabled={pendiente || !motivo.trim()}>
            Ignorar ({abiertas.length})
          </button>
          <button type="button" className={botonBarra} onClick={() => setIgnorando(false)} disabled={pendiente}>
            Cancelar
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            className={botonBarra}
            disabled={pendiente || !sugeridas.length}
            onClick={() => hacer(() => confirmarPropuestas(sugeridas.map((l) => ({ lineaId: l.id }))), (r) => `${n(r.confirmadas)} conciliadas`)}
          >
            Confirmar sugerencias ({sugeridas.length})
          </button>
          {deDeliverys.length > 0 && (
            <button
              type="button"
              className={botonBarra}
              disabled={pendiente}
              onClick={() => hacer(() => confirmarPropuestas(deDeliverys.map((l) => ({ lineaId: l.id }))), (r) => `${n(r.confirmadas)} de Deliverys conciliadas`)}
            >
              Confirmar deliverys ({deDeliverys.length})
            </button>
          )}
          {puedeCrear && paraIngreso.length > 0 && (
            <button
              type="button"
              className={botonBarra}
              disabled={pendiente}
              onClick={() => hacer(() => registrarIngresos(paraIngreso.map((l) => l.id)), (r) => `${n(r.registradas)} ingresos registrados en su cuenta`)}
            >
              Registrar ingreso ({paraIngreso.length})
            </button>
          )}
          {puedeCrear && (
            <button
              type="button"
              className={botonBarra}
              disabled={pendiente || !abiertas.length}
              onClick={() => hacer(() => crearEnLibro(abiertas.map((l) => l.id)), (r) => `${n(r.creados)} movimientos creados en el libro`)}
            >
              Crear en el libro ({abiertas.length})
            </button>
          )}
          <button type="button" className={botonBarra} disabled={pendiente || !abiertas.length} onClick={() => setIgnorando(true)}>
            Ignorar ({abiertas.length})
          </button>
          <button
            type="button"
            className={botonBarra}
            disabled={pendiente || !cerradas.length}
            onClick={() => hacer(() => reabrirLineas(cerradas.map((l) => l.id)), (r) => `${n(r.reabiertas)} vuelven a pendiente`)}
          >
            Volver a pendiente ({cerradas.length})
          </button>
        </>
      )}
      {pendiente && <span className="text-muted-foreground">Guardando…</span>}
      <Tooltip texto="Quitar selección">
        <button type="button" onClick={quitar} aria-label="Quitar la selección" className={`flex min-h-8 min-w-8 items-center justify-center !rounded-md text-muted-foreground hover:bg-muted ${anilloFoco}`}>
          <CerrarIcon className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}
