"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { BarraHerramientas } from "@/components/tabla/barra-herramientas";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { EncabezadoGrupo } from "@/components/tabla/encabezado-grupo";
import { useColumnas, type ColumnaDef } from "@/components/tabla/ganchos";
import { Paginacion } from "@/components/tabla/paginacion";
import { POR_PAGINA, textoEstadoTabla, useIrAPaginaArriba } from "@/components/tabla/usar-pagina-arriba";
import { useTablaInteractiva } from "@/components/tabla/usar-tabla";
import { formatearMoneda } from "@/lib/formato";
import { margenActual, type ProductoFila } from "@/lib/margen";
import { EstadoIcon, GastoIcon, LapizIcon, ProductoIcon, TiendaIcon } from "@/lib/nav-icons";
import { notasPie, type NombreFilas } from "@/lib/tabla/pie";
import { vincularProductoASku } from "../catalogo-maestro/actions";
import { actualizarMargenMasivo, actualizarProducto } from "./actions";
import { DEF_PRODUCTOS } from "./def-productos";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  vinculo: ProductoIcon,
  plataforma: TiendaIcon,
  nombre: ProductoIcon,
  sku: ProductoIcon,
  costo: GastoIcon,
  precio: GastoIcon,
  minimo: GastoIcon,
  margen: GastoIcon,
};

/** Un SKU maestro al que se puede vincular un producto (solo los simples y aprobados). */
export interface SkuMaestroOpcion {
  id: string;
  codigo: string;
  nombre: string;
}

type ColumnaId = "producto" | "plataforma" | "costo" | "precio" | "minimo" | "margen" | "skuMaestro";

const COLUMNAS: (ColumnaDef & { id: ColumnaId })[] = [
  { id: "producto", label: "Producto", ocultable: false },
  { id: "plataforma", label: "Plataforma", ocultable: true },
  { id: "costo", label: "Costo", ocultable: true },
  { id: "precio", label: "Precio de venta", ocultable: true },
  { id: "minimo", label: "Mínimo %", ocultable: true },
  { id: "margen", label: "Margen actual", ocultable: true },
  { id: "skuMaestro", label: "SKU maestro", ocultable: true },
];
const COLUMNAS_POR_ID = new Map(COLUMNAS.map((c) => [c.id, c]));

/** Los tres números que se editan en la fila; si su columna está oculta van como campos ocultos para no perderlos. */
const CAMPOS_EDITABLES = ["costo", "precio", "minimo"] as const;

/** El formulario de la fila que se edita: sus campos están en la tabla y se ligan a él con el atributo `form`. */
const FORM_EDITAR = "editar-producto";

const FONDO_EDITANDO = "bg-[color-mix(in_oklab,var(--accent)_45%,var(--card))]";

/**
 * Productos y márgenes con la barra de herramientas común (agrupar, filtros, columnas, vistas y descarga).
 * Una fila se edita en su sitio: «Editar» convierte costo, precio, mínimo y SKU maestro en campos y aparecen
 * Guardar y Cancelar. Antes cada producto llevaba su formulario siempre abierto (y otro más para el SKU maestro,
 * con todas las opciones repetidas en cada uno): más de 240 controles a la vez.
 */
