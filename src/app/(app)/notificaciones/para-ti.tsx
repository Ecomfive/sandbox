"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { marcarAvisoLeido, marcarTodosLeidos } from "@/lib/menciones-actions";

export interface AvisoParaTi {
  id: string;
  titulo: string;
  texto: string | null;
  href: string;
  leida: boolean;
  creadoEn: string;
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

/**
 * «Para ti»: los avisos personales (alguien te etiquetó con «@» en un comentario o una nota). Pulsar uno lo marca como
 * leído y lleva al lugar donde te mencionaron; los sin leer van marcados.
 */
export function ParaTi({ avisos }: { avisos: AvisoParaTi[] }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const sinLeer = avisos.filter((a) => !a.leida).length;

  function abrir(a: AvisoParaTi) {
    start(async () => {
      if (!a.leida) await marcarAvisoLeido(a.id);
      router.push(a.href);
    });
  }

  return (
    <section aria-labelledby="titulo-para-ti" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-para-ti" className="m-0 text-sm font-semibold">
          Para ti{" "}
          {sinLeer > 0 && <span className="ml-1 rounded-full bg-aviso px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">{sinLeer}</span>}
        </h2>
        {sinLeer > 0 && (
          <BotonBarra disabled={pendiente} onClick={() => start(async () => void (await marcarTodosLeidos()))}>
            Marcar todas como leídas
          </BotonBarra>
        )}
      </div>
      {avisos.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Cuando alguien te etiquete con @ en un comentario o una nota, te avisamos aquí.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {avisos.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={pendiente}
                onClick={() => abrir(a)}
                className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-muted ${a.leida ? "" : "bg-primario-suave"} ${anilloFoco}`}
              >
                <span className="flex items-start gap-2 text-sm">
                  {!a.leida && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primario" />}
                  <span className={a.leida ? "" : "font-medium"}>{a.titulo}</span>
                  {!a.leida && <span className="sr-only">(sin leer)</span>}
                </span>
                {a.texto && <span className="line-clamp-2 text-xs text-muted-foreground">«{a.texto}»</span>}
                <span className="text-xs text-muted-foreground">{fechaHora(a.creadoEn)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
