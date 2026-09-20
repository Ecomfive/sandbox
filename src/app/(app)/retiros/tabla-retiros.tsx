"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { linkClass } from "@/components/ui/link";
import { ETIQUETA_ESTADO_DROPI, TONO_ESTADO_DROPI, type EstadoDropi } from "@/lib/dropi/emparejar-retiros";
import { formatearFechaNumerica, formatearMoneda } from "@/lib/formato";
import { ArrastrarIcon, ChevronRightIcon, ColumnasIcon } from "@/lib/nav-icons";
import { ESTADO_ETIQUETA, filtroActivo } from "./filtros";
import { BotonFiltrosRetiros, useFiltrosRetiros } from "./filtros-retiros";
import { EstadoSelect } from "./estado-select";
import { BotonAgrupar, BotonCerrados, useVistaRetiros } from "./vista-retiros";
import { agruparRetiros, aplicarVista, type CampoAgrupable, type Grupo } from "./vista";
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

const ESTADO_TONO = {
  abierto: "info",
  cancelado: "neutral",
  novedad: "destructive",
  cerrado: "success",
} as const;

type ColumnaId = "correlativo" | "fecha" | "plataforma" | "destino" | "monto" | "consolidado" | "estado" | "dropi";

const COLUMNAS: { id: ColumnaId; label: string; ocultable: boolean; claseCelda?: string }[] = [
  { id: "correlativo", label: "#", ocultable: false, claseCelda: "font-semibold" },
  { id: "fecha", label: "Creación", ocultable: true },
  { id: "plataforma", label: "Plataforma", ocultable: true, claseCelda: "text-muted-foreground" },
  { id: "destino", label: "Destino", ocultable: true, claseCelda: "text-muted-foreground" },
  { id: "monto", label: "Monto", ocultable: true, claseCelda: "tabular-nums font-semibold" },
  { id: "consolidado", label: "Consolidación", ocultable: true },
  { id: "estado", label: "Estado", ocultable: true },
  { id: "dropi", label: "Dropi", ocultable: true },
];

const ORDEN_DEFECTO = COLUMNAS.map((c) => c.id);
const COLUMNAS_POR_ID = new Map(COLUMNAS.map((c) => [c.id, c]));
// v2: se sube de versión porque quienes ya tenían un orden guardado en v1 podían haber
// arrastrado "Consolidación" al final antes de este cambio — arranca de cero una sola vez.
const STORAGE_KEY = "retiros-columnas-v2";

function esColumnaId(valor: unknown): valor is ColumnaId {
  return typeof valor === "string" && ORDEN_DEFECTO.includes(valor as ColumnaId);
}

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
function etiquetaGrupo(campo: CampoAgrupable, grupo: Grupo) {
  if (campo === "estado") {
    return <Badge tone={ESTADO_TONO[grupo.clave as keyof typeof ESTADO_TONO]}>{grupo.etiqueta}</Badge>;
  }
  if (campo === "dropi" && grupo.clave in TONO_ESTADO_DROPI) {
    return <Badge tone={TONO_ESTADO_DROPI[grupo.clave as EstadoDropi]}>{grupo.etiqueta}</Badge>;
  }
  return <span className="font-semibold">{grupo.etiqueta}</span>;
}

