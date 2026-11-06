"use client";

import { anilloFoco } from "@/components/ui/field";
import { ZONA, agruparHechas, type CosaHecha } from "@/lib/rendimiento/jornada";

export const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-PA", { timeZone: ZONA, hour: "numeric", minute: "2-digit" }) : "—");

/** «7:21 – 7:45 a. m.»: si las dos horas son de la misma mitad del día, «a. m.» va una vez; en el mismo minuto, una sola hora. */
export function rangoHoras(desde: string, hasta: string) {
  const fin = /\s*[ap]\.\s*m\.$/u;
  const a = hora(desde);
  const b = hora(hasta);
  if (a === b) return a;
  return a.match(fin)?.[0].trim() === b.match(fin)?.[0].trim() ? `${a.replace(fin, "")} – ${b}` : `${a} – ${b}`;
}

export function plural(n: number, uno: string, varios: string) {
  return `${n.toLocaleString("es-PA")} ${n === 1 ? uno : varios}`;
}

/** Lo hecho más los WhatsApp, en orden de hora, como lo espera `ListaHecho`. */
export function cosasDe(x: { acciones: { creadoEn: string; texto: string }[]; mensajes: { chat: string; n: number; primero: string }[] }): CosaHecha[] {
  return [...x.acciones.map((a) => ({ momento: a.creadoEn, texto: a.texto })), ...x.mensajes.map((m) => ({ momento: m.primero, texto: `WhatsApp a ${m.chat}: ${plural(m.n, "mensaje", "mensajes")}` }))].sort((a, b) =>
    a.momento.localeCompare(b.momento),
  );
}

/** La flecha de lo que se despliega: apunta abajo cuando está abierto. */
export function Flecha({ abierta, clase = "" }: { abierta?: boolean; clase?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${abierta ? "rotate-90" : ""} ${clase}`}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

const HORA = "w-[7.25rem] shrink-0 whitespace-nowrap text-muted-foreground tabular-nums";

function Fila({ c }: { c: CosaHecha }) {
  return (
    <li className="flex gap-2 py-0.5 text-[13px]">
      <span className={HORA}>{hora(c.momento)}</span>
      <span className="min-w-0 break-words">{c.texto}</span>
    </li>
  );
}

/** Lo que se hizo, con la hora de cada cosa. Lo que se repite seguido va en un renglón que se abre, así 96 vínculos no ocupan 96 líneas. */
export function ListaHecho({ cosas }: { cosas: CosaHecha[] }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {agruparHechas(cosas).map((g) =>
        g.titulo === null ? (
          <Fila key={g.cosas[0].momento + g.cosas[0].texto} c={g.cosas[0]} />
        ) : (
          <li key={g.cosas[0].momento + g.titulo}>
            <details className="group">
              <summary className={`flex cursor-pointer list-none items-center gap-2 rounded py-0.5 text-[13px] hover:bg-muted/60 [&::-webkit-details-marker]:hidden ${anilloFoco}`}>
                <span className={HORA}>{rangoHoras(g.cosas[0].momento, g.cosas.at(-1)!.momento)}</span>
                <span className="min-w-0 truncate font-medium">{g.titulo}</span>
                <span className="shrink-0 rounded-full bg-primario-suave px-2 text-xs font-medium text-primario tabular-nums">{g.cosas.length} veces</span>
                <Flecha clase="group-open:rotate-90" />
              </summary>
              <ul className="m-0 ml-1 flex list-none flex-col border-l-2 border-border p-0 pl-2">
                {g.cosas.map((c, i) => (
                  <Fila key={i} c={c} />
                ))}
              </ul>
            </details>
          </li>
        ),
      )}
    </ul>
  );
}
