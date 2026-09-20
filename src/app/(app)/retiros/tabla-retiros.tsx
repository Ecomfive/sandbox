"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { linkClass } from "@/components/ui/link";
import { BarraHerramientas } from "@/components/tabla/barra-herramientas";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { EncabezadoGrupo } from "@/components/tabla/encabezado-grupo";
import { useColumnas, type ColumnaDef } from "@/components/tabla/ganchos";
import { useTablaInteractiva } from "@/components/tabla/usar-tabla";
import { ETIQUETA_ESTADO_DROPI, TONO_ESTADO_DROPI, type EstadoDropi } from "@/lib/dropi/emparejar-retiros";
import { formatearFechaNumerica, formatearMoneda } from "@/lib/formato";
import {
  ArrastrarIcon,
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
import { EstadoSelect } from "./estado-select";
import type { Cuenta, Plataforma } from "./crear-retiro-panel";
import { ConciliarRetiroPanel } from "./conciliar-retiro-panel";
import { EditarRetiroPanel } from "./editar-retiro-panel";
import { EliminarRetiroBoton } from "./eliminar-retiro-boton";

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

// Sin filtros ni grupos se ven los más recientes; con filtros o agrupando se trabaja sobre todos los retiros cargados.
const LIMITE_SIN_FILTROS = 50;

const NOMBRE_FILAS: NombreFilas = { singular: "retiro", plural: "retiros" };

const ESTADO_TONO = {
  abierto: "info",
  cancelado: "neutral",
  novedad: "destructive",
  cerrado: "success",
} as const;

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
  { id: "destino", label: "Destino", ocultable: true, claseCelda: "text-muted-foreground" },
  { id: "monto", label: "Monto", ocultable: true, claseCelda: "tabular-nums font-semibold" },
  { id: "consolidado", label: "Consolidación", ocultable: true },
  { id: "estado", label: "Estado", ocultable: true },
  { id: "dropi", label: "Dropi", ocultable: true },
];
const COLUMNAS_POR_ID = new Map(COLUMNAS.map((c) => [c.id, c]));

function renderCelda(id: ColumnaId, fila: FilaRetiro, codigoPais: string) {
  switch (id) {
    case "correlativo":
      return (
        <Link
          href={`/retiros/${fila.id}`}
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
      return fila.estado === "cancelado" ? (
        <Badge tone={ESTADO_TONO[fila.estado as keyof typeof ESTADO_TONO]}>
          {ESTADO_ETIQUETA[fila.estado] ?? fila.estado}
        </Badge>
      ) : (
        <EstadoSelect id={fila.id} estado={fila.estado} />
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
}: {
  retiros: FilaRetiro[];
  codigoPais: string;
  paisId: string;
  plataformas: Plataforma[];
  cuentas: Cuenta[];
}) {
  const tabla = useTablaInteractiva(DEF_RETIROS, retiros, { limiteSinFiltros: LIMITE_SIN_FILTROS });
  const [columnasGuardadas, cambiarColumnas] = useColumnas("retiros", COLUMNAS);
  const { vista, resultado, visibles, grupos, contraidos, hayFiltros, agrupado } = tabla;

  const columnasVisibles = columnasGuardadas.orden
    .filter((id) => !columnasGuardadas.ocultas.has(id))
    .map((id) => COLUMNAS_POR_ID.get(id as ColumnaId)!);

  const filaRetiro = (fila: FilaRetiro) => (
    <tr key={fila.id} className="group relative border-b border-border/60 last:border-0 hover:bg-muted/50">
      {columnasVisibles.map((columna) => (
        <td key={columna.id} className={`border-r border-border/40 px-4 py-3 ${columna.claseCelda ?? ""}`}>
          {renderCelda(columna.id, fila, codigoPais)}
        </td>
      ))}
      <td className="sticky right-0 z-10 bg-card px-2 py-3 group-hover:bg-muted/50">
        <div className="flex items-center justify-center gap-1">
          <ConciliarRetiroPanel
            retiro={{
              id: fila.id,
              numeroCorrelativo: fila.numeroCorrelativo,
              plataformaNombre: fila.plataformaNombre,
              destino: fila.destino,
              gestionadoPor: fila.gestionadoPor,
              monto: fila.monto,
              fecha: fila.fecha,
              fechaLimite: fila.fechaLimite,
              comision: fila.comision,
              aRecibir: fila.aRecibir,
              notas: fila.notas,
              soporteNumero: fila.soporteNumero,
              montoRecibido: fila.montoRecibido,
            }}
            paisId={paisId}
          />
          <EditarRetiroPanel
            retiro={{
              id: fila.id,
              numeroCorrelativo: fila.numeroCorrelativo,
              plataformaId: fila.plataformaId,
              cuentaRetiroId: fila.cuentaRetiroId,
              gestionadoPor: fila.gestionadoPor,
              monto: fila.monto,
              comision: fila.comision,
              fecha: fila.fecha,
              fechaLimite: fila.fechaLimite,
              notas: fila.notas,
            }}
            plataformas={plataformas}
            cuentas={cuentas}
          />
          <EliminarRetiroBoton id={fila.id} correlativo={fila.numeroCorrelativo} />
        </div>
      </td>
    </tr>
  );

  const notas = notasPie({
    hayFiltros,
    agrupado,
    visibles: visibles.length,
    base: resultado.base.length,
    grupos: grupos.length,
    limiteSinFiltros: LIMITE_SIN_FILTROS,
    nombre: NOMBRE_FILAS,
    cerradosVisibles: resultado.cerradosVisibles,
    cerradosOcultos: resultado.cerradosOcultos,
    etiquetaCerrados: DEF_RETIROS.cerrados?.etiqueta,
  });

  return (
    <div className="mt-3 min-w-0 rounded-xl border border-border bg-card">
      <BarraHerramientas
        def={DEF_RETIROS}
        filas={retiros}
        tabla={tabla}
        iconos={ICONOS}
        nombreFilas="retiros"
        columnas={{ defs: COLUMNAS, estado: columnasGuardadas, cambiar: cambiarColumnas }}
      />

      <div
        tabIndex={0}
        role="region"
        aria-label="Tabla de retiros, desplazable horizontalmente con las flechas izquierda y derecha"
        className="min-w-0 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
      >
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              {columnasVisibles.map((columna) => (
                <th
                  key={columna.id}
                  scope="col"
                  className="border-r border-border/60 px-4 py-3 text-xs font-semibold tracking-wide uppercase"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ArrastrarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    {columna.label}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="sticky right-0 z-10 bg-muted px-2 py-3 text-center text-xs font-semibold tracking-wide uppercase"
              >
                Acciones
              </th>
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
      </div>
      {/* Anuncia a lectores de pantalla cuántos retiros se ven cuando cambian los filtros, los grupos o los cerrados. */}
      <p role="status" className="sr-only">
        {retiros.length > 0
          ? `${visibles.length} ${visibles.length === 1 ? "retiro" : "retiros"}${
              agrupado ? ` en ${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}` : ""
            }${!resultado.cerradosVisibles && resultado.cerradosOcultos > 0 ? `, ${resultado.cerradosOcultos} cerrados ocultos` : ""}`
          : ""}
      </p>
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
