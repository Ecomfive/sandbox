"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { linkClass } from "@/components/ui/link";
import { useToast } from "@/components/ui/toast";
import { BarraHerramientas } from "@/components/tabla/barra-herramientas";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { EncabezadoGrupo } from "@/components/tabla/encabezado-grupo";
import { useColumnas, type ColumnaDef } from "@/components/tabla/ganchos";
import { useTablaInteractiva } from "@/components/tabla/usar-tabla";
import { formatearFecha } from "@/lib/formato";
import { CalendarioIcon, EstadoIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import { notasPie, type NombreFilas } from "@/lib/tabla/pie";
import type { Grupo } from "@/lib/tabla/vista";
import { actualizarEstadoAlerta, actualizarEstadoAlertasMasivo } from "./actions";
import { DEF_ALERTAS } from "./def-alertas";

const ESTADO_TONO = {
  abierta: "warning",
  reclamada: "info",
  resuelta: "success",
} as const;

export interface AlertaFila {
  id: string;
  sku: string;
  nombre: string;
  cantidad: number;
  fecha_deteccion: string;
  fecha_reclamo: string | null;
  estado: keyof typeof ESTADO_TONO;
}

const NOMBRE_FILAS: NombreFilas = { singular: "alerta", plural: "alertas" };

const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  producto: ProductoIcon,
  sku: InventarioIcon,
  cantidad: InventarioIcon,
  detectada: CalendarioIcon,
  reclamada: CalendarioIcon,
};

type ColumnaId = "sku" | "producto" | "cantidad" | "detectada" | "reclamada" | "estado" | "acciones";

const COLUMNAS: (ColumnaDef & { id: ColumnaId })[] = [
  { id: "sku", label: "SKU", ocultable: false },
  { id: "producto", label: "Producto", ocultable: true },
  { id: "cantidad", label: "Cantidad", ocultable: true },
  { id: "detectada", label: "Detectada", ocultable: true },
  { id: "reclamada", label: "Reclamada", ocultable: true },
  { id: "estado", label: "Estado", ocultable: true },
  { id: "acciones", label: "Acciones", ocultable: false },
];
const COLUMNAS_POR_ID = new Map(COLUMNAS.map((c) => [c.id, c]));

/** Nombre del grupo: para Estado usa la misma insignia de la columna, para el resto texto. */
function etiquetaGrupo(campo: string, grupo: Grupo<AlertaFila>) {
  if (campo === "estado") {
    return <Badge tone={ESTADO_TONO[grupo.clave as AlertaFila["estado"]]}>{grupo.etiqueta}</Badge>;
  }
  return <span className="font-semibold">{grupo.etiqueta}</span>;
}

