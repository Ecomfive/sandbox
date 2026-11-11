"use client";

import { useState } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { Button } from "@/components/ui/button";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero, entero, SIN_DATO } from "@/lib/af4/formato";
import type { Comparacion, FilaComparable } from "@/lib/finanzas/comparar-libro";

/** Filas que se muestran de cada lista (lo demás se cuenta). */
const MAX_FILAS = 100;

const linea = (f: FilaComparable, moneda: string) => (
  <span className="flex flex-wrap items-baseline gap-x-2">
    {/^\d{4}-\d{2}/.test(f.periodo) && <span className="text-muted-foreground">{mesCorto(f.periodo)}</span>}
    <span>{f.descripcion || SIN_DATO}</span>
    <span className="text-muted-foreground">{f.tienda}</span>
    <span className={`ml-auto ${claseCifra}`}>{dinero(f.monto, moneda, { decimales: 2 })}</span>
  </span>
);

function Lista({ titulo, total, punto, children }: { titulo: string; total: number; punto?: string; children: React.ReactNode }) {
  if (!total) return null;
  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
        {punto && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${punto}`} />}
        {titulo}
        <span className={`ml-auto text-muted-foreground ${claseCifra}`}>{entero(total)}</span>
      </summary>
      <ul className="flex flex-col divide-y divide-border border-t border-border text-sm">{children}</ul>
      {total > MAX_FILAS && <p className="px-3 py-2 text-xs text-muted-foreground">y {entero(total - MAX_FILAS)} más</p>}
    </details>
  );
}

/**
 * «Comparar con lo cargado» antes de aplicar un Excel: cuántas filas se agregan, cuáles cambian (campo antes → después)
 * y cuáles están en la base y ya no vienen (se borran al cargar, salvo las de meses cerrados).
 */
export function ComparacionImportacion({ comparar, moneda = "USD" }: { comparar: () => Promise<{ error: string } | Comparacion>; moneda?: string }) {
  const [estado, setEstado] = useState<{ tipo: "nada" } | { tipo: "cargando" } | { tipo: "error"; mensaje: string } | { tipo: "listo"; c: Comparacion }>({ tipo: "nada" });

  async function correr() {
    setEstado({ tipo: "cargando" });
    const r = await comparar().catch(() => ({ error: "Se cortó la conexión." }));
    setEstado("error" in r ? { tipo: "error", mensaje: r.error } : { tipo: "listo", c: r });
  }

  if (estado.tipo === "nada")
    return (
      <div>
        <Button type="button" variant="secondary" onClick={correr}>
          Comparar con lo cargado
        </Button>
      </div>
    );
  if (estado.tipo === "cargando") return <ProgresoCarga mensaje="Comparando con lo cargado…" />;
  if (estado.tipo === "error")
    return (
      <p role="alert" className="flex items-center gap-2 text-sm">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
        {estado.mensaje}
      </p>
    );
  const { c } = estado;
  const conservados = c.cambia.filter((x) => x.conservado).length;
  return (
    <section aria-label="Comparación con lo cargado" className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {[
          ["Se agregan", c.agrega.length],
          ["Cambian", c.cambia.length],
          ["Ya no vienen", c.quita.length],
          ["Iguales", c.iguales],
        ].map(([t, v]) => (
          <div key={t as string} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{t}</dt>
            <dd className={`font-semibold ${claseCifra}`}>{entero(v as number)}</dd>
          </div>
        ))}
      </dl>
      <Lista titulo="Se agregan" total={c.agrega.length}>
        {c.agrega.slice(0, MAX_FILAS).map((f) => (
          <li key={f.clave} className="px-3 py-1.5">
            {linea(f, moneda)}
          </li>
        ))}
      </Lista>
      <Lista titulo={conservados ? `Cambian (${entero(conservados)} corregidos a mano no se tocan)` : "Cambian"} total={c.cambia.length} punto="bg-warning">
        {c.cambia.slice(0, MAX_FILAS).map((x) => (
          <li key={`${x.antes.clave}-${x.despues.clave}`} className="flex flex-col gap-0.5 px-3 py-1.5">
            {linea(x.antes, moneda)}
            <span className="flex flex-wrap gap-x-3 text-xs">
              {x.conservado && <span className="text-muted-foreground">Corregido a mano: se conserva</span>}
              {x.campos.map((k) => (
                <span key={k.campo}>
                  <span className="text-muted-foreground">{k.campo}:</span> {k.antes || SIN_DATO} → {k.despues || SIN_DATO}
                </span>
              ))}
            </span>
          </li>
        ))}
      </Lista>
      <Lista titulo="Ya no vienen (se borran)" total={c.quita.length} punto="bg-destructive">
        {c.quita.slice(0, MAX_FILAS).map((f) => (
          <li key={f.clave} className="px-3 py-1.5">
            {linea(f, moneda)}
          </li>
        ))}
      </Lista>
    </section>
  );
}
