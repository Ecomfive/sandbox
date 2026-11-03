"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { FotoAmpliable } from "@/components/competencia/piezas-competencia";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { Badge } from "@/components/ui/badge";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { formatearFechaHora } from "@/lib/formato";
import { ChevronRightIcon, EnlaceIcon } from "@/lib/nav-icons";
import type { PerfilProveedor, ProductoPerfil } from "@/lib/scraping/perfil-proveedor";
import { RECOMENDACIONES } from "@/lib/scraping/recomendar";
import { CLASE_RECOMENDACION, formatoNumero, formatoPrecio, formatoUsd, nombrePais } from "../def-scraping";
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
  /** Lo que se sabe de sus productos: categorías fuertes, lo que no tenemos, lo que más vende (`perfilProveedor`). */
  perfil: PerfilProveedor;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.charAt(0) ?? "?") + (partes[1]?.charAt(0) ?? "")).toUpperCase();
}

/** El logo del proveedor en un cuadro blanco (los logos suelen venir con fondo transparente), o sus iniciales si no tiene o no carga. */
function LogoProveedor({ p, tam = "h-12 w-12" }: { p: ResumenProveedor; tam?: string }) {
  const [fallo, setFallo] = useState(false);
  return p.logo && !fallo ? (
    // eslint-disable-next-line @next/next/no-img-element -- logos del CDN de Dropi
    <img src={p.logo} alt="" loading="lazy" onError={() => setFallo(true)} className={`${tam} shrink-0 rounded-xl border border-border bg-white object-contain p-1`} />
  ) : (
    <span aria-hidden="true" className={`${tam} flex shrink-0 items-center justify-center rounded-xl border border-border bg-primario-suave text-sm font-bold text-primario`}>
      {iniciales(p.nombre)}
    </span>
  );
}

function EstadoBusqueda({ b }: { b: BusquedaResumen | null }) {
  if (!b) return <span className="text-muted-foreground">Sin búsquedas</span>;
  if (b.estado === "lista") return <span className="text-success">{formatearFechaHora(b.inicio)}</span>;
  if (b.estado === "fallida") return <span className="text-destructive">Falló · {formatearFechaHora(b.inicio)}</span>;
  return <span className="text-warning">Pedida, esperando a correr</span>;
}

const Puesto = ({ i }: { i: number }) => (
  <span className={`inline-flex min-w-8 justify-center rounded-[5px] px-1.5 py-0.5 text-xs font-bold tabular-nums ${i < 3 ? "bg-primario text-white" : "bg-muted text-muted-foreground"}`}>#{i + 1}</span>
);

/** Un dato de la fila: en pantalla ancha va bajo su columna (sin título); en angosta lleva su título al lado. */
function DatoFila({ titulo, children, fuerte = false }: { titulo: string; children: ReactNode; fuerte?: boolean }) {
  return (
    <span className="flex items-baseline justify-between gap-2 text-sm lg:block lg:text-right">
      <span className="text-xs text-muted-foreground lg:hidden">{titulo}</span>
      <span className={`tabular-nums ${fuerte ? "font-bold" : ""}`}>{children}</span>
    </span>
  );
}

/** Las columnas de la lista (la misma rejilla en el encabezado y en cada fila). */
const REJILLA = "lg:grid lg:grid-cols-[2.75rem_3rem_minmax(0,3.4fr)_repeat(6,minmax(0,0.85fr))_minmax(0,1.25fr)_1rem] lg:items-center lg:gap-3";

/**
 * Los proveedores referentes que se siguen, como una lista a lo largo (3 nov 2026, pedido de Hernán: las tarjetas «cubren mucho espacio»):
 * de más a menos órdenes, cada fila con su puesto, logo, nombre, las cifras de Dropi (órdenes, dropshippers, productos) y las nuestras
 * (ventas estimadas, para testear, nuevos) y la última búsqueda. Cada fila abre la ficha completa del proveedor. Se agrega con el enlace de
 * Dropi de cualquier país (app.dropi.mx, .co, .ec…).
 */
