"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AvatarPersona } from "@/components/ui/avatar-persona";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { AvatarRol, BarraCobertura, ChipSensible, Chip, LeyendaCobertura } from "@/components/permisos/piezas-permisos";
import { SelectorNivel } from "@/components/permisos/selector-segmentado";
import { AfinarIcon, BuscarIcon, CheckIcon, CopiarIcon, LapizIcon, OjoIcon, OjoTachadoIcon, PapeleraIcon } from "@/lib/nav-icons";
import { cobertura } from "@/lib/permisos/acceso";
import { AREAS_ACCESO, MODULOS_ACCESO, MODULOS_SENSIBLES, catalogoDe, type Nivel } from "@/lib/permisos/catalogo";
import { COLORES_ROL } from "@/lib/permisos/color-rol";
import { iniciarVistaPrevia } from "@/lib/vista-previa-actions";
import { copiarPermisosDeRol, duplicarRol, eliminarRolPorId, fijarNivelRolLote, guardarDatosRol } from "../permisos-actions";

interface RolEditable {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string | null;
}

type Filtro = "todos" | "con" | "sin";
type Estado = "guardado" | "guardando" | "error";

const normalizar = (t: string) => t.trim().toLowerCase();

/**
 * El editor de un rol: su cabecera (nombre, color, acciones), la barra de cobertura, y la matriz con un selector de tres niveles por
 * módulo (sin acceso, solo lectura, edición), agrupada por área. Cada cambio se ve al instante y se guarda solo.
 */