/** Tabla de retiros con menú de columnas: arrastrar para reordenar, casilla para ocultar.
 * La preferencia se guarda en localStorage — cada persona en su navegador ve su propio orden.
 * Encima de la tabla: agrupar por un campo y mostrar u ocultar los retiros cerrados (como en ClickUp). */
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
  const [filtros, cambiarFiltros] = useFiltrosRetiros();
  const [vista, cambiarVista] = useVistaRetiros();
  const hayFiltros = filtros.some(filtroActivo);
  const agrupado = vista.agrupar !== null;
  const { filas: filtradas, base, cerradosOcultos, cerradosVisibles, forzadoPorFiltro } = useMemo(
    () => aplicarVista(retiros, filtros, vista.mostrarCerrados),
    [retiros, filtros, vista.mostrarCerrados]
  );
  const visibles = hayFiltros || agrupado ? filtradas : filtradas.slice(0, LIMITE_SIN_FILTROS);
  const grupos = useMemo(
    () => (vista.agrupar ? agruparRetiros(visibles, vista.agrupar, vista.orden) : []),
    [visibles, vista.agrupar, vista.orden]
  );

  // Grupos contraídos: se olvidan al cambiar el campo de agrupación, porque las claves ya no aplican.
  const [contraidosPor, setContraidosPor] = useState<{ campo: CampoAgrupable | null; claves: string[] }>({
    campo: null,
    claves: [],
  });
  const contraidos = new Set(contraidosPor.campo === vista.agrupar ? contraidosPor.claves : []);
  function alternarGrupo(clave: string) {
    if (!vista.agrupar) return;
    const claves = contraidos.has(clave) ? [...contraidos].filter((c) => c !== clave) : [...contraidos, clave];
    setContraidosPor({ campo: vista.agrupar, claves });
  }

  const [orden, setOrden] = useState<ColumnaId[]>(ORDEN_DEFECTO);
  const [ocultas, setOcultas] = useState<Set<ColumnaId>>(new Set());
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [arrastrando, setArrastrando] = useState<ColumnaId | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const botonColumnasRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (!guardado) return;
      const datos = JSON.parse(guardado) as { orden?: unknown[]; ocultas?: unknown[] };
      const ordenGuardado = (datos.orden ?? []).filter(esColumnaId);
      // Una columna nueva (agregada después de que alguien ya guardó su propio orden) se
      // inserta junto a donde iría por defecto, en vez de siempre al final: se busca la
      // columna por defecto más cercana hacia atrás que ya esté en el orden guardado.
      const resultado = [...ordenGuardado];
      ORDEN_DEFECTO.forEach((id, indiceDefecto) => {
        if (resultado.includes(id)) return;
        let posicionInsercion = resultado.length;
        for (let i = indiceDefecto - 1; i >= 0; i--) {
          const indice = resultado.indexOf(ORDEN_DEFECTO[i]);
          if (indice !== -1) {
            posicionInsercion = indice + 1;
            break;
          }
        }
        resultado.splice(posicionInsercion, 0, id);
      });
      setOrden(resultado);
      setOcultas(new Set((datos.ocultas ?? []).filter(esColumnaId).filter((id) => id !== "correlativo")));
    } catch {
      // localStorage puede fallar (modo privado, cuotas, etc.) — se usa el orden por defecto.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ orden, ocultas: [...ocultas] }));
    } catch {}
  }, [orden, ocultas]);

  useEffect(() => {
    if (!menuAbierto) return;
    function alHacerClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setMenuAbierto(false);
      }
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMenuAbierto(false);
      if (contenedorRef.current?.contains(document.activeElement)) botonColumnasRef.current?.focus();
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alHacerClicFuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [menuAbierto]);

  function moverColumna(origenId: ColumnaId, destinoId: ColumnaId) {
    if (origenId === destinoId) return;
    setOrden((prev) => {
      const sinOrigen = prev.filter((id) => id !== origenId);
      const indiceDestino = sinOrigen.indexOf(destinoId);
      sinOrigen.splice(indiceDestino, 0, origenId);
      return sinOrigen;
    });
  }

  // Alternativa de teclado al arrastrar con mouse: mueve una posición arriba/abajo.
  function moverPorTeclado(id: ColumnaId, direccion: -1 | 1) {
    setOrden((prev) => {
      const indice = prev.indexOf(id);
      const destino = indice + direccion;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  function alternarVisible(id: ColumnaId) {
    setOcultas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  const columnasVisibles = orden.filter((id) => !ocultas.has(id)).map((id) => COLUMNAS_POR_ID.get(id)!);

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

  const notasPie: string[] = [];
  if (hayFiltros) notasPie.push(`${visibles.length} de ${base.length} retiros`);
  else if (agrupado) {
    notasPie.push(
      `${visibles.length} ${visibles.length === 1 ? "retiro" : "retiros"} en ${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}`
    );
  } else if (base.length > LIMITE_SIN_FILTROS) {
    notasPie.push(`Mostrando los ${LIMITE_SIN_FILTROS} más recientes de ${base.length}. Usa los filtros para ver el resto.`);
  }
  if (!cerradosVisibles && cerradosOcultos > 0) {
    notasPie.push(`${cerradosOcultos} ${cerradosOcultos === 1 ? "cerrado oculto" : "cerrados ocultos"}`);
  }

  return (
    <div className="mt-3 min-w-0 rounded-xl border border-border bg-card">
      <div
        ref={contenedorRef}
        className="flex flex-wrap items-center justify-end gap-2 border-b border-border bg-muted/50 px-2 py-1.5"
      >
        <BotonAgrupar
          campo={vista.agrupar}
          orden={vista.orden}
          alElegir={(agrupar) => cambiarVista({ agrupar })}
          alElegirOrden={(orden) => cambiarVista({ orden })}
          hayGrupos={grupos.length > 0}
          alContraerTodos={() =>
            setContraidosPor({ campo: vista.agrupar, claves: grupos.map((grupo) => grupo.clave) })
          }
          alExpandirTodos={() => setContraidosPor({ campo: vista.agrupar, claves: [] })}
          alAbrir={() => setMenuAbierto(false)}
        />
        <BotonCerrados
          visibles={cerradosVisibles}
          forzadoPorFiltro={forzadoPorFiltro}
          ocultos={cerradosOcultos}
          alAlternar={() => cambiarVista({ mostrarCerrados: !vista.mostrarCerrados })}
        />
        <BotonFiltrosRetiros
          filas={retiros}
          filtros={filtros}
          alCambiar={cambiarFiltros}
          alAbrir={() => setMenuAbierto(false)}
        />
        <div className="relative">
          <Tooltip texto="Mostrar y ordenar columnas">
            <button
              ref={botonColumnasRef}
              type="button"
              onClick={() => setMenuAbierto((v) => !v)}
              aria-expanded={menuAbierto}
              className={`flex min-h-8 items-center gap-1.5 !rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted ${anilloFoco}`}
            >
              <ColumnasIcon className="h-4 w-4" />
              Columnas
            </button>
          </Tooltip>
          {menuAbierto && (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-border bg-card p-1 shadow-lg">
              {orden.map((id, indice) => {
                const columna = COLUMNAS_POR_ID.get(id)!;
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={() => setArrastrando(id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (arrastrando) moverColumna(arrastrando, id);
                      setArrastrando(null);
                    }}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <ArrastrarIcon className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                    <label className="flex flex-1 items-center gap-2 select-none">
                      <input
                        type="checkbox"
                        checked={!ocultas.has(id)}
                        disabled={!columna.ocultable}
                        onChange={() => alternarVisible(id)}
                        className="h-4 w-4"
                      />
                      {columna.label}
                    </label>
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => moverPorTeclado(id, -1)}
                        disabled={indice === 0}
                        aria-label={`Mover columna ${columna.label} hacia arriba`}
                        className={`flex h-6 w-6 items-center justify-center text-xs leading-none text-muted-foreground hover:bg-border disabled:opacity-30 ${anilloFoco}`}
                      >
                        <span aria-hidden="true">▲</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => moverPorTeclado(id, 1)}
                        disabled={indice === orden.length - 1}
                        aria-label={`Mover columna ${columna.label} hacia abajo`}
                        className={`flex h-6 w-6 items-center justify-center text-xs leading-none text-muted-foreground hover:bg-border disabled:opacity-30 ${anilloFoco}`}
                      >
                        <span aria-hidden="true">▼</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
        {vista.agrupar
          ? grupos.map((grupo) => {
              const contraido = contraidos.has(grupo.clave);
              return (
                <tbody key={grupo.clave}>
                  <tr className="border-b border-border bg-muted/40">
                    <th scope="colgroup" colSpan={columnasVisibles.length + 1} className="p-0 text-left font-normal">
                      <button
                        type="button"
                        aria-expanded={!contraido}
                        onClick={() => alternarGrupo(grupo.clave)}
                        className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
                      >
                        <ChevronRightIcon
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
                            contraido ? "" : "rotate-90"
                          }`}
                        />
                        {etiquetaGrupo(vista.agrupar!, grupo)}
                        <span className="text-xs font-normal text-muted-foreground tabular-nums">
                          {grupo.filas.length} {grupo.filas.length === 1 ? "retiro" : "retiros"} ·{" "}
                          {formatearMoneda(grupo.total, codigoPais)}
                        </span>
                      </button>
                    </th>
                  </tr>
                  {!contraido && grupo.filas.map((fila) => filaRetiro(fila))}
                </tbody>
              );
            })
          : (
            <tbody>{visibles.map((fila) => filaRetiro(fila))}</tbody>
          )}
      </table>
      </div>
      {/* Anuncia a lectores de pantalla cuántos retiros se ven cuando cambian los filtros, los grupos o los cerrados. */}
      <p role="status" className="sr-only">
        {retiros.length > 0
          ? `${visibles.length} ${visibles.length === 1 ? "retiro" : "retiros"}${
              agrupado ? ` en ${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}` : ""
            }${!cerradosVisibles && cerradosOcultos > 0 ? `, ${cerradosOcultos} cerrados ocultos` : ""}`
          : ""}
      </p>
      {retiros.length === 0 && <EstadoVacio mensaje="Todavía no hay retiros registrados." />}
      {retiros.length > 0 && visibles.length === 0 && (
        <EstadoVacio
          mensaje={
            hayFiltros
              ? "Ningún retiro coincide con los filtros."
              : `No hay retiros abiertos por ahora. Pulsa «Cerrados» para ver los ${cerradosOcultos} cerrados.`
          }
        />
      )}
      {notasPie.length > 0 && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{notasPie.join(" · ")}</p>
      )}
    </div>
  );
}
