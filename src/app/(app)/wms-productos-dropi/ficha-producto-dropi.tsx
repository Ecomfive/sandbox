"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { anilloFoco } from "@/components/ui/field";
import { supabase } from "@/lib/supabase/client";
import { CheckIcon, CerrarIcon, HistorialIcon, InventarioIcon, PapeleraIcon, VistasIcon } from "@/lib/nav-icons";
import {
  ETIQUETA_PUBLICACION,
  faltantesDropi,
  productoDropiVacio,
  type Bodega,
  type ProductoDropiDatos,
  type SeccionDropi,
} from "@/lib/wms/producto-dropi";
import {
  archivarProductoDropi,
  duplicarProductoDropi,
  eliminarProductoDropi,
  guardarProductoDropi,
  obtenerHistorialExistenciaDropi,
  obtenerHistorialProductoDropi,
  obtenerProductoDropi,
  prepararSubidaMedioDropi,
} from "./actions";
import { SeccionGarantias, SeccionGeneral, SeccionImagenes, SeccionPrivados, SeccionRecursos, SeccionStock, SeccionVideos } from "./secciones-dropi";

interface Cargado {
  producto: ProductoDropiDatos;
  numero: number | null;
  archivado: boolean;
}

/**
 * Ficha de un producto de Dropi: el panel a la derecha que se abre al pulsar su fila (o «Agregar», con la ficha vacía).
 * Reúne lo que Dropi reparte entre las pestañas de «Crear Producto» (General, Stock o Variables y stock, Imagen del
 * producto, Videos, Recursos adicionales, Productos privados y Garantías) como bloques seguidos, y las acciones que
 * Dropi pone como íconos en la fila: Actualizar (la ficha ya es el formulario: «Guardar cambios» aparece con cambios),
 * Historial de existencia, Archivar (o restaurar) y, además, Duplicar y Eliminar. Con cambios sin guardar, cerrar pide
 * confirmación. Sin permiso de escritura solo se lee (`fieldset disabled`).
 */
export function FichaProductoDropi({
  id,
  abierto,
  paisId,
  bodegas,
  puedeEscribir,
  codigoPais,
  alAgregarBodega,
  alCerrar,
}: {
  /** null con `abierto` = producto nuevo. */
  id: string | null;
  abierto: boolean;
  paisId: string;
  bodegas: Bodega[];
  puedeEscribir: boolean;
  codigoPais: string;
  alAgregarBodega: (b: Bodega) => void;
  alCerrar: () => void;
}) {
  if (!abierto) return null;
  return (
    <ContenidoFicha
      key={id ?? "nuevo"}
      id={id}
      paisId={paisId}
      bodegas={bodegas}
      puedeEscribir={puedeEscribir}
      codigoPais={codigoPais}
      alAgregarBodega={alAgregarBodega}
      alCerrar={alCerrar}
    />
  );
}

