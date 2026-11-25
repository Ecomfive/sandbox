"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fieldClassSm } from "@/components/ui/field";
import { filtrarProductos } from "@/lib/meta-ads/topes";
import type { VistaActividad } from "@/lib/meta-ads/en-marcha";
import { claveDeProducto } from "@/lib/meta-ads/nombre";
import { SelectorActividad } from "./selector-actividad";
import { ordenarPor, type Orden } from "@/lib/meta-ads/orden";
import { CRITERIOS_GRUPOS } from "@/lib/meta-ads/orden-listas";
import { Tooltip } from "@/components/ui/tooltip";
import { DIMENSIONES_ANUNCIO, DIMENSIONES_CAMPANA, type DimensionAnuncio, type DimensionCampana, type GruposMeta } from "@/lib/meta-ads/datos";
import { DIMENSIONES_VIDEO, EXPLICACION_DIMENSION_VIDEO, esGanador, esPerdedor, mejorGrupo, MEZCLA_DE_ANGULOS, sumaDeGrupos, UMBRAL_DOMINANTE, usoDelTope, ventajaDeCpa, type DimensionVideo, type GruposDeVideo } from "@/lib/meta-ads/atributos-video";
import { ctr, dolares, dolaresEnteros, hookRate, motivoDeCerteza, nivelDeCtr, nivelDeHook, type Resultados } from "@/lib/meta-ads/metricas";
import type { Grupo } from "@/lib/meta-ads/vistas";
import { ClasificarGanchos } from "./clasificar-ganchos";
import { BarraProgreso, InsigniaCerteza, TarjetaMeta } from "./graficas";
import { AVISO_POCA_DATA, entero, Nivel, porcentaje, Resultado, valorCpa } from "./piezas";
import { SeccionPlegable } from "./plegable";
import { ColumnaOrdenable } from "./columna-ordenable";

type Seccion = "videos" | "campanas" | "anuncios" | "productos";
const SECCIONES: { id: Seccion; nombre: string; detalle: string }[] = [
  { id: "videos", nombre: "Videos", detalle: "Lo que la IA saca de cada video" },
  { id: "campanas", nombre: "Campañas", detalle: "Cómo está montada cada campaña" },
  { id: "anuncios", nombre: "Anuncios", detalle: "El texto y la página de destino" },
  { id: "productos", nombre: "Productos", detalle: "Qué producto rinde mejor" },
];

const EXPLICACION_CAMPANA: Record<DimensionCampana, string> = {
  Ángulo: "El ángulo con que se clasifica cada campaña: el que usa la mayoría de sus videos.",
  Estructura: "CBO (el presupuesto está en la campaña) o ABO (en cada conjunto de anuncios).",
  Puja: "La estrategia de puja de la campaña: sin tope, bid cap, cost cap…",
  Producto: "Qué producto vende la campaña, según su nombre.",
  Etapa: "Testing, ventas, escala o retargeting: ventas es lo que ya salió de Test.",
};
const EXPLICACION_ANUNCIO: Record<DimensionAnuncio, string> = {
  Copy: "El texto principal del anuncio: los anuncios que dicen lo mismo se juntan.",
  Landing: "La página a la que lleva el anuncio, sin parámetros ni rastreo.",
};

interface Conclusion {
  etiqueta: string;
  dimension: string;
  grupo: Grupo | null;
  total: Resultados;
  unidad: string;
}

function conclusion(etiqueta: string, dimension: string, grupos: Grupo[], unidad: string): Conclusion {
  return { etiqueta, dimension, grupo: mejorGrupo(grupos), total: sumaDeGrupos(grupos).r, unidad };
}

/**
 * «Qué funciona»: lo que ya se puede dar por cierto, arriba, y debajo cada forma de medir (los datos de los videos, cómo está montada la campaña, el texto y la landing) de mejor a peor CPA, con qué tan seguro es cada
 * resultado. El ángulo de una campaña es la mezcla de los ángulos de sus videos; el de un video lo saca la IA al verlo (o se corrige a mano en su ficha).
 */
