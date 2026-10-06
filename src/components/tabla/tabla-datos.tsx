"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { ContenedorTabla } from "./contenedor-tabla";
import { useState, type ReactNode } from "react";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import type { DefTabla } from "@/lib/tabla/motor";
import { notasPie, type NombreFilas } from "@/lib/tabla/pie";
import type { Grupo } from "@/lib/tabla/vista";
import { BarraHerramientas } from "./barra-herramientas";
import type { IconoComp } from "./botones-vista";
import type { DescargaCompleta } from "./boton-descargar";
import { EncabezadoGrupo } from "./encabezado-grupo";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "./estilos-tabla";
import { useColumnas, type ColumnaDef } from "./ganchos";
import { Paginacion } from "./paginacion";
import { POR_PAGINA, textoEstadoTabla, useIrAPaginaArriba } from "./usar-pagina-arriba";
import { useTablaInteractiva } from "./usar-tabla";

export interface ColumnaTabla<F, C = undefined> extends ColumnaDef {
  /** Dibuja la celda; `contexto` trae lo que depende de la página (p. ej. el código de país del monto). */
  render: (fila: F, contexto: C) => ReactNode;
  /** Clases de la celda (color, alineación...). */
  clase?: string;
}

/**
 * Tabla estándar con la barra de herramientas común: agrupar, filas cerradas, filtros y columnas. Sirve
 * a los módulos cuya tabla es solo mostrar datos; las que tienen comportamiento propio (selección,
 * fila que se edita...) arman la suya con `useTablaInteractiva` y `BarraHerramientas`.
 * `columnas` debe ser una constante del módulo (no se crea en cada render).
 */
