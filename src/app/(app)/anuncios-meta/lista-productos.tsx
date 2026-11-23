"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { fieldClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Ventana } from "@/components/ui/ventana";
import { AnunciosIcon, ChevronRightIcon, EstadoIcon, FiltroIcon, MargenIcon, ProductoIcon } from "@/lib/nav-icons";
import { CATALOGO_COLUMNAS, valorColumna, type ClaveColumna } from "@/lib/meta-ads/columnas";
import { confiable, cpa, dolares, resultado } from "@/lib/meta-ads/metricas";
import { angulosDeProducto } from "@/lib/meta-ads/productos";
import { claveDeProducto } from "@/lib/meta-ads/nombre";
import type { CampanaVista, ProductoVista, VideoVista } from "@/lib/meta-ads/vistas";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CeldasColumnas, EncabezadoColumnas, estiloRejilla, SelectorColumnasMeta, useColumnasMeta } from "./columnas-meta";
import { DEF_PRODUCTOS } from "./def-productos";
import { AVISO_POCA_DATA, Cifra, InsigniaEtapa, MetricasEnLinea, Nivel } from "./piezas";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = { nombre: ProductoIcon, veredicto: MargenIcon, datos: FiltroIcon, activas: EstadoIcon, gasto: MargenIcon, compras: MargenIcon, cpa: MargenIcon, campanas: AnunciosIcon, videos: AnunciosIcon };

/** Las columnas de la vista por producto cuando nadie ha elegido otras: lo que se gastó, lo que se vendió y cómo rinden los anuncios. */
const COLUMNAS_PRODUCTOS: ClaveColumna[] = ["gasto", "compras", "cpa", "roas", "ctr", "hook", "cvr", "resultado"];

const idDe = (p: ProductoVista) => p.clave || "sin-producto";

type Criterio = "gasto" | "compras" | "cpa" | "roas" | "resultado" | "campanas" | "nombre";
const CRITERIOS: { valor: Criterio; etiqueta: string; sentido: "asc" | "desc" }[] = [
  { valor: "gasto", etiqueta: "Gasto", sentido: "desc" },
  { valor: "compras", etiqueta: "Compras", sentido: "desc" },
  { valor: "cpa", etiqueta: "CPA (el más bajo primero)", sentido: "asc" },
  { valor: "roas", etiqueta: "ROAS", sentido: "desc" },
  { valor: "resultado", etiqueta: "Resultado estimado", sentido: "desc" },
  { valor: "campanas", etiqueta: "Campañas", sentido: "desc" },
  { valor: "nombre", etiqueta: "Nombre", sentido: "asc" },
];

/** El valor por el que se ordena; null = sin dato (va siempre al final). */
function claveDe(p: ProductoVista, c: Criterio): number | string | null {
  switch (c) {
    case "gasto":
      return p.r.gasto;
    case "compras":
      return p.r.compras;
    case "cpa":
      return cpa(p.r);
    case "roas":
      return p.r.gasto > 0 && p.r.valor > 0 ? p.r.valor / p.r.gasto : null;
    case "resultado":
      return p.r.gasto > 0 ? resultado(p.r, p.tope) : null;
    case "campanas":
      return p.campanas;
    case "nombre":
      return p.nombre.toLocaleLowerCase("es");
  }
}

function ordenar(lista: ProductoVista[], c: Criterio, sentido: "asc" | "desc"): ProductoVista[] {
  const signo = sentido === "asc" ? 1 : -1;
  return [...lista].sort((a, b) => {
    const x = claveDe(a, c);
    const y = claveDe(b, c);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y), "es") : x - y) * signo;
  });
}

function FilaProducto({ p, columnas, alAbrir }: { p: ProductoVista; columnas: ClaveColumna[]; alAbrir: () => void }) {
  const ok = confiable(p.r);
  return (
    <button type="button" onClick={alAbrir} style={estiloRejilla(columnas.length)} className="grid w-full cursor-pointer grid-cols-1 items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground lg:[grid-template-columns:var(--columnas-meta)]">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{p.nombre}</span>
        <span className="truncate text-xs text-muted-foreground">
          {p.campanas} {p.campanas === 1 ? "campaña" : "campañas"} ({p.activas} {p.activas === 1 ? "activa" : "activas"}) · {p.videos} {p.videos === 1 ? "video" : "videos"}
          {ok ? "" : " · poca data"}
        </span>
      </span>
      <CeldasColumnas columnas={columnas} r={p.r} ctx={{ tope: p.tope, etapa: "venta", confiable: ok }} />
      <ChevronRightIcon aria-hidden="true" className="hidden h-4 w-4 text-muted-foreground lg:block" />
    </button>
  );
}

