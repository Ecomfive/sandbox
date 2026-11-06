"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { textoCorreccion, type TipoCorreccion } from "@/lib/wms/correccion-remision";
import { pedirCorreccion, resolverCorreccion } from "./actions";

/** Una petición de corrección, como se muestra. */
export interface CorreccionVista {
  id: string;
  envioId: string;
  tipo: TipoCorreccion;
  recibidaAntes: number | null;
  recibidaNueva: number | null;
  enviada: number;
  motivo: string;
  estado: "pendiente" | "autorizada" | "rechazada";
  solicitante: string;
  resueltaPor: string | null;
  nota: string | null;
  /** El producto y la remisión de la línea. */
  codigo: string;
  remision: string | null;
  /** Si yo la puedo resolver. */
  meToca: boolean;
}

const claseBoton = `inline-flex min-h-8 items-center rounded-md border border-border-control bg-card px-2.5 text-xs font-medium hover:bg-muted ${anilloFoco}`;

/** «Corregir» en una línea recibida y «Anular» en una que sigue en camino: abren la petición, que queda esperando autorización. */
export function PedirCorreccion({ envioId, tipo, codigo, enviada, recibida }: { envioId: string; tipo: TipoCorreccion; codigo: string; enviada: number; recibida: number | null }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierta, setAbierta] = useState(false);
  const [nueva, setNueva] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function enviar() {
    setError(null);
    empezar(async () => {
      const r = await pedirCorreccion(envioId, tipo, nueva, motivo).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if (r.error) return void setError(r.error);
      setAbierta(false);
      mostrarToast("Petición enviada: espera autorización");
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} aria-haspopup="dialog" className={claseBoton}>
        {tipo === "anular" ? "Anular" : "Corregir"}
      </button>
      {abierta && (
        <Ventana abierto alCerrar={() => setAbierta(false)} titulo={tipo === "anular" ? `Anular ${codigo}` : `Corregir ${codigo}`} ancho="md">
          <form
            className="flex flex-col gap-4 p-5 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pendiente) enviar();
            }}
          >
            <p className="m-0 text-muted-foreground">
              {tipo === "anular"
                ? `Si lo autorizan, las ${enviada.toLocaleString("es-PA")} unidades vuelven a la bodega de donde salieron.`
                : `Se enviaron ${enviada.toLocaleString("es-PA")} y está anotado que llegaron ${(recibida ?? 0).toLocaleString("es-PA")}. No cambia hasta que lo autoricen.`}
            </p>
            {tipo === "recibida" && (
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Cuántas llegaron en realidad</span>
                <input type="number" inputMode="numeric" min={0} step={1} value={nueva} onChange={(e) => setNueva(e.target.value)} className={`${fieldClass} w-32 tabular-nums`} />
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Motivo</span>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} autoComplete="off" placeholder={tipo === "anular" ? "Ej: la carga no salió" : "Ej: faltaron 2 en la caja 3"} className={`${fieldClass} w-full`} />
            </label>
            {error && (
              <p role="alert" className="m-0 text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pendiente} className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-40 ${anilloFoco}`}>
                {pendiente ? "Un momento..." : "Pedir autorización"}
              </button>
              <button type="button" onClick={() => setAbierta(false)} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-muted ${anilloFoco}`}>
                Cancelar
              </button>
            </div>
          </form>
        </Ventana>
      )}
    </>
  );
}

function FilaPendiente({ c }: { c: CorreccionVista }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function resolver(autorizar: boolean) {
    setError(null);
    empezar(async () => {
      const r = await resolverCorreccion(c.id, autorizar, nota).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if (r.error) return void setError(r.error);
      mostrarToast(autorizar ? "Corrección autorizada" : "Corrección rechazada");
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="min-w-0 flex-1 basis-72">
        <span className="block font-medium">
          {c.codigo}
          {c.remision ? ` · ${c.remision}` : ""}
        </span>
        <span className="block font-medium tabular-nums">{textoCorreccion(c)}</span>
        <span className="block text-xs text-muted-foreground">
          {c.solicitante}: {c.motivo}
        </span>
        {error && (
          <span role="alert" className="block text-xs text-destructive">
            {error}
          </span>
        )}
      </span>
      {c.meToca ? (
        <span className="flex flex-wrap items-center gap-2">
          <input aria-label={`Nota para ${c.codigo}`} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Nota (para rechazar es obligatoria)" className={`${fieldClassSm} w-64`} />
          <button type="button" disabled={pendiente} onClick={() => resolver(true)} className={`inline-flex min-h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-40 ${anilloFoco}`}>
            Autorizar
          </button>
          <button type="button" disabled={pendiente} onClick={() => resolver(false)} className={claseBoton}>
            Rechazar
          </button>
        </span>
      ) : (
        <Badge tone="warning">Espera autorización</Badge>
      )}
    </li>
  );
}

/** Las correcciones que esperan autorización, arriba de la lista de remisiones. */
export function CorreccionesPendientes({ pendientes }: { pendientes: CorreccionVista[] }) {
  if (!pendientes.length) return null;
  return (
    <section aria-label="Correcciones por autorizar" className="overflow-hidden rounded-lg border border-warning bg-card text-sm">
      <h2 className="m-0 border-b border-border bg-warning-soft px-4 py-2 text-sm font-semibold text-warning">
        Por autorizar ({pendientes.length})
      </h2>
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
        {pendientes.map((c) => (
          <FilaPendiente key={c.id} c={c} />
        ))}
      </ul>
    </section>
  );
}
