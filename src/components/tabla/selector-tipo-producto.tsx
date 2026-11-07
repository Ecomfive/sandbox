"use client";

import { useFiltros } from "@/components/tabla/ganchos";
import { anilloFoco } from "@/components/ui/field";
import type { DefTabla } from "@/lib/tabla/motor";
import { conOpcion, opcionElegida, type OpcionTipoProducto } from "@/lib/tabla/tipo-producto";

/**
 * Elegir qué se ve en una lista de productos (7 nov 2026, pedido de Hernán): **Todos**, los **productos simples** (los básicos, de una sola unidad) o los **packs y combos**
 * (varias unidades de un producto o varios productos juntos; en el sistema, «compuestos»). Es un atajo sobre el campo «Tipo» de la propia lista, así que se combina con los demás filtros y
 * aparece también en «Filtros». Lo elegido se conserva mientras dure la sesión, como cualquier filtro. `campo`, `valorSimple` y `valorPack` dicen cómo se llama «Tipo» en esa lista y qué valores usa
 * («tipo», «simple» y «combo» casi siempre; Gestión de IDs usa el campo «tipoProducto»). `cuentas` (opcional) pone cuántos hay de cada uno, contados sobre toda la lista.
 */
export function SelectorTipoProducto<F>({
  def,
  campo = "tipo",
  valorSimple = "simple",
  valorPack = "combo",
  cuentas,
}: {
  def: DefTabla<F>;
  campo?: string;
  valorSimple?: string;
  valorPack?: string;
  cuentas?: { todos: number; simple: number; pack: number };
}) {
  const [filtros, cambiar] = useFiltros(def);
  const elegida = opcionElegida(filtros, campo, valorSimple, valorPack);
  const elegir = (o: OpcionTipoProducto) => cambiar(conOpcion(filtros, campo, o, valorSimple, valorPack));

  const opciones: { id: OpcionTipoProducto; texto: string; cuenta?: number }[] = [
    { id: "todos", texto: "Todos", cuenta: cuentas?.todos },
    { id: "simple", texto: "Productos simples", cuenta: cuentas?.simple },
    { id: "pack", texto: "Packs y combos", cuenta: cuentas?.pack },
  ];

  return (
    <div role="group" aria-label="Tipo de producto" className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
      {opciones.map((o) => {
        const activa = o.id === elegida;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={activa}
            onClick={() => elegir(o.id)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold ${activa ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"} ${anilloFoco}`}
          >
            {o.texto}
            {o.cuenta !== undefined && <span className={`text-xs font-medium tabular-nums ${activa ? "opacity-80" : "text-muted-foreground"}`}>{o.cuenta.toLocaleString("es-PA")}</span>}
          </button>
        );
      })}
    </div>
  );
}
