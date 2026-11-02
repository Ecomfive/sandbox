"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import type { AreaCrm } from "@/lib/crm/areas";
import { MAX_NOMBRE_CONTACTO, MAX_NOTA_PERMISO, MEDIOS_PERMISO } from "@/lib/whatsapp/nuevo-contacto";
import { rellenar } from "@/lib/whatsapp/plantillas";
import type { NumeroVista } from "./datos-bandeja";
import { datosNuevoContacto, iniciarChatConPlantilla, type PlantillaNuevoContacto } from "./nuevo-contacto-actions";

const CATEGORIA: Record<string, string> = { marketing: "Marketing", utility: "Utilidad" };

/** El mensaje como le va a llegar, con lo que se sabe y, en lo que falta, el nombre del dato entre corchetes. */
function previa(p: PlantillaNuevoContacto, nombre: string, manuales: string[]): string {
  const primer = nombre.trim().split(/\s+/)[0] ?? "";
  let i = -1;
  const valores = p.variables.map((v) => {
    if (v.campo === "manual") {
      i += 1;
      return manuales[i]?.trim() || `[${v.etiqueta}]`;
    }
    if (v.campo === "primer_nombre") return primer || "[nombre]";
    if (v.campo === "nombre_completo") return nombre.trim() || "[nombre]";
    return `[${v.etiqueta}]`;
  });
  return [p.encabezado, rellenar(p.cuerpo, valores), p.pie].filter(Boolean).join("\n");
}

/**
 * «Nuevo contacto» (30 oct 2026, pedido de Jhokser): escribirle por primera vez a alguien con una plantilla de primer contacto. Escribirle primero a quien no lo espera es lo que más reportes
 * y bloqueos causa, así que pide confirmar que la persona aceptó (y cómo), solo ofrece plantillas aprobadas con botón para rechazar y cuenta los contactos nuevos del día.
 */