export function QueFunciona({ productos, productoActual, ver, grupos, gruposVideo, videosSinAngulo, ganchosSinTipo, iaConectada, escribe }: { grupos: GruposMeta; gruposVideo: GruposDeVideo; videosSinAngulo: number; ganchosSinTipo: number; iaConectada: boolean; escribe: boolean; /** Los productos con campañas (los que están en marcha primero), para ver qué funciona de uno solo. */ productos: { clave: string; nombre: string; enMarcha: boolean }[]; productoActual: string | null; /** De qué se está aprendiendo cuando no hay un producto elegido. */ ver: VistaActividad }) {
  const router = useRouter();
  const [seccion, setSeccion] = useState<Seccion>("videos");
  const [dimVideo, setDimVideo] = useState<DimensionVideo>("Ángulo");
  const [dimCampana, setDimCampana] = useState<DimensionCampana>("Ángulo");
  const [dimAnuncio, setDimAnuncio] = useState<DimensionAnuncio>("Copy");
  // Lo que se escribe para encontrar un producto en la lista de Productos.
  const [buscarProducto, setBuscarProducto] = useState("");
  const [escrito, setEscrito] = useState<string | null>(null);

  const conclusiones: Conclusion[] = [
    conclusion("Ángulo del video", "Ángulo", gruposVideo.grupos["Ángulo"], "videos"),
    conclusion("Gancho", "Gancho", gruposVideo.grupos.Gancho, "videos"),
    conclusion("Formato del video", "Formato", gruposVideo.grupos.Formato, "videos"),
    conclusion("Llamado a la acción", "Llamado a la acción", gruposVideo.grupos["Llamado a la acción"], "videos"),
    conclusion("Estructura del video", "Estructura", gruposVideo.grupos.Estructura, "videos"),
    conclusion("Duración", "Duración", gruposVideo.grupos.Duración, "videos"),
    conclusion("Ángulo de la campaña", "Ángulo", grupos.campana["Ángulo"].filter((g) => g.nombre !== MEZCLA_DE_ANGULOS), "campañas"),
    conclusion("CBO o ABO", "Estructura", grupos.campana.Estructura, "campañas"),
    conclusion("Puja", "Puja", grupos.campana.Puja, "campañas"),
  ];
  const hayAlgo = conclusiones.some((c) => c.grupo);

  const lista = seccion === "videos" ? gruposVideo.grupos[dimVideo] : seccion === "campanas" ? grupos.campana[dimCampana] : seccion === "productos" ? grupos.campana.Producto : grupos.anuncio[dimAnuncio];
  const dimActual = seccion === "videos" ? dimVideo : seccion === "campanas" ? dimCampana : seccion === "productos" ? "Producto" : dimAnuncio;
  const unidad = seccion === "videos" ? "Videos" : "Campañas";
  const sinDato = seccion === "videos" ? gruposVideo.sinDato[dimVideo] : 0;
  const vacio =
    seccion === "videos"
      ? "Ningún video con gasto en el periodo tiene este dato todavía. Los datos se leen de cada video: analízalos en la pestaña Videos."
      : seccion === "campanas"
        ? `Ninguna campaña con gasto en el periodo ${dimCampana === "Ángulo" ? "tiene videos con ángulo todavía" : dimCampana === "Producto" || dimCampana === "Etapa" ? `trae ${dimCampana === "Etapa" ? "etapa" : "producto"} en el nombre. Ponlo en el nombre de la campaña o corrígelo en su ficha` : "trae este dato"}.`
        : seccion === "productos"
          ? "Ninguna campaña con producto y gasto en el periodo."
          : "No hay anuncios con gasto en el periodo.";

  const elegirProducto = (clave: string) => {
    const url = new URL(window.location.href);
    if (clave) url.searchParams.set("producto", clave);
    else url.searchParams.delete("producto");
    router.push(`${url.pathname}${url.search}`);
  };
  const elegirVista = (v: VistaActividad) => {
    const url = new URL(window.location.href);
    if (v === "activos") url.searchParams.delete("ver");
    else url.searchParams.set("ver", v);
    router.push(`${url.pathname}${url.search}`);
  };
  const nombreProducto = productos.find((p) => p.clave === productoActual)?.nombre ?? null;
  return (
    <div className="flex flex-col gap-6">
      {!productoActual && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SelectorActividad etiqueta="De qué productos aprender" vista={ver} alCambiar={elegirVista} textos={{ activos: "En marcha", apagados: "Apagados", todos: "Todo" }} />
          <p className="m-0 min-w-0 flex-1 basis-64 text-xs text-muted-foreground">
            {ver === "activos" ? "Lo que funciona en los productos que se están anunciando." : ver === "apagados" ? "Lo que pasó con los productos que ya no se anuncian, en el periodo elegido arriba." : "Todos los productos del periodo elegido arriba."}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Ver por producto</span>
          <input
            type="search"
            list="productos-que-funciona"
            value={escrito ?? nombreProducto ?? ""}
            onChange={(e) => {
              setEscrito(e.target.value);
              // Al escribir el nombre completo (o elegirlo de la lista) se abre ese producto.
              const exacto = productos.find((p) => p.nombre.toLocaleLowerCase("es") === e.target.value.trim().toLocaleLowerCase("es"));
              if (exacto) {
                setEscrito(null);
                elegirProducto(exacto.clave);
              }
            }}
            placeholder="Escribe el nombre de un producto"
            autoComplete="off"
            className={`${fieldClassSm} w-[min(22rem,80vw)]`}
          />
          <datalist id="productos-que-funciona">
            {filtrarProductos(productos.map((p) => ({ producto: p.nombre, enMarcha: p.enMarcha })), escrito ?? "").slice(0, 60).map((p) => (
              <option key={p.producto} value={p.producto} label={p.enMarcha ? "En marcha" : "Apagado"} />
            ))}
          </datalist>
        </label>
        {productoActual && (
          <button type="button" onClick={() => { setEscrito(null); elegirProducto(""); }} className="min-h-8 rounded-md border border-border-control bg-card px-3 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
            Ver todos los productos
          </button>
        )}
        <p className="m-0 text-xs text-muted-foreground">{nombreProducto ? `Todo lo de abajo sale solo de «${nombreProducto}».` : "Escribe o elige un producto para ver qué ángulos, ganchos y formatos funcionan con él."}</p>
      </div>
      <SeccionPlegable titulo="Lo que ya sabemos" resumen={`${conclusiones.filter((c) => c.grupo).length} de ${conclusiones.length} con datos suficientes`} derecha={<span className="hidden sm:inline">Firme: datos de sobra · Probable: falta data · Poca data: menos de $100</span>}>
        {!hayAlgo ? (
          <p className="m-0 text-sm text-muted-foreground">Todavía no hay nada con datos suficientes ($100 gastados y alguna compra). A medida que se gaste, aquí va saliendo lo que funciona.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {(["videos", "campañas"] as const).map((u) => (
              <div key={u} className="flex flex-col gap-2">
                <h3 className="m-0 text-xs font-semibold text-muted-foreground">{u === "videos" ? "En los videos" : "En las campañas"}</h3>
                <ul role="list" className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-3 p-0">
                  {conclusiones.filter((c) => c.unidad === u).map((c) => (
                    <TarjetaConclusion key={c.etiqueta} c={c} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SeccionPlegable>

      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Qué medir" className="flex flex-wrap gap-1.5">
          {SECCIONES.map((x) => (
            <button key={x.id} type="button" aria-pressed={seccion === x.id} onClick={() => setSeccion(x.id)} className={`inline-flex min-h-9 flex-col items-start justify-center rounded-lg border px-3.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${seccion === x.id ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`}>
              <span className="text-sm font-semibold leading-tight">{x.nombre}</span>
              <span className={`text-[11px] leading-tight ${seccion === x.id ? "opacity-80" : "text-muted-foreground"}`}>{x.detalle}</span>
            </button>
          ))}
        </div>
        <div role="group" aria-label="Ver por" className="flex flex-wrap gap-1.5">
          {seccion === "videos" &&
            DIMENSIONES_VIDEO.map((d) => (
              <Chip key={d} activo={d === dimVideo} texto={d} ayuda={EXPLICACION_DIMENSION_VIDEO[d]} alPulsar={() => setDimVideo(d)} />
            ))}
          {seccion === "campanas" &&
            DIMENSIONES_CAMPANA.map((d) => (
              <Chip key={d} activo={d === dimCampana} texto={d} ayuda={EXPLICACION_CAMPANA[d]} alPulsar={() => setDimCampana(d)} />
            ))}
          {seccion === "anuncios" &&
            DIMENSIONES_ANUNCIO.map((d) => (
              <Chip key={d} activo={d === dimAnuncio} texto={d} ayuda={EXPLICACION_ANUNCIO[d]} alPulsar={() => setDimAnuncio(d)} />
            ))}
        </div>
      </div>

      {seccion === "videos" && dimVideo === "Gancho" && escribe && <ClasificarGanchos pendientes={ganchosSinTipo} iaConectada={iaConectada} />}
      {seccion === "videos" && dimVideo === "Ángulo" && videosSinAngulo > 0 && (
        <p className="m-0 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
          {videosSinAngulo} {videosSinAngulo === 1 ? "video con gasto en el periodo todavía no tiene" : "videos con gasto en el periodo todavía no tienen"} ángulo, así que no cuentan aquí.{" "}
          <Link href="/anuncios-meta/videos" className="font-medium text-foreground underline underline-offset-2">
            Analizarlos en Videos
          </Link>
        </p>
      )}
      {seccion === "campanas" && dimCampana === "Ángulo" && (
        <p className="m-0 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
          Una campaña cuenta en el ángulo que usan {UMBRAL_DOMINANTE} % o más de sus videos; si ninguno llega, va en «{MEZCLA_DE_ANGULOS}». Cada una muestra su mezcla en Campañas.
        </p>
      )}

      {seccion === "productos" && productoActual ? (
        <DetalleDeProducto
          nombre={nombreProducto ?? lista[0]?.nombre ?? "Producto"}
          grupo={lista[0] ?? null}
          gruposVideo={gruposVideo}
          dimVideo={dimVideo}
          alElegirDimension={setDimVideo}
        />
      ) : lista.length === 0 ? (
        <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">{vacio}</p>
      ) : seccion === "productos" ? (
        <>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Buscar un producto</span>
            <input type="search" value={buscarProducto} onChange={(e) => setBuscarProducto(e.target.value)} placeholder="Parte del nombre, sin importar acentos" autoComplete="off" className={`${fieldClassSm} w-[min(22rem,80vw)]`} />
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {buscarProducto.trim() ? `${filtrarProductos(lista.map((g) => ({ ...g, producto: g.nombre })), buscarProducto).length} de ${lista.length} productos` : `${lista.length} productos`}
            </span>
          </label>
          <p className="m-0 text-xs text-muted-foreground">Toca un producto para ver sus ángulos, ganchos, formatos, llamados a la acción y lo demás que se mide en sus videos.</p>
          <TablaDeGrupos
            grupos={lista}
            filas={filtrarProductos(lista.map((g) => ({ ...g, producto: g.nombre })), buscarProducto)}
            dimension="Producto"
            unidad="Campañas"
            sinDato={0}
            porVideo={false}
            alElegir={(g) => {
              const p = productos.find((x) => x.clave === claveDeProducto(g.nombre));
              if (p) elegirProducto(p.clave);
            }}
          />
        </>
      ) : (
        <TablaDeGrupos grupos={lista} dimension={dimActual} unidad={unidad} sinDato={sinDato} porVideo={seccion === "videos"} />
      )}
    </div>
  );
}

function Chip({ activo, texto, ayuda, alPulsar }: { activo: boolean; texto: string; ayuda: string; alPulsar: () => void }) {
  return (
    <Tooltip texto={ayuda}>
      <button type="button" aria-pressed={activo} onClick={alPulsar} className={`min-h-9 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${activo ? "border-foreground bg-foreground text-background" : "border-border-control bg-card text-muted-foreground hover:bg-muted"}`}>
        {texto}
      </button>
    </Tooltip>
  );
}

function TarjetaConclusion({ c }: { c: Conclusion }) {
  const g = c.grupo;
  const ventaja = g ? ventajaDeCpa(g, c.total) : null;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 text-xs font-medium text-muted-foreground">{c.etiqueta}</p>
        {g && <InsigniaCerteza certeza={g.certeza} motivo={motivoDeCerteza(g.r, g.videos > 0 ? g.videos : g.campanas, g.videos > 0 ? "videos" : "campañas")} />}
      </div>
      {g ? (
        <>
          <p className="m-0 line-clamp-2 text-base font-semibold leading-snug">{g.nombre}</p>
          {g.deQue && <p className="m-0 text-xs text-muted-foreground">De qué son: {g.deQue}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-semibold tabular-nums">CPA {valorCpa(g.r)}</span>
            {ventaja !== null && Math.abs(ventaja) >= 1 && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${ventaja < 0 ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"}`}>
                {ventaja < 0 ? `${Math.abs(ventaja).toFixed(0)} % más barato` : `${ventaja.toFixed(0)} % más caro`}
              </span>
            )}
          </div>
          {usoDelTope(g) !== null && (
            <p className="m-0 text-xs">
              Cada compra cuesta el <UsoDelTope g={g} firme /> de su CPA tope.
            </p>
          )}
          <p className="m-0 mt-auto text-xs tabular-nums text-muted-foreground">
            {g.videos > 0 && c.unidad === "videos" ? `${g.videos} ${g.videos === 1 ? "video" : "videos"}` : `${g.campanas} ${g.campanas === 1 ? "campaña" : "campañas"}`} · {dolaresEnteros(g.r.gasto)} gastados
          </p>
        </>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">Sin datos suficientes todavía{c.etiqueta === "Estructura del video" ? " (cada orden de partes se reparte entre pocos videos)" : ""}.</p>
      )}
    </li>
  );
}

/**
 * Lo que se sabe de un producto (23 nov 2026, pedido de Alcides: «ver los ángulos de ese producto y lo demás que se ve en los videos»): su resumen y, con las mismas dimensiones de la pestaña Videos
 * (ángulo, gancho, formato, llamado a la acción, recursos, estructura, duración, momento del llamado y oferta), cómo funciona cada cosa solo en sus videos. La pantalla ya está calculada con ese producto.
 */
function DetalleDeProducto({ nombre, grupo, gruposVideo, dimVideo, alElegirDimension }: { nombre: string; grupo: Grupo | null; gruposVideo: GruposDeVideo; dimVideo: DimensionVideo; alElegirDimension: (d: DimensionVideo) => void }) {
  const lista = gruposVideo.grupos[dimVideo];
  return (
    <div className="flex flex-col gap-4">
      <TarjetaMeta titulo={nombre} derecha={grupo ? `${grupo.campanas} ${grupo.campanas === 1 ? "campaña" : "campañas"} · ${dolaresEnteros(grupo.r.gasto)} gastados` : "Sin campañas con gasto en el periodo"} id="detalle-producto">
        {grupo ? (
          <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
            <span className="font-semibold">CPA {valorCpa(grupo.r)}</span>
            <span>{entero(grupo.r.compras)} compras</span>
            <span>
              CTR <Nivel nivel={nivelDeCtr(ctr(grupo.r))}>{porcentaje(ctr(grupo.r))}</Nivel>
            </span>
            <span>
              Hook <Nivel nivel={nivelDeHook(hookRate(grupo.r))}>{porcentaje(hookRate(grupo.r), 0)}</Nivel>
            </span>
            <InsigniaCerteza certeza={grupo.certeza} motivo={motivoDeCerteza(grupo.r, grupo.campanas, "campañas")} />
          </p>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">Este producto no gastó nada en el periodo elegido.</p>
        )}
      </TarjetaMeta>
      <div role="group" aria-label={`Ver de ${nombre} por`} className="flex flex-wrap gap-1.5">
        {DIMENSIONES_VIDEO.map((d) => (
          <Chip key={d} activo={d === dimVideo} texto={d} ayuda={EXPLICACION_DIMENSION_VIDEO[d]} alPulsar={() => alElegirDimension(d)} />
        ))}
      </div>
      {lista.length === 0 ? (
        <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">Ningún video de este producto con gasto en el periodo tiene este dato todavía. Los datos se leen de cada video: analízalos en la pestaña Videos.</p>
      ) : (
        <TablaDeGrupos grupos={lista} dimension={dimVideo} unidad="Videos" sinDato={gruposVideo.sinDato[dimVideo]} porVideo />
      )}
      <p className="m-0 text-xs text-muted-foreground">Cambia a Campañas o Anuncios arriba para ver lo mismo de este producto desde esas miradas.</p>
    </div>
  );
}

/** Qué parte de su CPA tope cuesta cada compra: verde lejos, ámbar cerca, rojo por encima. */
function UsoDelTope({ g, firme }: { g: Grupo; firme: boolean }) {
  const uso = usoDelTope(g);
  if (uso === null) return <>—</>;
  const color = !firme ? "" : uso > 1 ? "font-medium text-destructive" : uso >= 0.9 ? "font-medium text-warning" : "font-medium text-success";
  return (
    <span className={`tabular-nums ${color}`}>
      {Math.round(uso * 100)} %
    </span>
  );
}

/** Los grupos de una dimensión: la comparación de CPA con su promedio y la tabla completa. */
function TablaDeGrupos({ grupos, filas, alElegir, dimension, unidad, sinDato, porVideo }: { grupos: Grupo[]; /** Las filas de la tabla si son menos que los grupos (una búsqueda): los promedios y las barras siguen midiendo todos. */ filas?: Grupo[]; /** Si viene, el nombre de cada fila se puede tocar (abre ese producto). */ alElegir?: (g: Grupo) => void; dimension: string; unidad: string; sinDato: number; porVideo: boolean }) {
  const total = sumaDeGrupos(grupos);
  const promedio = total.r.compras > 0 ? total.r.gasto / total.r.compras : null;
  const conCompras = grupos.filter((g) => g.r.compras > 0).slice(0, 10);
  const maxCpa = Math.max(0.01, promedio ?? 0, ...conCompras.map((g) => g.r.gasto / g.r.compras));
  const maxGasto = Math.max(1, ...grupos.map((g) => g.r.gasto));
  const primera = mejorGrupo(grupos);
  const conSinConfiar = grupos.some((g) => !g.confiable);
  // Tocar el título de una columna ordena por ella (otra vez, al revés); sin elegir, el orden de siempre (primero lo que ya tiene datos, de menor a mayor CPA).
  const [orden, setOrden] = useState<Orden | null>(null);
  const filasOrdenadas = orden ? ordenarPor(filas ?? grupos, CRITERIOS_GRUPOS, [orden], (g) => g.r.gasto) : (filas ?? grupos);
  const columna = (criterio: string, texto: string, clase: string) => <ColumnaOrdenable criterio={criterio} texto={texto} natural={CRITERIOS_GRUPOS.find((c) => c.valor === criterio)?.sentido} clase={clase} orden={orden} alElegir={setOrden} />;
  return (
    <div className="flex flex-col gap-6">
      {conCompras.length > 1 && promedio !== null && (
        <SeccionPlegable titulo={`CPA por ${dimension.toLowerCase()}`} resumen={`Promedio de la lista: ${dolares(promedio)}`} derecha={`Promedio de la lista: ${dolares(promedio)}`}>
          <ul role="list" className="m-0 flex list-none flex-col gap-2.5 p-0">
            {conCompras.map((g) => {
              const c = g.r.gasto / g.r.compras;
              const color = !g.confiable ? "var(--grafica-5)" : c <= promedio ? "var(--success)" : c > promedio * 1.3 ? "var(--destructive)" : "var(--warning)";
              return (
                <li key={g.nombre} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-xs">
                  <span className="min-w-0">
                    <span className="block truncate" title={g.nombre}>
                      {g.nombre}
                    </span>
                    {g.deQue && <span className="line-clamp-2 text-[11px] text-muted-foreground" title={g.deQue}>{g.deQue}</span>}
                  </span>
                  <span className="relative block h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (c / maxCpa) * 100)}%`, background: color }} />
                    <span className="absolute inset-y-0 w-0.5 bg-foreground/70" style={{ left: `${(promedio / maxCpa) * 100}%` }} />
                  </span>
                  <span className="min-w-[4.5rem] text-right font-semibold tabular-nums">
                    {dolares(c)}
                    {!g.confiable && <span className="ml-1 font-normal text-muted-foreground">·</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="m-0 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-3 w-0.5 bg-foreground/70" />
              Promedio
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-success" /> Mejor que el promedio
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-warning" /> Hasta 30 % más caro
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-destructive" /> Más caro
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--grafica-5)" }} /> Poca data
            </span>
          </p>
        </SeccionPlegable>
      )}

      <SeccionPlegable titulo="Todas las cifras" sinRelleno abierta={!(conCompras.length > 1 && promedio !== null)} resumen={`${(filas ?? grupos).length} filas`} derecha={`${(filas ?? grupos).length} ${dimension.toLowerCase()}`}>
        {primera && (
          <p className="m-0 border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
            Lo que mejor funciona en {dimension.toLowerCase()}: <span className="font-medium text-foreground">{primera.nombre}</span> con CPA {valorCpa(primera.r)} y {entero(primera.r.compras)} compras.{primera.deQue ? ` De qué son: ${primera.deQue}.` : ""}
          </p>
        )}
        {orden && (
          <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground" aria-live="polite">
            Ordenado por {CRITERIOS_GRUPOS.find((c) => c.valor === orden.criterio)?.etiqueta}, {orden.sentido === "asc" ? "de menor a mayor" : "de mayor a menor"}.
            <button type="button" onClick={() => setOrden(null)} className="min-h-8 cursor-pointer rounded-md border border-border-control bg-card px-3 py-1 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              Volver al orden de siempre
            </button>
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="tabla-datos w-full min-w-[62rem] border-collapse text-sm">
            <caption className="sr-only">Resultados por {dimension.toLowerCase()}</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {columna("nombre", dimension, "px-4 py-2 text-left")}
                {columna(porVideo ? "videos" : "campanas", unidad, "px-3 py-2 text-right")}
                {columna("gasto", "Gasto", "px-3 py-2 text-right")}
                {columna("compras", "Compras", "px-3 py-2 text-right")}
                {columna("cpa", "CPA", "px-3 py-2 text-right")}
                <th scope="col" className="px-3 py-2 text-right font-medium">Frente al promedio</th>
                {columna("ctr", "CTR", "px-3 py-2 text-right")}
                {columna("hook", "Hook", "px-3 py-2 text-right")}
                {columna("tope", "De su tope", "px-3 py-2 text-right")}
                {columna("resultado", "Resultado estimado", "px-3 py-2 text-right")}
                <th scope="col" className="px-4 py-2 font-medium">Qué tan seguro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filasOrdenadas.map((g) => {
                const ventaja = ventajaDeCpa(g, total.r);
                return (
                  <tr key={g.nombre} className={g.confiable ? "" : "text-muted-foreground"}>
                    <th scope="row" className="max-w-[26rem] px-4 py-2.5 text-left font-medium">
                      {alElegir ? (
                        <button type="button" onClick={() => alElegir(g)} title={`Ver qué funciona de ${g.nombre}`} className="block max-w-full cursor-pointer truncate text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                          {g.nombre}
                        </button>
                      ) : (
                        <span className="block truncate" title={g.nombre}>
                          {g.nombre}
                        </span>
                      )}
                      {g.deQue && <span className="block whitespace-normal text-xs font-normal text-muted-foreground">De qué son: {g.deQue}</span>}
                      <span className="mt-1.5 block w-40 max-w-full">
                        <BarraProgreso valor={g.r.gasto} maximo={maxGasto} color={esGanador(g) ? "var(--success)" : esPerdedor(g) ? "var(--destructive)" : "var(--grafica-5)"} alto={4} />
                      </span>
                    </th>
                    <td className="px-3 py-2.5 text-right tabular-nums">{porVideo ? g.videos : g.campanas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{dolares(g.r.gasto)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{entero(g.r.compras)}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{g.r.compras > 0 ? valorCpa(g.r) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{ventaja === null ? "—" : <span className={!g.confiable ? "" : ventaja < 0 ? "font-medium text-success" : "font-medium text-destructive"}>{ventaja < 0 ? "−" : "+"}{Math.abs(ventaja).toFixed(0)} %</span>}</td>
                    <td className="px-3 py-2.5 text-right">{g.confiable ? <Nivel nivel={nivelDeCtr(ctr(g.r))}>{porcentaje(ctr(g.r))}</Nivel> : porcentaje(ctr(g.r))}</td>
                    <td className="px-3 py-2.5 text-right">{hookRate(g.r) === null ? "—" : g.confiable ? <Nivel nivel={nivelDeHook(hookRate(g.r))}>{porcentaje(hookRate(g.r), 0)}</Nivel> : porcentaje(hookRate(g.r), 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <UsoDelTope g={g} firme={g.confiable} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Resultado r={g.r} tope={1} valor={g.resultado} />
                    </td>
                    <td className="px-4 py-2.5">
                      <InsigniaCerteza certeza={g.certeza} motivo={motivoDeCerteza(g.r, porVideo ? g.videos : g.campanas, porVideo ? "videos" : "campañas")} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(filas ?? grupos).length === 0 && <p className="m-0 px-4 py-4 text-sm text-muted-foreground">Ningún producto tiene esas palabras en su nombre.</p>}
        </div>
        {(conSinConfiar || sinDato > 0) && (
          <p className="m-0 flex flex-col gap-1 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {conSinConfiar && <span>{AVISO_POCA_DATA}</span>}
            {sinDato > 0 && (
              <span>
                {sinDato} {sinDato === 1 ? "video con gasto no tiene" : "videos con gasto no tienen"} este dato y no cuentan aquí.
              </span>
            )}
          </p>
        )}
      </SeccionPlegable>
    </div>
  );
}
