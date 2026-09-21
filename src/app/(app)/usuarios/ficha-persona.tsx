"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  actualizarDatosUsuario,
  cambiarActivoUsuario,
  cambiarRolUsuario,
  eliminarUsuario,
  generarContrasenaTemporal,
  recordarFoto,
  subirFotoDeUsuario,
} from "./actions";
import { AvatarPersona } from "./avatar-persona";
import { faltantesDePersona, type FilaUsuario, type Rol } from "./def-usuarios";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { CheckIcon } from "@/lib/nav-icons";
import { formatearFecha, formatearTiempoRelativo } from "@/lib/formato";

function FilaAlta({ etiqueta, completo, children }: { etiqueta: string; completo: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
      <span className="flex items-center gap-2 text-sm">
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            completo ? "bg-success text-white" : "border border-border"
          }`}
        >
          {completo && <CheckIcon className="h-3 w-3" />}
        </span>
        {etiqueta}
      </span>
      {children}
    </div>
  );
}

/**
 * Ficha de una persona: el panel a la derecha que se abre al pulsar su fila. El checklist de "Alta" (cuenta,
 * primer ingreso, foto, rol), sus datos, su rol, cómo entra (contraseña temporal) y si puede seguir entrando
 * (suspender/eliminar). Mismo patrón que las demás fichas: sin botón "Modificar" aparte, los campos de "Datos"
 * se guardan con su propio botón chico.
 */
export function FichaPersona({
  persona,
  roles,
  puedeEditarse,
  alCerrar,
}: {
  persona: FilaUsuario | undefined;
  roles: Rol[];
  /** Falso para la propia cuenta de quien mira: no se puede suspender ni eliminar a una misma. */
  puedeEditarse: boolean;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [contrasenaNueva, setContrasenaNueva] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function alEnviarDatos(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!persona) return;
    const formData = new FormData(e.currentTarget);
    formData.set("id", persona.id);
    setError(null);
    startTransition(async () => {
      const resultado = await actualizarDatosUsuario(formData);
      if (resultado?.error) setError(resultado.error);
      else mostrarToast("Cambios guardados");
    });
  }

  function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo || !persona) return;
    const formData = new FormData();
    formData.set("id", persona.id);
    formData.set("foto", archivo);
    startTransition(async () => {
      const resultado = await subirFotoDeUsuario(formData);
      if (resultado?.error) mostrarToast(resultado.error, "destructive");
      else mostrarToast("Foto actualizada");
    });
  }

  function alRecordarFoto() {
    if (!persona) return;
    const formData = new FormData();
    formData.set("id", persona.id);
    startTransition(async () => {
      try {
        await recordarFoto(formData);
        mostrarToast("Anotado. Recuérdaselo por fuera de la app (correo, chat, etc.).");
      } catch (err) {
        mostrarToast(err instanceof Error ? err.message : "No se pudo anotar.", "destructive");
      }
    });
  }

  function alCambiarRol(rolId: string) {
    if (!persona) return;
    const formData = new FormData();
    formData.set("id", persona.id);
    formData.set("rol_id", rolId);
    startTransition(async () => {
      try {
        await cambiarRolUsuario(formData);
      } catch (err) {
        mostrarToast(err instanceof Error ? err.message : "No se pudo cambiar el rol.", "destructive");
      }
    });
  }

  function alGenerarContrasena() {
    if (!persona) return;
    const formData = new FormData();
    formData.set("id", persona.id);
    startTransition(async () => {
      const resultado = await generarContrasenaTemporal(formData);
      if (resultado?.error) mostrarToast(resultado.error, "destructive");
      else setContrasenaNueva(resultado.contrasena ?? null);
    });
  }

  function alSuspender() {
    if (!persona) return;
    const formData = new FormData();
    formData.set("id", persona.id);
    formData.set("activo", String(!persona.activo));
    startTransition(async () => {
      try {
        await cambiarActivoUsuario(formData);
      } catch (err) {
        mostrarToast(err instanceof Error ? err.message : "No se pudo cambiar el estado.", "destructive");
      }
    });
  }

  function alEliminar() {
    if (!persona) return;
    if (!confirm(`¿Está seguro de que desea eliminar a ${persona.nombre ?? persona.email}? Esto no se puede deshacer.`)) return;
    const formData = new FormData();
    formData.set("id", persona.id);
    startTransition(async () => {
      const resultado = await eliminarUsuario(formData);
      if (resultado?.error) mostrarToast(resultado.error, "destructive");
      else {
        mostrarToast("Usuario eliminado");
        alCerrar();
      }
    });
  }

  const faltantes = persona ? faltantesDePersona(persona) : [];

  return (
    <Ventana
      abierto={!!persona}
      alCerrar={alCerrar}
      lado="derecha"
      titulo={persona && <span className="text-lg font-semibold">{persona.nombre ?? persona.email}</span>}
    >
      {persona && (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-3 p-5">
            <AvatarPersona nombre={persona.nombre} email={persona.email} avatarUrl={persona.avatarUrl} tamano="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">{persona.email}</p>
              <p className="text-sm text-muted-foreground">
                {persona.ultimoIngresoEn
                  ? `Último ingreso ${formatearTiempoRelativo(persona.ultimoIngresoEn)}`
                  : "Nunca entró"}
              </p>
              <p className="text-xs text-muted-foreground">Creada el {formatearFecha(persona.creadoEn.slice(0, 10))}</p>
            </div>
          </div>

          <div className="flex flex-col divide-y divide-border border-t border-border">
            <section className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Alta</h3>
              <div className="rounded-lg border border-border">
                <FilaAlta etiqueta="Cuenta creada" completo />
                <FilaAlta etiqueta="Primer ingreso" completo={!!persona.primerIngresoEn} />
                <FilaAlta etiqueta="Foto" completo={!!persona.avatarUrl}>
                  {!persona.avatarUrl && (
                    <span className="text-right">
                      <button type="button" onClick={alRecordarFoto} disabled={pending} className="text-xs font-medium text-accent-foreground underline disabled:opacity-50">
                        Recordar otra vez
                      </button>
                      {persona.fotoRecordadaEn && (
                        <span className="block text-[11px] text-muted-foreground">
                          Recordado {formatearTiempoRelativo(persona.fotoRecordadaEn)}
                        </span>
                      )}
                    </span>
                  )}
                </FilaAlta>
                <FilaAlta etiqueta="Rol de trabajo" completo={!!persona.rolId} />
              </div>
              {!persona.avatarUrl && (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={pending}
                    className="mt-2 text-sm font-medium text-accent-foreground underline disabled:opacity-50"
                  >
                    Poner su foto yo mismo
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={alElegirFoto} />
                </>
              )}
            </section>

            <section className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Datos</h3>
              <form onSubmit={alEnviarDatos} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className={labelClassSm}>Nombre</span>
                  <input type="text" name="nombre" required defaultValue={persona.nombre ?? ""} className={fieldClass} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClassSm}>Correo con el que entra</span>
                  <input type="email" name="email" required defaultValue={persona.email} className={fieldClass} />
                </label>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <button
                  type="submit"
                  disabled={pending}
                  className={`self-start rounded-md bg-[#202020] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2d2d2d] disabled:opacity-50 ${anilloFoco}`}
                >
                  {pending ? "Guardando..." : "Guardar"}
                </button>
              </form>
            </section>

            <section className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Rol y permisos</h3>
              <select
                aria-label={`Rol de ${persona.nombre ?? persona.email}`}
                defaultValue={persona.rolId ?? ""}
                disabled={pending}
                onChange={(e) => alCambiarRol(e.target.value)}
                className={`${fieldClass} disabled:opacity-50`}
              >
                <option value="">Sin rol</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
              {persona.rolNombre && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {roles.find((r) => r.id === persona.rolId)?.descripcion ?? "Sin descripción."}
                </p>
              )}
            </section>

            <section className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Acceso</h3>
              <button
                type="button"
                onClick={alGenerarContrasena}
                disabled={pending}
                className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
              >
                Generar contraseña temporal nueva
              </button>
              {contrasenaNueva && (
                <div className="mt-3 flex flex-col gap-1 rounded-md border border-border bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Pásasela a mano — no se vuelve a mostrar:</p>
                  <p className="font-mono text-sm font-semibold select-all">{contrasenaNueva}</p>
                </div>
              )}
            </section>

            <section className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Su acceso</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                {persona.activo ? "Entra y trabaja con normalidad." : "Está suspendida: no puede entrar."}
              </p>
              <div className="flex flex-wrap gap-2">
                {puedeEditarse && (
                  <>
                    <button
                      type="button"
                      onClick={alSuspender}
                      disabled={pending}
                      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
                    >
                      {persona.activo ? "Suspender" : "Reactivar"}
                    </button>
                    <button
                      type="button"
                      onClick={alEliminar}
                      disabled={pending}
                      className={`inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive-soft disabled:opacity-50 ${anilloFoco}`}
                    >
                      Eliminar
                    </button>
                  </>
                )}
                <Link
                  href="/usuarios/auditoria"
                  className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}
                >
                  Ver lo que hizo
                </Link>
              </div>
              {faltantes.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Falta: {faltantes.join(", ")}
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </Ventana>
  );
}

/** La insignia de "Listo" o "Falta: ..." de la fila de Personas — se usa acá y en la lista. */
export function EstadoDeAlta({ persona }: { persona: FilaUsuario }) {
  const faltantes = faltantesDePersona(persona);
  if (faltantes.length === 0) return <Badge tone="success">Listo</Badge>;
  return <span className="text-xs text-warning">Falta: {faltantes.join(", ")}</span>;
}
