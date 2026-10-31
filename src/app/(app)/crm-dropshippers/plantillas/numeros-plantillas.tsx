"use client";

import { useState, useTransition } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { enviarPlantillaANumero, igualarNumerosPlantillas, revisarNumerosDePlantillas, type NumeroConPlantillas } from "./actions";

const boton = `inline-flex min-h-9 items-center rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

const ESTADO: Record<string, { etiqueta: string; tono: Tone }> = {
  pendiente: { etiqueta: "En revisión", tono: "azul" },
  aprobada: { etiqueta: "Aprobada", tono: "success" },
  rechazada: { etiqueta: "Rechazada", tono: "destructive" },
  pausada: { etiqueta: "Pausada", tono: "warning" },
  deshabilitada: { etiqueta: "Deshabilitada", tono: "destructive" },
};

/**
 * «Revisar números» e «Igualar números» (30 oct 2026): con dos números de 360dialog, cada uno habla con Meta con su propia clave y las plantillas viven en la cuenta de WhatsApp Business de cada
 * número. «Revisar» pregunta a Meta qué ve cada número y en qué estado (no cambia nada); «Igualar» deja en los demás números las plantillas que ya se mandaron por el principal.
 * Donde un número no tiene una plantilla («Falta»), «Enviar a Meta» la manda solo a ese número (31 oct 2026, pedido de Hernán: el número de Dirección
 * llegó sin ninguna); solo con permiso para escribir y si la plantilla está guardada en el sistema.
 */
export function NumerosPlantillas({ escribe }: { escribe: boolean }) {
  const { mostrarToast } = useToast();
  const [ocupado, empezar] = useTransition();
  const [enCurso, setEnCurso] = useState<"revisar" | "igualar" | null>(null);
  const [revision, setRevision] = useState<{ numeros: NumeroConPlantillas[]; mismaCuenta: boolean; enSistema: string[] } | null>(null);
  /** La celda que se está mandando («nombre|idioma|canal»). */
  const [enviando, setEnviando] = useState<string | null>(null);

  async function enviarA(nombre: string, idioma: string, n: NumeroConPlantillas) {
    const celda = `${nombre}|${idioma}|${n.canal}`;
    setEnviando(celda);
    const r = await enviarPlantillaANumero(nombre, idioma, n.canal).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
    setEnviando(null);
    if ("error" in r) return mostrarToast(`${n.numero}: ${r.error}`, "destructive");
    mostrarToast(r.hecho === "creada" ? `«${nombre}» se mandó a Meta para ${n.numero}: queda en revisión.` : `${n.numero} ya tenía «${nombre}».`);
    // La celda pasa de «Falta» a su estado sin volver a preguntar a Meta por todos los números.
    setRevision((x) =>
      x
        ? {
            ...x,
            numeros: x.numeros.map((m) =>
              m.canal === n.canal ? { ...m, plantillas: [...m.plantillas, { nombre, idioma, estado: r.estado ?? "pendiente", metaId: `nueva-${celda}` }] } : m,
            ),
          }
        : x,
    );
  }

  function revisar() {
    setEnCurso("revisar");
    empezar(async () => {
      const r = await revisarNumerosDePlantillas().catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      setEnCurso(null);
      if ("error" in r) mostrarToast(r.error, "destructive");
      else setRevision(r);
    });
  }

  function igualar() {
    setEnCurso("igualar");
    empezar(async () => {
      const r = await igualarNumerosPlantillas().catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      setEnCurso(null);
      if ("error" in r) return mostrarToast(r.error, "destructive");
      if (r.fallas.length) mostrarToast(`${r.creadas} creadas. Fallaron ${r.fallas.length}: ${r.fallas[0]}`, "destructive");
      else mostrarToast(r.creadas ? `Listo: ${r.creadas} plantillas mandadas a los otros números.` : "Todos los números ya tienen las mismas plantillas.");
    });
  }

  // Todas las plantillas que aparecen en algún número, para ver cuál falta en cuál.
  const nombres = revision ? [...new Set(revision.numeros.flatMap((n) => n.plantillas.map((p) => `${p.nombre}|${p.idioma}`)))].sort() : [];

  return (
    <>
      <button type="button" disabled={ocupado} onClick={revisar} className={boton}>
        {enCurso === "revisar" ? "Revisando…" : "Revisar números"}
      </button>
      {escribe && (
        <button type="button" disabled={ocupado} onClick={igualar} className={boton}>
          {enCurso === "igualar" ? "Igualando…" : "Igualar números"}
        </button>
      )}
      {revision && (
        <Ventana abierto alCerrar={() => setRevision(null)} titulo="Plantillas por número" ancho="lg">
          <div className="flex flex-col gap-4 p-5">
            <p className="m-0 text-sm font-medium">{revision.mismaCuenta ? "Los números comparten la misma cuenta: tienen las mismas plantillas." : "Cada número tiene su propia cuenta de plantillas."}</p>
            {revision.numeros.some((n) => n.error) && (
              <ul role="alert" className="m-0 flex list-none flex-col gap-1 rounded-md bg-destructive-soft px-3 py-2 p-0 text-sm text-destructive">
                {revision.numeros
                  .filter((n) => n.error)
                  .map((n) => (
                    <li key={n.numero}>
                      {n.numero}: {n.error}
                    </li>
                  ))}
              </ul>
            )}
            {nombres.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Ningún número tiene plantillas todavía.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Plantilla
                      </th>
                      {revision.numeros.map((n) => (
                        <th key={n.numero} scope="col" className="px-2 py-2 font-medium">
                          {n.numero}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nombres.map((clave) => {
                      const [nombre, idioma] = clave.split("|");
                      return (
                        <tr key={clave} className="border-t border-border">
                          <th scope="row" className="py-2 pr-4 text-left font-mono text-sm font-semibold">
                            {nombre} <span className="font-sans text-xs font-normal text-muted-foreground">{idioma}</span>
                          </th>
                          {revision.numeros.map((n) => {
                            const p = n.plantillas.find((x) => x.nombre === nombre && x.idioma === idioma);
                            const e = p?.estado ? ESTADO[p.estado] : null;
                            const celda = `${nombre}|${idioma}|${n.canal}`;
                            const sePuedeEnviar = escribe && !n.error && revision.enSistema.includes(`${nombre}|${idioma}`);
                            return (
                              <td key={n.numero} className="px-2 py-2">
                                {p ? (
                                  <Badge tone={e?.tono ?? "neutral"}>{e?.etiqueta ?? "Sin estado"}</Badge>
                                ) : (
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="text-muted-foreground">Falta</span>
                                    {sePuedeEnviar && (
                                      <button
                                        type="button"
                                        disabled={enviando !== null}
                                        onClick={() => void enviarA(nombre, idioma, n)}
                                        aria-label={`Enviar ${nombre} a Meta para ${n.numero}`}
                                        className={`inline-flex min-h-8 items-center rounded-md border border-border-control bg-card px-2 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
                                      >
                                        {enviando === celda ? "Enviando…" : "Enviar a Meta"}
                                      </button>
                                    )}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => setRevision(null)} className={boton}>
                Cerrar
              </button>
            </div>
          </div>
        </Ventana>
      )}
    </>
  );
}
