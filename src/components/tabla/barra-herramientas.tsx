"use client";

import type { ReactNode } from "react";
import type { DefTabla } from "@/lib/tabla/motor";
import { camposAgrupables } from "@/lib/tabla/vista";
import { BotonFiltros } from "./boton-filtros";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import { PersonaIcon } from "@/lib/nav-icons";
import { BotonAgrupar, BotonAtajo, BotonCerrados, type IconoComp } from "./botones-vista";
import { BotonDescargar } from "./boton-descargar";
import { MenuVistas } from "./menu-vistas";
import type { EstadoTabla } from "@/lib/tabla/vistas";
import type { ColumnaDef, EstadoColumnas } from "./ganchos";
import { MenuColumnas } from "./menu-columnas";
import type { TablaInteractiva } from "./usar-tabla";

/**
 * Barra de herramientas común de las tablas, igual en todos los módulos y con el orden de ClickUp:
 * Agrupar, filas cerradas, Filtros y Columnas (cada una solo si la tabla la tiene). Mismas pastillas,
 * mismo lugar, mismos tooltips. `extra` va a la izquierda (p. ej. un botón propio del módulo).
 */
export function BarraHerramientas<F>({
  def,
  filas,
  tabla,
  iconos,
  nombreFilas,
  columnas,
  atajos,
  extra,
}: {
  def: DefTabla<F>;
  /** Todas las filas de la tabla, sin filtrar (de ahí salen las opciones de los filtros). */
  filas: F[];
  tabla: TablaInteractiva<F>;
  iconos: Record<string, IconoComp>;
  /** En plural y en minúscula: "retiros". */
  nombreFilas: string;
  columnas?: { defs: ColumnaDef[]; estado: EstadoColumnas; cambiar: (cambio: { orden?: string[]; ocultas?: string[] }) => void };
  /** Filtros de un toque (p. ej. «Mis retiros»); el ícono es el del campo que filtran. */
  atajos?: AtajoFiltro[];
  extra?: ReactNode;
}) {
  const agrupables = camposAgrupables(def).map((id) => ({ id, etiqueta: def.campos.find((c) => c.id === id)!.etiqueta }));
  const { vista, cambiarVista, resultado, filtros, cambiarFiltros, grupos } = tabla;
  const campoEstado = def.cerrados ? def.campos.find((c) => c.id === def.cerrados!.campoEstado)?.etiqueta : undefined;
  // Lo que se descarga es lo que se ve: las filas que dejan los filtros (no solo las primeras que caben en
  // pantalla) y, con grupos, en el orden de los grupos.
  const filasParaDescargar = vista.agrupar ? grupos.flatMap((g) => g.filas) : resultado.filas;

  // Aplicar una vista guardada (o la de un enlace) es escribir cada parte donde ya se guarda: filtros, vista y columnas.
  function aplicarEstado(nuevo: EstadoTabla) {
    cambiarFiltros(nuevo.filtros);
    cambiarVista(nuevo.vista);
    if (columnas && nuevo.columnas) columnas.cambiar(nuevo.columnas);
  }

  return (
    // Queda fija arriba al bajar la página, con fondo opaco para que las filas no se vean por debajo.
    <div
      className={`sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] px-2 py-1.5 ${
        extra ? "justify-between" : "justify-end"
      }`}
    >
      {extra && <div className="flex items-center gap-2">{extra}</div>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <MenuVistas
          def={def}
          estado={{
            filtros,
            vista,
            columnas: columnas ? { orden: columnas.estado.orden, ocultas: [...columnas.estado.ocultas] } : null,
          }}
          idsColumnas={columnas ? columnas.defs.map((c) => c.id) : null}
          aplicar={aplicarEstado}
        />
        {agrupables.length > 0 && (
          <BotonAgrupar
            campos={agrupables}
            iconos={iconos}
            campo={vista.agrupar}
            orden={vista.orden}
            alElegir={(agrupar) => cambiarVista({ agrupar })}
            alElegirOrden={(orden) => cambiarVista({ orden })}
            hayGrupos={grupos.length > 0}
            alContraerTodos={tabla.contraerTodos}
            alExpandirTodos={tabla.expandirTodos}
          />
        )}
        {def.cerrados && (
          <BotonCerrados
            etiqueta={def.cerrados.etiqueta}
            campoEstado={campoEstado ?? "Estado"}
            visibles={resultado.cerradosVisibles}
            forzadoPorFiltro={resultado.forzadoPorFiltro}
            ocultos={resultado.cerradosOcultos}
            alAlternar={() => cambiarVista({ mostrarCerrados: !vista.mostrarCerrados })}
          />
        )}
        {atajos?.map((atajo) => (
          <BotonAtajo
            key={atajo.id}
            etiqueta={atajo.etiqueta}
            ayuda={atajo.ayuda}
            icono={iconos[atajo.filtro.campo] ?? PersonaIcon}
            activo={atajoActivo(filtros, atajo)}
            alAlternar={() => cambiarFiltros(alternarAtajo(filtros, atajo))}
          />
        ))}
        <BotonFiltros
          def={def}
          filas={filas}
          filtros={filtros}
          alCambiar={cambiarFiltros}
          iconos={iconos}
          nombreFilas={nombreFilas}
        />
        {columnas && <MenuColumnas columnas={columnas.defs} estado={columnas.estado} alCambiar={columnas.cambiar} />}
        <BotonDescargar def={def} filas={filasParaDescargar} nombreFilas={nombreFilas} />
      </div>
    </div>
  );
}
