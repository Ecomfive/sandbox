"use client";

import Link from "next/link";
import { useState } from "react";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { Badge } from "@/components/ui/badge";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { formatearFechaHora } from "@/lib/formato";
import { EnlaceIcon } from "@/lib/nav-icons";
import { formatoNumero, nombrePais } from "../def-scraping";
import { AgregarProveedor, AnotarCifras, BuscarAhora, Delta, duracion, type BusquedaResumen, type ProveedorResumen, type Registro } from "../vista-scraping";

export interface ResumenProveedor extends ProveedorResumen {
  /** Productos que hoy publica (sin los desaparecidos). */
  productos: number;
  nuevos: number;
  ventas30: number;
  paraTestear: number;
  /** Sus cifras anotadas (órdenes, productos, dropshippers), de la más nueva a la más vieja. */
  registros: Registro[];
  busqueda: BusquedaResumen | null;
  /** El logo que muestra Dropi (migración 0225), o `null`: se dibujan las iniciales. */
  logo: string | null;
  verificado: boolean;
  /** El nombre con que lo vigilamos en el Análisis de competencia («Oferfly»), o `null`. */
  vigilado: string | null;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.charAt(0) ?? "?") + (partes[1]?.charAt(0) ?? "")).toUpperCase();
}

/** El logo del proveedor en un cuadro blanco (los logos suelen venir con fondo transparente), o sus iniciales si no tiene o no carga. */
function LogoProveedor({ p, tam = "h-14 w-14" }: { p: ResumenProveedor; tam?: string }) {
  const [fallo, setFallo] = useState(false);
  return p.logo && !fallo ? (
    // eslint-disable-next-line @next/next/no-img-element -- logos del CDN de Dropi
    <img src={p.logo} alt="" loading="lazy" onError={() => setFallo(true)} className={`${tam} shrink-0 rounded-xl border border-border bg-white object-contain p-1`} />
  ) : (
    <span aria-hidden="true" className={`${tam} flex shrink-0 items-center justify-center rounded-xl border border-border bg-primario-suave text-base font-bold text-primario`}>
      {iniciales(p.nombre)}
    </span>
  );
}

/** Una cifra grande de la tarjeta (órdenes, dropshippers, productos). */
function Cifra({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-lg font-bold tabular-nums">{valor}</span>
      <span className="text-xs text-muted-foreground">{titulo}</span>
    </span>
  );
}

function EstadoBusqueda({ b }: { b: BusquedaResumen | null }) {
  if (!b) return <span className="text-muted-foreground">Sin búsquedas</span>;
  if (b.estado === "lista") return <span className="text-success">{formatearFechaHora(b.inicio)}</span>;
  if (b.estado === "fallida") return <span className="text-destructive">Falló · {formatearFechaHora(b.inicio)}</span>;
  return <span className="text-warning">Pedida, esperando a correr</span>;
}

/**
 * Los proveedores referentes que se siguen: país, productos, nuevos, ventas estimadas de 30 días (lo que bajó el stock) y la última
 * búsqueda. Cada uno abre sus cifras (órdenes, productos y dropshippers que muestra Dropi). Se agrega con el enlace de Dropi de
 * cualquier país (app.dropi.mx, .co, .ec…).
 */