export function EditorRol({
  rol,
  niveles: nivelesIniciales,
  ajustes,
  personas,
  otrosRoles,
  puedeEscribir,
}: {
  rol: RolEditable;
  niveles: Record<string, Nivel>;
  /** Cuántos ajustes tiene el rol en cada módulo que ya se puede afinar. */
  ajustes: Record<string, number>;
  personas: { id: string; nombre: string | null; email: string; avatarUrl: string | null }[];
  otrosRoles: { id: string; nombre: string }[];
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [, empezar] = useTransition();
  const [niveles, setNiveles] = useState<Record<string, Nivel>>(nivelesIniciales);
  const [estado, setEstado] = useState<Estado>("guardado");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editando, setEditando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const enCurso = useRef(0);

  const nivelDe = (clave: string): Nivel => niveles[clave] ?? "n";
  const cob = useMemo(() => cobertura(niveles), [niveles]);
  const anuncio = `${rol.nombre}: ${cob.w} con edición, ${cob.r} de solo lectura, ${cob.n} sin acceso`;

  /** Cambia el nivel de uno o varios módulos: se ve al instante y, si el servidor lo rechaza, vuelve a como estaba. */
  function cambiar(claves: string[], nivel: Nivel) {
    if (!puedeEscribir) return;
    const antes = niveles;
    const siguiente = { ...niveles };
    for (const c of claves) {
      if (nivel === "n") delete siguiente[c];
      else siguiente[c] = nivel;
    }
    setNiveles(siguiente);
    setEstado("guardando");
    enCurso.current++;
    empezar(async () => {
      const r = await fijarNivelRolLote(rol.id, claves, nivel).catch(() => ({ error: "Inténtalo de nuevo." }));
      enCurso.current--;
      if (r.error) {
        setNiveles(antes);
        setEstado("error");
        mostrarToast(r.error, "destructive");
        return;
      }
      if (enCurso.current === 0) setEstado("guardado");
      router.refresh();
    });
  }

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return AREAS_ACCESO.map((area) => ({
      area,
      modulos: area.modulos.filter((m) => {
        const n = niveles[m.clave] ?? "n";
        if (filtro === "con" && n === "n") return false;
        if (filtro === "sin" && n !== "n") return false;
        return !q || normalizar(m.etiqueta).includes(q);
      }),
    })).filter((g) => g.modulos.length > 0);
  }, [busqueda, filtro, niveles]);

  function verAsi() {
    empezar(async () => {
      await iniciarVistaPrevia(rol.id);
    });
  }

  function duplicar() {
    empezar(async () => {
      const r = await duplicarRol(rol.id).catch(() => ({ error: "Inténtalo de nuevo." }) as { error: string; id?: undefined });
      if (r.error || !r.id) mostrarToast(r.error ?? "No se pudo duplicar.", "destructive");
      else {
        mostrarToast("Rol duplicado");
        router.push(`/usuarios/roles?rol=${r.id}`);
      }
    });
  }

  function eliminar() {
    if (!confirm(`¿Está seguro de que desea eliminar el rol "${rol.nombre}"?`)) return;
    empezar(async () => {
      const r = await eliminarRolPorId(rol.id).catch(() => ({ error: "Inténtalo de nuevo." }));
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("Rol eliminado");
        router.push("/usuarios/roles");
      }
    });
  }

  const boton = `inline-flex h-9 items-center gap-2 rounded-[10px] border border-border-control bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

  return (
    <section aria-label={`Editor del rol ${rol.nombre}`} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-[18px] rounded-[14px] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <AvatarRol nombre={rol.nombre} color={rol.color} tamano="lg" />
          <div className="min-w-60 grow">
            <div className="flex items-center gap-2">
              <h2 className="text-[22px] font-bold tracking-tight">{rol.nombre}</h2>
              {puedeEscribir && (
                <button type="button" onClick={() => setEditando(true)} aria-label={`Editar el nombre, la descripción y el color de ${rol.nombre}`} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}>
                  <LapizIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-muted-foreground">{rol.descripcion ?? "Sin descripción."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {puedeEscribir && (
              <>
                <button type="button" onClick={verAsi} className={boton}>
                  <OjoIcon className="h-4 w-4" />
                  Ver así
                </button>
                <button type="button" onClick={duplicar} className={boton}>
                  <CopiarIcon className="h-4 w-4" />
                  Duplicar
                </button>
                <button type="button" onClick={eliminar} className={`${boton} !border-destructive !text-destructive hover:!bg-destructive-soft`}>
                  <PapeleraIcon className="h-4 w-4" />
                  Eliminar
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <BarraCobertura w={cob.w} r={cob.r} n={cob.n} etiqueta={anuncio} />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <LeyendaCobertura w={cob.w} r={cob.r} n={cob.n} />
            <span className="grow" />
            {estado === "guardado" && (
              <Chip tono="ok">
                <CheckIcon className="h-3.5 w-3.5" />
                Cambios guardados
              </Chip>
            )}
            {estado === "guardando" && <Chip>Guardando…</Chip>}
            {estado === "error" && <Chip tono="error">No se guardó</Chip>}
          </div>
          <p className="sr-only" aria-live="polite">
            {anuncio}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3.5">
          <AvatarIconoPersonas />
          <span className="min-w-0 grow">
            <b className="font-semibold">Personas con este rol:</b>{" "}
            {personas.length === 0 ? (
              <span className="text-muted-foreground">nadie todavía</span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
                {personas.map((p) => (
                  <Link key={p.id} href={`/usuarios/personas/${p.id}`} className={`inline-flex items-center gap-1.5 hover:underline ${anilloFoco}`}>
                    <AvatarPersona nombre={p.nombre} email={p.email} avatarUrl={p.avatarUrl} tamano="sm" />
                    {p.nombre ?? p.email}
                  </Link>
                ))}
              </span>
            )}
          </span>
          <Link href="/usuarios" className={`inline-flex h-[30px] items-center rounded-lg border border-border-control px-2.5 text-[12.5px] font-semibold hover:bg-muted ${anilloFoco}`}>
            Asignar personas
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full max-w-[300px] min-w-48">
          <BuscarIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar módulo" aria-label="Buscar módulo" className={`${fieldClass} w-full pl-9`} />
        </div>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">Mostrar módulos</legend>
          <div className="inline-flex gap-0.5 rounded-[11px] border border-border bg-muted p-[3px]">
            {(
              [
                ["todos", `Todos ${MODULOS_ACCESO.length}`],
                ["con", `Con acceso ${cob.w + cob.r}`],
                ["sin", `Sin acceso ${cob.n}`],
              ] as const
            ).map(([valor, etiqueta]) => (
              <label key={valor} className="relative inline-flex h-[30px] cursor-pointer items-center rounded-lg px-3 text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primario">
                <input type="radio" name="filtro-modulos" checked={filtro === valor} onChange={() => setFiltro(valor)} className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0" />
                {etiqueta}
              </label>
            ))}
          </div>
        </fieldset>
        <span className="grow" />
        {puedeEscribir && otrosRoles.length > 0 && (
          <button type="button" onClick={() => setCopiando(true)} className={boton}>
            <CopiarIcon className="h-4 w-4" />
            Copiar permisos de otro rol
          </button>
        )}
      </div>

      <div className="matriz-permisos overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
        <div className="mp-fila border-b border-border bg-muted px-[18px] py-2.5 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
          <span className="mp-nm">Módulo</span>
          <span className="mp-lv mp-cab-lv flex gap-[18px]">
            <span className="inline-flex items-center gap-1.5">
              <OjoTachadoIcon className="h-3.5 w-3.5" />
              Sin acceso
            </span>
            <span className="inline-flex items-center gap-1.5">
              <OjoIcon className="h-3.5 w-3.5" />
              Solo lectura
            </span>
            <span className="inline-flex items-center gap-1.5">
              <LapizIcon className="h-3.5 w-3.5" />
              Edición
            </span>
          </span>
          <span className="mp-dt mp-cab-dt">Detalle</span>
        </div>

        {visibles.map(({ area, modulos }) => {
          const claves = area.modulos.map((m) => m.clave);
          const conAcceso = claves.filter((c) => nivelDe(c) !== "n").length;
          return (
            <div key={area.id}>
              <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-muted px-[18px] py-3">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: area.color }} />
                <h3 className="text-sm font-bold">{area.nombre}</h3>
                <Chip>
                  {conAcceso} de {claves.length} con acceso
                </Chip>
                {puedeEscribir && (
                  <div role="group" aria-label={`Aplicar a toda el área ${area.nombre}`} className="ml-auto flex gap-1.5">
                    {(
                      [
                        ["n", "Ninguno"],
                        ["r", "Lectura"],
                        ["w", "Edición"],
                      ] as const
                    ).map(([nivel, texto]) => (
                      <button key={nivel} type="button" onClick={() => cambiar(claves, nivel)} className={`inline-flex h-[30px] items-center rounded-lg border border-border-control bg-card px-2.5 text-[12.5px] font-semibold hover:bg-accent ${anilloFoco}`}>
                        {texto}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {modulos.map((m) => {
                const nivel = nivelDe(m.clave);
                const afinable = !!catalogoDe(m.clave);
                const n = nivel === "n" ? 0 : (ajustes[m.clave] ?? 0);
                return (
                  <div key={m.clave} className="mp-fila border-b border-border px-[18px] py-[7px] last:border-0 hover:bg-muted/50">
                    <span className="mp-nm flex min-w-0 items-center gap-2.5">
                      <span className={`font-medium ${nivel === "n" ? "text-muted-foreground" : ""}`}>{m.etiqueta}</span>
                      {MODULOS_SENSIBLES.has(m.clave) && <ChipSensible />}
                    </span>
                    <span className="mp-lv">
                      <SelectorNivel nombre={`nivel-${m.clave}`} modulo={m.etiqueta} valor={nivel} alCambiar={(v) => cambiar([m.clave], v)} deshabilitado={!puedeEscribir} />
                    </span>
                    <span className="mp-dt">
                      {afinable && nivel !== "n" ? (
                        <Link
                          href={`/usuarios/roles/${rol.id}/afinar/${m.clave}`}
                          className={`inline-flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold hover:bg-primario-suave ${anilloFoco} ${n > 0 ? "bg-primario-suave text-primario" : "text-muted-foreground"}`}
                        >
                          <AfinarIcon className="h-3.5 w-3.5" />
                          {n > 0 ? `${n} ajuste${n === 1 ? "" : "s"}` : "Afinar"}
                        </Link>
                      ) : (
                        <span aria-hidden="true" className="text-muted-foreground">
                          —
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}

        {visibles.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <b className="text-[15px]">Ningún módulo coincide</b>
            <button
              type="button"
              onClick={() => {
                setBusqueda("");
                setFiltro("todos");
              }}
              className={boton}
            >
              Quitar filtros
            </button>
          </div>
        )}
      </div>

      {editando && <EditarDatosRol rol={rol} alCerrar={() => setEditando(false)} />}
      {copiando && <CopiarPermisos rol={rol} otrosRoles={otrosRoles} alCerrar={() => setCopiando(false)} />}
    </section>
  );
}

function AvatarIconoPersonas() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 010 6M18 14c2 .7 3 2.5 3 6" />
    </svg>
  );
}

/** Nombre, descripción y color del rol. */
function EditarDatosRol({ rol, alCerrar }: { rol: RolEditable; alCerrar: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [nombre, setNombre] = useState(rol.nombre);
  const [descripcion, setDescripcion] = useState(rol.descripcion ?? "");
  const [color, setColor] = useState<string | null>(rol.color);
  const [error, setError] = useState<string | null>(null);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (pendiente) return;
    setError(null);
    empezar(async () => {
      const r = await guardarDatosRol(rol.id, { nombre, descripcion, color }).catch(() => ({ error: "Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Cambios guardados");
        alCerrar();
        router.refresh();
      }
    });
  }

  return (
    <Ventana abierto alCerrar={() => !pendiente && alCerrar()} lado="derecha" titulo={<span className="text-lg font-bold">Editar rol</span>}>
      <form onSubmit={guardar} className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-5 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Nombre</span>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={60} data-enfocar className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Descripción</span>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} maxLength={240} className={fieldClass} />
          </label>
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 p-0 text-[13px] font-semibold">Color</legend>
            <div className="flex flex-wrap gap-2">
              {COLORES_ROL.map((c) => (
                <label key={c.valor} className="relative inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-[13px] font-bold has-[:checked]:outline-2 has-[:checked]:outline-offset-2 has-[:checked]:outline-foreground has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primario" style={{ backgroundColor: c.fondo, color: c.texto }}>
                  <input type="radio" name="color-rol" value={c.valor} checked={color === c.valor} onChange={() => setColor(c.valor)} aria-label={c.etiqueta} className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0" />
                  {(nombre.trim().charAt(0) || "A").toUpperCase()}
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={alCerrar} disabled={pendiente} className={`rounded-[10px] border border-border-control bg-card px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
            Cancelar
          </button>
          <button type="submit" disabled={pendiente} className={`boton-neon rounded-[10px] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${anilloFoco}`}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Ventana>
  );
}

