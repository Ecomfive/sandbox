"use client";

import { useEffect, useRef, useState } from "react";
import { claseCampoPanel, PanelCelda } from "@/app/(app)/compras/panel-celda";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { bandera, nombrePais, type VendeEn } from "@/lib/whatsapp/origen-chat";
import { cambiarVendeEn, opcionesVendeEn } from "./vende-en-actions";

type Opciones = { plataformas: string[]; paises: { codigo: string; nombre: string }[] };
let pedido: Promise<Opciones | null> | null = null;
const cargar = () =>
  (pedido ??= opcionesVendeEn()
    .then((r) => ("error" in r ? null : r))
    .catch(() => {
      pedido = null;
      return null;
    }));

/** «🇵🇦 Dropi»: una plataforma en un país. */
export function PastillaVendeEn({ v }: { v: VendeEn }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-control px-2 py-px text-[11px] font-semibold whitespace-nowrap">
      <span aria-hidden="true">{bandera(v.pais)}</span>
      <span className="sr-only">{nombrePais(v.pais)}: </span>
      {v.plataforma}
    </span>
  );
}

/**
 * «Dónde vende» junto al nombre del cliente en el chat (29 oct 2026, pedido de Alcides), como las etiquetas: sus plataformas por país con la bandera
 * («🇵🇦 Dropi», «🇨🇷 EFFI») y «Dónde vende», que abre el selector: se elige el país y se marcan o desmarcan las plataformas. Lo de sus cuentas vinculadas
 * sale marcado y no se quita aquí. Se guarda en su ficha del CRM; un chat sin dropshipper primero se vincula.
 */
export function VendeEnChat({
  conversacionId,
  vendeEn,
  puede,
  alCambiar,
}: {
  conversacionId: string;
  vendeEn: VendeEn[];
  /** Puede escribir y el chat tiene dropshipper. */
  puede: boolean;
  alCambiar: (nuevo: VendeEn[]) => void;
}) {
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [pais, setPais] = useState<string>(vendeEn[0]?.pais ?? "PA");
  const [buscar, setBuscar] = useState("");
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    void cargar().then((o) => vigente && setOpciones(o));
    return () => {
      vigente = false;
    };
  }, [abierto]);

  function alternar(plataforma: string) {
    const actual = vendeEn.find((v) => v.plataforma === plataforma && v.pais === pais);
    if (actual && !actual.manual) return;
    const antes = vendeEn;
    const poner = !actual;
    alCambiar(poner ? [...vendeEn, { plataforma, pais, manual: true }] : vendeEn.filter((v) => v !== actual));
    void cambiarVendeEn(conversacionId, plataforma, pais, poner)
      .then((r) => {
        if ("error" in r) {
          alCambiar(antes);
          mostrarToast(r.error, "destructive");
        }
      })
      .catch(() => {
        alCambiar(antes);
        mostrarToast("No se pudo guardar.", "destructive");
      });
  }

  if (!puede && !vendeEn.length) return null;
  const q = buscar.trim().toLowerCase();
  const plataformas = (opciones?.plataformas ?? []).filter((p) => !q || p.toLowerCase().includes(q));

  return (
    <>
      {vendeEn.map((v) => (
        <PastillaVendeEn key={`${v.plataforma}|${v.pais}`} v={v} />
      ))}
      {puede && (
        <button
          ref={boton}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          onClick={() => setAbierto((x) => !x)}
          className={`inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border-control px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
          </svg>
          {vendeEn.length ? "Editar dónde vende" : "Dónde vende"}
        </button>
      )}
      {abierto && (
        <PanelCelda
          ancla={boton}
          etiqueta="Dónde vende"
          ancho={300}
          alCerrar={(m) => {
            setAbierto(false);
            if (m === "escape") boton.current?.focus();
          }}
        >
          {!opciones ? (
            <p className="m-0 px-3 py-3 text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <>
              <p className="m-0 px-3 pt-2.5 pb-1 text-xs text-muted-foreground">País</p>
              <div role="group" aria-label="País" className="flex flex-wrap gap-1 px-2.5 pb-2">
                {opciones.paises.map((p) => (
                  <button
                    key={p.codigo}
                    type="button"
                    aria-pressed={pais === p.codigo}
                    title={p.nombre}
                    onClick={() => setPais(p.codigo)}
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ${pais === p.codigo ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"} ${anilloFoco}`}
                  >
                    <span aria-hidden="true">{bandera(p.codigo)}</span>
                    {p.codigo}
                    <span className="sr-only"> {p.nombre}</span>
                  </button>
                ))}
              </div>
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar plataforma…" aria-label="Buscar plataforma" className={`${claseCampoPanel} border-t`} />
              <p className="m-0 px-3 pt-2 pb-1 text-xs text-muted-foreground">
                Plataformas en {bandera(pais)} {nombrePais(pais)}
              </p>
              <ul className="m-0 flex max-h-60 list-none flex-col gap-0.5 overflow-y-auto p-1.5 pt-0">
                {plataformas.map((pl) => {
                  const v = vendeEn.find((x) => x.plataforma === pl && x.pais === pais);
                  return (
                    <li key={pl}>
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={!!v}
                        aria-disabled={v && !v.manual ? true : undefined}
                        onClick={() => alternar(pl)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${v && !v.manual ? "cursor-default opacity-70" : ""} ${anilloFoco}`}
                      >
                        <span>{pl}</span>
                        {v && <span className="text-xs text-primario">{v.manual ? "✓" : "✓ por cuenta vinculada"}</span>}
                      </button>
                    </li>
                  );
                })}
                {!plataformas.length && <li className="px-2 py-1.5 text-xs text-muted-foreground">Ninguna plataforma con ese nombre.</li>}
              </ul>
            </>
          )}
        </PanelCelda>
      )}
    </>
  );
}
