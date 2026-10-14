"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { anilloFoco } from "@/components/ui/field";
import { BotonBarra, Indicador } from "@/components/panel/piezas-panel";
import { Seccion } from "@/components/ui/seccion-ficha";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { FotoAmpliable, HistorialCompetencia } from "@/components/competencia/piezas-competencia";
import { formatearFechaHora } from "@/lib/formato";
import { CalendarioIcon, CatalogoIcon, HistorialIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { marcarAlertasVistas } from "./actions";
import {
  DEF_BITACORA,
  DEF_COMPETIDORES,
  DEF_NUESTROS,
  EVENTOS,
  type BitacoraC,
  type CompetidorC,
  type DatosCompetencia,
  type FilaNuestro,
  type ProductoC,
} from "./def-competencia";


const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const num = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-PA"));
const segundos = (ms: number | null) => (ms === null ? "" : ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

// Cada alerta lleva un punto del color de su tipo junto al título (la regla del sistema: un punto, no una caja).
const TIPO: Record<string, { etiqueta: string; tono: "destructive" | "warning" | "azul" | "neutral"; punto: string }> = {
  mas_barato: { etiqueta: "Más barato que nosotros", tono: "destructive", punto: "bg-destructive" },
  bajo_precio: { etiqueta: "Bajó precio", tono: "warning", punto: "bg-warning" },
  bajo_stock: { etiqueta: "Bajó stock", tono: "warning", punto: "bg-warning" },
  desaparecio: { etiqueta: "Desapareció", tono: "neutral", punto: "bg-border-control" },
  competidor_nuevo: { etiqueta: "Competidor nuevo", tono: "neutral", punto: "bg-border-control" },
};

function Foto({ url, grande = false }: { url: string | null; grande?: boolean }) {
  const tam = grande ? "h-full w-full aspect-square" : "h-10 w-10";
  if (!url) return <span className={`${tam} block shrink-0 rounded-md border border-dashed border-border-control`} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element -- fotos de Dropi (CloudFront)
  const img = <img src={url} alt="" loading="lazy" className={`${tam} shrink-0 rounded-md border border-border object-cover`} />;
  if (grande) return img;
  return (
    <TarjetaEmergente
      clase="rounded-lg border border-border bg-card p-1.5 shadow-lg"
      contenido={
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-80 max-w-80 rounded-md object-contain" />
      }
    >
      {img}
    </TarjetaEmergente>
  );
}

function Bajo({ n }: { n: number }) {
  return n ? <span className="text-destructive tabular-nums">−{num(n)}</span> : <span className="text-muted-foreground tabular-nums">0</span>;
}

// ---------- Columnas ----------

const COL_NUESTROS: ColumnaTabla<FilaNuestro, undefined>[] = [
  {
    id: "producto",
    label: "Nuestro producto",
    ocultable: false,
    render: (f) => (
      <span className="flex min-w-[16rem] items-center gap-3">
        <Foto url={f.nuestro.foto} />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{f.nuestro.nombre}</span>
          <span className="text-xs text-muted-foreground">ECOMFIVE · {num(f.nuestro.stock)} en stock</span>
        </span>
      </span>
    ),
  },
  { id: "precio", label: "Nuestro precio", ocultable: true, clase: "text-right tabular-nums", render: (f) => usd(f.nuestro.precio) },
  {
    id: "competidores",
    label: "Competidores",
    ocultable: true,
    render: (f) =>
      f.iguales.length ? (
        <span className="flex flex-col text-xs">
          {f.iguales.slice(0, 3).map((i) => (
            <span key={i.id}>
              {i.proveedor} · <span className="tabular-nums">{usd(i.precio)}</span>
            </span>
          ))}
          {f.iguales.length > 3 && <span className="text-muted-foreground">y {f.iguales.length - 3} más</span>}
        </span>
      ) : (
        <Badge tone="success">Solo nosotros</Badge>
      ),
  },
  {
    id: "diferencia",
    label: "Más bajo vs nuestro",
    ocultable: true,
    clase: "text-right tabular-nums whitespace-nowrap",
    render: (f) =>
      f.diferencia === null ? (
        "—"
      ) : f.diferencia < 0 ? (
        <span className="text-destructive">
          {usd(f.minimo)} <span className="text-xs">({usd(f.diferencia).replace("$-", "−$")})</span>
        </span>
      ) : f.diferencia > 0 ? (
        <span className="text-success">
          {usd(f.minimo)} <span className="text-xs">(+{usd(f.diferencia)})</span>
        </span>
      ) : (
        <span className="text-muted-foreground">{usd(f.minimo)} (igual)</span>
      ),
  },
  {
    id: "vendido",
    label: "Stock vendido por la competencia",
    descripcion: "Unidades que bajó el stock de los iguales de la competencia (solo bajadas) en 1, 7 y 30 días.",
    ocultable: true,
    clase: "tabular-nums whitespace-nowrap text-xs",
    render: (f) => {
      const s = (k: "bajo1" | "bajo7" | "bajo30") => f.iguales.reduce((t, i) => t + i[k], 0);
      return f.iguales.length ? (
        <span className="flex gap-2">
          <span>
            1 d <Bajo n={s("bajo1")} />
          </span>
          <span>
            7 d <Bajo n={s("bajo7")} />
          </span>
          <span>
            30 d <Bajo n={s("bajo30")} />
          </span>
        </span>
      ) : (
        "—"
      );
    },
  },
];

const COL_COMPETIDORES: ColumnaTabla<CompetidorC, undefined>[] = [
  {
    id: "nombre",
    label: "Competidor",
    ocultable: false,
    render: (c) => (
      <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
        {c.nombre}
      </a>
    ),
  },
  { id: "productos", label: "Productos", ocultable: true, clase: "text-right tabular-nums", render: (c) => num(c.productos) },
  { id: "iguales", label: "Iguales a los nuestros", ocultable: true, clase: "text-right tabular-nums", render: (c) => num(c.iguales) },
  { id: "nuevos7", label: "Nuevos (7 días)", ocultable: true, clase: "text-right tabular-nums", render: (c) => num(c.nuevos7) },
  { id: "bajo1", label: "Stock vendido 1 d", ocultable: true, clase: "text-right", render: (c) => <Bajo n={c.bajo1} /> },
  { id: "bajo7", label: "7 d", ocultable: true, clase: "text-right", render: (c) => <Bajo n={c.bajo7} /> },
  { id: "bajo30", label: "30 d", ocultable: true, clase: "text-right", render: (c) => <Bajo n={c.bajo30} /> },
];

const COL_BITACORA: ColumnaTabla<BitacoraC, undefined>[] = [
  { id: "fecha", label: "Fecha", ocultable: false, clase: "whitespace-nowrap", render: (b) => formatearFechaHora(b.fecha) },
  { id: "evento", label: "Tipo", ocultable: true, render: (b) => <Badge tone={b.evento === "desaparecio" ? "neutral" : b.evento === "reaparecio" ? "success" : "info"}>{EVENTOS[b.evento] ?? b.evento}</Badge> },
  { id: "proveedor", label: "Proveedor", ocultable: true, render: (b) => (b.esNuestro ? <span className="font-medium">{b.proveedor} (nosotros)</span> : b.proveedor) },
  { id: "producto", label: "Producto", ocultable: true, render: (b) => b.producto },
  {
    id: "cambio",
    label: "Cambio",
    ocultable: true,
    clase: "tabular-nums whitespace-nowrap",
    render: (b) =>
      b.evento === "precio" ? (
        <span>
          {usd(b.precioAntes)} → {usd(b.precio)}{" "}
          {b.precio !== null && b.precioAntes !== null && <span className={b.precio < b.precioAntes ? "text-destructive" : "text-success"}>({b.precio < b.precioAntes ? "▼" : "▲"})</span>}
        </span>
      ) : b.evento === "stock" ? (
        <span>
          {num(b.stockAntes)} → {num(b.stock)}{" "}
          {b.stock !== null && b.stockAntes !== null && (
            <span className={b.stock < b.stockAntes ? "text-destructive" : "text-success"}>
              ({b.stock < b.stockAntes ? "−" : "+"}
              {num(Math.abs(b.stock - b.stockAntes))})
            </span>
          )}
        </span>
      ) : b.evento === "desaparecio" ? (
        <span className="text-muted-foreground">tenía {num(b.stockAntes)} en stock</span>
      ) : (
        "—"
      ),
  },
];

const ICONOS: Record<string, IconoComp> = {
  nombre: ProductoIcon,
  producto: ProductoIcon,
  competencia: CatalogoIcon,
  competidores: CatalogoIcon,
  precio: CatalogoIcon,
  diferencia: CatalogoIcon,
  bajo7: InventarioIcon,
  bajo30: InventarioIcon,
  proveedor: CatalogoIcon,
  cruce: CatalogoIcon,
  stock: InventarioIcon,
  visto: CalendarioIcon,
  productos: ProductoIcon,
  iguales: ProductoIcon,
  evento: HistorialIcon,
  fecha: CalendarioIcon,
};

// ---------- Comparación (ficha de un producto nuestro frente a la competencia) ----------

/**
 * La ficha de un producto nuestro frente a la competencia: arriba nuestro producto (foto pequeña que se agranda con un clic,
 * precio y stock); luego cada competidor en una fila con su foto, precio frente al nuestro, stock y lo que vendió en 1, 7 y 30
 * días; al desplegarlo, su historial en tabla (cada vez que bajó o subió el stock y cada cambio de precio). Al final, el
 * historial de nuestro producto.
 */
function Comparacion({ fila, alCerrar }: { fila: FilaNuestro | null; alCerrar: () => void }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  useEffect(() => setAbierto(fila?.iguales[0]?.id ?? null), [fila]);
  return (
    <Ventana abierto={!!fila} alCerrar={alCerrar} titulo={fila?.nuestro.nombre ?? ""} lado="derecha" ancho="lg">
      {fila && (
        <div className="flex flex-col divide-y divide-border p-5">
          <Seccion icono={ProductoIcon} titulo="Nuestro producto (ECOMFIVE)">
            <div className="flex items-center gap-3">
              <FotoAmpliable url={fila.nuestro.foto} nombre={fila.nuestro.nombre} tam="h-14 w-14" />
              <dl className="grid flex-1 grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Precio</dt>
                  <dd className="font-semibold tabular-nums">{usd(fila.nuestro.precio)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Stock</dt>
                  <dd className="font-semibold tabular-nums">{num(fila.nuestro.stock)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Precio más bajo de la competencia</dt>
                  <dd className={`font-semibold tabular-nums ${fila.diferencia !== null && fila.diferencia < 0 ? "text-destructive" : ""}`}>
                    {usd(fila.minimo)}
                    {fila.diferencia !== null && fila.diferencia !== 0 && (
                      <span className="ml-1 text-xs font-normal">
                        ({fila.diferencia < 0 ? "−" : "+"}
                        {usd(Math.abs(fila.diferencia))})
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </Seccion>

          <Seccion icono={CatalogoIcon} titulo={fila.iguales.length ? `Competidores que lo venden (${fila.iguales.length})` : "Sin competencia"}>
            {!fila.iguales.length && <p className="text-sm text-muted-foreground">Ningún competidor vende este producto en Dropi.</p>}
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {fila.iguales.map((c) => {
                const masBarato = c.precio !== null && fila.nuestro.precio !== null && c.precio < fila.nuestro.precio;
                return (
                  <li key={c.id} className="flex flex-col gap-2 px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <FotoAmpliable url={c.foto} nombre={c.nombre} tam="h-10 w-10" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <a href={c.urlProveedor} target="_blank" rel="noopener noreferrer" className="text-sm font-medium break-words underline-offset-2 hover:underline">
                          {c.proveedor}
                        </a>
                        <span className="text-xs break-words text-muted-foreground">
                          «{c.nombre}» · {c.metodo === "foto" ? "misma foto" : `${c.parecido ?? 0} % del nombre`}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end text-sm tabular-nums">
                        <span className={`font-semibold ${masBarato ? "text-destructive" : ""}`}>{usd(c.precio)}</span>
                        <span className="text-xs text-muted-foreground">{num(c.stock)} en stock</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:pl-[52px]">
                      {masBarato && <Badge tone="destructive">Más barato que nosotros</Badge>}
                      <Badge>Vendió 1 d: {num(c.bajo1)}</Badge>
                      <Badge>7 d: {num(c.bajo7)}</Badge>
                      <Badge>30 d: {num(c.bajo30)}</Badge>
                      <button
                        type="button"
                        aria-expanded={abierto === c.id}
                        onClick={() => setAbierto(abierto === c.id ? null : c.id)}
                        className={`ml-auto rounded-md px-2 py-1 text-xs text-primario hover:bg-muted ${anilloFoco}`}
                      >
                        {abierto === c.id ? "Ocultar historial" : "Ver historial"}
                      </button>
                    </div>
                    {abierto === c.id && <HistorialCompetencia productoId={c.id} />}
                  </li>
                );
              })}
            </ul>
          </Seccion>

          <Seccion icono={HistorialIcon} titulo="Historial de nuestro producto">
            <HistorialCompetencia productoId={fila.nuestro.id} />
          </Seccion>
        </div>
      )}
    </Ventana>
  );
}

// ---------- Filas de «Nuestros productos vs competencia» ----------

/** Cada producto nuestro con los iguales de la competencia (más baratos primero) y la diferencia con el más bajo. */
export function filasNuestras(productos: ProductoC[]): FilaNuestro[] {
  const iguales = new Map<string, ProductoC[]>();
  for (const p of productos) if (p.igualA && p.estado === "activo") iguales.set(p.igualA, [...(iguales.get(p.igualA) ?? []), p]);
  return productos
    .filter((p) => p.esNuestro && p.estado === "activo")
    .map((n) => {
      const lista = (iguales.get(n.id) ?? []).sort((a, b) => (a.precio ?? 1e9) - (b.precio ?? 1e9));
      const precios = lista.map((l) => l.precio).filter((x): x is number => x !== null);
      const minimo = precios.length ? Math.min(...precios) : null;
      return {
        nuestro: n,
        iguales: lista,
        minimo,
        diferencia: minimo !== null && n.precio !== null ? Math.round((minimo - n.precio) * 100) / 100 : null,
        bajo7: lista.reduce((t, l) => t + l.bajo7, 0),
      };
    })
    .sort((a, b) => b.iguales.length - a.iguales.length || a.nuestro.nombre.localeCompare(b.nuestro.nombre));
}

// ---------- Barra de indicadores (todas las pestañas) ----------

/** Los indicadores de arriba, con el borde neón de los dashboards del sistema; cada uno lleva a la pestaña que lo lista. */
export function ResumenCompetencia({ datos }: { datos: DatosCompetencia }) {
  const filas = useMemo(() => filasNuestras(datos.productos), [datos.productos]);
  const conCompetencia = filas.filter((f) => f.iguales.length).length;
  const masBaratos = filas.filter((f) => f.diferencia !== null && f.diferencia < 0).length;
  const sinVer = datos.alertas.filter((a) => !a.vista).length;
  const vendido7 = datos.competidores.reduce((t, c) => t + c.bajo7, 0);
  const competencia = datos.productos.filter((p) => !p.esNuestro && p.estado === "activo").length;
  return (
    <section aria-label="Indicadores de la competencia" className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="flex flex-wrap">
        <Indicador
          titulo="Catálogo de Dropi"
          valor={num(datos.ultima?.productos ?? null)}
          detalle={`${num(datos.competidores.length)} competidores · ${num(competencia)} productos suyos`}
          href="/analisis-competencia/competidores"
        />
        <Indicador titulo="Nuestros productos (ECOMFIVE)" valor={num(filas.length)} detalle={`${conCompetencia} con competencia`} href="/analisis-competencia/productos" />
        <Indicador
          titulo="Competencia más barata"
          punto={masBaratos ? "peligro" : undefined}
          valor={num(masBaratos)}
          detalle="productos nuestros con un competidor más barato"
          href="/analisis-competencia/productos"
        />
        <Indicador titulo="Stock vendido (7 días)" valor={num(vendido7)} detalle="unidades que bajó el stock de la competencia" href="/analisis-competencia/competidores" />
        <Indicador
          titulo="Alertas sin ver"
          punto={sinVer ? "peligro" : undefined}
          valor={num(sinVer)}
          detalle={datos.ultima ? `última búsqueda ${formatearFechaHora(datos.ultima.inicio)} · ${segundos(datos.ultima.duracionMs)}` : "sin búsquedas"}
          href="/analisis-competencia/alertas"
        />
      </div>
    </section>
  );
}

// ---------- Pestañas ----------

export function VistaAlertas({ datos, puedeEscribir }: { datos: DatosCompetencia; puedeEscribir: boolean }) {
  const [verVistas, setVerVistas] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string>("");
  const [pendiente, iniciar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  const filas = useMemo(() => filasNuestras(datos.productos), [datos.productos]);
  const sinVer = datos.alertas.filter((a) => !a.vista);
  const alertas = (verVistas ? datos.alertas : sinVer).filter((a) => !tipo || a.tipo === tipo);
  const cuenta = (t: string) => (verVistas ? datos.alertas : sinVer).filter((a) => a.tipo === t).length;
  const marcar = (ids?: string[]) =>
    iniciar(async () => {
      const r = await marcarAlertasVistas(ids);
      if (r.error) return mostrarToast(r.error, "destructive");
      router.refresh();
    });

  return (
    <section className="flex flex-col gap-3" aria-label="Alertas">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(TIPO).map(([valor, t]) => (
          <BotonBarra key={valor} activo={tipo === valor} onClick={() => setTipo(tipo === valor ? "" : valor)}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${t.punto}`} />
            {t.etiqueta} <span className="tabular-nums text-muted-foreground">{cuenta(valor)}</span>
          </BotonBarra>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <BotonBarra activo={verVistas} onClick={() => setVerVistas(!verVistas)}>
            Ver también las vistas
          </BotonBarra>
          {puedeEscribir && sinVer.length > 0 && (
            <BotonBarra principal disabled={pendiente} onClick={() => marcar()}>
              Marcar todas como vistas
            </BotonBarra>
          )}
        </span>
      </div>
      {!alertas.length && (
        <p className="rounded-[10px] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {datos.busquedas > 1 ? "Sin alertas con este filtro." : "Las alertas empiezan en la segunda búsqueda: la primera solo guarda cómo está todo hoy."}
        </p>
      )}
      <ul className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-card">
        {alertas.map((a) => {
          const t = TIPO[a.tipo] ?? TIPO.competidor_nuevo;
          const producto = datos.productos.find((p) => p.id === a.productoId);
          const abre = a.nuestroId ? () => setAbierta(a.nuestroId) : null;
          return (
            <li key={a.id} className={`flex flex-wrap items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-0 ${a.vista ? "opacity-70" : ""}`}>
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${t.punto}`} />
              {producto && <Foto url={producto.foto} />}
              <span className="flex min-w-0 flex-1 flex-col">
                {abre ? (
                  <button type="button" onClick={abre} className={`text-left text-sm font-medium hover:underline ${anilloFoco}`}>
                    {a.titulo}
                  </button>
                ) : (
                  <span className="text-sm font-medium">{a.titulo}</span>
                )}
                {a.detalle && <span className="text-xs text-muted-foreground">{a.detalle}</span>}
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={t.tono}>{t.etiqueta}</Badge>
                <span className="text-xs whitespace-nowrap text-muted-foreground">{formatearFechaHora(a.fecha)}</span>
                {puedeEscribir && !a.vista && (
                  <Button type="button" variant="ghost" className="text-xs" disabled={pendiente} onClick={() => marcar([a.id])}>
                    Vista
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <Comparacion fila={filas.find((f) => f.nuestro.id === abierta) ?? null} alCerrar={() => setAbierta(null)} />
    </section>
  );
}

export function VistaNuestros({ datos }: { datos: DatosCompetencia; puedeEscribir: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const filas = useMemo(() => filasNuestras(datos.productos), [datos.productos]);
  return (
    <>
      <TablaDatos
        def={DEF_NUESTROS}
        filas={filas}
        columnas={COL_NUESTROS}
        iconos={ICONOS}
        nombre={{ singular: "producto", plural: "productos" } satisfies NombreFilas}
        claveFila={(f) => f.nuestro.id}
        abrirFila={{ etiqueta: (f) => `Comparar ${f.nuestro.nombre} con la competencia`, alAbrir: (f) => setAbierta(f.nuestro.id) }}
        ariaLabel="Nuestros productos frente a la competencia"
        vacio="No hay productos nuestros en esta búsqueda."
      />
      <Comparacion fila={filas.find((f) => f.nuestro.id === abierta) ?? null} alCerrar={() => setAbierta(null)} />
    </>
  );
}

export function VistaCompetidores({ datos }: { datos: DatosCompetencia; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF_COMPETIDORES}
      filas={datos.competidores}
      columnas={COL_COMPETIDORES}
      iconos={ICONOS}
      nombre={{ singular: "competidor", plural: "competidores" }}
      claveFila={(c) => String(c.id)}
      ariaLabel="Competidores"
      vacio="Sin competidores."
    />
  );
}

export function VistaBitacora({ datos }: { datos: DatosCompetencia; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF_BITACORA}
      filas={datos.bitacora}
      columnas={COL_BITACORA}
      iconos={ICONOS}
      nombre={{ singular: "cambio", plural: "cambios" }}
      claveFila={(b) => `${b.fecha}-${b.producto}-${b.evento}-${b.proveedor}`}
      ariaLabel="Bitácora de cambios"
      vacio="Todavía no hay cambios: se anotan desde la segunda búsqueda."
    />
  );
}