/** Deja al rol con los mismos módulos y ajustes que otro. */
function CopiarPermisos({ rol, otrosRoles, alCerrar }: { rol: RolEditable; otrosRoles: { id: string; nombre: string }[]; alCerrar: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [desde, setDesde] = useState(otrosRoles[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  function copiar(e: React.FormEvent) {
    e.preventDefault();
    if (pendiente) return;
    setError(null);
    empezar(async () => {
      const r = await copiarPermisosDeRol(rol.id, desde).catch(() => ({ error: "Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Permisos copiados");
        alCerrar();
        router.refresh();
      }
    });
  }

  return (
    <Ventana abierto alCerrar={() => !pendiente && alCerrar()} titulo={<span className="text-lg font-bold">Copiar permisos</span>}>
      <form onSubmit={copiar} className="flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Copiar los permisos de</span>
          <select value={desde} onChange={(e) => setDesde(e.target.value)} data-enfocar className={fieldClass}>
            {otrosRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm">
          {rol.nombre} quedará con los mismos módulos y ajustes. Lo que tiene ahora se reemplaza.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={alCerrar} disabled={pendiente} className={`rounded-[10px] border border-border-control bg-card px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
            Cancelar
          </button>
          <button type="submit" disabled={pendiente || !desde} className={`boton-neon rounded-[10px] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${anilloFoco}`}>
            {pendiente ? "Copiando…" : "Copiar"}
          </button>
        </div>
      </form>
    </Ventana>
  );
}
