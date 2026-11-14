"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { revisarReparto, type LineaReparto } from "@/lib/wms/reparto-variantes";
import { dejarRepartoPendiente, obtenerRepartoVariantes, repartirStockVariantes, type DatosReparto } from "./reparto-actions";

/** Un aviso con un punto ámbar (la alerta es un punto, no una caja de color). */
function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px]">
      <span aria-hidden="true" className="mt-1.5 h-2 w-2 flex-none rounded-full bg-warning" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * En la ficha de una variante: su producto principal tiene el stock como general, pendiente de repartir (11 nov 2026, pedido de Jhokser; migración 0273). Lo que salga de esta
 * variante se descuenta de ese stock general hasta que se reparta.
 */
export function AvisoRepartoEnVariante({ padre, alAbrir }: { padre: { id: string; codigo: string }; alAbrir: (id: string) => void }) {
  return (
    <Aviso>
      <p className="m-0">
        <strong>Stock pendiente de repartir.</strong> El stock de este producto está como general en{" "}
        <button type="button" onClick={() => alAbrir(padre.id)} className={`font-medium underline-offset-2 hover:underline ${anilloFoco}`}>
          {padre.codigo}
        </button>
        , todavía sin repartir entre sus variantes: lo que salga de esta variante se descuenta de ahí.
      </p>
    </Aviso>
  );
}

/**
 * En la ficha del producto principal, dentro de «Variantes»: si su stock está pendiente de repartir, lo dice y deja repartirlo; si no, deja pasar el stock que hoy tienen sus
 * variantes al stock general (para un reparto que fue solo provisional) y dejarlo pendiente.
 */
