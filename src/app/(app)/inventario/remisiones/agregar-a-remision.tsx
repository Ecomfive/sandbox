"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import { agregarAremision } from "./actions";
import type { StockPorBodega } from "./nueva-remision";

interface Linea {
  sku: OpcionSkuMaestro;
  cantidad: string;
}

/**
 * «Agregar productos» en la ficha de una remisión que ya existe (12 nov 2026, pedido de Hernán): suma líneas a la misma remisión, con el mismo número, así que el papel sigue siendo
 * uno. Solo se ofrece mientras ninguna línea esté recibida (lo decide la ficha y la base lo vuelve a comprobar). Los productos que ya están en la remisión no se ofrecen.
 */
export function AgregarAremision({
  remisionId,
  numero,
  origenId,
  productos,
  stock,
  yaEstan,
}: {
  remisionId: string;
  numero: string;
  origenId: string;
  productos: OpcionSkuMaestro[];
  stock: StockPorBodega;
  yaEstan: string[];
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const hay = (sku: string) => stock[origenId]?.[sku] ?? 0;
  const disponibles = productos.filter((p) => !yaEstan.includes(p.id) && !lineas.some((l) => l.sku.id === p.id));
  const cantidad = (l: Linea) => (l.cantidad.trim() === "" ? NaN : Number(l.cantidad));
  const incompleta = lineas.some((l) => !Number.isInteger(cantidad(l)) || cantidad(l) <= 0);
  const pasada = lineas.find((l) => cantidad(l) > hay(l.sku.id));
  const falta = lineas.length === 0 ? "Agrega al menos un producto." : incompleta ? "Escribe la cantidad de cada producto." : pasada ? `De ${pasada.sku.codigo} solo hay ${hay(pasada.sku.id).toLocaleString("es-PA")} en esa bodega.` : null;
  const unidades = lineas.reduce((t, l) => t + (Number.isInteger(cantidad(l)) ? cantidad(l) : 0), 0);

  function cerrar() {
    setAbierto(false);
    setLineas([]);
    setError(null);
  }
  function agregar(sku: OpcionSkuMaestro | null) {
    if (sku && !lineas.some((l) => l.sku.id === sku.id)) setLineas((l) => [...l, { sku, cantidad: "" }]);
  }
  function guardar() {
    setError(null);
    empezar(async () => {
      const r = await agregarAremision(remisionId, lineas.map((l) => ({ sku: l.sku.id, cantidad: cantidad(l) }))).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if ("error" in r) return void setError(r.error);
      mostrarToast(`${r.agregadas} ${r.agregadas === 1 ? "producto agregado" : "productos agregados"} a ${r.numero}`);
      cerrar();
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className={`inline-flex min-h-10 w-fit items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
        Agregar productos
      </button>
    );
  }
  return (
    <form
      aria-label={`Agregar productos a ${numero}`}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!falta && !pendiente) guardar();
      }}
    >
      <div className="flex flex-col gap-1">
        <span className={labelClassSm}>Agregar producto a {numero}</span>
        <ProveedorSkusMaestros opciones={disponibles}>
          <CampoSkuMaestro key={lineas.length} valor={null} alCambiar={agregar} etiquetaAria="Agregar producto a la remisión" placeholder="Busca por SKU o nombre" claseContenedor="w-full" />
        </ProveedorSkusMaestros>
      </div>
      {lineas.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
          {lineas.map((l) => {
            const pasa = cantidad(l) > hay(l.sku.id);
            return (
              <li key={l.sku.id} className="flex items-center gap-3 px-3 py-2">
                <MiniaturaFoto url={l.sku.foto ?? null} nombre={l.sku.nombre} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.sku.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">{l.sku.codigo}</span>
                  <CodigosProducto numero={l.sku.numero} barras={l.sku.barras} className="block" />
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
          {pendiente ? "Un momento..." : "Agregar a la remisión"}
        </button>
        <button type="button" onClick={cerrar} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-muted ${anilloFoco}`}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
