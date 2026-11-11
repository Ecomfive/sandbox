"use client";

import { useEffect, useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { dinero, entero } from "@/lib/af4/formato";
import { vistaPreviaRegla, type VistaPreviaRegla } from "./calidad-actions";
import { crearRegla } from "./clasificar-actions";

/**
 * Después de corregir a mano la tienda o el tipo de un movimiento: ofrece crear la regla para los próximos con el texto
 * que mejor lo identifica, y muestra antes a cuántos movimientos tocaría.
 */
export function OfrecerRegla({
  patronInicial,
  unidad,
  tipo,
  alCerrar,
}: {
  patronInicial: string;
  unidad: { id: string; nombre: string } | null;
  tipo: { id: string; nombre: string } | null;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [patron, setPatron] = useState(patronInicial);
  const [pendiente, empezar] = useTransition();

  function crear() {
    const f = new FormData();
    f.set("patron", patron);
    if (unidad) f.set("unidad_id", unidad.id);
    if (tipo) f.set("tipo_id", tipo.id);
    empezar(async () => {
      const r = await crearRegla(f).catch(() => ({ error: "No se pudo crear la regla." }));
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("Regla creada: se aplicará a los próximos");
        alCerrar();
      }
    });
  }

  return (
    <section aria-label="Crear regla" className="flex flex-col gap-2 border-b border-border px-5 py-3 text-sm">
      <p className="m-0 font-medium">
        ¿Crear una regla para los próximos? {[unidad?.nombre, tipo?.nombre].filter(Boolean).join(" · ")}
      </p>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Si la descripción contiene</span>
        <input value={patron} onChange={(e) => setPatron(e.target.value)} maxLength={120} className={`${fieldClass} w-full`} placeholder="Ej: HOSTING NUBE" />
      </label>
      <VistaPrevia patron={patron} unidadId={unidad?.id ?? null} tipoId={tipo?.id ?? null} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={crear}
          disabled={pendiente || patron.trim().length < 3}
          className={`rounded-md bg-foreground px-3 py-1.5 font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
        >
          {pendiente ? "Creando..." : "Crear regla"}
        </button>
        <button type="button" onClick={alCerrar} disabled={pendiente} className={`rounded-md border border-border px-3 py-1.5 hover:bg-muted ${anilloFoco}`}>
          Ahora no
        </button>
      </div>
    </section>
  );
}

/** A cuántos movimientos tocaría una regla (se recalcula al escribir). */
export function VistaPrevia({ patron, unidadId, tipoId }: { patron: string; unidadId: string | null; tipoId: string | null }) {
  const [vista, setVista] = useState<VistaPreviaRegla | { error: string } | null>(null);

  const corto = patron.trim().length < 3;
  useEffect(() => {
    if (corto) return;
    let vigente = true;
    const reloj = setTimeout(async () => {
      const r = await vistaPreviaRegla(patron, unidadId, tipoId).catch(() => ({ error: "No se pudo calcular." }));
      if (vigente) setVista(r);
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(reloj);
    };
  }, [corto, patron, unidadId, tipoId]);

  if (!vista || corto) return null;
  if ("error" in vista) return <p className="m-0 text-sm text-muted-foreground">{vista.error}</p>;
  return (
    <div className="flex flex-col gap-1 text-sm" aria-live="polite">
      <p className="m-0">
        Calza con <span className={claseCifra}>{entero(vista.total)}</span> movimientos · completaría{" "}
        <span className={claseCifra}>{entero(vista.completaria)}</span> pendientes
        {vista.distintos > 0 && (
          <>
            {" "}
            · <span className={claseCifra}>{entero(vista.distintos)}</span> ya están clasificados distinto (no se cambian)
          </>
        )}
      </p>
      {vista.ganaOtra && <p className="m-0 text-muted-foreground">Ya hay una regla más específica para algunos: «{vista.ganaOtra}».</p>}
      {vista.ejemplos.length > 0 && (
        <ul className="m-0 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {vista.ejemplos.map((e, i) => (
            <li key={i} className="flex gap-2">
              <span className="truncate">{e.descripcion}</span>
              <span className={`ml-auto ${claseCifra}`}>{dinero(e.monto, "USD", { decimales: 2 })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
