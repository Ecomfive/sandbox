"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { FormularioConToast, useToast } from "@/components/ui/toast";
import { margenActual, type ProductoFila } from "@/lib/margen";
import { actualizarProducto, actualizarMargenMasivo } from "./actions";

export function TablaProductos({ productos }: { productos: ProductoFila[] }) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [nuevoMargen, setNuevoMargen] = useState("");
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();

  function alternar(id: string) {
    setSeleccionados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function alternarTodos() {
    setSeleccionados((actual) =>
      actual.size === productos.length ? new Set() : new Set(productos.map((p) => p.id))
    );
  }

  function aplicarMargenMasivo() {
    const valor = Number(nuevoMargen);
    if (nuevoMargen === "" || Number.isNaN(valor)) return;
    const ids = Array.from(seleccionados);
    startTransition(async () => {
      await actualizarMargenMasivo(ids, valor);
      mostrarToast(
        `Margen mínimo actualizado en ${ids.length} producto${ids.length === 1 ? "" : "s"}`
      );
      setSeleccionados(new Set());
      setNuevoMargen("");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
        <input
          type="checkbox"
          checked={productos.length > 0 && seleccionados.size === productos.length}
          onChange={alternarTodos}
          aria-label="Seleccionar todos los productos"
        />
        <span className="text-sm text-muted-foreground">
          {seleccionados.size > 0 ? `${seleccionados.size} seleccionado${seleccionados.size === 1 ? "" : "s"}` : "Seleccionar todos"}
        </span>
        {seleccionados.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <label className={labelClassSm}>Nuevo margen mínimo %</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={nuevoMargen}
              onChange={(e) => setNuevoMargen(e.target.value)}
              className={`${fieldClassSm} w-20 tabular-nums`}
            />
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={pending || nuevoMargen === ""}
              onClick={aplicarMargenMasivo}
            >
              Aplicar a seleccionados
            </Button>
          </div>
        )}
      </div>

      {productos.map((p) => {
        const margen = margenActual(p);
        return (
          <FormularioConToast
            key={`${p.id}:${p.costo}:${p.precio_actual}:${p.margen_minimo}`}
            action={actualizarProducto}
            mensajeExito="Margen actualizado"
            className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4"
          >
            <input
              type="checkbox"
              checked={seleccionados.has(p.id)}
              onChange={() => alternar(p.id)}
              aria-label={`Seleccionar ${p.nombre}`}
            />
            <input type="hidden" name="id" value={p.id} />
            <div className="min-w-[10rem] flex-1">
              <p className="text-sm font-medium">{p.nombre}</p>
              <p className="text-xs text-muted-foreground">
                {p.sku} {p.plataforma_nombre ? `· ${p.plataforma_nombre}` : ""}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClassSm}>Costo</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="costo"
                defaultValue={p.costo ?? ""}
                className={`${fieldClassSm} w-24 tabular-nums`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClassSm}>Precio venta</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="precio_actual"
                defaultValue={p.precio_actual ?? ""}
                className={`${fieldClassSm} w-24 tabular-nums`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClassSm}>Mínimo %</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                name="margen_minimo"
                defaultValue={p.margen_minimo}
                required
                className={`${fieldClassSm} w-20 tabular-nums`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className={labelClassSm}>Margen actual</p>
              {margen === null ? (
                <Badge tone="neutral">Sin datos</Badge>
              ) : margen < p.margen_minimo ? (
                <Badge tone="destructive">{margen.toFixed(1)}%</Badge>
              ) : (
                <Badge tone="success">{margen.toFixed(1)}%</Badge>
              )}
            </div>
            <Button type="submit" variant="secondary" className="text-xs">
              Guardar
            </Button>
          </FormularioConToast>
        );
      })}
    </div>
  );
}
