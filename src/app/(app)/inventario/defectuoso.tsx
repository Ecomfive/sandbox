"use client";

import { useState, useTransition } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { AlertaIcon } from "@/lib/nav-icons";
import { ACCIONES_DEFECTUOSO, EFECTO_ACCION_DEFECTUOSO, ETIQUETA_ACCION_DEFECTUOSO, MAX_MOTIVO_DEFECTUOSO, revisarDefectuoso, type AccionDefectuoso } from "@/lib/wms/defectuoso";
import { marcarDefectuoso } from "./stock-actions";

/** Una bodega propia con lo que tiene disponible y lo que ya está marcado como defectuoso. */
export interface BodegaDefectuosos {
  bodegaId: string;
  nombre: string;
  disponible: number;
  danado: number;
}

/** Algo a lo que se le puede marcar defectuoso: el producto, o cada una de sus variantes (y el stock general sin repartir), con sus bodegas. */
export interface OpcionDefectuoso {
  skuId: string;
  nombre: string;
  bodegas: BodegaDefectuosos[];
}

const unidades = (n: number) => `${n.toLocaleString("es-PA")} ${n === 1 ? "unidad" : "unidades"}`;

/**
 * «Defectuoso» en la fila de acciones de la ficha, junto a Entrada, Salida y Corregir (pedido de Dinora, 19 nov 2026): en vez de solo restar, se marcan unidades como defectuosas (siguen en
 * la bodega pero no se venden), se devuelven a disponible o se dan de baja. Siempre con el motivo, que queda en el historial del producto.
 */
