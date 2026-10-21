"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AvatarPersona } from "@/components/ui/avatar-persona";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { BarraCobertura, Chip } from "@/components/permisos/piezas-permisos";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { AfinarIcon, BuscarIcon, CheckIcon, DescargarIcon, OjoIcon } from "@/lib/nav-icons";
import { celdaCsv } from "@/lib/tabla/csv";
import { colorDeRol } from "@/lib/permisos/color-rol";
import type { Cobertura } from "@/lib/permisos/acceso";
import { iniciarVistaPreviaPersona } from "@/lib/vista-previa-actions";
import { CrearUsuarioPanel } from "./crear-usuario-panel";
import { faltantesDePersona, type FilaUsuario, type Rol } from "./def-usuarios";
import { EstadoPresencia } from "./estado-presencia";

export interface FilaPersonaLista extends FilaUsuario {
  rolColor: string | null;
  acceso: Cobertura;
  /** Tiene permisos propios o ajustes propios encima de los de su rol. */
  personalizado: boolean;
}

const normalizar = (texto: string) => texto.trim().toLowerCase();

function textoPaises(codigos: string[] | null | undefined, nombres: Map<string, string>): string {
  if (!codigos) return "Todos";
  if (codigos.length === 0) return "Ninguno";
  return codigos.map((c) => (c === "importacion" ? "Importadora" : (nombres.get(c) ?? c))).join(", ");
}

