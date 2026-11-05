"use client";

import { useId, useState, useTransition } from "react";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { LapizIcon } from "@/lib/nav-icons";
import { esBodegaDropi } from "@/lib/publicaciones/automatico";
import { ordenarVariaciones, stockEnBodega } from "@/lib/publicaciones/privatizar-variable";
import { codigoBodega, fechaHoraLectura, idsDeDropi } from "@/lib/publicaciones/sincronizar-dropi";
import { CONCEPTO_STOCK, MAX_CONCEPTO_STOCK, MAX_UNIDADES_STOCK } from "@/lib/publicaciones/stock-dropi";
import { cambiarStockDropi } from "./actions";
import { POCO_STOCK_VARIACION, textoVariacionesBajas, type FilaPublicacion } from "./def-publicaciones";

interface BodegaVista {
  id: number;
  nombre: string;
  stock: number;
  /** Las unidades que esperan «Aplicar en Dropi» en esta bodega. */
  pendiente: number | null;
  editable: boolean;
  /** Con variaciones, el stock de cada una en esta bodega (el lápiz va en cada variación, no en la bodega). */
  variaciones: VariacionVista[] | null;
}

interface VariacionVista {
  firma: string;
  etiqueta: string;
  sku: string | null;
  stock: number;
  pendiente: number | null;
  editable: boolean;
}

/** Lo que se está editando dentro de un ID: la bodega y, con variaciones, cuál. */
const claveDe = (bodega: number, firma: string | null) => `${bodega}|${firma ?? ""}`;

/** Si el stock de la publicación se puede cambiar desde aquí: existe en Dropi y no es una duplicada ni un borrador. */
export const puedeCambiarStock = (p: FilaPublicacion) => p.dropiId.trim() !== "" && !p.sinPublicar && !p.duplicadaDe;

/**
 * Las bodegas en Dropi de una publicación con su stock y, para quien puede modificar el módulo, el lápiz que cambia el stock de una bodega de ECOMFIVE
 * (28 oct 2026): se escriben las unidades que deben quedar y queda pendiente para «Aplicar en Dropi». Aparecen también las bodegas de ECOMFIVE sin stock
 * (Dropi no las lista), para poder darle stock a un producto agotado. La B280 es de Dropi: se ve, pero no se edita.
 * Con dos IDs en la publicación («6667-8295»), cada ID va en su lista con su propio lápiz (31 oct 2026): antes se veía solo el de más stock y el
 * cambio se iba al primer ID escrito. Un producto con variaciones (5 nov 2026) muestra dentro de cada bodega sus variaciones, cada una con su stock y su lápiz (también las que están
 * en cero): su stock es por variación, así que la bodega no se edita. La B280 solo muestra las que tienen stock.
 */