/** La ficha de un producto: lo que sumó en el periodo con todas sus cifras, los ángulos que usa, sus campañas y sus videos. */
function FichaProducto({ p, campanas, videos, alCerrar }: { p: ProductoVista | undefined; campanas: CampanaVista[]; videos: VideoVista[]; alCerrar: () => void }) {
  const delProducto = useMemo(() => (p ? campanas.filter((c) => claveDeProducto(c.producto) === p.clave).sort((a, b) => b.r.gasto - a.r.gasto) : []), [p, campanas]);
  const angulos = useMemo(() => (p ? angulosDeProducto(videos, p.clave) : []), [p, videos]);
  const susVideos = useMemo(() => (p ? videos.filter((v) => claveDeProducto(v.producto) === p.clave).sort((a, b) => b.r.gasto - a.r.gasto).slice(0, 8) : []), [p, videos]);
  return (
    <Ventana abierto={!!p} alCerrar={alCerrar} lado="derecha" ancho="lg" titulo={p && <span className="min-w-0 break-words text-lg font-semibold">{p.nombre}</span>}>
      {p && (
        <div className="flex flex-col divide-y divide-border px-5 py-5">
          <Seccion icono={MargenIcon} titulo="Cómo le va en el periodo">
            <p className="m-0 text-sm text-muted-foreground">
              Con un CPA tope de {dolares(p.tope)}
              {p.topeDefinido ? "" : " (el de por defecto: defínelo en Cuentas)"}.
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
              {CATALOGO_COLUMNAS.filter((c) => c.clave !== "frecuencia").map((c) => {
                const v = valorColumna(c.clave, p.r, { tope: p.tope, etapa: "venta", confiable: confiable(p.r) });
                return <Cifra key={c.clave} titulo={c.titulo} valor={v.texto} nivel={v.nivel} />;
              })}
            </div>
            {!confiable(p.r) && <p className="m-0 text-xs text-muted-foreground">{AVISO_POCA_DATA}</p>}
          </Seccion>

          <Seccion icono={FiltroIcon} titulo={`Ángulos que usa (${angulos.length})`}>
            {angulos.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Todavía no hay videos de este producto con ángulo (se miran los últimos 30 días).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-left text-sm">
                  <caption className="sr-only">Ángulos del producto con lo que gastó y vendió cada uno en los últimos 30 días</caption>
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th scope="col" className="py-1.5 pr-3 font-medium">Ángulo</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Videos</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Gasto</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Compras</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">CPA</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Hook</th>
                      <th scope="col" className="pl-2 py-1.5 text-right font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {angulos.map((a) => {
                      const ctx = { tope: p.tope, etapa: "venta", confiable: confiable(a.r) };
                      return (
                        <tr key={a.angulo} className="border-t border-border tabular-nums">
                          <th scope="row" className="py-1.5 pr-3 text-left font-medium">{a.angulo}</th>
                          <td className="px-2 py-1.5 text-right">{a.videos}</td>
                          {(["gasto", "compras", "cpa", "hook", "ctr"] as const).map((k, i) => {
                            const v = valorColumna(k, a.r, ctx);
                            return (
                              <td key={k} className={`${i === 4 ? "pl-2" : "px-2"} py-1.5 text-right`}>
                                <Nivel nivel={v.nivel}>{v.texto}</Nivel>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>

          <Seccion icono={AnunciosIcon} titulo={`Campañas (${delProducto.length})`}>
            <ul role="list" className="m-0 flex list-none flex-col gap-2 p-0">
              {delProducto.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 rounded-lg border border-border p-2.5">
                  <Link href={`/anuncios-meta/campanas?abrir=${c.id}`} className="truncate text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                    {c.nombre}
                  </Link>
                  <p className="m-0 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <InsigniaEtapa etapa={c.etapa} />
                    {c.activa ? "Activa" : "Apagada"}
                    {c.angulo ? ` · ${c.angulo}` : ""}
                  </p>
                  {c.r.gasto > 0 && <MetricasEnLinea r={c.r} tope={c.tope} etapa={c.etapa} completa frecuencia={c.frecuencia} />}
                </li>
              ))}
            </ul>
          </Seccion>

          {susVideos.length > 0 && (
            <Seccion icono={AnunciosIcon} titulo="Sus videos con más gasto (últimos 30 días)">
              <ul role="list" className="m-0 flex list-none flex-col gap-2 p-0">
                {susVideos.map((v) => (
                  <li key={v.id} className="flex flex-col gap-1 rounded-lg border border-border p-2.5">
                    <Link href={`/anuncios-meta/videos?abrir=${v.id}`} className="truncate text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                      {v.numero ? `${v.numero} · ` : ""}
                      {v.nombre}
                    </Link>
                    <p className="m-0 text-xs text-muted-foreground">{v.analisis?.angulo ?? v.angulo ?? "Ángulo sin analizar"}</p>
                    {v.r.gasto > 0 && <MetricasEnLinea r={v.r} tope={v.tope} etapa="venta" />}
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
        </div>
      )}
    </Ventana>
  );
}

/** Todos los productos con lo que sumaron sus campañas en el periodo, con la barra común, un orden a elegir y las columnas que cada persona quiera ver. Tocar uno abre su ficha (`?abrir=<producto>`). */
export function ListaProductos({ productos, campanas, videos, abrirInicial }: { productos: ProductoVista[]; campanas: CampanaVista[]; videos: VideoVista[]; abrirInicial: string | null }) {
  const [columnas, guardarColumnas, restablecerColumnas] = useColumnasMeta("productos", COLUMNAS_PRODUCTOS);
  const [criterio, setCriterio] = useState<Criterio>("gasto");
  const [sentido, setSentido] = useState<"asc" | "desc">("desc");
  const [abierto, setAbierto] = useState<string | null>(() => (abrirInicial && productos.some((p) => idDe(p) === abrirInicial) ? abrirInicial : null));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (abierto) url.searchParams.set("abrir", abierto);
    else url.searchParams.delete("abrir");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [abierto]);
  // La ficha se dibuja en `<body>` (portal): con `?abrir=` arranca abierta, así que solo se monta ya en el navegador.
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const ordenados = useMemo(() => ordenar(productos, criterio, sentido), [productos, criterio, sentido]);
  const p = enNavegador ? productos.find((x) => idDe(x) === abierto) : undefined;
  const hayPocaData = productos.some((x) => x.r.gasto > 0 && !confiable(x.r));
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Ordenar por</span>
          <select
            value={criterio}
            onChange={(e) => {
              const c = e.target.value as Criterio;
              setCriterio(c);
              setSentido(CRITERIOS.find((x) => x.valor === c)?.sentido ?? "desc");
            }}
            className={`${fieldClassSm} w-auto min-w-[14rem]`}
          >
            {CRITERIOS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setSentido(sentido === "asc" ? "desc" : "asc")}
          aria-label={`Cambiar el orden: ahora va de ${sentido === "asc" ? "menor a mayor" : "mayor a menor"}`}
          className="min-h-8 rounded-md border border-border-control bg-card px-3 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        >
          {criterio === "nombre" ? (sentido === "asc" ? "A → Z" : "Z → A") : sentido === "asc" ? "De menor a mayor ↑" : "De mayor a menor ↓"}
        </button>
        <span className="ml-auto">
          <SelectorColumnasMeta titulo="Productos" columnas={columnas} alCambiar={guardarColumnas} alRestablecer={restablecerColumnas} sinFrecuencia />
        </span>
      </div>
      <ListaDatos
        def={DEF_PRODUCTOS}
        filas={ordenados}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={idDe}
        variante="filas"
        encabezado={<EncabezadoColumnas nombre="Producto" columnas={columnas} />}
        renderFila={(x) => <FilaProducto p={x} columnas={columnas} alAbrir={() => setAbierto(idDe(x))} />}
        vacio="Todavía no hay campañas con producto en este periodo."
      />
      {hayPocaData && <p className="m-0 text-xs text-muted-foreground">{AVISO_POCA_DATA}</p>}
      <FichaProducto p={p} campanas={campanas} videos={videos} alCerrar={() => setAbierto(null)} />
    </>
  );
}
