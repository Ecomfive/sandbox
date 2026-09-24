"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { CerrarIcon, CheckIcon, EstadoIcon, InventarioIcon } from "@/lib/nav-icons";
import { actualizarUbicacion, cambiarEstadoUbicacion, obtenerHistorialUbicacion } from "./actions";
import { ETIQUETA_PROPIEDAD, ETIQUETA_TAMANO, PROPIEDADES, TAMANOS, TONO_PROPIEDAD, type FilaUbicacion, type Propiedad } from "./def-ubicaciones";

interface Formulario {
  codigo: string;
  propiedad: string;
  tamano: string;
  codigo_barras: string;
  notas: string;
}

const desde = (u: FilaUbicacion): Formulario => ({ codigo: u.codigo, propiedad: u.propiedad, tamano: u.tamano, codigo_barras: u.codigoBarras, notas: u.notas });

/**
 * Ficha de una ubicación: el panel a la derecha que se abre al pulsar su fila. **La ficha ya es el formulario** (como la
 * de una bodega): se cambia un dato y arriba aparecen «Guardar cambios» y «Cancelar»; junto a ellos, Desactivar o Activar
 * (una ubicación no se borra). La bodega se ve pero no se cambia. Con cambios sin guardar, cerrar pide confirmación.
 */
export function FichaUbicacion({ ubicacion, codigoPais, puedeEscribir, alCerrar }: { ubicacion: FilaUbicacion | undefined; codigoPais: string; puedeEscribir: boolean; alCerrar: () => void }) {
  if (!ubicacion) return null;
  // Con otra `key` el formulario arranca con los datos de la ubicación (al abrir otra o tras guardar).
  const clave = [ubicacion.id, ubicacion.codigo, ubicacion.propiedad, ubicacion.tamano, ubicacion.codigoBarras, ubicacion.notas, ubicacion.activa].join("|");
  return <ContenidoFicha key={clave} ubicacion={ubicacion} codigoPais={codigoPais} puedeEscribir={puedeEscribir} alCerrar={alCerrar} />;
}

function ContenidoFicha({ ubicacion, codigoPais, puedeEscribir, alCerrar }: { ubicacion: FilaUbicacion; codigoPais: string; puedeEscribir: boolean; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const [d, setD] = useState<Formulario>(desde(ubicacion));
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const sinGuardar = JSON.stringify(d) !== JSON.stringify(desde(ubicacion));
  const cambiar = (c: Partial<Formulario>) => setD((a) => ({ ...a, ...c }));

  function cerrar() {
    if (pendiente) return;
    if (sinGuardar && !confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    alCerrar();
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("id", ubicacion.id);
    for (const [k, v] of Object.entries(d)) formData.set(k, v);
    empezar(async () => {
      const r = await actualizarUbicacion(formData).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Cambios guardados");
        setVersion((v) => v + 1);
      }
    });
  }

  function alternarActiva() {
    setError(null);
    empezar(async () => {
      const r = await cambiarEstadoUbicacion(ubicacion.id, !ubicacion.activa).catch(() => ({ error: "No se pudo cambiar el estado." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast(ubicacion.activa ? "Ubicación desactivada" : "Ubicación activada");
        setVersion((v) => v + 1);
      }
    });
  }

  return (
    <Ventana
      abierto
      alCerrar={cerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        <>
          <span className="text-lg font-semibold">{ubicacion.codigo}</span>
          <Badge tone={TONO_PROPIEDAD[ubicacion.propiedad as Propiedad] ?? "neutral"}>{ETIQUETA_PROPIEDAD[ubicacion.propiedad as Propiedad] ?? ubicacion.propiedad}</Badge>
          <Badge tone={ubicacion.activa ? "success" : "warning"}>{ubicacion.activa ? "Activa" : "Inactiva"}</Badge>
        </>
      }
    >
      <form onSubmit={guardar} aria-busy={pendiente} className="flex flex-1 flex-col">
        <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-y border-border bg-card px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {puedeEscribir && sinGuardar && (
              <>
                <button type="submit" disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50">
                  <CheckIcon className="h-4 w-4" />
                  {pendiente ? "Guardando..." : "Guardar cambios"}
                </button>
                <button type="button" onClick={() => setD(desde(ubicacion))} disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                  <CerrarIcon className="h-4 w-4" />
                  Cancelar
                </button>
              </>
            )}
            {puedeEscribir && (
              <BotonAccion icono={EstadoIcon} tono={ubicacion.activa ? "alerta" : "exito"} disabled={pendiente} onClick={alternarActiva}>
                {ubicacion.activa ? "Desactivar" : "Activar"}
              </BotonAccion>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <fieldset disabled={!puedeEscribir} className="m-0 min-w-0 border-0 p-5">
          <Seccion icono={InventarioIcon} titulo="Ubicación">
            <div className="flex flex-col gap-0.5">
              <span className={labelClassSm}>Bodega</span>
              <span className="text-sm">{ubicacion.bodega}</span>
            </div>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>
                Código<span aria-hidden="true" className="text-destructive"> *</span>
              </span>
              <input type="text" value={d.codigo} onChange={(e) => cambiar({ codigo: e.target.value })} required maxLength={60} className={`${fieldClass} w-full`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Propiedad</span>
              <select value={d.propiedad} onChange={(e) => cambiar({ propiedad: e.target.value })} className={`${fieldClass} w-full`}>
                {PROPIEDADES.map((p) => (
                  <option key={p} value={p}>
                    {ETIQUETA_PROPIEDAD[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Tamaño</span>
              <select value={d.tamano} onChange={(e) => cambiar({ tamano: e.target.value })} className={`${fieldClass} w-full`}>
                <option value="">Sin tamaño</option>
                {TAMANOS.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TAMANO[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Código de barras</span>
              <input type="text" value={d.codigo_barras} onChange={(e) => cambiar({ codigo_barras: e.target.value })} maxLength={100} placeholder="Ej: 7501031311309" className={`${fieldClass} w-full`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Notas</span>
              <textarea value={d.notas} onChange={(e) => cambiar({ notas: e.target.value })} rows={3} maxLength={1000} className={`${fieldClass} w-full resize-y`} />
            </label>
          </Seccion>
        </fieldset>

        <HistorialGenerico id={ubicacion.id} codigoPais={codigoPais} version={version} obtener={obtenerHistorialUbicacion} />
      </form>
    </Ventana>
  );
}