export function NuevoContacto({ numeros, areas, alCerrar, alTerminar }: { numeros: NumeroVista[]; areas: AreaCrm[]; alCerrar: () => void; alTerminar: (id: string, escribirDirecto: boolean) => void }) {
  const posibles = numeros.filter((n) => areas.includes(n.area));
  const [numeroId, setNumeroId] = useState(posibles[0]?.id ?? "");
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [medio, setMedio] = useState("");
  const [nota, setNota] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [plantillas, setPlantillas] = useState<PlantillaNuevoContacto[] | null>(null);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [elegidaId, setElegidaId] = useState<string | null>(null);
  const [manuales, setManuales] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, empezar] = useTransition();

  useEffect(() => {
    let vigente = true;
    datosNuevoContacto()
      .catch(() => ({ error: "No se pudieron cargar las plantillas." }))
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) setErrorCarga(r.error);
        else {
          setPlantillas(r.plantillas);
          setRestantes(r.restantesHoy);
          const primera = r.plantillas.find((p) => !p.motivo);
          if (primera) elegir(primera);
        }
      });
    return () => {
      vigente = false;
    };
    // Solo al abrir.
  }, []);

  const elegida = plantillas?.find((p) => p.id === elegidaId) ?? null;
  const manualesDe = elegida?.variables.filter((v) => v.campo === "manual") ?? [];
  const faltaManual = manualesDe.some((_, i) => !manuales[i]?.trim());
  const listo = !!elegida && !elegida.motivo && !!telefono.trim() && nombre.trim().length >= 2 && !!medio && confirmo && !faltaManual && restantes !== 0 && !!numeroId;

  function elegir(p: PlantillaNuevoContacto) {
    setElegidaId(p.id);
    setManuales(p.variables.filter((v) => v.campo === "manual").map(() => ""));
    setError(null);
  }

  function enviar() {
    if (!elegida || !listo) return;
    setError(null);
    empezar(async () => {
      const r = await iniciarChatConPlantilla({ numeroId, telefono, nombre, medio, nota, confirmo, plantillaId: elegida.id, manuales }).catch(() => ({ error: "No se pudo enviar. Inténtalo de nuevo." }));
      if ("error" in r) setError(r.error);
      else alTerminar(r.id, r.escribirDirecto);
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Nuevo contacto" ancho="md">
      <div className="flex flex-col gap-4 p-5">
        {posibles.length === 0 ? (
          <p className="m-0 text-sm">No tienes un número de la empresa donde puedas escribir.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {posibles.length > 1 && (
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className={labelClass}>Escribir desde</span>
                  <select value={numeroId} onChange={(e) => setNumeroId(e.target.value)} className={fieldClass}>
                    {posibles.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1">
                <span className={labelClass}>WhatsApp de la persona</span>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" autoComplete="off" placeholder="Ej: +58 412 555 0000" data-enfocar className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Nombre</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={MAX_NOMBRE_CONTACTO} autoComplete="off" placeholder="Ej: María Pérez" className={fieldClass} />
              </label>
            </div>

            <fieldset className="m-0 flex flex-col gap-2 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">Permiso de la persona</legend>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} className={`mt-0.5 h-4 w-4 flex-none ${anilloFoco}`} />
                <span>Confirmo que esta persona aceptó recibir mensajes de Ecomfive por WhatsApp.</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>¿Cómo lo aceptó?</span>
                <select value={medio} onChange={(e) => setMedio(e.target.value)} className={fieldClass}>
                  <option value="">Elige una opción</option>
                  {MEDIOS_PERMISO.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Nota (opcional)</span>
                <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={MAX_NOTA_PERMISO} placeholder="Ej: formulario de la web, 12 oct" className={fieldClass} />
              </label>
            </fieldset>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Plantilla de primer contacto</span>
              {errorCarga && (
                <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
                  {errorCarga}
                </p>
              )}
              {!errorCarga && !plantillas && (
                <p role="status" className="m-0 text-sm text-muted-foreground">
                  Cargando plantillas…
                </p>
              )}
              {plantillas && !plantillas.some((p) => !p.motivo) && (
                <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Todavía no hay una plantilla aprobada con botón para rechazar. Agrega «primer_contacto» en Plantillas y mándala a Meta.</p>
              )}
              {plantillas && plantillas.length > 0 && (
                <ul className="m-0 flex max-h-56 list-none flex-col gap-2 overflow-y-auto p-0">
                  {plantillas.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        aria-pressed={elegidaId === p.id}
                        aria-disabled={!!p.motivo || undefined}
                        onClick={() => !p.motivo && elegir(p)}
                        className={`flex w-full flex-col gap-1 rounded-lg border p-3 text-left ${elegidaId === p.id ? "border-foreground bg-muted" : "border-border bg-card"} ${p.motivo ? "cursor-not-allowed opacity-60" : "hover:bg-muted"} ${anilloFoco}`}
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{p.nombre}</span>
                          <Badge tone="neutral">{CATEGORIA[p.categoria] ?? p.categoria}</Badge>
                          {p.botones.filter(Boolean).length > 0 && <Badge tone="success">Con botón para rechazar</Badge>}
                        </span>
                        {p.motivo && <span className="text-xs text-warning">{p.motivo}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {elegida && !elegida.motivo && (
              <div className="flex flex-col gap-3">
                {manualesDe.map((v, i) => (
                  <label key={i} className="flex flex-col gap-1">
                    <span className={labelClass}>{v.etiqueta}</span>
                    {/* Los datos largos (el motivo del contacto) piden un cuadro de varias líneas. */}
                    {/motivo|mensaje|requerimiento|solicitud/i.test(v.etiqueta) ? (
                      <textarea value={manuales[i] ?? ""} onChange={(e) => setManuales((l) => l.map((x, j) => (j === i ? e.target.value : x)))} rows={3} placeholder={`Ej: ${v.ejemplo}`} className={`${fieldClass} w-full resize-y`} />
                    ) : (
                      <input value={manuales[i] ?? ""} onChange={(e) => setManuales((l) => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Ej: ${v.ejemplo}`} className={`${fieldClass} w-full`} />
                    )}
                  </label>
                ))}
                <p className="m-0 max-w-[360px] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]" aria-label="Así le llegará">
                  {previa(elegida, nombre, manuales)}
                </p>
                {elegida.botones.filter(Boolean).length > 0 && <p className="m-0 text-xs text-muted-foreground">Botones: {elegida.botones.filter(Boolean).join(" · ")}</p>}
              </div>
            )}

            {restantes !== null && <p className={`m-0 text-xs ${restantes === 0 ? "text-destructive" : "text-muted-foreground"}`}>{restantes === 0 ? "Ya llegaste al máximo de contactos nuevos de hoy." : `Te quedan ${restantes} contactos nuevos hoy.`}</p>}
            {error && (
              <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={alCerrar} disabled={enviando} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
            Cancelar
          </button>
          {posibles.length > 0 && (
            <button type="button" onClick={enviar} aria-disabled={!listo || enviando || undefined} className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 ${!listo || enviando ? "cursor-not-allowed opacity-50" : ""} ${anilloFoco}`}>
              {enviando ? "Enviando…" : "Enviar primer contacto"}
            </button>
          )}
        </div>
      </div>
    </Ventana>
  );
}
