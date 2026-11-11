"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { guardarObligacion, marcarPresentada, quitarPresentada } from "./actions";

const botonBorde = `inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[13px] hover:bg-muted ${anilloFoco}`;
const botonOscuro = `rounded-md bg-foreground px-3 py-1 text-sm font-medium text-background disabled:opacity-50 ${anilloFoco}`;

function AvisoError({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
      <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
      {texto}
    </p>
  );
}

/** «Marcar presentada» (con fecha, referencia y monto) o «Quitar la marca» de una obligación y período. */
export function MarcaPresentada({ obligacionId, periodo, nombre, presentada, hoy }: { obligacionId: string; periodo: string; nombre: string; presentada: boolean; hoy: string }) {
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [referencia, setReferencia] = useState("");
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();

  if (presentada) {
    return (
      <button
        type="button"
        disabled={enviando}
        onClick={() =>
          startTransition(async () => {
            const r = await quitarPresentada(obligacionId, periodo);
            if (r.error) return mostrarToast(r.error, "destructive");
            mostrarToast("Marca quitada");
            router.refresh();
          })
        }
        className={botonBorde}
      >
        Quitar la marca<span className="sr-only">: {nombre}</span>
      </button>
    );
  }
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} aria-expanded={false} className={botonBorde}>
        Marcar presentada<span className="sr-only">: {nombre}</span>
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await marcarPresentada(obligacionId, periodo, fecha, referencia, monto);
          if (r.error) return setError(r.error);
          mostrarToast(`${nombre}: presentada`);
          setAbierto(false);
          router.refresh();
        });
      }}
      className="flex flex-col gap-2 text-left"
    >
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Fecha</span>
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} data-enfocar className={fieldClassSm} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Referencia</span>
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} placeholder="Ej: 8-0001-2026" className={fieldClassSm} />
        </label>
        <label className="flex w-28 flex-col gap-1">
          <span className={labelClassSm}>Monto (USD)</span>
          <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="Ej: 850.00" className={fieldClassSm} />
        </label>
      </div>
      <AvisoError texto={error} />
      <span className="flex justify-end gap-2">
        <button type="button" onClick={() => setAbierto(false)} className={`rounded-md border border-border px-3 py-1 text-sm ${anilloFoco}`}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando} className={botonOscuro}>
          {enviando ? "Guardando..." : "Guardar"}
        </button>
      </span>
    </form>
  );
}

/** Los ajustes de una obligación: día, mes (anual), días de aviso y si está activa. */
export function EditarObligacion({
  o,
}: {
  o: { id: string; nombre: string; periodicidad: "mensual" | "anual"; dia: number; mes: number | null; diasAviso: number; activo: boolean };
}) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const r = await guardarObligacion(datos);
          if (r.error) return setError(r.error);
          mostrarToast(`${o.nombre}: guardada`);
          router.refresh();
        });
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="id" value={o.id} />
      <label className="flex w-16 flex-col gap-1">
        <span className={labelClassSm}>Día</span>
        <input name="dia" type="number" min={1} max={31} defaultValue={o.dia} aria-label={`Día de vencimiento de ${o.nombre}`} className={fieldClassSm} />
      </label>
      {o.periodicidad === "anual" && (
        <label className="flex w-16 flex-col gap-1">
          <span className={labelClassSm}>Mes</span>
          <input name="mes" type="number" min={1} max={12} defaultValue={o.mes ?? 12} aria-label={`Mes de vencimiento de ${o.nombre}`} className={fieldClassSm} />
        </label>
      )}
      <label className="flex w-20 flex-col gap-1">
        <span className={labelClassSm}>Aviso (días)</span>
        <input name="dias_aviso" type="number" min={0} max={60} defaultValue={o.diasAviso} aria-label={`Días de aviso de ${o.nombre}`} className={fieldClassSm} />
      </label>
      <label className="inline-flex h-8 items-center gap-1.5 text-sm">
        <input name="activo" type="checkbox" defaultChecked={o.activo} />
        Activa
      </label>
      <button type="submit" disabled={enviando} aria-busy={enviando} className={botonOscuro}>
        {enviando ? "Guardando..." : "Guardar"}
        <span className="sr-only">: {o.nombre}</span>
      </button>
      <AvisoError texto={error} />
    </form>
  );
}