export function VistaProveedores({ proveedores, puedeEscribir }: { proveedores: ResumenProveedor[]; puedeEscribir: boolean }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const indice = proveedores.findIndex((p) => p.id === abierto);
  const elegido = indice >= 0 ? proveedores[indice] : null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-3xl flex-col gap-1">
          <Link href="/scraping-proveedores" className="w-fit text-sm text-muted-foreground hover:text-foreground">
            ← Scraping de proveedores
          </Link>
          <h1 className="m-0 text-2xl font-bold">Proveedores referentes</h1>
          <p className="m-0 text-sm text-muted-foreground">
            De más a menos órdenes en Dropi. Toca uno para ver todo: sus categorías fuertes, lo que tiene y nosotros no, lo que más vende y lo nuevo. Para agregar uno,
            pega su enlace de Dropi de cualquier país (México, Colombia, Ecuador…).
          </p>
        </div>
        {puedeEscribir && <AgregarProveedor />}
      </div>

      {proveedores.length === 0 ? (
        <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Todavía no hay proveedores.</p>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-card shadow-sm">
          <div aria-hidden="true" className={`hidden border-b border-border bg-muted px-4 py-2.5 text-xs font-semibold text-muted-foreground ${REJILLA}`}>
            <span>#</span>
            <span />
            <span>Proveedor</span>
            <span className="text-right">Órdenes</span>
            <span className="text-right">Dropshippers</span>
            <span className="text-right">Productos</span>
            <span className="text-right">Ventas 30 d</span>
            <span className="text-right">Para testear</span>
            <span className="text-right">Nuevos 14 d</span>
            <span>Última búsqueda</span>
            <span />
          </div>
          <ol className="m-0 list-none divide-y divide-border p-0" aria-label="Proveedores referentes, de más a menos órdenes">
            {proveedores.map((p, i) => {
              const cifras = p.registros[0] ?? null;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setAbierto(p.id)}
                    className={`grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-muted/50 motion-reduce:transition-none ${REJILLA} ${anilloFoco}`}
                  >
                    <span className="row-span-2 flex items-start gap-3 lg:contents">
                      <span className="pt-1 lg:pt-0">
                        <Puesto i={i} />
                      </span>
                      <LogoProveedor p={p} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate font-semibold" title={p.nombre}>
                          {p.nombre}
                        </span>
                        {p.verificado && <Badge tone="success">Verificado</Badge>}
                        {p.vigilado && <Badge tone="warning">Vigilado · {p.vigilado}</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {nombrePais(p.pais)} · Proveedor {p.dropiId ?? "—"}
                        {p.perfil.categorias[0] && p.perfil.categorias[0].nombre !== "Sin categoría" ? ` · Fuerte en ${p.perfil.categorias[0].nombre}` : ""}
                      </span>
                    </span>
                    <span className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:contents">
                      <DatoFila titulo="Órdenes" fuerte>
                        {cifras ? formatoNumero(cifras.ordenes) : "—"}
                      </DatoFila>
                      <DatoFila titulo="Dropshippers">{cifras ? formatoNumero(cifras.dropshippers) : "—"}</DatoFila>
                      <DatoFila titulo="Productos">{formatoNumero(p.productos)}</DatoFila>
                      <DatoFila titulo="Ventas 30 d">{p.ventas30 ? `~${formatoNumero(p.ventas30)} u.` : "—"}</DatoFila>
                      <DatoFila titulo="Para testear">
                        {p.paraTestear ? <span className="font-semibold text-primario">{formatoNumero(p.paraTestear)}</span> : "0"}
                      </DatoFila>
                      <DatoFila titulo="Nuevos 14 d">{formatoNumero(p.nuevos)}</DatoFila>
                    </span>
                    <span className="col-span-2 text-xs lg:col-span-1">
                      <span className="text-muted-foreground lg:hidden">Última búsqueda: </span>
                      <EstadoBusqueda b={p.busqueda} />
                    </span>
                    <ChevronRightIcon aria-hidden="true" className="hidden h-4 w-4 text-muted-foreground lg:block" />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <Ventana abierto={!!elegido} alCerrar={() => setAbierto(null)} titulo={elegido?.nombre ?? ""} lado="derecha" ancho="xl">
        {elegido && <FichaProveedor p={elegido} puesto={indice} puedeEscribir={puedeEscribir} />}
      </Ventana>
    </div>
  );
}

// ---------- La ficha del proveedor ----------

function Seccion({ titulo, detalle, children }: { titulo: string; detalle?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h3 className="m-0 text-base font-semibold">{titulo}</h3>
        {detalle && <p className="m-0 text-xs text-muted-foreground">{detalle}</p>}
      </div>
      {children}
    </section>
  );
}

function Kpi({ titulo, valor, apoyo }: { titulo: string; valor: ReactNode; apoyo?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[10px] border border-border bg-card px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <span className="text-lg font-bold tabular-nums">{valor}</span>
      {apoyo && <span className="text-xs text-muted-foreground">{apoyo}</span>}
    </div>
  );
}

const etiquetaRecomendacion = (r: ProductoPerfil["recomendacion"]) => RECOMENDACIONES.find((x) => x.valor === r)?.etiqueta ?? r;

/** Un producto del proveedor en la ficha: foto (se amplía), nombre, categoría y stock, precio, ventas y qué hacer. */
function FilaProducto({ x, pais, conRecomendacion = true }: { x: ProductoPerfil; pais: string; conRecomendacion?: boolean }) {
  const enDolares = pais !== "pa" && x.precioUsd !== null;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <FotoAmpliable url={x.foto} nombre={x.nombre} tam="h-11 w-11" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="line-clamp-2 text-sm font-medium" title={x.nombre}>
            {x.nombre}
          </span>
          {x.nuevo && <Badge tone="azul">Nuevo</Badge>}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {[x.categoria, x.stock !== null ? `${formatoNumero(x.stock)} u. en stock` : null].filter(Boolean).join(" · ")}
          {x.nuestro ? ` · Se parece a «${x.nuestro}»` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <span className="text-sm font-semibold tabular-nums">{enDolares ? formatoUsd(x.precioUsd) : formatoPrecio(x.precio, pais)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{x.ventas30 ? `~${formatoNumero(x.ventas30)} u. en 30 d` : "sin ventas estimadas"}</span>
      </span>
      {conRecomendacion && (
        <span className={`hidden w-28 shrink-0 justify-center rounded-[5px] px-2 py-0.5 text-center text-xs font-medium sm:inline-flex ${CLASE_RECOMENDACION[x.recomendacion]}`}>
          {etiquetaRecomendacion(x.recomendacion)}
        </span>
      )}
    </li>
  );
}

function ListaProductos({ productos, pais, vacio, total, conRecomendacion }: { productos: ProductoPerfil[]; pais: string; vacio: string; total?: number; conRecomendacion?: boolean }) {
  if (!productos.length) return <p className="m-0 rounded-[10px] border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <div className="flex flex-col gap-1">
      <ul className="m-0 list-none divide-y divide-border rounded-[10px] border border-border bg-card px-3 py-0">
        {productos.map((x) => (
          <FilaProducto key={x.id} x={x} pais={pais} conRecomendacion={conRecomendacion} />
        ))}
      </ul>
      {total !== undefined && total > productos.length && (
        <p className="m-0 text-xs text-muted-foreground">
          {productos.length} de {formatoNumero(total)}. Los demás, en la lista de{" "}
          <Link href="/scraping-proveedores" className="underline underline-offset-2">
            Scraping de proveedores
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/**
 * La ficha completa de un proveedor (3 nov 2026, pedido de Hernán: «toda la información de ese proveedor»): sus cifras en Dropi y las
 * nuestras, sus categorías fuertes, lo que tiene y nosotros no (lo primero que hay que mirar), lo que más vende, lo nuevo, lo que ya
 * tenemos de él y sus cifras por fecha.
 */
function FichaProveedor({ p, puesto, puedeEscribir }: { p: ResumenProveedor; puesto: number; puedeEscribir: boolean }) {
  const f = p.perfil;
  const cifras = p.registros[0] ?? null;
  const previas = p.registros[1] ?? null;
  const pedida = p.busqueda?.estado === "pendiente" || p.busqueda?.estado === "corriendo";
  const maxCategoria = Math.max(1, ...f.categorias.map((c) => (f.ventas30 ? c.ventas30 : c.productos)));
  const precio = (local: number, usd: number | null) => (p.pais !== "pa" && usd !== null ? formatoUsd(usd) : formatoPrecio(local, p.pais));
  return (
    <div className="flex flex-col gap-6 p-5">
      <div className="flex items-start gap-4">
        <LogoProveedor p={p} tam="h-20 w-20" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <Puesto i={puesto} />
            {p.verificado && <Badge tone="success">Verificado</Badge>}
            {p.vigilado && <Badge tone="warning">Vigilado · {p.vigilado}</Badge>}
          </span>
          <p className="m-0 text-sm text-muted-foreground">
            {nombrePais(p.pais)} · Proveedor {p.dropiId} en Dropi ·{" "}
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
              Abrir en Dropi <EnlaceIcon className="h-3.5 w-3.5" />
            </a>
          </p>
          <p className="m-0 text-xs">
            <span className="text-muted-foreground">Última búsqueda: </span>
            <EstadoBusqueda b={p.busqueda} />
            {p.busqueda?.estado === "lista" && p.busqueda.duracionMs !== null ? ` · duró ${duracion(p.busqueda.duracionMs)}` : ""}
          </p>
          {puedeEscribir && (
            <div className="mt-1 flex flex-wrap gap-2">
              <AnotarCifras proveedor={p} />
              <BuscarAhora proveedorId={p.id} pedida={pedida} />
            </div>
          )}
        </div>
      </div>

      <Seccion titulo="En Dropi" detalle="Lo que muestra Dropi en su página, comparado con las cifras anteriores.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Kpi titulo="Órdenes" valor={cifras ? formatoNumero(cifras.ordenes) : "—"} apoyo={cifras && previas ? <Delta ahora={cifras.ordenes} antes={previas.ordenes} /> : undefined} />
          <Kpi titulo="Dropshippers" valor={cifras ? formatoNumero(cifras.dropshippers) : "—"} apoyo={cifras && previas ? <Delta ahora={cifras.dropshippers} antes={previas.dropshippers} /> : undefined} />
          <Kpi titulo="Productos (Dropi)" valor={cifras ? formatoNumero(cifras.productos) : "—"} apoyo={cifras && previas ? <Delta ahora={cifras.productos} antes={previas.productos} /> : undefined} />
        </div>
      </Seccion>

      <Seccion titulo="Lo que vemos de sus productos" detalle="Ventas estimadas = lo que bajó su stock entre búsquedas (Dropi no muestra ventas ajenas).">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi titulo="Publicados" valor={formatoNumero(f.activos)} apoyo={f.desaparecidos ? `${formatoNumero(f.desaparecidos)} ya no aparecen` : undefined} />
          <Kpi titulo="Ventas 30 d" valor={f.ventas30 ? `~${formatoNumero(f.ventas30)} u.` : "—"} apoyo={f.ventas7 ? `~${formatoNumero(f.ventas7)} u. en 7 d` : undefined} />
          <Kpi titulo="No los tenemos" valor={<span className="text-primario">{formatoNumero(f.noTenemosTotal)}</span>} apoyo={`${formatoNumero(p.paraTestear)} para testear`} />
          <Kpi titulo="Ya los tenemos" valor={formatoNumero(f.tenemosTotal)} apoyo={`${formatoNumero(f.nuevosTotal)} nuevos en 14 d`} />
        </div>
        {f.precios && (
          <p className="m-0 text-sm text-muted-foreground">
            Precios de proveedor: desde <span className="font-semibold text-foreground">{precio(f.precios.minimo, f.precios.minimoUsd)}</span>, la mitad por debajo de{" "}
            <span className="font-semibold text-foreground">{precio(f.precios.mediana, f.precios.medianaUsd)}</span>, hasta{" "}
            <span className="font-semibold text-foreground">{precio(f.precios.maximo, f.precios.maximoUsd)}</span>. Stock publicado: {formatoNumero(f.stock)} u.
          </p>
        )}
      </Seccion>

      <Seccion titulo="Categorías fuertes" detalle={f.ventas30 ? "Por ventas estimadas de 30 días (y cuántos productos tiene en cada una)." : "Por cantidad de productos (todavía sin ventas estimadas)."}>
        {f.categorias.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Sin productos leídos todavía.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {f.categorias.map((c) => {
              const valor = f.ventas30 ? c.ventas30 : c.productos;
              return (
                <li key={c.nombre} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                  <span className="truncate" title={c.nombre}>
                    {c.nombre}
                  </span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primario" style={{ width: `${Math.max(3, (valor / maxCategoria) * 100)}%` }} />
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {f.ventas30 ? `~${formatoNumero(c.ventas30)} u. · ` : ""}
                    {formatoNumero(c.productos)} {c.productos === 1 ? "producto" : "productos"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Lo que tiene y nosotros no" detalle="Ni testeado, ni en Producto, ni comprado, ni publicado por nosotros. Primero lo que conviene testear, luego lo que se mueve.">
        <ListaProductos productos={f.noTenemos} pais={p.pais} total={f.noTenemosTotal} vacio="De lo que publica, todo lo tenemos ya." />
      </Seccion>

      <Seccion titulo="Lo que más vende" detalle="Ventas estimadas de los últimos 30 días.">
        <ListaProductos productos={f.masVendidos} pais={p.pais} vacio="Todavía sin ventas estimadas: se ven desde su segunda búsqueda." />
      </Seccion>

      <Seccion titulo="Lo nuevo" detalle="Publicado hace menos de 14 días.">
        <ListaProductos productos={f.nuevos} pais={p.pais} total={f.nuevosTotal} vacio="No publicó nada nuevo en 14 días." />
      </Seccion>

      <Seccion titulo="Lo que ya tenemos de él" detalle="Igual a algo nuestro (Test, Producto, Compras o Gestión de IDs Dropi) o marcado «Ya lo tenemos».">
        <ListaProductos productos={f.tenemos} pais={p.pais} total={f.tenemosTotal} conRecomendacion={false} vacio="Nada de lo suyo lo tenemos." />
      </Seccion>

      <Seccion titulo="Cifras por fecha" detalle="Órdenes, productos y dropshippers que mostró Dropi en cada búsqueda (o escritas a mano).">
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
              {p.registros.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${claseCeldaColumna} text-center text-muted-foreground`}>
                    Sin cifras todavía.
                  </td>
                </tr>
              )}
              {p.registros.map((r, i, lista) => {
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
      </Seccion>
    </div>
  );
}
