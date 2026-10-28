"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { rellenar } from "@/lib/whatsapp/plantillas";
import { enviarPlantillaConversacion, plantillasParaConversacion, type PlantillaParaEnviar } from "./actions";

const CATEGORIA: Record<string, string> = { marketing: "Marketing", utility: "Utilidad" };

/** El mensaje con lo que ya se sabe de la persona y, en lo que se escribe al enviar, lo escrito o su nombre entre corchetes. */
function previa(p: PlantillaParaEnviar, manuales: string[]): string {
  const texto = rellenar(
    p.cuerpo,
    p.valores.map((v, i) => (p.manual[i] ? manuales[i]?.trim() || `[${p.etiquetas[i] || `dato ${i + 1}`}]` : v || `[falta]`)),
  );
  return [p.encabezado, texto, p.pie].filter(Boolean).join("\n");
}

/**
 * «Enviar plantilla» (28 oct 2026): pasadas 24 h del último mensaje de un dropshipper, la única forma de escribirle. Lista las plantillas
 * que Meta aprobó con sus datos ya llenos para esta persona; lo que no se sabe (el producto, por ejemplo) se escribe antes de enviar.
 */
export function EnviarPlantilla({ conversacionId, nombre, alCerrar, alEnviado }: { conversacionId: string; nombre: string; alCerrar: () => void; alEnviado: () => void }) {
  const [plantillas, setPlantillas] = useState<PlantillaParaEnviar[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [elegida, setElegida] = useState<PlantillaParaEnviar | null>(null);
  const [manuales, setManuales] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();

  useEffect(() => {
    let vigente = true;
    plantillasParaConversacion(conversacionId)
      .catch(() => ({ error: "No se pudieron cargar las plantillas." }))
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) setErrorCarga(r.error);
        else setPlantillas(r.plantillas);
      });
    return () => {
      vigente = false;
    };
  }, [conversacionId]);

  const faltaEscribir = !!elegida && elegida.manual.some((m, i) => m && !manuales[i]?.trim());
  const sePuede = !!elegida && !elegida.faltante && !elegida.yaEnviada && !faltaEscribir && !enviando;

  function enviar() {
    if (!elegida || !sePuede) return;
    setError(null);
    empezar(async () => {
      const r = await enviarPlantillaConversacion(conversacionId, elegida.id, manuales).catch(() => ({ error: "No se pudo enviar. Inténtalo de nuevo." }));
      if ("error" in r) setError(r.error);
      else alEnviado();
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo={`Enviar plantilla a ${nombre}`} ancho="md">
      <div className="flex flex-col gap-4 p-5">
        {errorCarga && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {errorCarga}
          </p>
        )}
        {!errorCarga && !plantillas && (
          <p role="status" className="m-0 text-sm text-muted-foreground">
            Cargando plantillas…
          </p>
        )}
        {plantillas && plantillas.length === 0 && (
          <p className="m-0 text-sm">
            Todavía no hay plantillas aprobadas por Meta.{" "}
            <Link href="/crm-dropshippers/plantillas" className={`font-medium underline underline-offset-2 ${anilloFoco}`}>
              Ir a Plantillas
            </Link>
          </p>
        )}
        {plantillas && plantillas.length > 0 && !elegida && (
          <ul className="m-0 flex max-h-[60vh] list-none flex-col gap-2 overflow-y-auto p-0">
            {plantillas.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setElegida(p);
                    setManuales(p.valores.map(() => ""));
                    setError(null);
                  }}
                  className={`flex min-h-12 w-full flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left hover:bg-muted ${anilloFoco}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{p.nombre}</span>
                    <Badge tone="neutral">{CATEGORIA[p.categoria] ?? p.categoria}</Badge>
                    {p.yaEnviada && <Badge tone="warning">Ya enviada hoy</Badge>}
                  </span>
                  <span className="text-sm text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">{previa(p, [])}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {elegida && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">{elegida.nombre}</span>
                <Badge tone="neutral">{CATEGORIA[elegida.categoria] ?? elegida.categoria}</Badge>
              </span>
              <button type="button" disabled={enviando} onClick={() => setElegida(null)} className={`inline-flex min-h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
                Elegir otra
              </button>
            </div>
            {elegida.manual.map(
              (m, i) =>
                m && (
                  <label key={i} className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{elegida.etiquetas[i] || `Dato ${i + 1}`}</span>
                    <input
                      value={manuales[i] ?? ""}
                      onChange={(e) => setManuales((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                      data-enfocar
                      className={`${fieldClass} w-full`}
                    />
                  </label>
                ),
            )}
            <p className="m-0 max-w-[340px] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]" aria-label="Así le llegará">
              {previa(elegida, manuales)}
            </p>
            {elegida.botones.length > 0 && <p className="m-0 text-xs text-muted-foreground">Botones: {elegida.botones.join(" · ")}</p>}
            {elegida.faltante && <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">{elegida.faltante}</p>}
            {elegida.yaEnviada && <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Ya le mandaste esta plantilla hoy. Espera su respuesta antes de repetirla.</p>}
            {elegida.categoria === "marketing" && !elegida.yaEnviada && <p className="m-0 text-xs text-muted-foreground">Es de Marketing: cada mensaje cuesta más.</p>}
            {error && (
              <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={alCerrar} disabled={enviando} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
            Cancelar
          </button>
          {elegida && (
            <button type="button" onClick={enviar} disabled={!sePuede} className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}>
              {enviando ? "Enviando…" : "Enviar plantilla"}
            </button>
          )}
        </div>
      </div>
    </Ventana>
  );
}
