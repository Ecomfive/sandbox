"use client";

import Link from "next/link";
import { useState } from "react";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
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
        <ContenedorTabla ariaLabel="Proveedores referentes">
          <table className="tabla-datos w-full min-w-[900px] text-sm">
            <thead>
              <tr className={claseFilaEncabezado}>
                <th className={claseEncabezadoColumna}>Proveedor</th>
                <th className={claseEncabezadoColumna}>País</th>
                <th className={`${claseEncabezadoColumna} text-right`}>Productos</th>
                <th className={`${claseEncabezadoColumna} text-right`}>Nuevos · 14 días</th>
                <th className={`${claseEncabezadoColumna} text-right`}>Ventas estimadas · 30 días</th>
                <th className={`${claseEncabezadoColumna} text-right`}>Para testear</th>
                <th className={`${claseEncabezadoColumna} text-right`}>Órdenes (Dropi)</th>
                <th className={claseEncabezadoColumna}>Última búsqueda</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className={claseCeldaColumna}>
                    <button type="button" onClick={() => setAbierto(p.id)} className={`flex flex-col items-start rounded text-left hover:underline ${anilloFoco}`}>
                      <span className="font-semibold">{p.nombre}</span>
                      <span className="text-xs text-muted-foreground">Proveedor {p.dropiId ?? "—"} en Dropi</span>
                    </button>
                  </td>
                  <td className={claseCeldaColumna}>{nombrePais(p.pais)}</td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums`}>{formatoNumero(p.productos)}</td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums`}>{formatoNumero(p.nuevos)}</td>
                  <td className={`${claseCeldaColumna} text-right font-semibold tabular-nums`}>{p.ventas30 ? `~${formatoNumero(p.ventas30)} u.` : "—"}</td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums`}>{formatoNumero(p.paraTestear)}</td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums`}>{p.registros[0] ? formatoNumero(p.registros[0].ordenes) : "—"}</td>
                  <td className={claseCeldaColumna}>
                    <EstadoBusqueda b={p.busqueda} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ContenedorTabla>
      )}

      <Ventana abierto={!!elegido} alCerrar={() => setAbierto(null)} titulo={elegido?.nombre ?? ""} lado="derecha" ancho="lg">
        {elegido && (
          <div className="flex flex-col gap-5 p-5">
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