export function PanelDefectuoso({
  opciones,
  puedeBaja,
  alGuardar,
  enLinea = false,
  nombre,
}: {
  /** Un producto simple trae una sola opción; un producto con variantes trae una por variante (y el stock general mientras esté sin repartir): se elige primero cuál. */
  opciones: OpcionDefectuoso[];
  puedeBaja: boolean;
  alGuardar: () => void;
  /** Un botón pequeño de texto para una fila (cada variante dentro de «Stock por bodega» del producto principal), en vez del botón grande de la fila de acciones. */
  enLinea?: boolean;
  /** A qué se le marca (el nombre de la variante), cuando no es el producto de la ficha. */
  nombre?: string;
}) {
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [accion, setAccion] = useState<AccionDefectuoso>("marcar");
  const [opcionId, setOpcionId] = useState("");
  const [bodegaId, setBodegaId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const acciones = ACCIONES_DEFECTUOSO.filter((a) => a !== "baja" || puedeBaja);
  const opcion = opciones.find((o) => o.skuId === opcionId) ?? null;
  const bodegas = opcion?.bodegas ?? [];
  const bodega = bodegas.find((b) => b.bodegaId === bodegaId) ?? null;
  // Cuántas unidades se pueden mover en la bodega elegida según la acción.
  const tope = !bodega ? null : accion === "marcar" ? Math.max(bodega.disponible, 0) : Math.max(bodega.danado, 0);

  function elegirOpcion(id: string) {
    setOpcionId(id);
    const o = opciones.find((x) => x.skuId === id);
    setBodegaId(o && o.bodegas.length === 1 ? o.bodegas[0].bodegaId : "");
    setCantidad("");
    setError(null);
  }

  function abrir() {
    setAccion("marcar");
    elegirOpcion(opciones.length === 1 ? opciones[0].skuId : "");
    setCantidad("");
    setMotivo("");
    setError(null);
    setAbierto(true);
  }

  function guardar() {
    if (!opcion) return setError("Elige la variante.");
    if (!bodega) return setError("Elige la bodega.");
    const r = revisarDefectuoso({ accion, cantidad, motivo, disponible: bodega.disponible, danado: bodega.danado });
    if ("error" in r) return setError(r.error);
    empezar(async () => {
      const res = await marcarDefectuoso({ skuId: opcion.skuId, bodegaId: bodega.bodegaId, accion: r.accion, cantidad: r.cantidad, motivo: r.motivo }).catch(() => ({ error: "No se pudo guardar." }));
      if (res.error) return setError(res.error);
      mostrarToast(r.accion === "marcar" ? `${unidades(r.cantidad)} marcadas como defectuosas` : r.accion === "devolver" ? `${unidades(r.cantidad)} vuelven a disponible` : `${unidades(r.cantidad)} dadas de baja`);
      setAbierto(false);
      alGuardar();
    });
  }

  return (
    <>
      {enLinea ? (
        <button
          type="button"
          onClick={abrir}
          aria-haspopup="dialog"
          disabled={!opciones.length}
          aria-label={`Defectuoso: ${nombre ?? "marcar unidades"}${opciones.length === 1 && opciones[0].bodegas.length === 1 ? ` en ${opciones[0].bodegas[0].nombre}` : ""}`}
          className="inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-md border border-border-control bg-card px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          <AlertaIcon aria-hidden="true" className="h-3 w-3" />
          Defectuoso
        </button>
      ) : (
        <BotonAccion icono={AlertaIcon} onClick={abrir} aria-haspopup="dialog" disabled={!opciones.length} title={opciones.length ? undefined : "No hay unidades para marcar ni bodegas propias"}>
          Defectuoso
        </BotonAccion>
      )}
      <Ventana abierto={abierto} alCerrar={() => !pendiente && setAbierto(false)} ancho="sm" titulo={nombre ? `Defectuoso: ${nombre}` : "Productos defectuosos"}>
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
        >
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className={`${labelClassSm} mb-1`}>¿Qué quieres hacer?</legend>
            {acciones.map((a) => (
              <label key={a} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${accion === a ? "border-foreground bg-muted/50" : "border-border"}`}>
                <input
                  type="radio"
                  name="accion-defectuoso"
                  value={a}
                  checked={accion === a}
                  onChange={() => {
                    setAccion(a);
                    setError(null);
                  }}
                  className="mt-1"
                />
                <span className="flex flex-col">
                  <span className="font-medium">{ETIQUETA_ACCION_DEFECTUOSO[a]}</span>
                  <span className="text-xs text-muted-foreground">{EFECTO_ACCION_DEFECTUOSO[a]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {opciones.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Variante</span>
              <select value={opcionId} onChange={(e) => elegirOpcion(e.target.value)} required className={fieldClassSm}>
                <option value="">Elige la variante</option>
                {opciones.map((o) => (
                  <option key={o.skuId} value={o.skuId}>
                    {o.nombre} · {o.bodegas.reduce((t, b) => t + b.disponible, 0).toLocaleString("es-PA")} disp. · {o.bodegas.reduce((t, b) => t + b.danado, 0).toLocaleString("es-PA")} defectuosas
                  </option>
                ))}
              </select>
            </label>
          )}
          {!opcion ? null : bodegas.length > 1 ? (
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Bodega</span>
              <select
                value={bodegaId}
                onChange={(e) => {
                  setBodegaId(e.target.value);
                  setError(null);
                }}
                required
                className={fieldClassSm}
              >
                <option value="">Elige la bodega</option>
                {bodegas.map((b) => (
                  <option key={b.bodegaId} value={b.bodegaId}>
                    {b.nombre} · {b.disponible.toLocaleString("es-PA")} disp. · {b.danado.toLocaleString("es-PA")} defectuosas
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="m-0 text-[13px] text-muted-foreground">
              {nombre ? `${nombre} · ` : ""}{bodegas.length === 0 ? "Sin bodegas con unidades" : "Bodega"}: {bodegas[0]?.nombre} · {bodegas[0]?.disponible.toLocaleString("es-PA")} disponibles · {bodegas[0]?.danado.toLocaleString("es-PA")} defectuosas
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Cuántas unidades{tope !== null ? ` (hasta ${tope.toLocaleString("es-PA")})` : ""}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={tope ?? undefined}
              step={1}
              required
              value={cantidad}
              onChange={(e) => {
                setCantidad(e.target.value);
                setError(null);
              }}
              className={`${fieldClassSm} text-base tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>{accion === "marcar" ? "¿Qué tiene de defectuoso?" : "Motivo"}</span>
            <textarea
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setError(null);
              }}
              required
              rows={3}
              maxLength={MAX_MOTIVO_DEFECTUOSO}
              placeholder={accion === "marcar" ? "Ej.: llegaron con la tapa rota; no enciende" : accion === "devolver" ? "Ej.: se revisaron y funcionan bien" : "Ej.: se botaron; se devolvieron al proveedor"}
              className={`${fieldClassSm} h-auto py-1.5`}
            />
            <span className="text-xs text-muted-foreground">Queda en el historial del producto con tu nombre y la hora.</span>
          </label>
          {error && (
            <p role="alert" className="m-0 text-[13px] text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={pendiente} onClick={() => setAbierto(false)} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
              Cancelar
            </button>
            <button type="submit" disabled={pendiente} className="rounded-md bg-primario px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
              {pendiente ? "Guardando…" : ETIQUETA_ACCION_DEFECTUOSO[accion]}
            </button>
          </div>
        </form>
      </Ventana>
    </>
  );
}
