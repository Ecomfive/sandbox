"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { claseCifra } from "@/components/af4/estilos-af4";
import { fechaCorta, hoyPanama } from "@/lib/af4/fecha";
import { dinero, entero, SIN_DATO } from "@/lib/af4/formato";
import { CalendarioIcon, CerrarIcon, CheckIcon, EstadoIcon, GastoIcon, InventarioIcon } from "@/lib/nav-icons";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { TIPOS_BIEN } from "@/lib/finanzas/bienes-uso";
import { actualizarBien, cambiarBaja, obtenerHistorialBien } from "./actions";
import type { FilaBien } from "./def-bienes";

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

interface Formulario {
  descripcion: string;
  tipo: string;
  unidad_id: string;
  fecha_alta: string;
  importe: string;
  meses_vida: string;
  valor_residual: string;
  notas: string;
}

const desde = (b: FilaBien): Formulario => ({
  descripcion: b.descripcion,
  tipo: b.tipo,
  unidad_id: b.unidadId ?? "",
  fecha_alta: b.fechaAlta,
  importe: String(b.importe),
  meses_vida: String(b.mesesVida),
  valor_residual: String(b.valorResidual),
  notas: b.notas,
});

const TONO: Record<FilaBien["estado"], "success" | "neutral" | "destructive"> = { "En uso": "success", Depreciado: "neutral", "De baja": "destructive" };

/**
 * Ficha de un bien de uso. **La ficha ya es el formulario**: se cambia un dato y arriba aparecen «Guardar cambios» y
 * «Cancelar» (queda corregido a mano: reimportar el Excel ya no lo pisa). «Dar de baja» despliega la fecha y el motivo en
 * la misma ficha; un bien dado de baja trae «Anular baja». Un bien no se borra. La actividad va al final.
 */
export function FichaBien({ bien, tiendas, puedeEscribir, alCerrar }: { bien: FilaBien | undefined; tiendas: Opcion[]; puedeEscribir: boolean; alCerrar: () => void }) {
  if (!bien) return null;
  return <Contenido key={`${bien.id}-${JSON.stringify(desde(bien))}-${bien.fechaBaja}`} b={bien} tiendas={tiendas} puedeEscribir={puedeEscribir} alCerrar={alCerrar} />;
}

