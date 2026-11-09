"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { textoCaja, type CajaGuardada } from "@/lib/wms/cajas";
import { crearTraslado } from "./actions";

interface Linea {
  sku: OpcionSkuMaestro;
  cantidad: string;
  /** Cuántas cajas se eligieron de cada grupo guardado: `{ [id de la caja]: cuántas }`. */
  elegidas: Record<string, string>;
  /** En qué ubicación del destino quedan. */
  ubicacion: string;
}

/**
 * «Nuevo traslado»: de qué bodega sale, a cuál va, los productos con sus unidades y una nota libre. Un producto guardado por cajas se traslada eligiendo cuáles, como en la remisión; si el destino
 * tiene ubicaciones se elige dónde quedan, y si no, llegan como unidades.
 */
export function NuevoTraslado({
  bodegas,
  productos,
  stock,
  cajas,
  ubicaciones,
}: {
  bodegas: { id: string; nombre: string }[];
  productos: OpcionSkuMaestro[];
  stock: Record<string, Record<string, number>>;
  cajas: Record<string, Record<string, CajaGuardada[]>>;
  ubicaciones: Record<string, { id: string; codigo: string; notas: string | null }[]>;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierta, setAbierta] = useState(false);
  const [desde, setDesde] = useState(bodegas[0]?.id ?? "");
  const [hacia, setHacia] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const hay = (sku: string) => stock[desde]?.[sku] ?? 0;
  const numero = (t: string) => Number(t);
  const cajasDe = (sku: string) => cajas[desde]?.[sku] ?? [];
  const lugares = ubicaciones[hacia] ?? [];
  const elegidasDe = (l: Linea) => cajasDe(l.sku.id).map((c) => ({ c, n: numero(l.elegidas[c.id] ?? "") })).filter(({ n }) => Number.isInteger(n) && n > 0);
  const cantidadDe = (l: Linea) => (cajasDe(l.sku.id).length ? elegidasDe(l).reduce((t, { c, n }) => t + n * c.porCaja, 0) : numero(l.cantidad));
  const cajaPasada = (l: Linea) => cajasDe(l.sku.id).some((c) => numero(l.elegidas[c.id] ?? "") > c.cajas);
  const pasada = lineas.find((l) => cantidadDe(l) > hay(l.sku.id) || cajaPasada(l));
  const incompleta = lineas.some((l) => !Number.isInteger(cantidadDe(l)) || cantidadDe(l) <= 0);
  const sinLugar = lineas.find((l) => cajasDe(l.sku.id).length > 0 && lugares.length > 0 && !lugares.some((u) => u.id === l.ubicacion));
  const unidades = lineas.reduce((t, l) => t + (Number.isInteger(cantidadDe(l)) ? cantidadDe(l) : 0), 0);
  const totalCajas = lineas.reduce((t, l) => t + elegidasDe(l).reduce((s, { n }) => s + n, 0), 0);
  const falta = !desde
    ? "Elige de qué bodega sale."
    : !hacia
      ? "Elige a qué bodega va."
      : desde === hacia
        ? "La bodega de origen y la de destino son la misma."
        : lineas.length === 0
          ? "Agrega al menos un producto."
          : incompleta
            ? "Escribe la cantidad de cada producto."
            : pasada
              ? `De ${pasada.sku.codigo} no hay tanto en esa bodega.`
              : sinLugar
                ? `Elige dónde quedan las cajas de ${sinLugar.sku.codigo}.`
                : null;

  function cerrar() {
    setAbierta(false);
    setLineas([]);
    setNotas("");
    setHacia("");
    setError(null);
  }
  function agregar(sku: OpcionSkuMaestro | null) {
    if (sku && !lineas.some((l) => l.sku.id === sku.id)) setLineas((l) => [...l, { sku, cantidad: "", elegidas: {}, ubicacion: "" }]);
  }
  function crear() {
    setError(null);
    empezar(async () => {
      const r = await crearTraslado({
        desde,
        hacia,
        notas,
        lineas: lineas.map((l) => ({ sku: l.sku.id, cantidad: cantidadDe(l), cajas: elegidasDe(l).map(({ c, n }) => ({ id: c.id, cajas: n })), ubicacion_destino: l.ubicacion || undefined })),
      }).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if ("error" in r) return void setError(r.error);
      mostrarToast(`Traslado ${r.numero} hecho`);
      cerrar();
      router.refresh();
    });
  }

  if (bodegas.length < 2) return null;
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} aria-haspopup="dialog" className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background ${anilloFoco}`}>
        Nuevo traslado
      </button>
      {abierta && (
        <Ventana abierto alCerrar={cerrar} titulo="Nuevo traslado" ancho="md">
          <form
            className="flex flex-col gap-4 p-5 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (!falta && !pendiente) crear();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Sale de</span>
                <select value={desde} onChange={(e) => setDesde(e.target.value)} className={`${fieldClass} w-full`}>
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Va a</span>
                <select value={hacia} onChange={(e) => setHacia(e.target.value)} className={`${fieldClass} w-full`}>
                  <option value="" disabled>
                    Elige la bodega
                  </option>
                  {bodegas
                    .filter((b) => b.id !== desde)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nombre}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelClassSm}>Agregar producto</span>
              <ProveedorSkusMaestros opciones={productos.filter((p) => hay(p.id) > 0)}>
                <CampoSkuMaestro key={`${desde}-${lineas.length}`} valor={null} alCambiar={agregar} etiquetaAria="Agregar producto al traslado" placeholder="Busca por SKU o nombre" claseContenedor="w-full" />
              </ProveedorSkusMaestros>
            </div>
            {lineas.length > 0 && (
              <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
                {lineas.map((l) => {
                  const pasa = cantidadDe(l) > hay(l.sku.id);
                  const guardadas = cajasDe(l.sku.id);
                  return (
                    <li key={l.sku.id} className="flex flex-col gap-2 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <MiniaturaFoto url={l.sku.foto ?? null} nombre={l.sku.nombre} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{l.sku.nombre}</span>
                          <span className="block truncate text-xs text-muted-foreground">{l.sku.codigo}</span>
                          <CodigosProducto numero={l.sku.numero} barras={l.sku.barras} className="block" />
                          <span className={`block text-xs tabular-nums ${pasa ? "text-destructive" : "text-muted-foreground"}`}>{hay(l.sku.id).toLocaleString("es-PA")} disponibles en la bodega</span>
                        </span>
                        {guardadas.length > 0 ? (
                          <span className="w-24 text-right text-sm font-medium tabular-nums">{cantidadDe(l).toLocaleString("es-PA")} u.</span>
                        ) : (
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            aria-label={`Unidades de ${l.sku.codigo}`}
                            value={l.cantidad}
                            onChange={(e) => setLineas((ls) => ls.map((x) => (x.sku.id === l.sku.id ? { ...x, cantidad: e.target.value } : x)))}
                            placeholder="0"
                            className={`${fieldClassSm} w-24 tabular-nums`}
                          />
                        )}
                        <button type="button" aria-label={`Quitar ${l.sku.codigo}`} onClick={() => setLineas((ls) => ls.filter((x) => x.sku.id !== l.sku.id))} className={`min-h-9 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted ${anilloFoco}`}>
                          Quitar
                        </button>
                      </div>
                      {guardadas.length > 0 && (
                        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-2 text-xs">
                          <ul className="m-0 flex list-none flex-col gap-1 p-0">
                            {guardadas.map((caja) => {
                              const pide = numero(l.elegidas[caja.id] ?? "");
                              return (
                                <li key={caja.id} className="flex items-center gap-2">
                                  <span className={`min-w-0 flex-1 ${pide > caja.cajas ? "text-destructive" : ""}`}>
                                    {textoCaja(caja)}
                                    {caja.lugar ? ` · ${caja.lugar}` : ""}
                                  </span>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={caja.cajas}
                                    step={1}
                                    aria-label={`Cajas de ${caja.porCaja} en ${caja.ubicacion} de ${l.sku.codigo}`}
                                    value={l.elegidas[caja.id] ?? ""}
                                    onChange={(e) => setLineas((ls) => ls.map((x) => (x.sku.id === l.sku.id ? { ...x, elegidas: { ...x.elegidas, [caja.id]: e.target.value } } : x)))}
                                    placeholder="0"
                                    className={`${fieldClassSm} w-20 tabular-nums`}
                                  />
                                </li>
                              );
                            })}
                          </ul>
                          {!hacia ? null : lugares.length > 0 ? (
                            <label className="flex items-center gap-2">
                              <span className="flex-1">Quedan en</span>
                              <select
                                aria-label={`Ubicación de destino de ${l.sku.codigo}`}
                                value={l.ubicacion}
                                onChange={(e) => setLineas((ls) => ls.map((x) => (x.sku.id === l.sku.id ? { ...x, ubicacion: e.target.value } : x)))}
                                className={`${fieldClassSm} min-w-40`}
                              >
                                <option value="">Elige la ubicación</option>
                                {lugares.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.codigo}
                                    {u.notas ? ` · ${u.notas}` : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <p className="m-0 text-muted-foreground">Esa bodega no tiene ubicaciones: llegan como unidades, sin cajas.</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Notas</span>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={500} placeholder="Ej: traslado del 7 nov, número 0042, lo llevó Luis" className={`${fieldClass} h-auto w-full py-2`} />
            </label>
            {lineas.length > 0 && (
              <p className="m-0 text-xs text-muted-foreground tabular-nums">
                {lineas.length} {lineas.length === 1 ? "producto" : "productos"} · {unidades.toLocaleString("es-PA")} unidades{totalCajas > 0 ? ` · ${totalCajas.toLocaleString("es-PA")} ${totalCajas === 1 ? "caja" : "cajas"}` : ""}
              </p>
            )}
            {error && (
              <p role="alert" className="m-0 text-destructive">
                {error}
              </p>
            )}
            {falta && <p className="m-0 text-xs text-muted-foreground">Falta: {falta}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pendiente || !!falta} className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-40 ${anilloFoco}`}>
                {pendiente ? "Un momento..." : "Hacer traslado"}
              </button>
              <button type="button" onClick={cerrar} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-muted ${anilloFoco}`}>
                Cancelar
              </button>
            </div>
          </form>
        </Ventana>
      )}
    </>
  );
}