/** Personas: quién entra a la plataforma, con qué rol, cuánto acceso tiene de verdad y si ya está lista para empezar. */
export function ListaPersonas({
  personas,
  roles,
  paises,
  miId,
  rolesSinPersonas,
}: {
  personas: FilaPersonaLista[];
  roles: Rol[];
  paises: { codigo: string; nombre: string }[];
  miId: string;
  rolesSinPersonas: number;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [rolId, setRolId] = useState("");
  const [pais, setPais] = useState("");
  const [soloPorCompletar, setSoloPorCompletar] = useState(false);

  // Quién está «Activo» es de otras personas: mientras se mira la lista se vuelve a pedir cada 20 s (lo mismo que tarda
  // `LatidoPresencia` en mandar un latido nuevo) para que se note cuando alguien entra o se va.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(id);
  }, [router]);

  const nombresPaises = useMemo(() => new Map(paises.map((p) => [p.codigo, p.nombre])), [paises]);
  const porCompletar = useMemo(() => personas.filter((p) => p.activo && faltantesDePersona(p).length > 0).length, [personas]);

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda);
    return personas.filter((p) => {
      if (q && !normalizar(p.nombre ?? "").includes(q) && !normalizar(p.email).includes(q)) return false;
      if (rolId && p.rolId !== rolId) return false;
      if (pais && !(p.paisesPermitidos === null || p.paisesPermitidos === undefined || p.paisesPermitidos.includes(pais))) return false;
      if (soloPorCompletar && (!p.activo || faltantesDePersona(p).length === 0)) return false;
      return true;
    });
  }, [personas, busqueda, rolId, pais, soloPorCompletar]);

  function descargar() {
    const filas = [["Nombre", "Correo", "Rol", "Personalizado", "Módulos con edición", "Módulos de solo lectura", "Países", "Estado"]];
    for (const p of filtradas) {
      const faltan = faltantesDePersona(p);
      filas.push([
        p.nombre ?? "",
        p.email,
        p.rolNombre ?? "",
        p.personalizado ? "Sí" : "No",
        String(p.acceso.w),
        String(p.acceso.r),
        textoPaises(p.paisesPermitidos, nombresPaises),
        !p.activo ? "Suspendida" : faltan.length ? `Falta: ${faltan.join(", ")}` : "Listo",
      ]);
    }
    const csv = "﻿" + filas.map((f) => f.map(celdaCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "personas.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function verAsi(id: string) {
    empezar(async () => {
      try {
        await iniciarVistaPreviaPersona(id);
      } catch (error) {
        mostrarToast(error instanceof Error ? error.message : "No se pudo iniciar la vista previa.", "destructive");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full max-w-xs min-w-52">
          <BuscarIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar persona"
            className={`${fieldClass} w-full pl-9`}
          />
        </div>
        <select aria-label="Filtrar por rol" value={rolId} onChange={(e) => setRolId(e.target.value)} className={`${fieldClass} h-9 py-0 font-medium`}>
          <option value="">Todos los roles</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por país" value={pais} onChange={(e) => setPais(e.target.value)} className={`${fieldClass} h-9 py-0 font-medium`}>
          <option value="">Todos los países</option>
          {paises.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={soloPorCompletar}
          onClick={() => setSoloPorCompletar((v) => !v)}
          className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold ${anilloFoco} ${
            soloPorCompletar ? "border-primario bg-accent text-accent-foreground" : "border-border-control bg-card hover:bg-muted"
          }`}
        >
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
          Por completar
          <span className="rounded-full border border-border bg-muted px-2 text-xs text-foreground-soft">{porCompletar}</span>
        </button>
        <span className="grow" />
        <button
          type="button"
          onClick={descargar}
          className={`inline-flex h-9 items-center gap-2 rounded-[10px] border border-border-control bg-card px-3.5 text-[13px] font-semibold hover:bg-muted ${anilloFoco}`}
        >
          <DescargarIcon className="h-4 w-4" />
          Descargar
        </button>
        <CrearUsuarioPanel roles={roles} />
      </div>

      {filtradas.length === 0 ? (
        <EstadoVacio mensaje={personas.length === 0 ? "Todavía no hay usuarios." : "Ninguna coincide con lo que buscas."} />
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-border bg-card shadow-sm">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Personas con acceso a la plataforma</caption>
            <thead>
              <tr className={claseFilaEncabezado}>
                {["Persona", "Rol", "Acceso", "Países", "Estado", "Última conexión"].map((t) => (
                  <th key={t} scope="col" className={`${claseEncabezadoColumna} whitespace-nowrap`}>
                    {t}
                  </th>
                ))}
                <th scope="col" className={claseEncabezadoColumna}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((p) => {
                const faltan = faltantesDePersona(p);
                const color = colorDeRol(p.rolColor, p.rolNombre ?? "");
                const total = p.acceso.w + p.acceso.r;
                return (
                  <tr key={p.id} className="hover:bg-muted/50">
                    <td className={`${claseCeldaColumna} border-b border-border/40`}>
                      <Link href={`/usuarios/personas/${p.id}`} className={`group flex items-center gap-3 font-semibold ${anilloFoco}`}>
                        <AvatarPersona nombre={p.nombre} email={p.email} avatarUrl={p.avatarUrl} />
                        <span className="min-w-0">
                          <span className="block truncate group-hover:underline">{p.nombre ?? p.email}</span>
                          {p.nombre && <span className="block truncate text-xs font-normal text-muted-foreground">{p.email}</span>}
                        </span>
                      </Link>
                    </td>
                    <td className={`${claseCeldaColumna} border-b border-border/40`}>
                      <div className="flex flex-wrap items-center gap-2">
                        {p.rolNombre ? (
                          <span className="inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold" style={{ backgroundColor: color.fondo, color: color.texto }}>
                            {p.rolNombre}
                          </span>
                        ) : (
                          <Chip tono="aviso">Sin rol</Chip>
                        )}
                        {p.personalizado && (
                          <Chip tono="primario">
                            <AfinarIcon className="h-3.5 w-3.5" />
                            Personalizado
                          </Chip>
                        )}
                      </div>
                    </td>
                    <td className={`${claseCeldaColumna} border-b border-border/40`}>
                      <div className="flex items-center gap-3">
                        <BarraCobertura w={p.acceso.w} r={p.acceso.r} n={p.acceso.n} ancho="96px" etiqueta={`${total} módulos: ${p.acceso.w} con edición, ${p.acceso.r} de solo lectura`} />
                        <span className="text-muted-foreground">{total === p.acceso.total ? "Todo" : `${total} módulos`}</span>
                      </div>
                    </td>
                    <td className={`${claseCeldaColumna} border-b border-border/40`}>{textoPaises(p.paisesPermitidos, nombresPaises)}</td>
                    <td className={`${claseCeldaColumna} border-b border-border/40`}>
                      {!p.activo ? (
                        <Chip>Suspendida</Chip>
                      ) : faltan.length === 0 ? (
                        <Chip tono="ok">
                          <CheckIcon className="h-3.5 w-3.5" />
                          Listo
                        </Chip>
                      ) : (
                        <Chip tono="aviso">Falta: {faltan.join(", ")}</Chip>
                      )}
                    </td>
                    <td className={`${claseCeldaColumna} border-b border-border/40`}>
                      <EstadoPresencia ultimaActividadEn={p.ultimaActividadEn} ultimoIngresoEn={p.ultimoIngresoEn} />
                    </td>
                    <td className={`${claseCeldaColumna} border-b border-border/40`}>
                      {p.id !== miId && (
                        <button
                          type="button"
                          disabled={pendiente}
                          onClick={() => verAsi(p.id)}
                          aria-label={`Ver la plataforma como ${p.nombre ?? p.email}`}
                          className={`inline-flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
                        >
                          <OjoIcon className="h-3.5 w-3.5" />
                          Ver así
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rolesSinPersonas > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
          <span className="min-w-0 flex-1 text-sm">
            <b className="font-semibold">
              {rolesSinPersonas} rol{rolesSinPersonas === 1 ? "" : "es"} sin personas asignadas.
            </b>{" "}
            Asigna un rol desde la ficha de cada persona.
          </span>
          <Link href="/usuarios/roles" className={`inline-flex h-[30px] items-center rounded-lg border border-border-control px-2.5 text-[12.5px] font-semibold hover:bg-muted ${anilloFoco}`}>
            Ver roles
          </Link>
        </div>
      )}
    </div>
  );
}
