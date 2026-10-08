"use client";

import { useState } from "react";
import { fieldClass } from "@/components/ui/field";

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** El glosario con un buscador que filtra por el término o por su definición. */
export function GlosarioBuscable({ terminos, inicial = "" }: { terminos: { termino: string; definicion: string }[]; inicial?: string }) {
  const [busqueda, setBusqueda] = useState(inicial);
  const q = normal(busqueda.trim());
  const vistos = q ? terminos.filter((t) => normal(`${t.termino} ${t.definicion}`).includes(q)) : terminos;
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="sr-only">Buscar en el glosario</span>
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar un término (Ej: lote, etapa, SKU)" className={fieldClass} />
      </label>
      {!q && (
        <nav aria-label="Ir a la letra" className="flex flex-wrap gap-1">
          {[...new Set(terminos.map((t) => normal(t.termino)[0].toUpperCase()))].map((l) => (
            <a key={l} href={`#letra-${l}`} className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-xs font-semibold hover:bg-primario-suave hover:text-primario">
              {l}
            </a>
          ))}
        </nav>
      )}
      {vistos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ningún término coincide con «{busqueda}».</p>
      ) : (
        <dl className="m-0 flex flex-col divide-y divide-border rounded-[10px] border border-border bg-card">
          {vistos.map((t) => (
            <div
              key={t.termino}
              id={vistos.findIndex((x) => normal(x.termino)[0] === normal(t.termino)[0]) === vistos.indexOf(t) ? `letra-${normal(t.termino)[0].toUpperCase()}` : undefined}
              className="flex scroll-mt-28 flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6"
            >
              <dt className="shrink-0 font-semibold sm:w-56">{t.termino}</dt>
              <dd className="m-0 text-sm text-muted-foreground">{t.definicion}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
