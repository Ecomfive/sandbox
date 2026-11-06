"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { Ventana } from "@/components/ui/ventana";
import { crearRemision } from "./actions";

export interface BodegaRemision {
  id: string;
  nombre: string;
}

/** Lo que hay disponible de cada producto en cada bodega propia: `{ [bodega]: { [producto]: unidades } }`. */
export type StockPorBodega = Record<string, Record<string, number>>;

interface Linea {
  sku: OpcionSkuMaestro;
  cantidad: string;
}

/** «Nueva remisión»: de qué bodega sale, a cuál va y los productos con sus cantidades. Al crearla ofrece el papel que va con la carga. */
export function NuevaRemision({ propias, externas, productos, stock }: { propias: BodegaRemision[]; externas: BodegaRemision[]; productos: OpcionSkuMaestro[]; stock: StockPorBodega }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [desde, setDesde] = useState(propias[0]?.id ?? "");
  const [hacia, setHacia] = useState(externas.length === 1 ? externas[0].id : (externas.find((b) => /dropi/i.test(b.nombre))?.id ?? ""));
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creada, setCreada] = useState<{ id: string; numero: string } | null>(null);
  const [pendiente, empezar] = useTransition();

  const hay = (sku: string) => stock[desde]?.[sku] ?? 0;
  const numero = (t: string) => Number(t);
  const pasada = lineas.find((l) => numero(l.cantidad) > hay(l.sku.id));
  const incompleta = lineas.some((l) => !Number.isInteger(numero(l.cantidad)) || numero(l.cantidad) <= 0);
  const unidades = lineas.reduce((t, l) => t + (Number.isInteger(numero(l.cantidad)) ? numero(l.cantidad) : 0), 0);
  const falta = !desde ? "Elige de qué bodega sale." : !hacia ? "Elige a qué bodega va." : lineas.length === 0 ? "Agrega al menos un producto." : incompleta ? "Escribe la cantidad de cada producto." : pasada ? `De ${pasada.sku.codigo} solo hay ${hay(pasada.sku.id).toLocaleString("es-PA")} en esa bodega.` : null;

  function cerrar() {
    setAbierta(false);
    setCreada(null);
    setLineas([]);
    setNotas("");
    setError(null);
  }
  function agregar(sku: OpcionSkuMaestro | null) {
    if (sku && !lineas.some((l) => l.sku.id === sku.id)) setLineas((l) => [...l, { sku, cantidad: "" }]);
  }
  function crear() {
    setError(null);
    empezar(async () => {
      const r = await crearRemision({ desde, hacia, notas, lineas: lineas.map((l) => ({ sku: l.sku.id, cantidad: numero(l.cantidad) })) }).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if ("error" in r) return void setError(r.error);
      setCreada(r);
      router.refresh();
    });
  }

  if (!propias.length || !externas.length) return null;
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} aria-haspopup="dialog" className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background ${anilloFoco}`}>
        Nueva remisión
      </button>
      {abierta && (
        <Ventana abierto alCerrar={cerrar} titulo={creada ? `Remisión ${creada.numero}` : "Nueva remisión"} ancho="md">
          {creada ? (
            <div className="flex flex-col gap-4 p-5 text-sm">
              <p className="m-0">
                Las unidades salieron de la bodega y quedan <b className="font-medium">en camino</b>. Imprime el papel: va con la carga y ahí anotan lo que recibieron.
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={`/imprimir/remision/${creada.id}`} target="_blank" rel="noreferrer" className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 py-2 font-medium text-background ${anilloFoco}`}>
                  Imprimir remisión
                </a>
                <button type="button" onClick={cerrar} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-muted ${anilloFoco}`}>
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
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
                    {propias.map((b) => (
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
                    {externas.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <span className={labelClassSm}>Agregar producto</span>
                <ProveedorSkusMaestros opciones={productos}>
                  <CampoSkuMaestro key={lineas.length} valor={null} alCambiar={agregar} etiquetaAria="Agregar producto a la remisión" placeholder="Busca por SKU o nombre" claseContenedor="w-full" />
                </ProveedorSkusMaestros>
              </div>
              {lineas.length > 0 && (
                <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
                  {lineas.map((l) => {
                    const pasa = numero(l.cantidad) > hay(l.sku.id);
                    return (
                      <li key={l.sku.id} className="flex items-center gap-3 px-3 py-2">
                        <MiniaturaFoto url={l.sku.foto ?? null} nombre={l.sku.nombre} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{l.sku.codigo}</span>
                          <span className={`block text-xs tabular-nums ${pasa ? "text-destructive" : "text-muted-foreground"}`}>{hay(l.sku.id).toLocaleString("es-PA")} disponibles en la bodega</span>
                        </span>
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
                        <button type="button" aria-label={`Quitar ${l.sku.codigo}`} onClick={() => setLineas((ls) => ls.filter((x) => x.sku.id !== l.sku.id))} className={`min-h-9 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted ${anilloFoco}`}>
                          Quitar
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Notas (salen en el papel)</span>
                <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={300} autoComplete="off" placeholder="Ej: transportista, placa o cuántas cajas van" className={`${fieldClass} w-full`} />
              </label>
              {lineas.length > 0 && (
                <p className="m-0 text-xs text-muted-foreground tabular-nums">
                  {lineas.length} {lineas.length === 1 ? "producto" : "productos"} · {unidades.toLocaleString("es-PA")} unidades
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
                  {pendiente ? "Un momento..." : "Crear remisión"}
                </button>
                <button type="button" onClick={cerrar} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-muted ${anilloFoco}`}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </Ventana>
      )}
    </>
  );
}
