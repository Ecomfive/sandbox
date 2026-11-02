"use client";

import type { ReactNode } from "react";
import type { VistaPreviaMensaje } from "./datos-bandeja";

function hora(iso: string): string {
  const d = new Date(iso);
  const esHoy = d.toDateString() === new Date().toDateString();
  return esHoy ? d.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("es-PA", { day: "numeric", month: "short" });
}

/**
 * Los últimos mensajes de un chat, que se despliegan al pasar el cursor por la lista de la bandeja (29 oct 2026): así se lee lo que no se ha leído sin
 * abrir el chat ni marcarlo leído. Es solo para mirar (`pointer-events-none`); `fixed` para que la lista, que se desplaza, no lo recorte.
 */
export function VistaPreviaChat({ nombre, etiquetas, mensajes, noLeidos, top, left }: { nombre: string; etiquetas?: ReactNode; mensajes: VistaPreviaMensaje[] | "cargando" | "error"; noLeidos: number; top: number; left: number }) {
  // Los que aún no se han leído son los últimos mensajes del dropshipper, tantos como diga el contador de la lista.
  const sinLeer = new Set<string>();
  if (Array.isArray(mensajes)) {
    let faltan = noLeidos;
    for (let i = mensajes.length - 1; i >= 0 && faltan > 0; i--) {
      if (mensajes[i].direccion === "entrante") {
        sinLeer.add(mensajes[i].id);
        faltan--;
      }
    }
  }
  return (
    <div
      aria-hidden="true"
      style={{ top, left }}
      className="pointer-events-none fixed z-50 hidden max-h-80 w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-1.5 overflow-hidden rounded-xl border border-[var(--wa-borde)] bg-[var(--wa-fondo)] p-3 text-[13.5px] leading-snug text-[var(--wa-texto)] shadow-[0_8px_24px_var(--wa-sombra)] lg:flex"
    >
      <span className="truncate text-xs font-semibold text-[var(--wa-sec)]">{nombre}</span>
      {etiquetas}
      {mensajes === "cargando" && <span className="text-[var(--wa-sec)]">Cargando…</span>}
      {mensajes === "error" && <span className="text-destructive">No se pudieron cargar los mensajes.</span>}
      {Array.isArray(mensajes) && !mensajes.length && <span className="text-[var(--wa-sec)]">Todavía no hay mensajes.</span>}
      {Array.isArray(mensajes) &&
        mensajes.map((m) => {
          const nuestro = m.direccion !== "entrante";
          const nota = m.direccion === "nota";
          return (
            <div key={m.id} className={`flex flex-col gap-0.5 ${nuestro ? "items-end" : "items-start"}`}>
              <span
                className={`max-w-[92%] rounded-lg px-2.5 py-1.5 [overflow-wrap:anywhere] whitespace-pre-wrap ${
                  nota ? "border border-dashed border-[var(--wa-nota-borde)] bg-[var(--wa-nota)] text-[var(--wa-nota-texto)]" : nuestro ? "bg-[var(--wa-saliente)]" : "bg-[var(--wa-entrante)] shadow-[0_1px_0.5px_var(--wa-sombra)]"
                } ${sinLeer.has(m.id) ? "ring-1 ring-[var(--wa-acento)]" : ""}`}
              >
                {nota && <span className="mr-1 font-semibold">Nota:</span>}
                {m.texto}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--wa-sec)] tabular-nums">
                {sinLeer.has(m.id) && <span className="font-semibold text-[var(--wa-acento)]">Sin leer</span>}
                {hora(m.momento)}
              </span>
            </div>
          );
        })}
    </div>
  );
}