export function BodegasStockDropi({
  p,
  bodegasEcomfive,
  puedeEscribir,
}: {
  p: FilaPublicacion;
  bodegasEcomfive: { id: number; nombre: string }[];
  puedeEscribir: boolean;
}) {
  const editable = puedeEscribir && puedeCambiarStock(p);
  // «ID:bodega|variación» de lo que se está editando.
  const [editando, setEditando] = useState<string | null>(null);
  const primero = idsDeDropi(p.dropiId)[0] ?? 0;
  const llave = (producto: number, bodega: number, firma: string | null) => `${producto}:${claveDe(bodega, firma)}`;
  const pendiente = new Map(p.stockPendiente.map((s) => [llave(s.producto ?? primero, s.bodega, s.firma), s.unidades]));
  // Sin lectura de Dropi, una lista vacía del primer ID: así igual se le puede dar stock en una bodega de ECOMFIVE.
  const ids = p.stockPorId.length ? p.stockPorId : [{ id: primero, archivado: false, stock: 0, bodegas: [], variable: false, variaciones: null }];
  const varios = ids.length > 1;
  const grupos = ids
    .map((g) => {
      const variacionesDe = (bodega: number): VariacionVista[] | null => {
        if (!g.variable) return null;
        const dropi = esBodegaDropi(bodega);
        return ordenarVariaciones(g.variaciones ?? [])
          .filter((v) => !dropi || stockEnBodega(v, bodega) > 0)
          .map((v) => ({
            firma: v.firma,
            etiqueta: v.etiqueta,
            sku: v.sku,
            stock: stockEnBodega(v, bodega),
            pendiente: pendiente.get(llave(g.id, bodega, v.firma)) ?? null,
            editable: editable && !dropi,
          }));
      };
      const lista: BodegaVista[] = g.bodegas.map((b) => ({
        id: b.id,
        nombre: b.nombre,
        stock: b.stock,
        pendiente: pendiente.get(llave(g.id, b.id, null)) ?? null,
        editable: editable && !esBodegaDropi(b.id) && !g.variable,
        variaciones: variacionesDe(b.id),
      }));
      if (editable)
        for (const b of bodegasEcomfive)
          if (!esBodegaDropi(b.id) && !lista.some((x) => x.id === b.id))
            lista.push({ id: b.id, nombre: b.nombre, stock: 0, pendiente: pendiente.get(llave(g.id, b.id, null)) ?? null, editable: !g.variable, variaciones: variacionesDe(b.id) });
      return { ...g, lista };
    })
    .filter((g) => g.lista.length);
  if (!grupos.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClassSm}>Bodegas en Dropi</span>
      {varios && <span className="text-xs text-muted-foreground">Esta publicación tiene {grupos.length} IDs en Dropi: cada uno con su stock. El lápiz cambia el de ese ID.</span>}
      {grupos.some((g) => g.variable && !g.variaciones) && (
        <span className="text-xs text-muted-foreground">Este producto tiene variaciones y la última lectura no las trajo: pulsa «Actualizar datos» para cambiar su stock.</span>
      )}
      {grupos.map((g) => (
        <div key={g.id} className="flex flex-col gap-1">
          {varios && (
            <span className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold">
                ID {g.id}
                {g.archivado && <span className="font-normal text-muted-foreground"> · archivado en Dropi</span>}
              </span>
              <span className="tabular-nums text-muted-foreground">{g.stock.toLocaleString("es-PA")} u.</span>
            </span>
          )}
          <ListaBodegas
            lista={g.lista}
            producto={varios ? g.id : null}
            editando={editando?.startsWith(`${g.id}:`) ? editando.slice(String(g.id).length + 1) : null}
            alEditar={(clave) => setEditando(clave === null ? null : `${g.id}:${clave}`)}
            editor={(b, v) => <EditarStock p={p} producto={g.id} varios={varios} bodega={b} variacion={v} alCerrar={() => setEditando(null)} />}
          />
        </div>
      ))}
      {p.variacionesBajas.length > 0 && (
        <span className="text-xs text-warning tabular-nums">
          Con menos de {POCO_STOCK_VARIACION} unidades: {textoVariacionesBajas(p.variacionesBajas)}
        </span>
      )}
      <span className="text-xs text-muted-foreground tabular-nums">
        {varios
          ? `Total entre los ${grupos.length} IDs ${grupos.reduce((t, g) => t + g.stock, 0).toLocaleString("es-PA")} u. · `
          : (p.bodegasDropi?.length ?? 0) > 1 && `Total ${(p.stockProveedor ?? 0).toLocaleString("es-PA")} u. · `}
        {p.stockPrivadoProveedor ? `${p.stockPrivadoProveedor.toLocaleString("es-PA")} reservadas a privados · ` : ""}
        {p.leidoProveedor && `Actualizado desde Dropi el ${fechaHoraLectura(p.leidoProveedor)}`}
      </span>
    </div>
  );
}

/** Las unidades de una bodega o variación, lo que espera «Aplicar en Dropi» y su lápiz. */
function StockConLapiz({ stock, pendiente, editable, etiqueta, alEditar }: { stock: number; pendiente: number | null; editable: boolean; etiqueta: string; alEditar: () => void }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="flex flex-col items-end leading-tight">
        <span className="font-semibold tabular-nums">{stock.toLocaleString("es-PA")} u.</span>
        {pendiente !== null && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive tabular-nums">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
            {pendiente.toLocaleString("es-PA")} u. pendiente
          </span>
        )}
      </span>
      {editable && (
        <Tooltip texto="Cambiar stock">
          <button
            type="button"
            onClick={alEditar}
            aria-label={`Cambiar el stock de ${etiqueta} en Dropi`}
            className={`flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground ${anilloFoco}`}
          >
            <LapizIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      )}
    </span>
  );
}

