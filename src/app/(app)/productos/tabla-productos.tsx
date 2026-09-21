"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { FormularioConToast, useToast } from "@/components/ui/toast";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { margenActual, type ProductoFila } from "@/lib/margen";
import { EstadoIcon, GastoIcon, ProductoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { actualizarProducto, actualizarMargenMasivo } from "./actions";
import { DEF_PRODUCTOS } from "./def-productos";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  plataforma: TiendaIcon,
  nombre: ProductoIcon,
  sku: ProductoIcon,
  costo: GastoIcon,
  precio: GastoIcon,
  minimo: GastoIcon,
  margen: GastoIcon,
};

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

  function aplicarMargenMasivo(ids: string[]) {
    const valor = Number(nuevoMargen);
    if (nuevoMargen === "" || Number.isNaN(valor)) return;
    startTransition(async () => {
      await actualizarMargenMasivo(ids, valor);
      mostrarToast(
        `Margen mínimo actualizado en ${ids.length} producto${ids.length === 1 ? "" : "s"}`
      );
      setSeleccionados(new Set());
      setNuevoMargen("");
    });
  }

  // La selección solo cuenta lo que se ve: si un filtro esconde un producto marcado, no se le aplica el cambio.
  function barraSeleccion(visibles: ProductoFila[]) {
    const marcados = visibles.filter((p) => seleccionados.has(p.id)).map((p) => p.id);
    const todos = marcados.length === visibles.length;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <input
          type="checkbox"
          checked={todos}
          onChange={() => setSeleccionados(todos ? new Set() : new Set(visibles.map((p) => p.id)))}
          aria-label="Seleccionar todos los productos visibles"
        />
        <span className="text-sm text-muted-foreground">
          {marcados.length > 0 ? `${marcados.length} seleccionado${marcados.length === 1 ? "" : "s"}` : "Seleccionar todos"}
        </span>
        {marcados.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="margen-masivo" className={labelClassSm}>Nuevo margen mínimo %</label>
            <input
              id="margen-masivo"
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
              onClick={() => aplicarMargenMasivo(marcados)}
            >
              Aplicar a seleccionados
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <ListaDatos
      def={DEF_PRODUCTOS}
      filas={productos}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(p) => p.id}
      encima={barraSeleccion}
      vacio="Todavía no hay productos."
      renderFila={(p) => {
        const margen = margenActual(p);
        return (
          <FormularioConToast
            key={`${p.id}:${p.costo}:${p.precio_actual}:${p.margen_minimo}`}
            action={actualizarProducto}
            mensajeExito="Margen actualizado"
            className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4"
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
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Costo</span>
              <input
                type="number"
                step="0.01"
                min="0"
                name="costo"
                aria-label={`Costo de ${p.nombre}`}
                defaultValue={p.costo ?? ""}
                className={`${fieldClassSm} w-24 tabular-nums`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Precio venta</span>
              <input
                type="number"
                step="0.01"
                min="0"
                name="precio_actual"
                aria-label={`Precio de venta de ${p.nombre}`}
                defaultValue={p.precio_actual ?? ""}
                className={`${fieldClassSm} w-24 tabular-nums`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Mínimo %</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                name="margen_minimo"
                aria-label={`Margen mínimo de ${p.nombre}`}
                defaultValue={p.margen_minimo}
                required
                className={`${fieldClassSm} w-20 tabular-nums`}
              />
            </label>
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
            <Button type="submit" variant="secondary" className="text-xs" aria-label={`Guardar ${p.nombre}`}>
              Guardar
            </Button>
          </FormularioConToast>
        );
      }}
    />
  );
}
