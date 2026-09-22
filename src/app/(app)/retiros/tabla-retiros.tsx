"use client";

import { useState } from "react";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { Paginacion } from "@/components/tabla/paginacion";
import { POR_PAGINA, useIrAPaginaArriba } from "@/components/tabla/usar-pagina-arriba";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { linkClass } from "@/components/ui/link";
import { BarraHerramientas } from "@/components/tabla/barra-herramientas";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { EncabezadoGrupo } from "@/components/tabla/encabezado-grupo";
import {
  claseCeldaCasilla,
  claseCeldaColumna,
  claseEncabezadoCasilla,
  claseEncabezadoColumna,
  claseFilaEncabezado,
} from "@/components/tabla/estilos-tabla";
import { useColumnas, type ColumnaDef } from "@/components/tabla/ganchos";
import { useTablaInteractiva } from "@/components/tabla/usar-tabla";
import { ETIQUETA_ESTADO_DROPI, TONO_ESTADO_DROPI, type EstadoDropi } from "@/lib/dropi/emparejar-retiros";
import { formatearFechaNumerica, formatearMoneda } from "@/lib/formato";
import {
  CalendarioIcon,
  EstadoIcon,
  ExtractoIcon,
  GastoIcon,
  PedidoIcon,
  PersonaIcon,
  TiendaIcon,
} from "@/lib/nav-icons";
import { notasPie, type NombreFilas } from "@/lib/tabla/pie";
import type { Grupo } from "@/lib/tabla/vista";
import { DEF_RETIROS, ESTADO_ETIQUETA } from "./filtros";
import { ESTADO_TONO } from "@/lib/retiros/estados";
import { CrearRetiroPanel, type Cuenta, type Plataforma } from "./crear-retiro-panel";
import { BarraLote } from "./barra-lote";
import { VistaRapidaRetiro } from "./vista-rapida-retiro";

export interface FilaRetiro {
  id: string;
  numeroCorrelativo: number;
  consolidado: boolean;
  fecha: string;
  plataformaId: string | null;
  plataformaNombre: string | null;
  cuentaRetiroId: string | null;
  destino: string;
  monto: number;
  estado: string;
  comision: number;
  aRecibir: number;
  montoRecibido: number | null;
  fechaCierre: string | null;
  fechaLimite: string | null;
  asignadoNombre: string | null;
  estadoDropi: string | null;
  gestionadoPor: string;
  notas: string | null;
  soporteNumero: string | null;
}

// Sin filtros ni grupos se ve una página de 50 (los más recientes primero); con filtros o agrupando se trabaja sobre
// todos los retiros cargados.

const NOMBRE_FILAS: NombreFilas = { singular: "retiro", plural: "retiros" };

/** Ícono de cada campo en los menús de agrupar y de filtros. */
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  plataforma: TiendaIcon,
  destino: ExtractoIcon,
  dropi: PedidoIcon,
  asignado: PersonaIcon,
  creacion: CalendarioIcon,
  cierre: CalendarioIcon,
  limite: CalendarioIcon,
  monto: GastoIcon,
  comision: GastoIcon,
  arecibir: GastoIcon,
  recibido: GastoIcon,
  notas: ExtractoIcon,
  soporte: ExtractoIcon,
};

type ColumnaId = "correlativo" | "fecha" | "plataforma" | "destino" | "monto" | "consolidado" | "estado" | "dropi";

const COLUMNAS: (ColumnaDef & { id: ColumnaId; claseCelda?: string })[] = [
  { id: "correlativo", label: "#", ocultable: false, claseCelda: "font-semibold" },
  { id: "fecha", label: "Creación", ocultable: true },
  { id: "plataforma", label: "Plataforma", ocultable: true, claseCelda: "text-muted-foreground" },
  { id: "destino", label: "Cuenta destino", ocultable: true, claseCelda: "text-muted-foreground" },
  { id: "monto", label: "Monto", ocultable: true, claseCelda: "tabular-nums font-semibold" },
  { id: "consolidado", label: "Consolidación", ocultable: true },
  { id: "estado", label: "Estado", ocultable: true },
  { id: "dropi", label: "Dropi", ocultable: true },
];
const COLUMNAS_POR_ID = new Map(COLUMNAS.map((c) => [c.id, c]));

/** Fondo opaco de una fila marcada. */
const FONDO_MARCADA = "bg-[color-mix(in_oklab,var(--accent)_45%,var(--card))]";