export function TablaDatos<F, C = undefined>({
  def,
  filas,
  columnas,
  contexto,
  iconos,
  nombre,
  claveFila,
  etiquetaGrupo,
  formatearTotal,
  accion,
  abrirFila,
  claseFila,
  ariaLabel,
  anchoMinimo = "36rem",
  limiteSinFiltros,
  porPagina = POR_PAGINA,
  paginarSiempre,
  descargaCompleta,
  accionPrincipal,
  vacio,
  aspecto = "tabla",
}: {
  def: DefTabla<F>;
  filas: F[];
  columnas: ColumnaTabla<F, C>[];
  contexto?: C;
  iconos: Record<string, IconoComp>;
  nombre: NombreFilas;
  claveFila: (fila: F) => string;
  /** Nombre del grupo (texto o insignia); por defecto, el texto en negrita. */
  etiquetaGrupo?: (campo: string, grupo: Grupo<F>) => ReactNode;
  /** Formatea la suma del grupo; sin él el grupo solo cuenta filas. */
  formatearTotal?: (total: number) => string;
  /**
   * Columna de botones de la fila, fuera del menú de columnas. Con `fija` queda pegada al borde derecho
   * aunque la tabla se desplace de lado, con su encabezado visible.
   */
  accion?: { etiqueta: string; render: (fila: F) => ReactNode; fija?: boolean };
  /**
   * Hace que toda la fila se pueda pulsar para abrir su ficha. Un clic en un botón, enlace o campo de la fila
   * (el interruptor de estado, por ejemplo) sigue haciendo lo suyo y no abre nada. Para teclado y lectores de
   * pantalla, el contenido de la primera columna es un botón (`etiqueta` es su nombre). `alAbrir` recibe, además de
   * la fila, las claves de las filas en el orden en que se ven (para pasar a la anterior o a la siguiente).
   * Con `soloColumna`, la ficha se abre **solo** desde el botón de la columna `columna` (la primera si no se dice): el resto
   * de la fila no responde al clic, para que sus celdas puedan editarse en su sitio (Compras).
   */
  abrirFila?: { etiqueta: (fila: F) => string; alAbrir: (fila: F, orden: string[]) => void; columna?: string; soloColumna?: boolean };
  claseFila?: (fila: F) => string;
  ariaLabel: string;
  anchoMinimo?: string;
  limiteSinFiltros?: number;
  /** Filas por página cuando no hay filtros ni grupos (50 por defecto); con menos filas que eso no se ve la paginación. */
  porPagina?: number;
  /** Pagina también con filtros o grupos (por defecto se ven todas las filas en esos casos). */
  paginarSiempre?: boolean;
  /** Descarga que arma el servidor con más filas que las cargadas; el botón Descargar la ofrece junto a «Lo que se ve». */
  descargaCompleta?: DescargaCompleta;
  /** El botón «Agregar» del módulo (`FichaCrear`), al final de la fila de botones de la barra, junto a Descargar. */
  accionPrincipal?: ReactNode;
  /** Mensaje cuando no hay filas cargadas. */
  vacio: string;
  /** «lista»: más limpia, como una lista de ClickUp (sin rayas entre columnas y apenas una línea suave entre filas). */
  aspecto?: "tabla" | "lista";
}) {
  const tabla = useTablaInteractiva(def, filas, { limiteSinFiltros, porPagina, paginarSiempre });
  const [guardadas, cambiarColumnas] = useColumnas(def.clave, columnas);
  const { vista, resultado, visibles, grupos, contraidos, hayFiltros, agrupado, paginacion } = tabla;
  const { raiz, alIrA } = useIrAPaginaArriba(tabla.irAPagina);

  // Arrastrar el título de una columna sobre otro la pone en su lugar (el menú «Columnas» hace lo mismo con flechas,
  // para teclado). El orden se guarda por persona, como el del menú.
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  function soltarEn(destino: string) {
    if (arrastrada && arrastrada !== destino) {
      const origen = guardadas.orden.indexOf(arrastrada);
      const sinOrigen = guardadas.orden.filter((id) => id !== arrastrada);
      const i = sinOrigen.indexOf(destino);
      // Hacia la derecha queda después del destino; hacia la izquierda, antes.
      sinOrigen.splice(origen < guardadas.orden.indexOf(destino) ? i + 1 : i, 0, arrastrada);
      cambiarColumnas({ orden: sinOrigen });
    }
    setArrastrada(null);
    setSobre(null);
  }

  const porId = new Map(columnas.map((c) => [c.id, c]));
  const visibles_ = guardadas.orden.filter((id) => !guardadas.ocultas.has(id)).map((id) => porId.get(id)!);
  const anchoColumnas = visibles_.length + (accion ? 1 : 0);

  // Las filas en el orden en que se ven: con grupos, los que están abiertos; sin ellos, la página actual.
  const ordenEnPantalla = () =>
    (vista.agrupar ? grupos.filter((g) => !contraidos.has(g.clave)).flatMap((g) => g.filas) : visibles).map(claveFila);

  const fila = (f: F) => (
    <tr
      key={claveFila(f)}
      onClick={
        abrirFila && !abrirFila.soloColumna
          ? (e) => {
              if ((e.target as HTMLElement).closest("button, a, input, select, textarea, label, summary")) return;
              // El foco pasa al botón de la fila antes de abrir: al cerrar la ficha vuelve ahí y no se pierde.
              e.currentTarget.querySelector<HTMLElement>("button[aria-haspopup='dialog']")?.focus({ preventScroll: true });
              abrirFila.alAbrir(f, ordenEnPantalla());
            }
          : undefined
      }
      className={`group border-b border-border/60 last:border-0 ${abrirFila && !abrirFila.soloColumna ? "cursor-pointer" : ""} ${abrirFila ? "hover:bg-muted/50" : ""} ${claseFila?.(f) ?? ""}`}
    >
      {visibles_.map((c, i) => (
        <td key={c.id} className={`${claseCeldaColumna} ${c.clase ?? ""}`}>
          {abrirFila && (abrirFila.columna ? c.id === abrirFila.columna : i === 0) ? (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={abrirFila.etiqueta(f)}
              onClick={() => abrirFila.alAbrir(f, ordenEnPantalla())}
              className="-mx-1 rounded px-1 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            >
              {c.render(f, contexto as C)}
            </button>
          ) : (
            c.render(f, contexto as C)
          )}
        </td>
      ))}
      {accion && (
        <td
          className={
            accion.fija
              ? "sticky right-0 z-10 border-l border-border/60 bg-card py-3 pr-4 pl-3 group-hover:bg-muted/50"
              : "py-3 pr-3"
          }
        >
          {accion.render(f)}
        </td>
      )}
    </tr>
  );

  const notas = notasPie({
    hayFiltros,
    agrupado,
    visibles: visibles.length,
    base: resultado.base.length,
    grupos: grupos.length,
    limiteSinFiltros,
    nombre,
    cerradosVisibles: resultado.cerradosVisibles,
    cerradosOcultos: resultado.cerradosOcultos,
    etiquetaCerrados: def.cerrados?.etiqueta,
  });

  return (
    <div ref={raiz} className="min-w-0 rounded-xl border border-border bg-card">
      <BarraHerramientas
        def={def}
        filas={filas}
        tabla={tabla}
        iconos={iconos}
        nombreFilas={nombre.plural}
        columnas={{ defs: columnas, estado: guardadas, cambiar: cambiarColumnas }}
        descargaCompleta={descargaCompleta}
        accionPrincipal={accionPrincipal}
      />
      <ContenedorTabla ariaLabel={ariaLabel}>
        <table data-aspecto={aspecto} className="tabla-datos w-full border-collapse text-sm" style={{ minWidth: anchoMinimo }}>
          <thead>
            <tr className={claseFilaEncabezado}>
              {visibles_.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  draggable
                  title="Arrastra para mover la columna"
                  onDragStart={(e) => {
                    setArrastrada(c.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", c.id);
                  }}
                  onDragOver={(e) => {
                    if (!arrastrada) return;
                    e.preventDefault();
                    if (sobre !== c.id) setSobre(c.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    soltarEn(c.id);
                  }}
                  onDragEnd={() => {
                    setArrastrada(null);
                    setSobre(null);
                  }}
                  className={`${claseEncabezadoColumna} cursor-grab active:cursor-grabbing ${arrastrada === c.id ? "opacity-50" : ""} ${
                    sobre === c.id && arrastrada && arrastrada !== c.id ? "outline-2 -outline-offset-2 outline-foreground" : ""
                  }`}
                >
                  {c.descripcion ? (
                    <Tooltip texto={c.descripcion}>
                      <span tabIndex={0} className="cursor-help border-b border-dotted border-muted-foreground/60">
                        {c.label}
                      </span>
                    </Tooltip>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              {accion && (
                <th
                  scope="col"
                  className={
                    accion.fija
                      ? "sticky right-0 z-10 bg-muted px-4 py-3 text-center text-xs font-semibold tracking-wide uppercase"
                      : "py-3 pr-3 font-medium"
                  }
                >
                  {accion.fija ? accion.etiqueta : <span className="sr-only">{accion.etiqueta}</span>}
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
                    columnas={anchoColumnas}
                    contraido={contraido}
                    alAlternar={() => tabla.alternarGrupo(grupo.clave)}
                    etiqueta={etiquetaGrupo?.(vista.agrupar!, grupo) ?? <span className="font-semibold">{grupo.etiqueta}</span>}
                    cantidad={grupo.filas.length}
                    nombre={nombre}
                    total={formatearTotal ? formatearTotal(grupo.total) : undefined}
                  />
                  {!contraido && grupo.filas.map((f) => fila(f))}
                </tbody>
              );
            })
          ) : (
            <tbody>{visibles.map((f) => fila(f))}</tbody>
          )}
        </table>
      </ContenedorTabla>
      {paginacion && <Paginacion pagina={paginacion} nombre={nombre} alIrA={alIrA} />}
      <p role="status" className="sr-only">
        {filas.length > 0 ? textoEstadoTabla(nombre, paginacion ? paginacion.total : visibles.length, paginacion) : ""}
      </p>
      {filas.length === 0 && <EstadoVacio mensaje={vacio} />}
      {filas.length > 0 && visibles.length === 0 && (
        <EstadoVacio
          mensaje={
            hayFiltros
              ? `Ninguna coincide con los filtros.`
              : def.cerrados?.exclusivo && vista.mostrarCerrados
                ? `No hay ninguna en «${def.cerrados.etiqueta}». Vuelve a pulsar el botón para ver las demás.`
                : `Todas están ocultas. Pulsa «${def.cerrados?.etiqueta ?? "Cerrados"}» para ver las ${resultado.cerradosOcultos}.`
          }
        />
      )}
      {notas.length > 0 && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{notas.join(" · ")}</p>
      )}
    </div>
  );
}
