"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AvatarPersona } from "@/components/ui/avatar-persona";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Chip } from "@/components/permisos/piezas-permisos";
import { AfinarIcon, OjoIcon } from "@/lib/nav-icons";
import { colorDeRol } from "@/lib/permisos/color-rol";
import { iniciarVistaPreviaPersona } from "@/lib/vista-previa-actions";
import { cambiarActivoUsuario, eliminarUsuario, generarContrasenaTemporal, restablecerSegundoPaso } from "../../actions";
import { faltantesDePersona } from "../../def-usuarios";
import { EstadoPresencia } from "../../estado-presencia";

export interface PersonaCabecera {
  id: string;
  email: string;
  nombre: string | null;
  avatarUrl: string | null;
  activo: boolean;
  rolId: string | null;
  rolNombre: string | null;
  rolColor: string | null;
  creadoEn: string;
  primerIngresoEn: string | null;
  ultimoIngresoEn: string | null;
  ultimaActividadEn: string | null;
  fotoRecordadaEn: string | null;
  /** Si ya activó su app autenticadora (verificación en dos pasos). */
  conSegundoPaso: boolean;
}

/** La cabecera de la ficha de una persona: quién es, su rol y qué le falta, y lo que se hace con su cuenta (ver así, contraseña, suspender, eliminar). */
export function CabeceraPersona({ persona, propios, esYo, puedeEscribir }: { persona: PersonaCabecera; propios: number; esYo: boolean; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [contrasena, setContrasena] = useState<string | null>(null);
  const faltan = faltantesDePersona({ primerIngresoEn: persona.primerIngresoEn, ultimoIngresoEn: persona.ultimoIngresoEn, avatarUrl: persona.avatarUrl, rolId: persona.rolId });
  const color = colorDeRol(persona.rolColor, persona.rolNombre ?? "");
  const nombre = persona.nombre ?? persona.email;

  const boton = `inline-flex h-9 items-center gap-2 rounded-[10px] border border-border-control bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

  function verAsi() {
    empezar(async () => {
      try {
        await iniciarVistaPreviaPersona(persona.id);
      } catch (e) {
        mostrarToast(e instanceof Error ? e.message : "No se pudo iniciar la vista previa.", "destructive");
      }
    });
  }

  function generar() {
    const formData = new FormData();
    formData.set("id", persona.id);
    empezar(async () => {
      const r = await generarContrasenaTemporal(formData).catch(() => ({ error: "Inténtalo de nuevo." }) as { error: string; contrasena?: undefined });
      if (r.error) mostrarToast(r.error, "destructive");
      else setContrasena(r.contrasena ?? null);
    });
  }

  function restablecer() {
    if (!confirm(`¿Restablecer la verificación en dos pasos de ${nombre}? Pierde su app autenticadora y tendrá que activar una nueva al entrar.`)) return;
    empezar(async () => {
      const r = await restablecerSegundoPaso(persona.id).catch(() => ({ error: "Inténtalo de nuevo." }) as { error: string });
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("Verificación restablecida: activará una app nueva en su próximo ingreso");
        router.refresh();
      }
    });
  }

  function suspender() {
    const formData = new FormData();
    formData.set("id", persona.id);
    formData.set("activo", String(!persona.activo));
    empezar(async () => {
      try {
        await cambiarActivoUsuario(formData);
        router.refresh();
      } catch (e) {
        mostrarToast(e instanceof Error ? e.message : "No se pudo cambiar el estado.", "destructive");
      }
    });
  }

  function eliminar() {
    if (!confirm(`¿Está seguro de que desea eliminar a ${nombre}? Esto no se puede deshacer.`)) return;
    const formData = new FormData();
    formData.set("id", persona.id);
    empezar(async () => {
      const r = await eliminarUsuario(formData).catch(() => ({ error: "Inténtalo de nuevo." }));
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("Usuario eliminado");
        router.push("/usuarios");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[14px] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-[18px]">
          <AvatarPersona nombre={persona.nombre} email={persona.email} avatarUrl={persona.avatarUrl} tamano="lg" />
          <div className="min-w-64 grow">
            <h2 className="text-2xl font-bold tracking-tight">{nombre}</h2>
            {persona.nombre && <p className="text-sm text-muted-foreground">{persona.email}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {persona.rolNombre ? (
                <span className="inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold" style={{ backgroundColor: color.fondo, color: color.texto }}>
                  {persona.rolNombre}
                </span>
              ) : (
                <Chip tono="aviso">Sin rol</Chip>
              )}
              {propios > 0 && (
                <Chip tono="primario">
                  <AfinarIcon className="h-3.5 w-3.5" />
                  {propios} permiso{propios === 1 ? "" : "s"} propio{propios === 1 ? "" : "s"}
                </Chip>
              )}
              {!persona.activo && <Chip>Suspendida</Chip>}
              {persona.activo && faltan.length > 0 && <Chip tono="aviso">Falta: {faltan.join(", ")}</Chip>}
              <EstadoPresencia ultimaActividadEn={persona.ultimaActividadEn} ultimoIngresoEn={persona.ultimoIngresoEn} />
            </div>
          </div>
          {puedeEscribir && (
            <div className="flex flex-wrap items-center gap-2">
              {!esYo && (
                <button type="button" onClick={verAsi} disabled={pendiente} className={`${boton} !border-foreground !bg-foreground !text-background hover:!bg-foreground-soft`}>
                  <OjoIcon className="h-4 w-4" />
                  Ver así
                </button>
              )}
              <button type="button" onClick={generar} disabled={pendiente} className={boton}>
                Generar contraseña temporal
              </button>
              {persona.conSegundoPaso && (
                <button type="button" onClick={restablecer} disabled={pendiente} className={boton}>
                  Restablecer verificación
                </button>
              )}
              {!esYo && (
                <>
                  <button type="button" onClick={suspender} disabled={pendiente} className={boton}>
                    {persona.activo ? "Suspender" : "Reactivar"}
                  </button>
                  <button type="button" onClick={eliminar} disabled={pendiente} className={`${boton} !border-destructive !text-destructive hover:!bg-destructive-soft`}>
                    Eliminar
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {contrasena && (
        <div role="status" className="flex flex-col gap-1 rounded-xl border border-border bg-muted p-4">
          <p className="text-sm text-muted-foreground">Pásasela a mano — no se vuelve a mostrar:</p>
          <p className="font-mono text-base font-semibold select-all">{contrasena}</p>
        </div>
      )}
    </div>
  );
}
