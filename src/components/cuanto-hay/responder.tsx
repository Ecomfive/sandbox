"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { responderCuantoHay } from "@/app/(app)/tienda-cuanto-hay/actions";
import { fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cuandoCorto, type PreguntaCuantoHay } from "@/lib/cuanto-hay/reglas";

/** Una fila: la cantidad y «Responder» (en Respondidas, la cantidad dada y se puede corregir). */
function Fila({ p, puedeResponder, ahora }: { p: PreguntaCuantoHay; puedeResponder: boolean; ahora: Date }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [cantidad, setCantidad] = useState(p.cantidad === null ? "" : String(p.cantidad));
  const [enviando, iniciar] = useTransition();
  const responder = () =>
    iniciar(async () => {
      const r = await responderCuantoHay(p.id, cantidad).catch(() => ({ error: "No se pudo guardar la respuesta." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(`Listo: le llegó a ${p.pedidoPorNombre ?? "quien preguntó"}.`);
      router.refresh();
    });
  const cambio = p.cantidad === null ? cantidad.trim() !== "" : cantidad.trim() !== String(p.cantidad);
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-2 font-medium">{p.producto}</td>
      <td className="px-2 py-2 text-muted-foreground">{p.nota ?? "—"}</td>
      <td className="px-2 py-2 text-muted-foreground">
        {p.pedidoPorNombre ?? "—"} · {cuandoCorto(p.creadoEn, ahora)}
      </td>
      <td className="px-4 py-2">
        {puedeResponder ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (cambio) responder();
            }}
          >
            <label>
              <span className="sr-only">Cantidad de {p.producto}</span>
              <input type="number" inputMode="numeric" min={0} step={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" className={`${fieldClass} w-20`} />
            </label>
            <button type="submit" disabled={enviando || !cambio} className="inline-flex min-h-9 items-center rounded-md bg-primario px-3 text-sm font-semibold text-white disabled:opacity-50">
              {enviando ? "…" : p.cantidad === null ? "Responder" : "Corregir"}
            </button>
            {p.respondidoEn && (
              <span className="ml-1 whitespace-nowrap text-xs text-muted-foreground">
                {p.respondidoPorNombre ?? ""} · {cuandoCorto(p.respondidoEn, ahora)}
              </span>
            )}
          </form>
        ) : (
          <span className="font-semibold">{p.cantidad ?? "—"}</span>
        )}
      </td>
    </tr>
  );
}

/** El panel de Yiletsi (16 nov 2026): una tabla con un renglón por tienda y debajo sus preguntas, la más vieja primero. */
export function ResponderCuantoHay({
  grupos,
  respondidas,
  puedeResponder,
}: {
  grupos: { tienda: { id: string; nombre: string }; preguntas: PreguntaCuantoHay[] }[];
  respondidas: boolean;
  puedeResponder: boolean;
}) {
  const ahora = new Date();
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="border-b border-border px-4 py-2 font-medium">Producto</th>
              <th className="border-b border-border px-2 py-2 font-medium">Nota</th>
              <th className="border-b border-border px-2 py-2 font-medium">Preguntó</th>
              <th className="border-b border-border px-4 py-2 font-medium">Hay</th>
            </tr>
          </thead>
          <tbody>
            {grupos.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  {respondidas ? "No hay respuestas en los últimos 7 días." : "No hay preguntas pendientes."}
                </td>
              </tr>
            ) : (
              grupos.flatMap((g) => [
                <tr key={`t-${g.tienda.id}`} className="bg-primario-suave">
                  <th colSpan={4} scope="colgroup" className="px-4 py-1.5 text-left font-bold text-primario">
                    {g.tienda.nombre} · {g.preguntas.length}
                  </th>
                </tr>,
                ...g.preguntas.map((p) => <Fila key={`${p.id}-${p.cantidad ?? ""}`} p={p} puedeResponder={puedeResponder} ahora={ahora} />),
              ])
            )}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-xs text-muted-foreground">Al responder, la cantidad le llega a quien preguntó (en «Para ti») y la pregunta pasa a «Respondidas».</p>
    </div>
  );
}
