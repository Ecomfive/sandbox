"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Chip } from "@/components/permisos/piezas-permisos";
import { SeccionTarjeta } from "@/components/permisos/seccion-tarjeta";
import { EscudoIcon } from "@/lib/nav-icons";
import type { Nivel } from "@/lib/permisos/catalogo";
import { cambiarRolUsuario } from "../../actions";
import { MatrizPersona } from "./matriz-persona";

export interface AjustePropio {
  modulo: string;
  etiqueta: string;
  delRol: Nivel;
  efectivo: Nivel;
  /** Tiene un permiso propio sobre el módulo (no solo ajustes de lo que ve). */
  tienePropio: boolean;
  /** Cuántos ajustes propios tiene en lo que ve dentro del módulo. */
  ajustes: number;
}

/** «Rol y acceso» de una persona: su rol base y la matriz de sus permisos (11 nov 2026: la misma del rol, por persona). */
export function RolYAcceso({
  personaId,
  nombre,
  roles,
  rolId,
  lista,
  efectivos,
  nivelesDelRol,
  ajustesTotales,
  puedeEscribir,
}: {
  personaId: string;
  nombre: string;
  roles: { id: string; nombre: string }[];
  rolId: string | null;
  lista: AjustePropio[];
  /** Lo que la persona puede de verdad en cada módulo, para la matriz. */
  efectivos: Record<string, Nivel>;
  nivelesDelRol: Record<string, Nivel>;
  ajustesTotales: Record<string, number>;
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const deshabilitado = !puedeEscribir || pendiente;

  function cambiarRol(nuevo: string) {
    const formData = new FormData();
    formData.set("id", personaId);
    formData.set("rol_id", nuevo);
    setError(null);
    empezar(async () => {
      try {
        await cambiarRolUsuario(formData);
        mostrarToast("Rol cambiado");
        router.refresh();
      } catch (e) {
        mostrarToast(e instanceof Error ? e.message : "No se pudo cambiar el rol.", "destructive");
      }
    });
  }

  return (
    <SeccionTarjeta id="h-rol-acceso" icono={EscudoIcon} titulo="Rol y acceso">
      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-wrap items-end gap-3.5">
          <label className="flex max-w-sm min-w-64 flex-1 flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Rol base</span>
            <select aria-label={`Rol de ${nombre}`} value={rolId ?? ""} disabled={deshabilitado} onChange={(e) => cambiarRol(e.target.value)} className={`${fieldClass} disabled:opacity-50`}>
              <option value="">Sin rol</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </label>
          {rolId && (
            <Link href={`/usuarios/roles?rol=${rolId}`} className={`inline-flex h-9 items-center rounded-[10px] border border-border-control bg-card px-3.5 text-[13px] font-semibold hover:bg-muted ${anilloFoco}`}>
              Ver el rol
            </Link>
          )}
        </div>

        <div>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <h3 id="h-propios" className="text-sm font-bold">
              Permisos de {nombre}
            </h3>
            {lista.length > 0 && <Chip tono="primario">Personalizado</Chip>}
            <span className="text-xs text-muted-foreground">Parte de lo que da su rol; lo que cambies aquí es solo para esta persona.</span>
          </div>
          <MatrizPersona personaId={personaId} nombre={nombre} efectivos={efectivos} delRol={nivelesDelRol} ajustesTotales={ajustesTotales} puedeEscribir={puedeEscribir} />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </SeccionTarjeta>
  );
}