export function RepartoStock({ id, codigo, pendiente, puedeEscribir, alCambiar }: { id: string; codigo: string; pendiente: boolean; puedeEscribir: boolean; alCambiar?: () => void }) {
  const { mostrarToast } = useToast();
  const [repartiendo, setRepartiendo] = useState(false);
  const [ocupado, empezar] = useTransition();

  function dejarPendiente() {
    if (!confirm(`¿Pasar al stock general de ${codigo} lo que hoy tienen sus variantes y dejarlo pendiente de repartir? Mientras tanto, lo que salga de una variante se descuenta del stock general.`)) return;
    empezar(async () => {
      const r = await dejarRepartoPendiente(id);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(`${r.unidades} unidades pasadas al stock general, pendientes de repartir`);
      alCambiar?.();
    });
  }

  if (!pendiente) {
    if (!puedeEscribir) return null;
    return (
      <button type="button" disabled={ocupado} onClick={dejarPendiente} className={`w-fit text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60 ${anilloFoco}`}>
        {ocupado ? "Pasando el stock…" : "Dejar el stock sin repartir (pendiente)"}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Aviso>
        <p className="m-0">
          <strong>El stock está pendiente de repartir entre las variantes.</strong> Se lleva como un número general del producto; mientras tanto, lo que sale de una variante se descuenta de ahí. Cuando se cuente lo
          que hay de cada una, se reparte.
        </p>
      </Aviso>
      {puedeEscribir &&
        (repartiendo ? (
          <PanelReparto id={id} alTerminar={(cambio) => { setRepartiendo(false); if (cambio) alCambiar?.(); }} />
        ) : (
          <BotonBarra className="w-fit" onClick={() => setRepartiendo(true)}>
            Repartir el stock
          </BotonBarra>
        ))}
    </div>
  );
}

/** Por cada bodega con stock general, una casilla por variante; solo se guarda cuando en todas lo repartido es exactamente lo que hay. */
function PanelReparto({ id, alTerminar }: { id: string; alTerminar: (cambio: boolean) => void }) {
  const { mostrarToast } = useToast();
  const [datos, setDatos] = useState<DatosReparto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [ocupado, empezar] = useTransition();

  useEffect(() => {
    let vigente = true;
    obtenerRepartoVariantes(id).then((r) => {
      if (!vigente) return;
      if ("error" in r) setError(r.error);
      else setDatos(r);
    });
    return () => {
      vigente = false;
    };
  }, [id]);

  const clave = (varianteId: string, bodegaId: string) => `${varianteId}|${bodegaId}`;
  const lineas: LineaReparto[] = useMemo(
    () => (datos ? datos.general.flatMap((g) => datos.variantes.map((v) => ({ varianteId: v.id, bodegaId: g.bodegaId, cantidad: valores[clave(v.id, g.bodegaId)] === undefined || valores[clave(v.id, g.bodegaId)] === "" ? 0 : Number(valores[clave(v.id, g.bodegaId)]) }))) : []),
    [datos, valores],
  );
  const revision = useMemo(() => (datos ? revisarReparto(datos.general, lineas) : null), [datos, lineas]);

  function quitarMarca() {
    empezar(async () => {
      const r = await repartirStockVariantes(id, []);
      if (r.error) return setError(r.error);
      mostrarToast("Listo: el producto ya no figura como sin repartir");
      alTerminar(true);
    });
  }

  function guardar() {
    empezar(async () => {
      const r = await repartirStockVariantes(id, lineas);
      if (r.error) return setError(r.error);
      mostrarToast(r.queda ? `${r.repartidas} unidades repartidas; siguen ${r.queda} como stock general` : `${r.repartidas} unidades repartidas entre las variantes`);
      alTerminar(true);
    });
  }

  if (error && !datos) {
    return (
      <p role="alert" className="m-0 text-xs text-destructive">
        {error}
      </p>
    );
  }
  if (!datos || !revision) return <p className="m-0 text-xs text-muted-foreground">Cargando…</p>;
  if (datos.general.length === 0) {
    // Sin stock general no hay nada que repartir: todo el stock ya está en las variantes y solo queda la marca. Quitarla evita que lo que salga de una variante se descuente de un principal en 0.
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3 text-[13px]">
        <p className="m-0">El producto ya no tiene stock general en ninguna bodega propia: todo el stock está en sus variantes.</p>
        {error && (
          <p role="alert" className="m-0 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <BotonBarra principal disabled={ocupado} onClick={quitarMarca}>
            {ocupado ? "Quitando…" : "Quitar la marca de sin repartir"}
          </BotonBarra>
          <BotonBarra disabled={ocupado} onClick={() => alTerminar(false)}>
            Cerrar
          </BotonBarra>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
      {datos.general.map((g) => {
        const r = revision.porBodega.find((b) => b.bodegaId === g.bodegaId)!;
        return (
          <fieldset key={g.bodegaId} className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-1 flex w-full flex-wrap items-baseline justify-between gap-2 p-0 text-sm font-medium">
              <span>
                {g.nombre} · hay {g.fisico}
              </span>
              <span className={`text-xs tabular-nums ${r.falta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {r.falta === 0 ? "Repartido todo" : r.falta > 0 ? (r.repartido === 0 ? "Sigue como stock general" : `Quedan ${r.falta} como stock general`) : `Te pasaste por ${-r.falta}`}
              </span>
            </legend>
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
              {datos.variantes.map((v) => (
                <li key={v.id}>
                  <label className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{v.opciones || v.nombre}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      placeholder="0"
                      aria-label={`${v.opciones || v.nombre} en ${g.nombre}`}
                      value={valores[clave(v.id, g.bodegaId)] ?? ""}
                      onChange={(e) => setValores((x) => ({ ...x, [clave(v.id, g.bodegaId)]: e.target.value }))}
                      className={`${fieldClassSm} w-24 text-right tabular-nums`}
                    />
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}
      {(error || revision.error) && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error ?? revision.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <BotonBarra onClick={() => alTerminar(false)} disabled={ocupado}>
          Cancelar
        </BotonBarra>
        <BotonBarra principal onClick={guardar} disabled={ocupado || !revision.valido || revision.total === 0}>
          {ocupado ? "Repartiendo…" : "Guardar el reparto"}
        </BotonBarra>
      </div>
    </div>
  );
}
