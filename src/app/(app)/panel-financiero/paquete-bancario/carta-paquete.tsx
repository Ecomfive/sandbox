"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { MAX_CARTA } from "@/lib/finanzas/paquete-bancario";
import { TextoManual } from "../../ayuda/manuales/texto-manual";
import { guardarPaqueteBancario } from "./actions";

/**
 * La carta del paquete: se edita en la página (formato simple «## / - / 1.», nunca HTML) y se imprime como texto. «Guardar
 * versión» guarda la carta junto con la foto del paquete que arma el servidor.
 */
export function CartaPaquete({
  inicial,
  corte,
  entidad,
  secciones,
  puedeGuardar,
}: {
  inicial: string;
  corte: string;
  entidad: string;
  secciones: string[];
  puedeGuardar: boolean;
}) {
  const [texto, setTexto] = useState(inicial);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();

  return (
    <>
      <div data-sin-imprimir>
        <MarcoAF4
          id="paquete-carta-editar"
          titulo="Carta"
          detalle={`${texto.length.toLocaleString("es-PA")} / ${MAX_CARTA.toLocaleString("es-PA")}`}
          accion={
            puedeGuardar ? (
              <button
                type="button"
                disabled={pendiente || texto.length > MAX_CARTA}
                onClick={() =>
                  empezar(async () => {
                    const r = await guardarPaqueteBancario({ corte, entidad, secciones, carta: texto }).catch(() => ({ error: "Se cortó la conexión." }) as { error: string });
                    if (r.error) mostrarToast(r.error, "destructive");
                    else {
                      mostrarToast("Versión guardada");
                      router.refresh();
                    }
                  })
                }
                className={`inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}
              >
                {pendiente ? "Guardando…" : "Guardar versión"}
              </button>
            ) : undefined
          }
        >
          <label className="flex flex-col gap-1">
            <span className="sr-only">Texto de la carta</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={12} maxLength={MAX_CARTA + 200} className={`${fieldClass} font-mono text-[13px] leading-relaxed`} />
          </label>
        </MarcoAF4>
      </div>
      {texto.trim() && (
        <div className="hidden rounded-xl border border-border bg-card p-4 print:block">
          <TextoManual texto={texto} />
        </div>
      )}
    </>
  );
}