export function TablaAlertas({ alertas }: { alertas: AlertaFila[] }) {
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();
  const tabla = useTablaInteractiva(DEF_ALERTAS, alertas);
  const [columnasGuardadas, cambiarColumnas] = useColumnas("alertas", COLUMNAS);
  const { vista, resultado, visibles, grupos, contraidos, hayFiltros, agrupado } = tabla;

  const columnasVisibles = columnasGuardadas.orden
    .filter((id) => !columnasGuardadas.ocultas.has(id))
    .map((id) => COLUMNAS_POR_ID.get(id as ColumnaId)!);

  // La selección solo cuenta lo que se ve: lo que un filtro o el botón de resueltas esconde no se toca.
  const idsSeleccionados = visibles.filter((a) => seleccionadas.has(a.id)).map((a) => a.id);
  const todasSeleccionadas = visibles.length > 0 && idsSeleccionados.length === visibles.length;

  function alternar(id: string) {
    setSeleccionadas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function alternarTodas() {
    setSeleccionadas(todasSeleccionadas ? new Set() : new Set(visibles.map((a) => a.id)));
  }

  function aplicarMasivo(estado: "reclamada" | "resuelta") {
    const ids = idsSeleccionados;
    startTransition(async () => {
      await actualizarEstadoAlertasMasivo(ids, estado);
      mostrarToast(
        `${ids.length} alerta${ids.length === 1 ? "" : "s"} marcada${ids.length === 1 ? "" : "s"} como ${estado}`
      );
      setSeleccionadas(new Set());
    });
  }

  function celda(id: ColumnaId, a: AlertaFila) {
    switch (id) {
      case "sku":
        return a.sku;
      case "producto":
        return a.nombre;
      case "cantidad":
        return a.cantidad;
      case "detectada":
        return formatearFecha(a.fecha_deteccion);
      case "reclamada":
        return a.fecha_reclamo ? formatearFecha(a.fecha_reclamo) : "—";
      case "estado":
        return <Badge tone={ESTADO_TONO[a.estado]}>{a.estado}</Badge>;
      case "acciones":
        return (
          <div className="flex justify-end gap-2">
            {a.estado === "abierta" && (
              <form action={actualizarEstadoAlerta}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="estado" value="reclamada" />
                <Button type="submit" variant="secondary" className="px-3 py-1 text-xs">
                  Marcar reclamada
                </Button>
              </form>
            )}
            {a.estado !== "resuelta" && (
              <form action={actualizarEstadoAlerta}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="estado" value="resuelta" />
                <Button type="submit" variant="secondary" className="px-3 py-1 text-xs">
                  Marcar resuelta
                </Button>
              </form>
            )}
          </div>
        );
    }
  }

  const claseCelda: Record<ColumnaId, string> = {
    sku: "font-medium",
    producto: "text-muted-foreground",
    cantidad: "tabular-nums",
    detectada: "",
    reclamada: "",
    estado: "",
    acciones: "pr-4",
  };

  const filaAlerta = (a: AlertaFila) => (
    <tr key={a.id} className="border-b border-border/60 last:border-0">
      <td className="py-2 pr-2 pl-4">
        <input
          type="checkbox"
          checked={seleccionadas.has(a.id)}
          onChange={() => alternar(a.id)}
          aria-label={`Seleccionar alerta de ${a.nombre}`}
        />
      </td>
      {columnasVisibles.map((columna) => (
        <td key={columna.id} className={`py-2 pr-3 ${claseCelda[columna.id]}`}>
          {celda(columna.id, a)}
        </td>
      ))}
    </tr>
  );

  const notas = notasPie({
    hayFiltros,
    agrupado,
    visibles: visibles.length,
    base: resultado.base.length,
    grupos: grupos.length,
    nombre: NOMBRE_FILAS,
    cerradosVisibles: resultado.cerradosVisibles,
    cerradosOcultos: resultado.cerradosOcultos,
    etiquetaCerrados: DEF_ALERTAS.cerrados?.etiqueta,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Alertas</h2>
        <a href="/api/exportar-alertas" className={linkClass}>
          Descargar CSV
        </a>
      </div>
      <div className="mt-3 min-w-0 rounded-xl border border-border bg-card">
        <BarraHerramientas
          def={DEF_ALERTAS}
          filas={alertas}
          tabla={tabla}
          iconos={ICONOS}
          nombreFilas="alertas"
          columnas={{ defs: COLUMNAS, estado: columnasGuardadas, cambiar: cambiarColumnas }}
        />
        {idsSeleccionados.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted px-4 py-2 text-sm">
            <span>
              {idsSeleccionados.length} seleccionada{idsSeleccionados.length === 1 ? "" : "s"}
            </span>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1 text-xs"
              disabled={pending}
              onClick={() => aplicarMasivo("reclamada")}
            >
              Marcar reclamadas
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1 text-xs"
              disabled={pending}
              onClick={() => aplicarMasivo("resuelta")}
            >
              Marcar resueltas
            </Button>
          </div>
        )}
        <div
          tabIndex={0}
          role="region"
          aria-label="Tabla de alertas, desplazable horizontalmente con las flechas izquierda y derecha"
          className="min-w-0 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
        >
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-2 pl-4">
                  <input
                    type="checkbox"
                    checked={todasSeleccionadas}
                    onChange={alternarTodas}
                    aria-label="Seleccionar todas"
                  />
                </th>
                {columnasVisibles.map((columna) => (
                  <th key={columna.id} scope="col" className="py-2 pr-3 font-medium">
                    {columna.id === "acciones" ? <span className="sr-only">Acciones</span> : columna.label}
                  </th>
                ))}
              </tr>
            </thead>
            {vista.agrupar ? (
              grupos.map((grupo) => {
                const contraido = contraidos.has(grupo.clave);
                return (
                  <tbody key={grupo.clave}>
                    <EncabezadoGrupo
                      columnas={columnasVisibles.length + 1}
                      contraido={contraido}
                      alAlternar={() => tabla.alternarGrupo(grupo.clave)}
                      etiqueta={etiquetaGrupo(vista.agrupar!, grupo)}
                      cantidad={grupo.filas.length}
                      nombre={NOMBRE_FILAS}
                      total={`${grupo.total} ${grupo.total === 1 ? "unidad" : "unidades"}`}
                    />
                    {!contraido && grupo.filas.map((a) => filaAlerta(a))}
                  </tbody>
                );
              })
            ) : (
              <tbody>{visibles.map((a) => filaAlerta(a))}</tbody>
            )}
          </table>
        </div>
        {alertas.length === 0 && <EstadoVacio mensaje="Todavía no hay alertas generadas." />}
        {alertas.length > 0 && visibles.length === 0 && (
          <EstadoVacio
            mensaje={
              hayFiltros
                ? "Ninguna alerta coincide con los filtros."
                : `No hay alertas por resolver. Pulsa «Resueltas» para ver las ${resultado.cerradosOcultos} resueltas.`
            }
          />
        )}
        <p role="status" className="sr-only">
          {alertas.length > 0 ? `${visibles.length} ${visibles.length === 1 ? "alerta" : "alertas"}` : ""}
        </p>
        {notas.length > 0 && (
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{notas.join(" · ")}</p>
        )}
      </div>
    </div>
  );
}