function renderCelda(id: ColumnaId, fila: FilaRetiro, codigoPais: string, alAbrir: (id: string) => void) {
  switch (id) {
    case "correlativo":
      return (
        <Link
          href={`/retiros/${fila.id}`}
          onClick={(e) => {
            // Ctrl/Cmd/Shift-clic o clic central: se deja abrir en pestaña nueva como cualquier
            // enlace. Un clic normal abre la ficha acá mismo, sin salir de la tabla.
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            alAbrir(fila.id);
          }}
          className={`${linkClass} after:absolute after:inset-0 after:content-['']`}
        >
          #{String(fila.numeroCorrelativo).padStart(4, "0")}
        </Link>
      );
    case "fecha":
      return formatearFechaNumerica(fila.fecha);
    case "plataforma":
      return fila.plataformaNombre;
    case "destino":
      return fila.destino;
    case "monto":
      return formatearMoneda(fila.monto, codigoPais);
    case "consolidado":
      return (
        <Badge tone={fila.consolidado ? "success" : "warning"}>
          {fila.consolidado ? "Consolidado" : "Pendiente"}
        </Badge>
      );
    case "estado":
      // Solo lectura: el estado no se cambia desde la tabla (cambia al conciliar, cancelar o editar el retiro).
      return (
        <Badge tone={ESTADO_TONO[fila.estado as keyof typeof ESTADO_TONO] ?? "neutral"}>
          {ESTADO_ETIQUETA[fila.estado] ?? fila.estado}
        </Badge>
      );
    case "dropi":
      return fila.estadoDropi ? (
        <Badge tone={TONO_ESTADO_DROPI[fila.estadoDropi as EstadoDropi]}>
          {ETIQUETA_ESTADO_DROPI[fila.estadoDropi as EstadoDropi]}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
  }
}

/** Nombre del grupo: para Estado y Estado en Dropi usa la misma insignia de la columna, para el resto texto. */
function etiquetaGrupo(campo: string, grupo: Grupo<FilaRetiro>) {
  if (campo === "estado") {
    return <Badge tone={ESTADO_TONO[grupo.clave as keyof typeof ESTADO_TONO]}>{grupo.etiqueta}</Badge>;
  }
  if (campo === "dropi" && grupo.clave in TONO_ESTADO_DROPI) {
    return <Badge tone={TONO_ESTADO_DROPI[grupo.clave as EstadoDropi]}>{grupo.etiqueta}</Badge>;
  }
  return <span className="font-semibold">{grupo.etiqueta}</span>;
}

/** Tabla de retiros con la barra de herramientas común (agrupar, cerrados, filtros y columnas). Cada persona
 * conserva en su navegador sus filtros, su vista y el orden de sus columnas. */
export function TablaRetiros({
  retiros,
  codigoPais,
  paisId,
  plataformas,
  cuentas,
  miNombre,
  puedeEscribir,
}: {
  retiros: FilaRetiro[];
  codigoPais: string;
  paisId: string;
  plataformas: Plataforma[];
  cuentas: Cuenta[];
  /** Cómo aparece la persona que tiene la sesión en «Creado por»; con él sale «Mis retiros». */
  miNombre?: string | null;
  /** Solo quien puede modificar retiros ve las casillas y la barra de selección. */
  puedeEscribir: boolean;
}) {
  const tabla = useTablaInteractiva(DEF_RETIROS, retiros, { porPagina: POR_PAGINA });
  const [columnasGuardadas, cambiarColumnas] = useColumnas("retiros", COLUMNAS);
  const { vista, resultado, visibles, grupos, contraidos, hayFiltros, agrupado, paginacion } = tabla;

  // Al cambiar de página se vuelve al principio de la tabla (si quien pulsó estaba abajo, no se queda mirando el final).
  const { raiz, alIrA: irAPagina } = useIrAPaginaArriba(tabla.irAPagina);

  // Lo marcado. Solo cuenta lo que se ve ahora (filas de los grupos abiertos, o las de la lista): así una acción
  // nunca toca un retiro que la persona no tiene delante. Un retiro marcado que un filtro esconde sigue marcado
  // y reaparece marcado cuando el filtro se quita.
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  // El retiro que se ve en la vista rápida (el panel de la derecha); se busca por id para que, si la fila cambia
  // (un estado nuevo), el panel muestre lo de ahora.
  const [vistaRapidaId, setVistaRapidaId] = useState<string | null>(null);
  const filasEnPantalla = agrupado ? grupos.filter((g) => !contraidos.has(g.clave)).flatMap((g) => g.filas) : visibles;
  const filasMarcadas = puedeEscribir ? filasEnPantalla.filter((f) => marcados.has(f.id)) : [];
  const todasMarcadas = filasEnPantalla.length > 0 && filasMarcadas.length === filasEnPantalla.length;

  function alternarFila(id: string) {
    setMarcados((actuales) => {
      const nuevos = new Set(actuales);
      if (!nuevos.delete(id)) nuevos.add(id);
      return nuevos;
    });
  }

  function alternarTodas() {
    setMarcados((actuales) => {
      const nuevos = new Set(actuales);
      for (const fila of filasEnPantalla) {
        if (todasMarcadas) nuevos.delete(fila.id);
        else nuevos.add(fila.id);
      }
      return nuevos;
    });
  }

  const columnasVisibles = columnasGuardadas.orden
    .filter((id) => !columnasGuardadas.ocultas.has(id))
    .map((id) => COLUMNAS_POR_ID.get(id as ColumnaId)!);

  const filaRetiro = (fila: FilaRetiro) => (
    <tr
      key={fila.id}
      className={`group relative border-b border-border/60 last:border-0 ${
        marcados.has(fila.id) ? FONDO_MARCADA : "hover:bg-muted/50"
      }`}
    >
      {puedeEscribir && (
        // `relative z-10`: la fila entera es un enlace estirado (ver el número #), la casilla debe quedar encima.
        <td className={claseCeldaCasilla}>
          <label className="-my-2 flex h-8 w-8 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              checked={marcados.has(fila.id)}
              onChange={() => alternarFila(fila.id)}
              aria-label={`Seleccionar el retiro #${String(fila.numeroCorrelativo).padStart(4, "0")}`}
              className="h-4 w-4 cursor-pointer accent-foreground"
            />
          </label>
        </td>
      )}
      {columnasVisibles.map((columna) => (
        <td key={columna.id} className={`${claseCeldaColumna} ${columna.claseCelda ?? ""}`}>
          {renderCelda(columna.id, fila, codigoPais, setVistaRapidaId)}
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
    // Sin nota de "N cerrados sin mostrar": el botón "Cerrados" de la barra ya lo indica.
  });

  return (
    <div ref={raiz} className="mt-3 min-w-0 rounded-xl border border-border bg-card">
      <BarraHerramientas
        def={DEF_RETIROS}
        filas={retiros}
        tabla={tabla}
        iconos={ICONOS}
        nombreFilas="retiros"
        columnas={{ defs: COLUMNAS, estado: columnasGuardadas, cambiar: cambiarColumnas }}
        atajos={
          miNombre
            ? [
                {
                  id: "mis-retiros",
                  etiqueta: "Mis retiros",
                  ayuda: "Ver solo mis retiros",
                  filtro: { campo: "asignado", valor: { tipo: "seleccion", valores: [miNombre] } },
                },
              ]
            : undefined
        }
        accionPrincipal={
          puedeEscribir ? <CrearRetiroPanel paisId={paisId} plataformas={plataformas} cuentas={cuentas} /> : undefined
        }
      />

      <ContenedorTabla ariaLabel="Tabla de retiros">
        <table className="tabla-datos w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              {puedeEscribir && (
                <th scope="col" className={claseEncabezadoCasilla}>
                  <label className="-my-2 flex h-8 w-8 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={todasMarcadas}
                      ref={(el) => {
                        if (el) el.indeterminate = filasMarcadas.length > 0 && !todasMarcadas;
                      }}
                      onChange={alternarTodas}
                      disabled={filasEnPantalla.length === 0}
                      aria-label="Seleccionar todos los retiros que se ven"
                      className="h-4 w-4 cursor-pointer accent-foreground"
                    />
                  </label>
                </th>
              )}
              {columnasVisibles.map((columna) => (
                <th key={columna.id} scope="col" className={claseEncabezadoColumna}>
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
                    columnas={columnasVisibles.length + (puedeEscribir ? 1 : 0)}
                    contraido={contraido}
                    alAlternar={() => tabla.alternarGrupo(grupo.clave)}
                    etiqueta={etiquetaGrupo(vista.agrupar!, grupo)}
                    cantidad={grupo.filas.length}
                    nombre={NOMBRE_FILAS}
                    total={formatearMoneda(grupo.total, codigoPais)}
                  />
                  {!contraido && grupo.filas.map((fila) => filaRetiro(fila))}
                </tbody>
              );
            })
          ) : (
            <tbody>{visibles.map((fila) => filaRetiro(fila))}</tbody>
          )}
        </table>
      </ContenedorTabla>
      {paginacion && <Paginacion pagina={paginacion} nombre={NOMBRE_FILAS} alIrA={irAPagina} />}
      {filasMarcadas.length > 0 && <BarraLote filas={filasMarcadas} alQuitar={() => setMarcados(new Set())} />}
      {/* Anuncia a lectores de pantalla cuántos retiros se ven cuando cambian los filtros, los grupos o los cerrados. */}
      <p role="status" className="sr-only">
        {retiros.length > 0
          ? `${paginacion ? paginacion.total : visibles.length} ${
              (paginacion ? paginacion.total : visibles.length) === 1 ? "retiro" : "retiros"
            }${paginacion && paginacion.totalPaginas > 1 ? `, página ${paginacion.pagina} de ${paginacion.totalPaginas}` : ""}${
              agrupado ? ` en ${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}` : ""
            }${!resultado.cerradosVisibles && resultado.cerradosOcultos > 0 ? `, ${resultado.cerradosOcultos} cerrados ocultos` : ""}`
          : ""}
      </p>
      <VistaRapidaRetiro
        fila={retiros.find((r) => r.id === vistaRapidaId) ?? null}
        codigoPais={codigoPais}
        paisId={paisId}
        plataformas={plataformas}
        cuentas={cuentas}
        alCerrar={() => setVistaRapidaId(null)}
      />
      {retiros.length === 0 && <EstadoVacio mensaje="Todavía no hay retiros registrados." />}
      {retiros.length > 0 && visibles.length === 0 && (
        <EstadoVacio
          mensaje={
            hayFiltros
              ? "Ningún retiro coincide con los filtros."
              : `No hay retiros abiertos por ahora. Pulsa «Cerrados» para ver los ${resultado.cerradosOcultos} cerrados.`
          }
        />
      )}
      {notas.length > 0 && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{notas.join(" · ")}</p>
      )}
    </div>
  );
}
