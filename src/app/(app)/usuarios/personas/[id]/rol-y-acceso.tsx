"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ChipSensible, Chip } from "@/components/permisos/piezas-permisos";
import { SeccionTarjeta } from "@/components/permisos/seccion-tarjeta";
import { SelectorNivel } from "@/components/permisos/selector-segmentado";
import { AfinarIcon, EscudoIcon, MasIcon, OjoIcon } from "@/lib/nav-icons";
import { MODULOS_ACCESO, MODULOS_SENSIBLES, catalogoDe, etiquetaDeModulo, type Nivel } from "@/lib/permisos/catalogo";
import { cambiarRolUsuario } from "../../actions";
import { fijarNivelPersona, quitarAjustesPersona } from "../../permisos-actions";

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

const TEXTO_NIVEL: Record<Nivel, string> = { n: "Sin acceso", r: "Solo lectura", w: "Edición" };

/** Cómo se aparta del rol: suma, quita, sube, baja o solo afina. */
function describir(a: AjustePropio): { marca: string; clase: string; texto: string } {
  if (!a.tienePropio) return { marca: "~", clase: "bg-warning-soft text-warning", texto: "Lo que ve dentro del módulo es propio" };
  if (a.delRol === "n") return { marca: "+", clase: "bg-success-soft text-success", texto: "Suma un módulo que el rol no tiene" };
  if (a.efectivo === "n") return { marca: "−", clase: "bg-destructive-soft text-destructive", texto: "Quita un módulo que el rol da" };
  if (a.delRol === "w") return { marca: "↓", clase: "bg-warning-soft text-warning", texto: "El rol da Edición; aquí baja a lectura" };
  return { marca: "↑", clase: "bg-warning-soft text-warning", texto: "El rol da lectura; aquí sube a Edición" };
}

/** «Rol y acceso» de una persona: su rol base, sus permisos propios encima y el formulario para añadir otro. */
export function RolYAcceso({
  personaId,
  nombre,
  roles,
  rolId,
  lista,
  modulosConPropio,
  nivelesDelRol,
  ajustesTotales,
  puedeEscribir,
}: {
  personaId: string;
  nombre: string;
  roles: { id: string; nombre: string }[];
  rolId: string | null;
  lista: AjustePropio[];
  modulosConPropio: string[];
  nivelesDelRol: Record<string, Nivel>;
  ajustesTotales: Record<string, number>;
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [modulo, setModulo] = useState("");
  const [nivel, setNivel] = useState<Nivel>("r");
  const [error, setError] = useState<string | null>(null);
  const deshabilitado = !puedeEscribir || pendiente;

  const disponibles = useMemo(() => MODULOS_ACCESO.filter((m) => !modulosConPropio.includes(m.clave)), [modulosConPropio]);

  function correr(accion: () => Promise<{ error?: string }>, exito: string) {
    setError(null);
    empezar(async () => {
      const r = await accion().catch(() => ({ error: "Inténtalo de nuevo." }));
      if (r.error) {
        setError(r.error);
        mostrarToast(r.error, "destructive");
      } else {
        mostrarToast(exito);
        router.refresh();
      }
    });
  }

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

  function anadir() {
    if (!modulo) return;
    if ((nivelesDelRol[modulo] ?? "n") === nivel) {
      setError(`${etiquetaDeModulo(modulo)} ya tiene ese nivel por su rol.`);
      return;
    }
    correr(() => fijarNivelPersona(personaId, modulo, nivel), "Permiso propio añadido");
    setModulo("");
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
          <div className="mb-2.5 flex items-center gap-2">
            <h3 id="h-propios" className="text-sm font-bold">
              Permisos propios
            </h3>
            {lista.length > 0 && <Chip tono="primario">Personalizado</Chip>}
          </div>
          {lista.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-control px-4 py-3 text-sm text-muted-foreground">Sin permisos propios: tiene lo que da su rol.</p>
          ) : (
            <ul aria-labelledby="h-propios" className="m-0 list-none overflow-hidden rounded-[14px] border border-border p-0">
              {lista.map((a) => {
                const d = describir(a);
                const afinable = !!catalogoDe(a.modulo) && a.efectivo !== "n";
                return (
                  <li key={a.modulo} className="flex flex-wrap items-center gap-3.5 border-b border-border px-[18px] py-2.5 last:border-0 hover:bg-muted/50">
                    <span aria-hidden="true" className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[15px] font-bold ${d.clase}`}>
                      {d.marca}
                    </span>
                    <span className="min-w-48 grow">
                      <b className="font-semibold">{a.etiqueta}</b>
                      {MODULOS_SENSIBLES.has(a.modulo) && (
                        <span className="ml-2 inline-block align-middle">
                          <ChipSensible />
                        </span>
                      )}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {d.texto}
                        {a.ajustes > 0 && a.tienePropio ? ` · ${a.ajustes} ajuste${a.ajustes === 1 ? "" : "s"} dentro del módulo` : ""}
                      </span>
                    </span>
                    <Chip tono={a.efectivo === "n" ? "neutro" : a.efectivo === "r" ? "azul" : "primario"}>
                      {a.efectivo === "r" && <OjoIcon className="h-3.5 w-3.5" />}
                      {TEXTO_NIVEL[a.efectivo]}
                    </Chip>
                    {afinable && (
                      <Link
                        href={`/usuarios/personas/${personaId}/afinar/${a.modulo}`}
                        className={`inline-flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-primario hover:bg-primario-suave ${anilloFoco}`}
                      >
                        <AfinarIcon className="h-3.5 w-3.5" />
                        {ajustesTotales[a.modulo] > 0 ? `${ajustesTotales[a.modulo]} ajuste${ajustesTotales[a.modulo] === 1 ? "" : "s"}` : "Afinar"}
                      </Link>
                    )}
                    {puedeEscribir && (
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => correr(() => quitarAjustesPersona(personaId, a.modulo), "Ajuste quitado")}
                        aria-label={`Quitar el ajuste de ${a.etiqueta}`}
                        className={`inline-flex h-[30px] items-center rounded-lg border border-border-control bg-card px-2.5 text-[12.5px] font-semibold hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
                      >
                        Quitar
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {puedeEscribir && (
          <div className="flex flex-wrap items-end gap-3 rounded-[14px] border border-border bg-muted p-3.5">
            <label className="flex min-w-52 flex-1 flex-col gap-1.5">
              <span className="text-[13px] font-semibold">Añadir un permiso propio</span>
              <select aria-label="Módulo del permiso propio" value={modulo} onChange={(e) => setModulo(e.target.value)} className={fieldClass}>
                <option value="">Elige un módulo</option>
                {disponibles.map((m) => (
                  <option key={m.clave} value={m.clave}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <SelectorNivel nombre="nivel-propio-nuevo" modulo="el permiso nuevo" valor={nivel} alCambiar={setNivel} />
            <button type="button" onClick={anadir} disabled={!modulo || pendiente} className={`inline-flex h-9 items-center gap-2 rounded-[10px] bg-foreground px-3.5 text-[13px] font-semibold text-background hover:bg-foreground-soft disabled:opacity-50 ${anilloFoco}`}>
              <MasIcon className="h-4 w-4" />
              Añadir
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </SeccionTarjeta>
  );
}