function Contenido({ b, tiendas, puedeEscribir, alCerrar }: { b: FilaBien; tiendas: Opcion[]; puedeEscribir: boolean; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const [d, setD] = useState<Formulario>(desde(b));
  const [baja, setBaja] = useState<{ fecha: string; motivo: string } | null>(null);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const sinGuardar = JSON.stringify(d) !== JSON.stringify(desde(b));
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
    formData.set("id", b.id);
    for (const [k, v] of Object.entries(d)) formData.set(k, v);
    empezar(async () => {
      const r = await actualizarBien(formData).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Cambios guardados");
        setVersion((v) => v + 1);
      }
    });
  }

  function aplicarBaja(fecha: string | null, motivo = "") {
    setError(null);
    empezar(async () => {
      const r = await cambiarBaja(b.id, fecha, motivo).catch(() => ({ error: "No se pudo cambiar la baja." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast(fecha ? "Bien dado de baja" : "Baja anulada");
        setBaja(null);
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
          <span className="text-lg font-semibold">Bien de uso</span>
          <Badge tone={TONO[b.estado]}>{b.estado}</Badge>
          {b.editado && <Badge tone="info">Corregido a mano</Badge>}
        </>
      }
    >
      <form onSubmit={guardar} aria-busy={pendiente} className="flex flex-1 flex-col">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 pt-5 text-sm sm:grid-cols-4">
          <Dato titulo="Cuota mensual" valor={usd(b.cuota)} />
          <Dato titulo="Dep. acumulada" valor={usd(b.acumulada)} />
          <Dato titulo="Valor neto" valor={usd(b.neto)} />
          <Dato titulo="Meses restantes" valor={b.estado === "En uso" ? entero(b.mesesRestantes) : SIN_DATO} />
        </dl>

        {puedeEscribir && (
          <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] mt-4 flex flex-col gap-3 border-y border-border bg-card px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {sinGuardar ? (
                <>
                  <button type="submit" disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50">
                    <CheckIcon className="h-4 w-4" />
                    {pendiente ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button type="button" onClick={() => setD(desde(b))} disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                    <CerrarIcon className="h-4 w-4" />
                    Cancelar
                  </button>
                </>
              ) : b.fechaBaja ? (
                <BotonAccion icono={EstadoIcon} tono="exito" disabled={pendiente} onClick={() => aplicarBaja(null)}>
                  Anular baja
                </BotonAccion>
              ) : (
                <BotonAccion icono={EstadoIcon} tono="alerta" disabled={pendiente || !!baja} onClick={() => setBaja({ fecha: hoyPanama(), motivo: "" })}>
                  Dar de baja
                </BotonAccion>
              )}
            </div>
            {baja && !sinGuardar && (
              <div role="group" aria-label="Dar de baja" className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className={labelClassSm}>Fecha de baja</span>
                  <input type="date" data-enfocar value={baja.fecha} min={b.fechaAlta} onChange={(e) => setBaja({ ...baja, fecha: e.target.value })} className={fieldClass} />
                </label>
                <label className="flex min-w-48 flex-1 flex-col gap-1">
                  <span className={labelClassSm}>Motivo</span>
                  <input value={baja.motivo} maxLength={300} onChange={(e) => setBaja({ ...baja, motivo: e.target.value })} placeholder="Ej: Vendida, robada, dañada" className={`${fieldClass} w-full`} />
                </label>
                <button
                  type="button"
                  onClick={() => aplicarBaja(baja.fecha, baja.motivo)}
                  disabled={pendiente || !baja.fecha}
                  className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-background hover:bg-destructive/85 disabled:opacity-50"
                >
                  {pendiente ? "Guardando..." : "Confirmar baja"}
                </button>
                <button type="button" onClick={() => setBaja(null)} disabled={pendiente} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                  Cancelar
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <fieldset disabled={!puedeEscribir} className="m-0 flex min-w-0 flex-col divide-y divide-border border-0 p-5">
          <Seccion icono={InventarioIcon} titulo="Bien">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Descripción</span>
              <textarea value={d.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} required rows={2} maxLength={300} className={`${fieldClass} w-full resize-y`} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Tipo de bien</span>
                <select value={d.tipo} onChange={(e) => cambiar({ tipo: e.target.value })} className={`${fieldClass} w-full`}>
                  {TIPOS_BIEN.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Tienda</span>
                <select value={d.unidad_id} onChange={(e) => cambiar({ unidad_id: e.target.value })} className={`${fieldClass} w-full`}>
                  <option value="">A DISTRIBUIR</option>
                  {tiendas
                    .filter((t) => t.nombre !== "A DISTRIBUIR")
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Alta y depreciación">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Fecha de alta</span>
                <input type="date" required value={d.fecha_alta} onChange={(e) => cambiar({ fecha_alta: e.target.value })} className={`${fieldClass} w-full`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Importe (USD)</span>
                <input type="number" inputMode="decimal" step="any" min="0.01" required value={d.importe} onChange={(e) => cambiar({ importe: e.target.value })} className={`${fieldClass} w-full tabular-nums`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Vida útil (meses)</span>
                <input type="number" inputMode="numeric" step="1" min="1" max="600" required value={d.meses_vida} onChange={(e) => cambiar({ meses_vida: e.target.value })} className={`${fieldClass} w-full tabular-nums`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Valor residual (USD)</span>
                <input type="number" inputMode="decimal" step="any" min="0" value={d.valor_residual} onChange={(e) => cambiar({ valor_residual: e.target.value })} className={`${fieldClass} w-full tabular-nums`} />
              </label>
            </div>
          </Seccion>
          {(b.fechaBaja || b.notas) && (
            <Seccion icono={GastoIcon} titulo="Notas">
              {b.fechaBaja && (
                <p className="text-sm">
                  Baja el {fechaCorta(b.fechaBaja)}
                  {b.motivoBaja ? `: ${b.motivoBaja}` : ""}
                </p>
              )}
              {b.notas && <p className="text-sm text-muted-foreground">{b.notas}</p>}
            </Seccion>
          )}
        </fieldset>

        <HistorialGenerico id={b.id} codigoPais="PA" version={version} obtener={obtenerHistorialBien} />
      </form>
    </Ventana>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className={`font-semibold ${claseCifra}`}>{valor}</dd>
    </div>
  );
}
