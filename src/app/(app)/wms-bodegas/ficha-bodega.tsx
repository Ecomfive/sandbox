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
import { actualizarBodega, cambiarEstadoBodega, obtenerHistorialBodega } from "./actions";
import { ETIQUETA_TIPO_BODEGA, TIPOS_BODEGA, type FilaBodega, type TipoBodega } from "./def-bodegas";

interface Formulario {
  nombre: string;
  tipo: string;
  direccion: string;
  contacto: string;
  notas: string;
}

const desde = (b: FilaBodega): Formulario => ({ nombre: b.nombre, tipo: b.tipo, direccion: b.direccion, contacto: b.contacto, notas: b.notas });

/**
 * Ficha de una bodega: el panel a la derecha que se abre al pulsar su fila. **La ficha ya es el formulario** (como la de
 * una cuenta destino): se cambia un dato y arriba aparecen «Guardar cambios» y «Cancelar»; junto a ellos, el botón para
 * desactivar o reactivar la bodega (no se borra: el stock y los movimientos dependen de ella). Con cambios sin guardar,
 * cerrar pide confirmación. Sin permiso de escritura solo se lee. La actividad va al final.
 */
export function FichaBodega({ bodega, codigoPais, puedeEscribir, alCerrar }: { bodega: FilaBodega | undefined; codigoPais: string; puedeEscribir: boolean; alCerrar: () => void }) {
  if (!bodega) return null;
  // Con otra `key` el formulario arranca con los datos de la bodega (al abrir otra o tras guardar).
  return <ContenidoFicha key={`${bodega.id}-${bodega.nombre}-${bodega.tipo}-${bodega.direccion}-${bodega.contacto}-${bodega.notas}-${bodega.activa}`} bodega={bodega} codigoPais={codigoPais} puedeEscribir={puedeEscribir} alCerrar={alCerrar} />;
}

function ContenidoFicha({ bodega, codigoPais, puedeEscribir, alCerrar }: { bodega: FilaBodega; codigoPais: string; puedeEscribir: boolean; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const [d, setD] = useState<Formulario>(desde(bodega));
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const sinGuardar = JSON.stringify(d) !== JSON.stringify(desde(bodega));
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
    formData.set("id", bodega.id);
    for (const [k, v] of Object.entries(d)) formData.set(k, v);
    empezar(async () => {
      const r = await actualizarBodega(formData).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
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
      const r = await cambiarEstadoBodega(bodega.id, !bodega.activa).catch(() => ({ error: "No se pudo cambiar el estado." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast(bodega.activa ? "Bodega desactivada" : "Bodega activada");
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
          <span className="text-lg font-semibold">{bodega.nombre}</span>
          <Badge tone="neutral">{ETIQUETA_TIPO_BODEGA[bodega.tipo as TipoBodega] ?? bodega.tipo}</Badge>
          <Badge tone={bodega.activa ? "success" : "warning"}>{bodega.activa ? "Activa" : "Inactiva"}</Badge>
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
                <button type="button" onClick={() => setD(desde(bodega))} disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                  <CerrarIcon className="h-4 w-4" />
                  Cancelar
                </button>
              </>
            )}
            {puedeEscribir && (
              <BotonAccion icono={EstadoIcon} tono={bodega.activa ? "alerta" : "exito"} disabled={pendiente} onClick={alternarActiva}>
                {bodega.activa ? "Desactivar" : "Activar"}
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
          <Seccion icono={InventarioIcon} titulo="Bodega">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>
                Nombre<span aria-hidden="true" className="text-destructive"> *</span>
              </span>
              <input type="text" value={d.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} required maxLength={120} className={`${fieldClass} w-full`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Tipo</span>
              <select value={d.tipo} onChange={(e) => cambiar({ tipo: e.target.value })} className={`${fieldClass} w-full`}>
                {TIPOS_BODEGA.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_BODEGA[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Dirección</span>
              <input type="text" value={d.direccion} onChange={(e) => cambiar({ direccion: e.target.value })} maxLength={300} placeholder="Ej: Ave Centenario, Costa del Este" className={`${fieldClass} w-full`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Contacto</span>
              <input type="text" value={d.contacto} onChange={(e) => cambiar({ contacto: e.target.value })} maxLength={200} placeholder="Ej: Ana Pérez · 6000-0000" className={`${fieldClass} w-full`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Notas</span>
              <textarea value={d.notas} onChange={(e) => cambiar({ notas: e.target.value })} rows={3} maxLength={1000} className={`${fieldClass} w-full resize-y`} />
            </label>
          </Seccion>
        </fieldset>

        <HistorialGenerico id={bodega.id} codigoPais={codigoPais} version={version} obtener={obtenerHistorialBodega} />
      </form>
    </Ventana>
  );
}