export function VistaProveedores({ proveedores, puedeEscribir }: { proveedores: ResumenProveedor[]; puedeEscribir: boolean }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const elegido = proveedores.find((p) => p.id === abierto) ?? null;
  const pedida = (p: ResumenProveedor) => p.busqueda?.estado === "pendiente" || p.busqueda?.estado === "corriendo";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-3xl flex-col gap-1">
          <Link href="/scraping-proveedores" className="w-fit text-sm text-muted-foreground hover:text-foreground">
            ← Scraping de proveedores
          </Link>
          <h1 className="m-0 text-2xl font-bold">Proveedores referentes</h1>
          <p className="m-0 text-sm text-muted-foreground">Los que se siguen cada día. Para agregar uno, pega su enlace de Dropi de cualquier país (México, Colombia, Ecuador…).</p>
        </div>
        {puedeEscribir && <AgregarProveedor />}
      </div>

      {proveedores.length === 0 ? (
        <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Todavía no hay proveedores.</p>
      ) : (
        <ol className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3" aria-label="Proveedores referentes, de más a menos órdenes">
          {proveedores.map((p, i) => {
            const cifras = p.registros[0] ?? null;
            return (
              <li key={p.id} className="flex">
                <button
                  type="button"
                  onClick={() => setAbierto(p.id)}
                  className={`flex w-full flex-col gap-4 rounded-[12px] border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primario/60 hover:bg-muted/40 motion-reduce:transition-none ${anilloFoco}`}
                >
                  <span className="flex items-start gap-3">
                    <LogoProveedor p={p} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-[5px] px-1.5 py-0.5 text-xs font-bold tabular-nums ${i < 3 ? "bg-primario text-white" : "bg-muted text-muted-foreground"}`}>#{i + 1}</span>
                        {p.verificado && <Badge tone="success">Verificado</Badge>}
                        {p.vigilado && <Badge tone="warning">Vigilado · {p.vigilado}</Badge>}
                      </span>
                      <span className="truncate font-semibold" title={p.nombre}>
                        {p.nombre}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {nombrePais(p.pais)} · Proveedor {p.dropiId ?? "—"} en Dropi
                      </span>
                    </span>
                  </span>
                  <span className="grid grid-cols-3 gap-2 rounded-[10px] bg-muted/60 px-3 py-2.5">
                    <Cifra titulo="Órdenes" valor={cifras ? formatoNumero(cifras.ordenes) : "—"} />
                    <Cifra titulo="Dropshippers" valor={cifras ? formatoNumero(cifras.dropshippers) : "—"} />
                    <Cifra titulo="Productos" valor={formatoNumero(p.productos)} />
                  </span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Ventas estimadas 30 d: <span className="font-semibold text-foreground tabular-nums">{p.ventas30 ? `~${formatoNumero(p.ventas30)} u.` : "—"}</span>
                    </span>
                    <span>
                      Para testear: <span className="font-semibold text-foreground tabular-nums">{formatoNumero(p.paraTestear)}</span>
                    </span>
                    <span>
                      Nuevos 14 d: <span className="font-semibold text-foreground tabular-nums">{formatoNumero(p.nuevos)}</span>
                    </span>
                  </span>
                  <span className="mt-auto border-t border-border pt-3 text-xs">
                    <span className="text-muted-foreground">Última búsqueda: </span>
                    <EstadoBusqueda b={p.busqueda} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <Ventana abierto={!!elegido} alCerrar={() => setAbierto(null)} titulo={elegido?.nombre ?? ""} lado="derecha" ancho="lg">
        {elegido && (
          <div className="flex flex-col gap-5 p-5">
            <div className="flex items-center gap-3">
              <LogoProveedor p={elegido} tam="h-16 w-16" />
              <span className="flex flex-wrap gap-1.5">
                {elegido.verificado && <Badge tone="success">Verificado</Badge>}
                {elegido.vigilado && <Badge tone="warning">Vigilado · {elegido.vigilado}</Badge>}
              </span>
            </div>
            <p className="m-0 text-sm text-muted-foreground">
              {nombrePais(elegido.pais)} · Proveedor {elegido.dropiId} en Dropi ·{" "}
              <a href={elegido.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                Abrir en Dropi <EnlaceIcon className="h-3.5 w-3.5" />
              </a>
            </p>
            {puedeEscribir && (
              <div className="flex flex-wrap gap-2">
                <AnotarCifras proveedor={elegido} />
                <BuscarAhora proveedorId={elegido.id} pedida={pedida(elegido)} />
              </div>
            )}
            <p className="m-0 text-sm">
              Última búsqueda: <EstadoBusqueda b={elegido.busqueda} />
              {elegido.busqueda?.estado === "lista" && elegido.busqueda.duracionMs !== null ? ` · duró ${duracion(elegido.busqueda.duracionMs)}` : ""}
              {elegido.busqueda?.vistos !== null && elegido.busqueda?.vistos !== undefined ? ` · ${formatoNumero(elegido.busqueda.vistos)} productos vistos` : ""}
            </p>
            <ContenedorTabla ariaLabel="Órdenes, productos y dropshippers del proveedor por fecha">
              <table className="tabla-datos w-full text-sm">
                <thead>
                  <tr className={claseFilaEncabezado}>
                    <th className={claseEncabezadoColumna}>Fecha</th>
                    <th className={`${claseEncabezadoColumna} text-right`}>Órdenes</th>
                    <th className={`${claseEncabezadoColumna} text-right`}>Productos</th>
                    <th className={`${claseEncabezadoColumna} text-right`}>Dropshippers</th>
                    <th className={claseEncabezadoColumna}>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {elegido.registros.length === 0 && (
                    <tr>
                      <td colSpan={5} className={`${claseCeldaColumna} text-center text-muted-foreground`}>
                        Sin cifras todavía.
                      </td>
                    </tr>
                  )}
                  {elegido.registros.map((r, i, lista) => {
                    const previo = lista[i + 1];
                    return (
                      <tr key={`${r.fecha}-${i}`} className="border-b border-border last:border-0">
                        <td className={claseCeldaColumna}>{formatearFechaHora(r.fecha)}</td>
                        {(["ordenes", "productos", "dropshippers"] as const).map((k) => (
                          <td key={k} className={`${claseCeldaColumna} text-right tabular-nums`}>
                            <span className="flex flex-col items-end">
                              {formatoNumero(r[k])}
                              {previo && <Delta ahora={r[k]} antes={previo[k]} />}
                            </span>
                          </td>
                        ))}
                        <td className={`${claseCeldaColumna} text-muted-foreground`}>{r.origen === "dropi" ? "Leído de Dropi" : "Escrito a mano"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ContenedorTabla>
          </div>
        )}
      </Ventana>
    </div>
  );
}