export function TablaProductos({
  productos,
  codigoPais,
  skusMaestros,
  puedeEscribir,
  puedeVincular,
}: {
  productos: ProductoFila[];
  codigoPais: string;
  skusMaestros: SkuMaestroOpcion[];
  /** Con solo lectura no hay casillas, ni «Editar», ni acciones en lote (el servidor lo vuelve a comprobar). */
  puedeEscribir: boolean;
  /** Vincular a un SKU maestro se permite con escritura en el catálogo maestro, no en Productos. */
  puedeVincular: boolean;
}) {
  const tabla = useTablaInteractiva(DEF_PRODUCTOS, productos, { porPagina: POR_PAGINA });
  const [guardadas, cambiarColumnas] = useColumnas("productos", COLUMNAS);
  const { vista, resultado, visibles, grupos, contraidos, hayFiltros, agrupado, paginacion } = tabla;
  const { raiz, alIrA } = useIrAPaginaArriba(tabla.irAPagina);

  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [nuevoMargen, setNuevoMargen] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();
  const skuPorId = useMemo(() => new Map(skusMaestros.map((s) => [s.id, s])), [skusMaestros]);

  const columnasVisibles = guardadas.orden
    .filter((id) => !guardadas.ocultas.has(id))
    .map((id) => COLUMNAS_POR_ID.get(id as ColumnaId)!);
  const idsVisibles = new Set<string>(columnasVisibles.map((c) => c.id));

  // Lo marcado solo cuenta lo que se ve: un producto que un filtro o la página esconde no recibe el cambio.
  const filasEnPantalla = agrupado ? grupos.filter((g) => !contraidos.has(g.clave)).flatMap((g) => g.filas) : visibles;
  const marcados = puedeEscribir ? filasEnPantalla.filter((p) => seleccionados.has(p.id)) : [];
  const todosMarcados = filasEnPantalla.length > 0 && marcados.length === filasEnPantalla.length;

  function alternar(id: string) {
    setSeleccionados((actuales) => {
      const nuevos = new Set(actuales);
      if (!nuevos.delete(id)) nuevos.add(id);
      return nuevos;
    });
  }

  function alternarTodos() {
    setSeleccionados((actuales) => {
      const nuevos = new Set(actuales);
      for (const p of filasEnPantalla) {
        if (todosMarcados) nuevos.delete(p.id);
        else nuevos.add(p.id);
      }
      return nuevos;
    });
  }

  function aplicarMargenMasivo() {
    const valor = Number(nuevoMargen);
    if (nuevoMargen === "" || Number.isNaN(valor)) return;
    const ids = marcados.map((p) => p.id);
    startTransition(async () => {
      try {
        await actualizarMargenMasivo(ids, valor);
        mostrarToast(`Margen mínimo actualizado en ${ids.length} producto${ids.length === 1 ? "" : "s"}`);
        setSeleccionados(new Set());
        setNuevoMargen("");
      } catch {
        mostrarToast("No se pudo actualizar el margen. Inténtalo de nuevo.", "destructive");
      }
    });
  }

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    const id = String(formData.get("id"));
    const producto = productos.find((p) => p.id === id);
    const skuElegido = String(formData.get("sku_maestro_id") ?? "");
    startTransition(async () => {
      try {
        await actualizarProducto(formData);
        // Un SKU maestro distinto al que tenía se guarda aparte: es otro módulo con su propio permiso.
        if (puedeVincular && producto && (producto.sku_maestro_id ?? "") !== skuElegido) {
          const vinculo = new FormData();
          vinculo.set("producto_id", id);
          vinculo.set("sku_maestro_id", skuElegido);
          await vincularProductoASku(vinculo);
        }
        mostrarToast("Producto actualizado");
        setEditandoId(null);
      } catch {
        mostrarToast("No se pudo guardar el producto. Revisa los valores e inténtalo de nuevo.", "destructive");
      }
    });
  }

  function celda(id: ColumnaId, p: ProductoFila, editando: boolean) {
    const margen = margenActual(p);
    switch (id) {
      case "producto":
        return (
          <>
            <p className="font-medium">{p.nombre}</p>
            <p className="text-xs text-muted-foreground">{p.sku}</p>
          </>
        );
      case "plataforma":
        return p.plataforma_nombre ?? "—";
      case "costo":
        return editando ? (
          <input
            type="number"
            step="0.01"
            min="0"
            name="costo"
            form={FORM_EDITAR}
            aria-label={`Costo de ${p.nombre}`}
            defaultValue={p.costo ?? ""}
            autoFocus
            className={`${fieldClassSm} w-24 tabular-nums`}
          />
        ) : p.costo === null ? (
          "—"
        ) : (
          formatearMoneda(p.costo, codigoPais)
        );
      case "precio":
        return editando ? (
          <input
            type="number"
            step="0.01"
            min="0"
            name="precio_actual"
            form={FORM_EDITAR}
            aria-label={`Precio de venta de ${p.nombre}`}
            defaultValue={p.precio_actual ?? ""}
            className={`${fieldClassSm} w-24 tabular-nums`}
          />
        ) : p.precio_actual === null ? (
          "—"
        ) : (
          formatearMoneda(p.precio_actual, codigoPais)
        );
      case "minimo":
        return editando ? (
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            name="margen_minimo"
            form={FORM_EDITAR}
            aria-label={`Margen mínimo de ${p.nombre}`}
            defaultValue={p.margen_minimo}
            required
            className={`${fieldClassSm} w-20 tabular-nums`}
          />
        ) : (
          `${p.margen_minimo}%`
        );
      case "margen":
        return margen === null ? (
          <Badge tone="neutral">Sin datos</Badge>
        ) : (
          <Badge tone={margen < p.margen_minimo ? "destructive" : "success"}>{margen.toFixed(1)}%</Badge>
        );
      case "skuMaestro":
        return editando && puedeVincular ? (
          <select
            name="sku_maestro_id"
            form={FORM_EDITAR}
            aria-label={`SKU maestro de ${p.nombre}`}
            defaultValue={p.sku_maestro_id ?? ""}
            className={`${fieldClassSm} w-56`}
          >
            <option value="">Sin vincular</option>
            {skusMaestros.map((s) => (
              <option key={s.id} value={s.id}>
                {s.codigo} — {s.nombre}
              </option>
            ))}
          </select>
        ) : p.sku_maestro_id ? (
          (skuPorId.get(p.sku_maestro_id)?.codigo ?? "Vinculado")
        ) : (
          <span className="text-muted-foreground">Sin vincular</span>
        );
    }
  }

  const claseCelda: Record<ColumnaId, string> = {
    producto: "",
    plataforma: "text-muted-foreground",
    costo: "tabular-nums",
    precio: "tabular-nums",
    minimo: "tabular-nums",
    margen: "",
    skuMaestro: "",
  };

  const filaProducto = (p: ProductoFila) => {
    const editando = editandoId === p.id;
    return (
      <tr
        key={p.id}
        className={`group border-b border-border/60 last:border-0 ${
          editando ? FONDO_EDITANDO : seleccionados.has(p.id) && puedeEscribir ? FONDO_EDITANDO : "hover:bg-muted/50"
        }`}
      >
        {puedeEscribir && (
          <td className="w-10 py-2 pr-2 pl-4">
            <label className="-my-1 flex h-6 w-6 cursor-pointer items-center justify-center">
              <input
                type="checkbox"
                checked={seleccionados.has(p.id)}
                onChange={() => alternar(p.id)}
                aria-label={`Seleccionar ${p.nombre}`}
                className="h-4 w-4 cursor-pointer accent-foreground"
              />
            </label>
          </td>
        )}
        {columnasVisibles.map((columna, i) => (
          <td key={columna.id} className={`py-2 pr-3 ${i === 0 && !puedeEscribir ? "pl-4" : ""} ${claseCelda[columna.id]}`}>
            {celda(columna.id, p, editando)}
          </td>
        ))}
        {puedeEscribir && (
          <td
            className={`sticky right-0 z-10 border-l border-border/60 py-2 pr-3 pl-3 ${
              editando || seleccionados.has(p.id) ? FONDO_EDITANDO : "bg-card group-hover:bg-muted/50"
            }`}
          >
            {editando ? (
              <div className="flex items-center justify-end gap-1">
                {/* Los números cuya columna está oculta viajan igual: sin ellos «Guardar» los borraría. */}
                {CAMPOS_EDITABLES.filter((c) => !idsVisibles.has(c)).map((c) => (
                  <input
                    key={c}
                    type="hidden"
                    form={FORM_EDITAR}
                    name={c === "costo" ? "costo" : c === "precio" ? "precio_actual" : "margen_minimo"}
                    defaultValue={
                      (c === "costo" ? p.costo : c === "precio" ? p.precio_actual : p.margen_minimo) ?? ""
                    }
                  />
                ))}
                <Button
                  type="submit"
                  form={FORM_EDITAR}
                  variant="primary"
                  className="px-3 py-1 text-xs"
                  disabled={pending}
                  aria-label={`Guardar ${p.nombre}`}
                >
                  Guardar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  disabled={pending}
                  onClick={() => setEditandoId(null)}
                  aria-label={`Cancelar la edición de ${p.nombre}`}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <Tooltip texto="Editar producto">
                  <button
                    type="button"
                    onClick={() => setEditandoId(p.id)}
                    aria-label={`Editar ${p.nombre}`}
                    className={`rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
                  >
                    <LapizIcon className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
            )}
          </td>
        )}
      </tr>
    );
  };

  const notas = notasPie({
    hayFiltros,
    agrupado,
    visibles: visibles.length,
    base: resultado.base.length,
    grupos: grupos.length,
    nombre: NOMBRE,
    cerradosVisibles: resultado.cerradosVisibles,
    cerradosOcultos: resultado.cerradosOcultos,
    etiquetaCerrados: DEF_PRODUCTOS.cerrados?.etiqueta,
  });

  return (
    <div
      ref={raiz}
      className="min-w-0 rounded-xl border border-border bg-card"
      // Los campos de la fila que se edita están fuera del <form> (ligados por `form`): Enter en uno la guarda y
      // Escape la cancela.
      onKeyDown={(e) => {
        const campo = e.target as HTMLElement;
        if (campo.getAttribute?.("form") !== FORM_EDITAR) return;
        if (e.key === "Escape") setEditandoId(null);
        else if (e.key === "Enter" && campo.tagName === "INPUT") {
          e.preventDefault();
          (document.getElementById(FORM_EDITAR) as HTMLFormElement | null)?.requestSubmit();
        }
      }}
    >
      <BarraHerramientas
        def={DEF_PRODUCTOS}
        filas={productos}
        tabla={tabla}
        iconos={ICONOS}
        nombreFilas={NOMBRE.plural}
        columnas={{ defs: COLUMNAS, estado: guardadas, cambiar: cambiarColumnas }}
      />

      {/* El formulario de la fila que se edita: Enter en cualquiera de sus campos lo envía. */}
      <form id={FORM_EDITAR} onSubmit={guardar}>
        {editandoId && <input type="hidden" name="id" value={editandoId} />}
      </form>

      {marcados.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted px-4 py-2 text-sm">
          <span>
            {marcados.length} seleccionado{marcados.length === 1 ? "" : "s"}
          </span>
          <label className="flex items-center gap-2">
            <span className={labelClassSm}>Nuevo margen mínimo %</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={nuevoMargen}
              onChange={(e) => setNuevoMargen(e.target.value)}
              className={`${fieldClassSm} w-20 tabular-nums`}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1 text-xs"
            disabled={pending || nuevoMargen === ""}
            onClick={aplicarMargenMasivo}
          >
            Aplicar a seleccionados
          </Button>
          <Button type="button" variant="ghost" className="text-xs" onClick={() => setSeleccionados(new Set())}>
            Quitar selección
          </Button>
        </div>
      )}

      <ContenedorTabla ariaLabel="Tabla de productos y márgenes">
        <table className="tabla-datos w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              {puedeEscribir && (
                <th scope="col" className="w-10 py-2 pr-2 pl-4">
                  <label className="-my-1 flex h-6 w-6 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      ref={(el) => {
                        if (el) el.indeterminate = marcados.length > 0 && !todosMarcados;
                      }}
                      onChange={alternarTodos}
                      disabled={filasEnPantalla.length === 0}
                      aria-label="Seleccionar todos los productos que se ven"
                      className="h-4 w-4 cursor-pointer accent-foreground"
                    />
                  </label>
                </th>
              )}
              {columnasVisibles.map((columna, i) => (
                <th
                  key={columna.id}
                  scope="col"
                  className={`py-2 pr-3 font-medium ${i === 0 && !puedeEscribir ? "pl-4" : ""}`}
                >
                  {columna.label}
                </th>
              ))}
              {puedeEscribir && (
                <th scope="col" className="sticky right-0 z-10 bg-muted py-2 pr-3 pl-3 text-center font-medium">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          {vista.agrupar ? (
            grupos.map((grupo) => {
              const contraido = contraidos.has(grupo.clave);
              return (
                <tbody key={grupo.clave}>
                  <EncabezadoGrupo
                    columnas={columnasVisibles.length + (puedeEscribir ? 2 : 0)}
                    contraido={contraido}
                    alAlternar={() => tabla.alternarGrupo(grupo.clave)}
                    etiqueta={<span className="font-semibold">{grupo.etiqueta}</span>}
                    cantidad={grupo.filas.length}
                    nombre={NOMBRE}
                  />
                  {!contraido && grupo.filas.map((p) => filaProducto(p))}
                </tbody>
              );
            })
          ) : (
            <tbody>{visibles.map((p) => filaProducto(p))}</tbody>
          )}
        </table>
      </ContenedorTabla>
      {paginacion && <Paginacion pagina={paginacion} nombre={NOMBRE} alIrA={alIrA} />}
      <p role="status" className="sr-only">
        {productos.length > 0
          ? textoEstadoTabla(NOMBRE, paginacion ? paginacion.total : visibles.length, paginacion)
          : ""}
      </p>
      {productos.length === 0 && <EstadoVacio mensaje="Todavía no hay productos." />}
      {productos.length > 0 && visibles.length === 0 && (
        <EstadoVacio mensaje={hayFiltros ? "Ningún producto coincide con los filtros." : "No hay productos que mostrar."} />
      )}
      {notas.length > 0 && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{notas.join(" · ")}</p>
      )}
    </div>
  );
}