function ContenidoFicha({
  id,
  paisId,
  bodegas,
  puedeEscribir,
  codigoPais,
  alAgregarBodega,
  alCerrar,
}: {
  id: string | null;
  paisId: string;
  bodegas: Bodega[];
  puedeEscribir: boolean;
  codigoPais: string;
  alAgregarBodega: (b: Bodega) => void;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [cargado, setCargado] = useState<Cargado | null>(id === null ? { producto: productoDropiVacio(), numero: null, archivado: false } : null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [d, setD] = useState<ProductoDropiDatos>(cargado?.producto ?? productoDropiVacio());
  const [pendiente, empezar] = useTransition();
  const [errores, setErrores] = useState<string[]>([]);
  const [intento, setIntento] = useState(false);
  const [version, setVersion] = useState(0);
  const [verExistencia, setVerExistencia] = useState(false);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const archivos = useRef(new Map<string, File>());
  const esNuevo = id === null;

  useEffect(() => {
    if (id === null) return;
    let vigente = true;
    obtenerProductoDropi(id)
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) setErrorCarga(r.error);
        else {
          setCargado({ producto: r.producto, numero: r.numero, archivado: r.archivado });
          setD(r.producto);
        }
      })
      .catch(() => vigente && setErrorCarga("No se pudo abrir el producto."));
    return () => {
      vigente = false;
    };
  }, [id, version]);

  const snapshot = useMemo(() => JSON.stringify(cargado?.producto ?? null), [cargado]);
  const sinGuardar = cargado !== null && JSON.stringify(d) !== snapshot;

  const set = (cambios: Partial<ProductoDropiDatos>) => setD((actual) => ({ ...actual, ...cambios }));

  function cerrar() {
    if (pendiente) return;
    if (sinGuardar && !confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    alCerrar();
  }

  function descartar() {
    archivos.current.clear();
    setErrores([]);
    setIntento(false);
    if (cargado) setD(cargado.producto);
    setVersion((v) => v + 1);
  }

  function irA(seccion: SeccionDropi) {
    document.getElementById(`dropi-seccion-${seccion}`)?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function guardar() {
    setIntento(true);
    const faltan = faltantesDropi(d);
    if (faltan.length > 0) {
      setErrores(faltan.map((f) => f.mensaje));
      irA(faltan[0].pestana);
      return;
    }
    setErrores([]);
    empezar(async () => {
      const medios = [...d.medios];
      for (const [i, m] of medios.entries()) {
        if (!m.tempId) continue;
        const archivo = archivos.current.get(m.tempId);
        if (!archivo) {
          setErrores(["Falta uno de los archivos elegidos; vuelve a agregarlo."]);
          return;
        }
        const permiso = await prepararSubidaMedioDropi(archivo.name).catch(() => ({ error: "No se pudo preparar la subida." }));
        if ("error" in permiso) {
          setErrores([permiso.error]);
          return;
        }
        const { error } = await supabase.storage.from("wms-productos").uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type || "application/octet-stream" });
        if (error) {
          setErrores([`No se pudo subir «${archivo.name}»: ${error.message}`]);
          return;
        }
        medios[i] = { ...m, ruta: permiso.ruta, tempId: undefined };
      }
      const r = await guardarProductoDropi({ id, paisId, datos: { ...d, medios } }).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if ("error" in r) {
        setErrores([r.error]);
        return;
      }
      archivos.current.clear();
      mostrarToast(esNuevo ? "Producto creado" : "Cambios guardados");
      router.refresh();
      if (esNuevo) alCerrar();
      else {
        setIntento(false);
        setVersion((v) => v + 1);
        setVersionHistorial((v) => v + 1);
      }
    });
  }

  function accion(fn: () => Promise<{ error?: string }>, mensaje: string, cerrarDespues = false) {
    empezar(async () => {
      const r = await fn().catch(() => ({ error: "No se pudo completar la acción." }));
      if (r.error) {
        setErrores([r.error]);
        return;
      }
      mostrarToast(mensaje);
      router.refresh();
      if (cerrarDespues) alCerrar();
      else {
        setVersion((v) => v + 1);
        setVersionHistorial((v) => v + 1);
      }
    });
  }

  const archivado = cargado?.archivado ?? false;
  const titulo = (
    <>
      {esNuevo ? "Producto nuevo" : `Producto #${cargado?.numero ?? ""}`}
      <Badge tone={d.publicacion === "publico" ? "info" : "neutral"}>{ETIQUETA_PUBLICACION[d.publicacion]}</Badge>
      {d.aprobado && <Badge tone="success">Aprobado</Badge>}
      {archivado && <Badge tone="warning">Archivado</Badge>}
    </>
  );

  if (errorCarga || !cargado) {
    return (
      <Ventana abierto alCerrar={alCerrar} lado="derecha" ancho="lg" titulo={titulo}>
        {errorCarga ? (
          <p role="alert" className="p-4 text-sm text-destructive">{errorCarga}</p>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        )}
      </Ventana>
    );
  }

  return (
    <Ventana abierto alCerrar={cerrar} lado="derecha" ancho="lg" titulo={titulo}>
    <div className="flex flex-1 flex-col" aria-busy={pendiente}>
      <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-3 border-y border-border bg-card px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {puedeEscribir && (sinGuardar || esNuevo) && (
            <>
              <button type="button" onClick={guardar} disabled={pendiente} className={`inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}>
                <CheckIcon className="h-4 w-4" />
                {pendiente ? "Guardando..." : esNuevo ? "Crear producto" : "Guardar cambios"}
              </button>
              {sinGuardar && !esNuevo && (
                <button type="button" onClick={descartar} disabled={pendiente} className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
                  <CerrarIcon className="h-4 w-4" />
                  Cancelar
                </button>
              )}
            </>
          )}
          {!esNuevo && (
            <>
              <BotonAccion icono={InventarioIcon} aria-pressed={verExistencia} onClick={() => setVerExistencia((v) => !v)}>
                Historial de existencia
              </BotonAccion>
              {puedeEscribir && (
                <>
                  <BotonAccion icono={VistasIcon} disabled={pendiente} onClick={() => id && accion(async () => duplicarProductoDropi(id).then((r) => ("error" in r ? r : {})), "Producto duplicado")}>
                    Duplicar
                  </BotonAccion>
                  <BotonAccion
                    icono={HistorialIcon}
                    tono="alerta"
                    disabled={pendiente}
                    onClick={() => {
                      if (!id) return;
                      if (!archivado && !confirm("¿Archivar este producto? Sale de «Activos» y pasa a «Archivados»; no se borra nada.")) return;
                      accion(() => archivarProductoDropi(id, !archivado), archivado ? "Producto restaurado" : "Producto archivado");
                    }}
                  >
                    {archivado ? "Restaurar" : "Archivar"}
                  </BotonAccion>
                  <BotonAccion
                    icono={PapeleraIcon}
                    tono="peligro"
                    disabled={pendiente}
                    onClick={() => {
                      if (!id || !confirm(`¿Eliminar «${d.nombre || "este producto"}»? No se puede deshacer.`)) return;
                      accion(() => eliminarProductoDropi(id), "Producto eliminado", true);
                    }}
                  >
                    Eliminar
                  </BotonAccion>
                </>
              )}
            </>
          )}
        </div>
        {errores.length > 0 && (
          <ul role="alert" className="flex list-disc flex-col gap-0.5 pl-4 text-sm text-destructive">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      <fieldset disabled={!puedeEscribir} className="m-0 min-w-0 border-0 p-0">
        <div className="flex flex-col divide-y divide-border px-4 [&>section]:py-5">
          <SeccionGeneral d={d} set={set} intento={intento} />
          <SeccionStock d={d} set={set} intento={intento} bodegas={bodegas} paisId={paisId} alAgregarBodega={alAgregarBodega} puedeEscribir={puedeEscribir} />
          <SeccionImagenes d={d} set={set} intento={intento} archivos={archivos} avisar={(m) => setErrores([m])} />
          <SeccionVideos d={d} set={set} intento={intento} archivos={archivos} existe={!esNuevo} />
          <SeccionRecursos d={d} set={set} intento={intento} existe={!esNuevo} />
          <SeccionPrivados d={d} set={set} intento={intento} />
          <SeccionGarantias d={d} set={set} intento={intento} />
        </div>
      </fieldset>

      {id && verExistencia && (
        <HistorialGenerico id={id} codigoPais={codigoPais} version={versionHistorial} titulo="Historial de existencia" obtener={obtenerHistorialExistenciaDropi} />
      )}
      {id && <HistorialGenerico id={id} codigoPais={codigoPais} version={versionHistorial} titulo="Historial" obtener={obtenerHistorialProductoDropi} />}
    </div>
    </Ventana>
  );
}
