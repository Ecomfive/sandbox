"use client";

import { useSyncExternalStore } from "react";
import { anilloFoco } from "@/components/ui/field";

// Lo que cada persona marcó en una guía se recuerda en su navegador (es una ayuda para ella, no un dato del equipo).
const clave = (modulo: string) => `ayuda-guia-${modulo}-v1`;
const oyentes = new Set<() => void>();
function leer(modulo: string): string {
  try {
    return localStorage.getItem(clave(modulo)) ?? "{}";
  } catch {
    return "{}";
  }
}
function guardar(modulo: string, valor: Record<string, unknown>) {
  try {
    localStorage.setItem(clave(modulo), JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: se olvida al recargar */
  }
  oyentes.forEach((f) => f());
}
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

/**
 * Los pasos de una guía como lista para ir marcando (como un checklist de ClickUp): cada sección con su avance y, arriba, el
 * total. Al final, «¿Te sirvió esta guía?».
 */
export function PasosGuia({ modulo, secciones }: { modulo: string; secciones: { titulo: string; pasos: string[] }[] }) {
  const crudo = useSyncExternalStore(suscribir, () => leer(modulo), () => "{}");
  const estado = JSON.parse(crudo) as { hechos?: string[]; sirvio?: "si" | "no" };
  const hechos = new Set(estado.hechos ?? []);
  const total = secciones.reduce((t, s) => t + s.pasos.length, 0);
  const marcados = secciones.reduce((t, s, i) => t + s.pasos.filter((_, j) => hechos.has(`${i}.${j}`)).length, 0);

  function alternar(k: string) {
    const nuevos = new Set(hechos);
    if (nuevos.has(k)) nuevos.delete(k);
    else nuevos.add(k);
    guardar(modulo, { ...estado, hechos: [...nuevos] });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-sm font-medium tabular-nums">
          {marcados} de {total} pasos
        </span>
        <span className="block h-2 min-w-[8rem] flex-1 rounded-full bg-muted">
          <span className="barra-neon block h-2 rounded-full transition-[width]" style={{ width: `${total ? (marcados / total) * 100 : 0}%` }} />
        </span>
        {marcados > 0 && (
          <button type="button" onClick={() => guardar(modulo, { ...estado, hechos: [] })} className={`rounded text-xs text-muted-foreground hover:text-foreground ${anilloFoco}`}>
            Reiniciar
          </button>
        )}
      </div>

      {secciones.map((s, i) => {
        const hechasAqui = s.pasos.filter((_, j) => hechos.has(`${i}.${j}`)).length;
        return (
          <section key={s.titulo} id={`seccion-${i}`} aria-labelledby={`titulo-seccion-${i}`} className="scroll-mt-24 rounded-xl border border-border bg-card p-4">
            <h2 id={`titulo-seccion-${i}`} className="flex items-center justify-between gap-2 text-base font-semibold">
              {s.titulo}
              <span className={`text-xs font-normal tabular-nums ${hechasAqui === s.pasos.length ? "text-success" : "text-muted-foreground"}`}>
                {hechasAqui === s.pasos.length ? "✓ Listo" : `${hechasAqui}/${s.pasos.length}`}
              </span>
            </h2>
            <ol className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
              {s.pasos.map((p, j) => {
                const k = `${i}.${j}`;
                const hecho = hechos.has(k);
                return (
                  <li key={p}>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted ${hecho ? "text-muted-foreground" : ""}`}>
                      <input type="checkbox" checked={hecho} onChange={() => alternar(k)} className="mt-0.5 accent-[var(--primario)]" />
                      <span>
                        <span className="mr-1.5 font-semibold text-primario tabular-nums">{j + 1}.</span>
                        <span className={hecho ? "line-through" : ""}>{p}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <span className="font-medium">¿Te sirvió esta guía?</span>
        {(["si", "no"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={estado.sirvio === v}
            onClick={() => guardar(modulo, { ...estado, sirvio: v })}
            className={`rounded-full border px-3 py-1 text-xs ${anilloFoco} ${estado.sirvio === v ? "border-primario bg-primario text-white" : "border-border hover:bg-muted"}`}
          >
            {v === "si" ? "👍 Sí" : "👎 No"}
          </button>
        ))}
        {estado.sirvio === "no" && <span className="text-xs text-muted-foreground">Cuéntale a tu líder qué faltó: lo agregamos a la guía.</span>}
        {estado.sirvio === "si" && <span className="text-xs text-success">¡Gracias!</span>}
      </div>
    </div>
  );
}
