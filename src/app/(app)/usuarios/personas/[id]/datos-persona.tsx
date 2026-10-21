"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { SeccionTarjeta } from "@/components/permisos/seccion-tarjeta";
import { formatearTiempoRelativo } from "@/lib/formato";
import { CheckIcon, PersonaIcon } from "@/lib/nav-icons";
import { actualizarDatosUsuario, recordarFoto, subirFotoDeUsuario } from "../../actions";

function FilaAlta({ etiqueta, completo, children }: { etiqueta: string; completo: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
      <span className="flex items-center gap-2 text-sm">
        <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${completo ? "bg-success text-white" : "border border-border-control"}`}>
          {completo && <CheckIcon className="h-3 w-3" />}
        </span>
        {etiqueta}
        <span className="sr-only">{completo ? ": listo" : ": falta"}</span>
      </span>
      {children}
    </div>
  );
}

export interface PersonaDatos {
  id: string;
  email: string;
  nombre: string | null;
  avatarUrl: string | null;
  rolId: string | null;
  primerIngresoEn: string | null;
  ultimoIngresoEn: string | null;
  fotoRecordadaEn: string | null;
}

/** «Alta» y «Datos» de una persona: qué le falta para empezar (cuenta, primer ingreso, foto, rol), su foto, su nombre y el correo con el que entra. */
export function DatosPersona({ persona, puedeEscribir }: { persona: PersonaDatos; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("id", persona.id);
    setError(null);
    empezar(async () => {
      const r = await actualizarDatosUsuario(formData);
      if (r?.error) setError(r.error);
      else {
        mostrarToast("Cambios guardados");
        router.refresh();
      }
    });
  }

  function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    const formData = new FormData();
    formData.set("id", persona.id);
    formData.set("foto", archivo);
    empezar(async () => {
      const r = await subirFotoDeUsuario(formData);
      if (r?.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("Foto actualizada");
        router.refresh();
      }
    });
  }

  function recordar() {
    const formData = new FormData();
    formData.set("id", persona.id);
    empezar(async () => {
      try {
        await recordarFoto(formData);
        mostrarToast("Anotado. Recuérdaselo por fuera de la app (correo, chat, etc.).");
        router.refresh();
      } catch (e) {
        mostrarToast(e instanceof Error ? e.message : "No se pudo anotar.", "destructive");
      }
    });
  }

  return (
    <SeccionTarjeta id="h-datos" icono={PersonaIcon} titulo="Alta y datos">
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-border">
          <FilaAlta etiqueta="Cuenta creada" completo />
          <FilaAlta etiqueta="Primer ingreso" completo={!!(persona.primerIngresoEn || persona.ultimoIngresoEn)} />
          <FilaAlta etiqueta="Foto" completo={!!persona.avatarUrl}>
            {!persona.avatarUrl && puedeEscribir && (
              <span className="text-right">
                <button type="button" onClick={recordar} disabled={pendiente} className="text-xs font-medium text-accent-foreground underline disabled:opacity-50">
                  Recordar otra vez
                </button>
                {persona.fotoRecordadaEn && <span className="block text-[11px] text-muted-foreground">Recordado {formatearTiempoRelativo(persona.fotoRecordadaEn)}</span>}
              </span>
            )}
          </FilaAlta>
          <FilaAlta etiqueta="Rol de trabajo" completo={!!persona.rolId} />
        </div>
        {!persona.avatarUrl && puedeEscribir && (
          <div>
            <button type="button" onClick={() => archivoRef.current?.click()} disabled={pendiente} className="text-sm font-medium text-accent-foreground underline disabled:opacity-50">
              Poner su foto yo mismo
            </button>
            <input ref={archivoRef} type="file" accept="image/*" aria-label="Foto de la persona" className="hidden" onChange={elegirFoto} />
          </div>
        )}

        <form onSubmit={guardar} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Nombre</span>
            <input type="text" name="nombre" required defaultValue={persona.nombre ?? ""} disabled={!puedeEscribir} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Correo con el que entra</span>
            <input type="email" name="email" required defaultValue={persona.email} disabled={!puedeEscribir} className={fieldClass} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {puedeEscribir && (
            <button type="submit" disabled={pendiente} className={`boton-neon self-start rounded-[10px] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${anilloFoco}`}>
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
          )}
        </form>
      </div>
    </SeccionTarjeta>
  );
}
