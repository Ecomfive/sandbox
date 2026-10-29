"use client";

import { useEffect, useRef, useState } from "react";
import { claseCampoPanel, PanelCelda } from "@/app/(app)/compras/panel-celda";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { bandera, nombrePais, type VendeEn } from "@/lib/whatsapp/origen-chat";
import { cambiarVendeEn, crearPlataformaVenta, eliminarPlataformaVenta, opcionesVendeEn, renombrarPlataformaVenta } from "./vende-en-actions";

type Opciones = { plataformas: string[]; paises: { codigo: string; nombre: string }[] };

const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const botonIcono = `flex h-6 w-6 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`;

/** «🇵🇦 Dropi»: una plataforma en un país, con su ✕ para quitarla si se puede escribir. */
function PastillaVendeEn({ v, alQuitar }: { v: VendeEn; alQuitar?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-control py-px pr-0.5 pl-2 text-[11px] font-semibold whitespace-nowrap">
      <span aria-hidden="true">{bandera(v.pais)}</span>
      <span className="sr-only">{nombrePais(v.pais)}: </span>
      {v.plataforma}
      {alQuitar ? (
        <button type="button" onClick={alQuitar} aria-label={`Quitar ${v.plataforma} ${nombrePais(v.pais)}`} className={`flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <span className="w-1" />
      )}
    </span>
  );
}

/**
 * «Dónde vende» junto al nombre del cliente en el chat (29 oct 2026, pedido de Alcides), como las etiquetas: sus plataformas por país con la bandera
 * («🇵🇦 Dropi», «🇨🇷 EFFI»), cada una con su ✕, y «Dónde vende», que abre el selector: se elige el país y se marcan o desmarcan las plataformas. La lista de
 * plataformas es propia de «Dónde vende» (migración 0194): se crea escribiendo un nombre nuevo y cada una se renombra (lápiz) o se borra (papelera).
 * Quitar lo que viene de una cuenta vinculada la oculta, sin desvincular la cuenta.
 */
export function VendeEnChat({
  conversacionId,
  vendeEn,
  puede,
  alCambiar,
  alCambioLista,
}: {
  conversacionId: string;
  vendeEn: VendeEn[];
  /** Puede escribir y el chat tiene dropshipper. */
  puede: boolean;
  alCambiar: (nuevo: VendeEn[]) => void;
  /** Se renombró o se borró una plataforma de la lista: la bandeja se vuelve a pedir (cambia en todos los chats). */
  alCambioLista: () => void;
}) {
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [errorOpciones, setErrorOpciones] = useState<string | null>(null);
  const [pais, setPais] = useState<string>(vendeEn[0]?.pais ?? "PA");
  const [buscar, setBuscar] = useState("");
  const [editando, setEditando] = useState<{ nombre: string; nuevo: string } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    opcionesVendeEn()
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) setErrorOpciones(r.error);
        else setOpciones(r);
      })
      .catch(() => vigente && setErrorOpciones("No se pudieron cargar las plataformas."));
    return () => {
      vigente = false;
    };
  }, [abierto]);

  function cambiar(plataforma: string, enPais: string, poner: boolean) {
    const antes = vendeEn;
    alCambiar(poner ? [...vendeEn, { plataforma, pais: enPais, manual: true }] : vendeEn.filter((v) => !(igual(v.plataforma, plataforma) && v.pais === enPais)));
    void cambiarVendeEn(conversacionId, plataforma, enPais, poner)
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

  async function crear(nombre: string) {
    const r = await crearPlataformaVenta(nombre).catch(() => ({ error: "No se pudo crear la plataforma." }));
    if ("error" in r) return mostrarToast(r.error, "destructive");
    setOpciones((o) => (o ? { ...o, plataformas: [...new Set([...o.plataformas, r.nombre])].sort((a, b) => a.localeCompare(b, "es")) } : o));
    setBuscar("");
    if (!vendeEn.some((v) => igual(v.plataforma, r.nombre) && v.pais === pais)) cambiar(r.nombre, pais, true);
  }

  async function renombrar() {
    if (!editando) return;
    const nuevo = editando.nuevo.trim();
    if (!nuevo || nuevo === editando.nombre) return setEditando(null);
    const r = await renombrarPlataformaVenta(editando.nombre, nuevo).catch(() => ({ error: "No se pudo cambiar el nombre." }));
    if ("error" in r) return mostrarToast(r.error, "destructive");
    setOpciones((o) => (o ? { ...o, plataformas: o.plataformas.map((p) => (p === editando.nombre ? r.nombre : p)).sort((a, b) => a.localeCompare(b, "es")) } : o));
    alCambiar(vendeEn.map((v) => (igual(v.plataforma, editando.nombre) ? { ...v, plataforma: r.nombre } : v)));
    setEditando(null);
    alCambioLista();
  }

  async function borrar(nombre: string) {
    const r = await eliminarPlataformaVenta(nombre).catch(() => ({ error: "No se pudo borrar la plataforma." }));
    setBorrando(null);
    if ("error" in r) return mostrarToast(r.error, "destructive");
    setOpciones((o) => (o ? { ...o, plataformas: o.plataformas.filter((p) => p !== nombre) } : o));
    alCambiar(vendeEn.filter((v) => !(v.manual && igual(v.plataforma, nombre))));
    mostrarToast(`«${nombre}» se borró de la lista.`);
    alCambioLista();
  }

  if (!puede && !vendeEn.length) return null;
  const q = buscar.trim().toLowerCase();
  const plataformas = (opciones?.plataformas ?? []).filter((p) => !q || p.toLowerCase().includes(q));
  const nueva = buscar.replace(/\s+/g, " ").trim().slice(0, 40);
  const puedeCrear = !!nueva && !(opciones?.plataformas ?? []).some((p) => igual(p, nueva));

  return (
    <>
      {vendeEn.map((v) => (
        <PastillaVendeEn key={`${v.plataforma}|${v.pais}`} v={v} alQuitar={puede ? () => cambiar(v.plataforma, v.pais, false) : undefined} />
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
          ancho={320}
          alCerrar={(m) => {
            setAbierto(false);
            setEditando(null);
            setBorrando(null);
            if (m === "escape") boton.current?.focus();
          }}
        >
          {errorOpciones ? (
            <p role="alert" className="m-0 px-3 py-3 text-sm text-destructive">
              {errorOpciones}
            </p>
          ) : !opciones ? (
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
              <input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (puedeCrear) void crear(nueva);
                  }
                }}
                placeholder="Buscar o crear plataforma…"
                aria-label="Buscar o crear plataforma"
                className={`${claseCampoPanel} border-t`}
              />
              <p className="m-0 px-3 pt-2 pb-1 text-xs text-muted-foreground">
                Plataformas en {bandera(pais)} {nombrePais(pais)}
              </p>
              <ul className="m-0 flex max-h-64 list-none flex-col gap-0.5 overflow-y-auto p-1.5 pt-0">
                {puedeCrear && (
                  <li>
                    <button type="button" onClick={() => void crear(nueva)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${anilloFoco}`}>
                      <span className="text-muted-foreground">Crear</span> <strong className="font-semibold">{nueva}</strong>
                    </button>
                  </li>
                )}
                {plataformas.map((pl) => {
                  const v = vendeEn.find((x) => igual(x.plataforma, pl) && x.pais === pais);
                  if (editando?.nombre === pl)
                    return (
                      <li key={pl} className="flex items-center gap-1 px-1">
                        <input
                          autoFocus
                          value={editando.nuevo}
                          maxLength={40}
                          onChange={(e) => setEditando({ nombre: pl, nuevo: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void renombrar();
                            }
                            if (e.key === "Escape") {
                              e.stopPropagation();
                              setEditando(null);
                            }
                          }}
                          aria-label={`Nuevo nombre de ${pl}`}
                          className="h-8 min-w-0 flex-1 rounded-md border border-border-control bg-card px-2 text-sm"
                        />
                        <button type="button" onClick={() => void renombrar()} className={`rounded-md px-2 py-1 text-xs font-semibold text-primario hover:bg-muted ${anilloFoco}`}>
                          Guardar
                        </button>
                      </li>
                    );
                  if (borrando === pl)
                    return (
                      <li key={pl} className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted px-2 py-1.5 text-xs">
                        <span className="flex-1">¿Borrar «{pl}» de la lista? Se quita de todos los clientes.</span>
                        <button type="button" onClick={() => void borrar(pl)} className={`rounded-md bg-destructive px-2 py-1 font-semibold text-background ${anilloFoco}`}>
                          Borrar
                        </button>
                        <button type="button" onClick={() => setBorrando(null)} className={`rounded-md px-2 py-1 font-medium hover:bg-card ${anilloFoco}`}>
                          Cancelar
                        </button>
                      </li>
                    );
                  return (
                    <li key={pl} className="flex items-center gap-0.5">
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={!!v}
                        onClick={() => cambiar(pl, pais, !v)}
                        className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${anilloFoco}`}
                      >
                        <span className="truncate">{pl}</span>
                        {v && <span className="text-xs text-primario">{v.manual ? "✓" : "✓ cuenta vinculada"}</span>}
                      </button>
                      <button type="button" onClick={() => setEditando({ nombre: pl, nuevo: pl })} aria-label={`Corregir el nombre de ${pl}`} title="Corregir el nombre" className={botonIcono}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                        </svg>
                      </button>
                      <button type="button" onClick={() => setBorrando(pl)} aria-label={`Borrar ${pl} de la lista`} title="Borrar de la lista" className={botonIcono}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
                {!plataformas.length && !puedeCrear && <li className="px-2 py-1.5 text-xs text-muted-foreground">Escribe un nombre para crear la primera plataforma.</li>}
              </ul>
            </>
          )}
        </PanelCelda>
      )}
    </>
  );
}
