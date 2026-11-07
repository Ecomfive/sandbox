"use client";

import { useState, useTransition } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { LapizIcon } from "@/lib/nav-icons";
import { MAX_NOTA_CORRECCION, revisarCorreccionStock, textoDiferencia } from "@/lib/wms/correccion-stock";
import { corregirStock, type LoteStock } from "./stock-actions";

/** Una bodega propia con lo que tiene ahora. */
export interface BodegaCorregible {
  bodegaId: string;
  nombre: string;
  fisico: number;
}

/**
 * «Corregir» en la fila de acciones de la ficha, junto a Entrada y Salida (pedido de Hernán, 7 nov 2026): se elige la bodega, se escribe la cantidad correcta del físico, se ve cuánto
 * cambia y, antes de guardar, por qué. Queda como ajuste en el historial con la nota. Un producto con vencimiento se corrige lote por lote.
 */
export function CorregirStock({
  skuId,
  bodegas,
  lotes,
  manejaVencimiento,
  alGuardar,
}: {
  skuId: string;
  bodegas: BodegaCorregible[];
  /** Los lotes con unidades (solo si maneja vencimiento), de todas las bodegas. */
  lotes: LoteStock[];
  manejaVencimiento: boolean;
  alGuardar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [bodegaId, setBodegaId] = useState("");
  const [lote, setLote] = useState("");
  const [correcto, setCorrecto] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const bodega = bodegas.find((b) => b.bodegaId === bodegaId) ?? null;
  const delaBodega = lotes.filter((l) => l.bodegaId === bodegaId);
  const elegido = delaBodega.find((l) => l.loteId === lote) ?? null;
  const actual = !bodega ? null : manejaVencimiento ? (elegido?.cantidad ?? null) : bodega.fisico;
  const revision = actual === null || correcto.trim() === "" ? null : revisarCorreccionStock({ actual, correcto, nota: nota || "---" });
  const diferencia = revision && "diferencia" in revision ? revision.diferencia : null;

  function elegirBodega(id: string) {
    setBodegaId(id);
    const suyos = lotes.filter((l) => l.bodegaId === id);
    setLote(suyos.length === 1 ? suyos[0].loteId : "");
  }

  function abrir() {
    elegirBodega(bodegas.length === 1 ? bodegas[0].bodegaId : "");
    setCorrecto("");
    setNota("");
    setError(null);
    setAbierto(true);
  }

  function guardar() {
    if (!bodega) return setError("Elige la bodega que vas a corregir.");
    if (actual === null) return setError("Elige el lote que vas a corregir.");
    const r = revisarCorreccionStock({ actual, correcto, nota });
    if ("error" in r) return setError(r.error);
    empezar(async () => {
      const res = await corregirStock({ skuId, bodegaId: bodega.bodegaId, loteId: elegido?.loteId ?? null, visto: actual, correcto, nota }).catch(() => ({ error: "No se pudo guardar la corrección." }));
      if (res.error) return setError(res.error);
      mostrarToast("Corrección guardada");
      setAbierto(false);
      alGuardar();
    });
  }

  return (
    <>
      <BotonAccion icono={LapizIcon} onClick={abrir} aria-haspopup="dialog" disabled={!bodegas.length} title={bodegas.length ? undefined : "No hay bodegas propias para corregir"}>
        Corregir
      </BotonAccion>
      <Ventana abierto={abierto} alCerrar={() => !pendiente && setAbierto(false)} ancho="sm" titulo="Corregir el inventario">
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
        >
          {bodegas.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Bodega</span>
              <select value={bodegaId} onChange={(e) => elegirBodega(e.target.value)} required className={fieldClassSm}>
                <option value="">Elige la bodega</option>
                {bodegas.map((b) => (
                  <option key={b.bodegaId} value={b.bodegaId}>
                    {b.nombre} · {b.fisico.toLocaleString("es-PA")} u.
                  </option>
                ))}
              </select>
            </label>
          )}
          {bodegas.length === 1 && <p className="m-0 text-[13px] text-muted-foreground">Bodega: {bodegas[0].nombre}</p>}
          {manejaVencimiento && bodega && (
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Lote</span>
              {delaBodega.length ? (
                <select value={lote} onChange={(e) => setLote(e.target.value)} required className={fieldClassSm}>
                  <option value="">Elige el lote</option>
                  {delaBodega.map((l) => (
                    <option key={l.loteId} value={l.loteId}>
                      {l.lote} · {l.cantidad.toLocaleString("es-PA")} u. · vence {l.fechaVencimiento}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[13px] text-muted-foreground">Esta bodega no tiene lotes con unidades. Para cargar un lote, usa «Entrada».</span>
              )}
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className={labelClassSm}>Tiene ahora</span>
              <span className="text-lg font-semibold tabular-nums">{actual === null ? "—" : actual.toLocaleString("es-PA")}</span>
            </div>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Lo correcto</span>
              <input type="number" inputMode="numeric" min={0} step={1} required value={correcto} onChange={(e) => setCorrecto(e.target.value)} className={`${fieldClassSm} text-base tabular-nums`} />
            </label>
          </div>
          <p role="status" className={`m-0 min-h-5 text-[13px] ${diferencia ? "font-medium text-primario" : "text-muted-foreground"}`}>
            {diferencia ? textoDiferencia(diferencia) : "Escribe la cantidad que de verdad hay en esta bodega."}
          </p>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>¿Por qué lo corriges?</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              required
              rows={3}
              maxLength={MAX_NOTA_CORRECCION}
              placeholder="Ej.: al cargar puse 438 y eran 430; conté mal la caja 3"
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
              {pendiente ? "Guardando…" : "Guardar corrección"}
            </button>
          </div>
        </form>
      </Ventana>
    </>
  );
}
