"use client";

import { Badge } from "@/components/ui/badge";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { BarraHerramientas } from "@/components/tabla/barra-herramientas";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { EncabezadoGrupo } from "@/components/tabla/encabezado-grupo";
import { useColumnas, type ColumnaDef } from "@/components/tabla/ganchos";
import { useTablaInteractiva } from "@/components/tabla/usar-tabla";
import { toneEstadoPedido } from "@/lib/estados-pedido";
import { formatearFecha, formatearFechaHora, formatearMoneda } from "@/lib/formato";
import { CalendarioIcon, EstadoIcon, GastoIcon, InventarioIcon, PedidoIcon, ProductoIcon } from "@/lib/nav-icons";
import { notasPie, type NombreFilas } from "@/lib/tabla/pie";
import type { Grupo } from "@/lib/tabla/vista";
import { DEF_PEDIDOS } from "./def-pedidos";

/** Una orden de Dropi lista para dibujar (lo que llega del servidor ya resuelto). */
export interface FilaPedido {
  referencia: string;
  fecha: string;
  fechaHora: string | null;
  producto: string | null;
  cantidad: number;
  monto: number;
  estado: string;
  /** Liquidado en cartera pero todavía no marcado ENTREGADO en Dropi. */
  alerta: boolean;
}

const NOMBRE_FILAS: NombreFilas = { singular: "orden", plural: "órdenes" };

const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  producto: ProductoIcon,
  alerta: PedidoIcon,
  orden: PedidoIcon,
  fecha: CalendarioIcon,
  cantidad: InventarioIcon,
  monto: GastoIcon,
};

type ColumnaId = "fecha" | "fechaHora" | "orden" | "producto" | "cantidad" | "monto" | "estado";

const COLUMNAS: (ColumnaDef & { id: ColumnaId })[] = [
  { id: "fecha", label: "Fecha", ocultable: true },
  { id: "fechaHora", label: "Fecha y hora del pedido", ocultable: true },
  { id: "orden", label: "Orden", ocultable: false },
  { id: "producto", label: "Producto", ocultable: true },
  { id: "cantidad", label: "Cantidad", ocultable: true },
  { id: "monto", label: "Monto", ocultable: true },
  { id: "estado", label: "Estado", ocultable: true },
];
const COLUMNAS_POR_ID = new Map(COLUMNAS.map((c) => [c.id, c]));

function etiquetaGrupo(campo: string, grupo: Grupo<FilaPedido>) {
  if (campo === "estado") return <Badge tone={toneEstadoPedido(grupo.clave)}>{grupo.etiqueta}</Badge>;
  return <span className="font-semibold">{grupo.etiqueta}</span>;
}

/**
 * Tabla de órdenes de Dropi con la barra de herramientas común. Trabaja sobre las órdenes ya cargadas
 * (el período y el orden se eligen arriba, en el servidor).
 */
export function TablaPedidos({ pedidos, codigoPais }: { pedidos: FilaPedido[]; codigoPais: string }) {
  const tabla = useTablaInteractiva(DEF_PEDIDOS, pedidos);
  const [columnasGuardadas, cambiarColumnas] = useColumnas("pedidos-dropi", COLUMNAS);
  const { vista, resultado, visibles, grupos, contraidos, hayFiltros, agrupado } = tabla;

  const columnasVisibles = columnasGuardadas.orden
    .filter((id) => !columnasGuardadas.ocultas.has(id))
    .map((id) => COLUMNAS_POR_ID.get(id as ColumnaId)!);

  function celda(id: ColumnaId, p: FilaPedido) {
    switch (id) {
      case "fecha":
        return formatearFecha(p.fecha);
      case "fechaHora":
        return formatearFechaHora(p.fechaHora);
      case "orden":
        return (
          <>
            {p.alerta && (
              <>
                <Tooltip texto="Liquidado en cartera, sin marcar ENTREGADO en Dropi">
                  <span
                    role="img"
                    aria-label="Alerta: liquidado en cartera, sin marcar ENTREGADO en Dropi"
                    tabIndex={0}
                    className={anilloFoco}
                  >
                    ⚠️
                  </span>
                </Tooltip>{" "}
              </>
            )}
            {p.referencia}
          </>
        );
      case "producto":
        return p.producto ?? "—";
      case "cantidad":
        return p.cantidad;
      case "monto":
        return formatearMoneda(p.monto, codigoPais);
      case "estado":
        return <Badge tone={toneEstadoPedido(p.estado)}>{p.estado}</Badge>;
    }
  }

  const fila = (p: FilaPedido) => (
    <tr
      key={p.referencia}
      className={`border-b last:border-0 ${
        p.alerta ? "border-destructive/30 bg-destructive-soft text-destructive" : "border-border/60"
      }`}
    >
      {columnasVisibles.map((columna, i) => {
        const base = `py-2 pr-3 ${i === 0 ? "pl-4" : ""}`;
        const color =
          columna.id === "fechaHora"
            ? p.alerta
              ? "text-destructive"
              : "text-muted-foreground"
            : columna.id === "producto"
              ? p.alerta
                ? ""
                : "text-muted-foreground"
              : "";
        const tipo = columna.id === "orden" ? "font-medium" : columna.id === "cantidad" || columna.id === "monto" ? "tabular-nums" : "";
        return (
          <td key={columna.id} className={`${base} ${color} ${tipo}`}>
            {celda(columna.id, p)}
          </td>
        );
      })}
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
    etiquetaCerrados: DEF_PEDIDOS.cerrados?.etiqueta,
  });

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card">
      <BarraHerramientas
        def={DEF_PEDIDOS}
        filas={pedidos}
        tabla={tabla}
        iconos={ICONOS}
        nombreFilas="órdenes"
        columnas={{ defs: COLUMNAS, estado: columnasGuardadas, cambiar: cambiarColumnas }}
      />
      <div
        tabIndex={0}
        role="region"
        aria-label="Tabla de órdenes de Dropi, desplazable horizontalmente con las flechas izquierda y derecha"
        className="min-w-0 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
      >
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              {columnasVisibles.map((columna, i) => (
                <th key={columna.id} scope="col" className={`py-2 pr-3 font-medium ${i === 0 ? "pl-4" : ""}`}>
                  {columna.label}
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
                    columnas={columnasVisibles.length}
                    contraido={contraido}
                    alAlternar={() => tabla.alternarGrupo(grupo.clave)}
                    etiqueta={etiquetaGrupo(vista.agrupar!, grupo)}
                    cantidad={grupo.filas.length}
                    nombre={NOMBRE_FILAS}
                    total={formatearMoneda(grupo.total, codigoPais)}
                  />
                  {!contraido && grupo.filas.map((p) => fila(p))}
                </tbody>
              );
            })
          ) : (
            <tbody>{visibles.map((p) => fila(p))}</tbody>
          )}
        </table>
      </div>
      {pedidos.length > 0 && visibles.length === 0 && (
        <EstadoVacio
          mensaje={
            hayFiltros
              ? "Ninguna orden coincide con los filtros."
              : `Todas las órdenes están entregadas. Pulsa «Entregados» para ver las ${resultado.cerradosOcultos}.`
          }
        />
      )}
      <p role="status" className="sr-only">
        {pedidos.length > 0 ? `${visibles.length} ${visibles.length === 1 ? "orden" : "órdenes"}` : ""}
      </p>
      {notas.length > 0 && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{notas.join(" · ")}</p>
      )}
    </div>
  );
}