/** Las bodegas de un ID, con el lápiz de cada una (o su editor abierto) y, con variaciones, las de cada bodega. */
function ListaBodegas({
  lista,
  producto,
  editando,
  alEditar,
  editor,
}: {
  lista: BodegaVista[];
  /** El ID de Dropi, para el lector de pantalla (solo con varios IDs). */
  producto: number | null;
  /** `claveDe` de lo que se está editando. */
  editando: string | null;
  alEditar: (clave: string | null) => void;
  editor: (b: BodegaVista, v: VariacionVista | null) => React.ReactNode;
}) {
  const deId = producto ? ` del ID ${producto}` : "";
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg bg-muted p-0 px-4 text-sm">
      {lista.map((b) =>
        editando === claveDe(b.id, null) ? (
          <li key={b.id} className="py-2.5">
            {editor(b, null)}
          </li>
        ) : (
          <li key={b.id} className="py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">
                <span className="font-mono font-semibold">{codigoBodega(b.id)}</span> · {b.nombre}
              </span>
              <StockConLapiz stock={b.stock} pendiente={b.pendiente} editable={b.editable} etiqueta={`${codigoBodega(b.id)}${deId}`} alEditar={() => alEditar(claveDe(b.id, null))} />
            </div>
            {b.variaciones && b.variaciones.length > 0 && (
              <ul className="m-0 mt-1.5 flex list-none flex-col divide-y divide-border border-t border-border p-0">
                {b.variaciones.map((v) =>
                  editando === claveDe(b.id, v.firma) ? (
                    <li key={v.firma} className="py-2.5">
                      {editor(b, v)}
                    </li>
                  ) : (
                    <li key={v.firma} className="flex min-h-9 items-center justify-between gap-3 py-1 pl-3">
                      <span className="min-w-0 truncate">{v.etiqueta}</span>
                      <StockConLapiz
                        stock={v.stock}
                        pendiente={v.pendiente}
                        editable={v.editable}
                        etiqueta={`${v.etiqueta} en ${codigoBodega(b.id)}${deId}`}
                        alEditar={() => alEditar(claveDe(b.id, v.firma))}
                      />
                    </li>
                  ),
                )}
              </ul>
            )}
          </li>
        ),
      )}
    </ul>
  );
}

/** El stock nuevo de una bodega y el concepto del movimiento. Va dentro del formulario de la ficha: Enter no lo envía, deja el cambio pendiente. */
function EditarStock({
  p,
  producto,
  varios,
  bodega,
  variacion,
  alCerrar,
}: {
  p: FilaPublicacion;
  producto: number;
  varios: boolean;
  bodega: BodegaVista;
  /** Con variaciones, cuál se cambia (el stock y lo pendiente son los suyos, no los de la bodega). */
  variacion: VariacionVista | null;
  alCerrar: () => void;
}) {
  const id = useId();
  const { mostrarToast } = useToast();
  const hoy = variacion?.stock ?? bodega.stock;
  const [unidades, setUnidades] = useState(String((variacion ?? bodega).pendiente ?? hoy));
  const [concepto, setConcepto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const n = unidades.trim() === "" ? NaN : Number(unidades);
  const valido = Number.isInteger(n) && n >= 0 && n <= MAX_UNIDADES_STOCK;
  const diferencia = valido ? n - hoy : 0;

  function guardar() {
    if (!valido || pendiente)
      return void setError(valido ? null : `Escribe las unidades que deben quedar (de 0 a ${MAX_UNIDADES_STOCK.toLocaleString("es-PA")}).`);
    setError(null);
    empezar(async () => {
      const r = await cambiarStockDropi(p.id, { producto, bodega: bodega.id, nombreBodega: bodega.nombre, unidades: n, concepto, firma: variacion?.firma, etiqueta: variacion?.etiqueta }).catch(() => ({
        error: "No se pudo. Inténtalo de nuevo.",
        detalle: undefined,
      }));
      if (r.error) return void setError(r.error);
      alCerrar();
      mostrarToast(r.detalle ?? "Stock pendiente para Dropi");
    });
  }
  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      guardar();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      alCerrar();
    }
  };

  return (
    <div className="flex flex-col gap-2.5" onKeyDown={alTeclear}>
      <span className="min-w-0 truncate">
        {varios && <span className="font-semibold">ID {producto} · </span>}
        {variacion && <span className="font-semibold">{variacion.etiqueta} · </span>}
        <span className="font-mono font-semibold">{codigoBodega(bodega.id)}</span> · {bodega.nombre} · hoy {hoy.toLocaleString("es-PA")} u.
      </span>
      <div className="grid gap-2.5 sm:grid-cols-[9rem_1fr]">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Stock nuevo</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_UNIDADES_STOCK}
            step={1}
            autoFocus
            value={unidades}
            onChange={(e) => setUnidades(e.target.value)}
            aria-invalid={!!error || undefined}
            aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ""}`}
            className={`${fieldClass} w-full tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Concepto en Dropi</span>
          <input
            type="text"
            maxLength={MAX_CONCEPTO_STOCK}
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder={`Ej: ${CONCEPTO_STOCK}`}
            className={`${fieldClass} w-full`}
          />
        </label>
      </div>
      <span id={`${id}-ayuda`} className="text-xs tabular-nums text-muted-foreground">
        {valido && diferencia !== 0 ? `${diferencia > 0 ? "Entrada" : "Salida"} de ${Math.abs(diferencia).toLocaleString("es-PA")} u. en Dropi` : "Sin cambio"}
      </span>
      {error && (
        <span id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente}
          className={`inline-flex min-h-9 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60 ${anilloFoco}`}
        >
          {pendiente ? "Guardando…" : "Dejar pendiente para Dropi"}
        </button>
        <button
          type="button"
          onClick={alCerrar}
          className={`inline-flex min-h-9 items-center rounded-md border border-border-control px-3 text-sm font-medium hover:bg-card ${anilloFoco}`}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
