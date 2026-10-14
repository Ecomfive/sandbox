"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { anilloFoco } from "@/components/ui/field";
import { claseKpi, ContenidoKpi, KpiGrid } from "@/components/ui/kpi-card";
import { Seccion } from "@/components/ui/seccion-ficha";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { formatearFechaHora } from "@/lib/formato";
import { CalendarioIcon, CatalogoIcon, HistorialIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { marcarAlertasVistas, obtenerHistorialCompetencia, type EventoCompetencia } from "./actions";
import {
  DEF_BITACORA,
  DEF_COMPETIDORES,
  DEF_NUESTROS,
  DEF_NUEVOS,
  EVENTOS,
  type BitacoraC,
  type CompetidorC,
  type FilaNuestro,
  type ProductoC,
} from "./def-competencia";

export interface AlertaC {
  id: string;
  fecha: string;
  tipo: string;
  titulo: string;
  detalle: string | null;
  vista: boolean;
  productoId: string | null;
  nuestroId: string | null;
}

export interface DatosCompetencia {
  pais: string;
  productos: ProductoC[];
  nuevos: ProductoC[];
  competidores: CompetidorC[];
  alertas: AlertaC[];
  bitacora: BitacoraC[];
  ultima: { inicio: string; estado: string; duracionMs: number | null; productos: number | null; proveedores: number | null } | null;
  busquedas: number;
}

type Pestana = "alertas" | "nuestros" | "nuevos" | "competidores" | "bitacora";

const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const num = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-PA"));
const segundos = (ms: number | null) => (ms === null ? "" : ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

// Cada alerta lleva un punto del color de su tipo junto al título (la regla del sistema: un punto, no una caja).
const TIPO: Record<string, { etiqueta: string; tono: "destructive" | "warning" | "azul" | "neutral"; punto: string }> = {
  mas_barato: { etiqueta: "Más barato que nosotros", tono: "destructive", punto: "bg-destructive" },
  bajo_precio: { etiqueta: "Bajó precio", tono: "warning", punto: "bg-warning" },
  bajo_stock: { etiqueta: "Bajó stock", tono: "warning", punto: "bg-warning" },
  desaparecio: { etiqueta: "Desapareció", tono: "neutral", punto: "bg-border-control" },
  nuevo: { etiqueta: "Nuevo que no tenemos", tono: "azul", punto: "bg-azul" },
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

const COL_NUEVOS: ColumnaTabla<ProductoC, undefined>[] = [
  {
    id: "producto",
    label: "Producto",
    ocultable: false,
    render: (p) => (
      <span className="flex min-w-[16rem] items-center gap-3">
        <Foto url={p.foto} />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{p.nombre}</span>
          <span className="text-xs text-muted-foreground">{p.categoria ?? `ID ${p.dropiId}`}</span>
        </span>
      </span>
    ),
  },
  {
    id: "proveedor",
    label: "Competidor",
    ocultable: true,
    render: (p) => (
      <a href={p.urlProveedor} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        {p.proveedor}
      </a>
    ),
  },
  { id: "precio", label: "Precio", ocultable: true, clase: "text-right tabular-nums", render: (p) => usd(p.precio) },
  { id: "stock", label: "Stock", ocultable: true, clase: "text-right tabular-nums", render: (p) => num(p.stock) },
  {
    id: "cruce",
    label: "Cruce",
    ocultable: true,
    render: (p) => (
      <span className="flex flex-wrap gap-1">
        {p.yaLoTenemos ? <Badge>{p.yaLoTenemos}</Badge> : <Badge tone="success">No lo tenemos</Badge>}
        {p.repetidoEn.length > 0 && <Badge tone="destructive">Prioridad · {p.repetidoEn.length + 1} competidores</Badge>}
      </span>
    ),
  },
  { id: "visto", label: "Visto", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (p) => formatearFechaHora(p.primeraVez) },
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

// ---------- Comparación lado a lado ----------

function HistorialProducto({ id }: { id: string }) {
  const [eventos, setEventos] = useState<EventoCompetencia[] | null>(null);
  useEffect(() => {
    let vigente = true;
    obtenerHistorialCompetencia(id).then((r) => vigente && setEventos(r.eventos ?? []));
    return () => {
      vigente = false;
    };
  }, [id]);
  if (!eventos) return <p className="text-xs text-muted-foreground">Cargando historial…</p>;
  if (!eventos.length) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground tabular-nums">
      {eventos.slice(0, 8).map((e, i) => (
        <li key={i}>
          {formatearFechaHora(e.fecha)} ·{" "}
          {e.evento === "precio"
            ? `precio ${usd(e.precioAntes)} → ${usd(e.precio)}`
            : e.evento === "stock"
              ? `stock ${num(e.stockAntes)} → ${num(e.stock)}`
              : e.evento === "primera_vez"
                ? `apareció a ${usd(e.precio)} con ${num(e.stock)}`
                : (EVENTOS[e.evento] ?? e.evento).toLowerCase()}
        </li>
      ))}
    </ul>
  );
}

function Comparacion({ fila, alCerrar }: { fila: FilaNuestro | null; alCerrar: () => void }) {
  return (
    <Ventana abierto={!!fila} alCerrar={alCerrar} titulo={fila?.nuestro.nombre ?? ""} lado="derecha" ancho="lg">
      {fila && (
        <div className="flex flex-col divide-y divide-border p-5">
          <Seccion icono={ProductoIcon} titulo={fila.iguales.length ? `Frente a ${fila.iguales.length} competidor${fila.iguales.length === 1 ? "" : "es"}` : "Sin competencia"}>
            {!fila.iguales.length && <p className="text-sm text-muted-foreground">Ningún competidor vende este producto en Dropi.</p>}
            {fila.iguales.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 border-b border-border pb-4 last:border-0 last:pb-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1 rounded-lg border border-foreground/30 bg-accent p-2 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">Nosotros</span>
                    <Foto url={fila.nuestro.foto} grande />
                    <span className="font-semibold tabular-nums">{usd(fila.nuestro.precio)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{num(fila.nuestro.stock)} en stock</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border border-border p-2 text-sm">
                    <a href={c.urlProveedor} target="_blank" rel="noopener noreferrer" className="text-xs font-medium underline underline-offset-2">
                      {c.proveedor}
                    </a>
                    <Foto url={c.foto} grande />
                    <span className={`font-semibold tabular-nums ${c.precio !== null && fila.nuestro.precio !== null && c.precio < fila.nuestro.precio ? "text-destructive" : ""}`}>{usd(c.precio)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{num(c.stock)} en stock</span>
                    <span className="text-xs">«{c.nombre}»</span>
                  </div>
                </div>
                <span className="flex flex-wrap gap-1">
                  {c.metodo === "foto" ? <Badge tone="azul">Misma foto</Badge> : null}
                  {c.parecido !== null && <Badge>{c.parecido} % del nombre</Badge>}
                  {c.precio !== null && fila.nuestro.precio !== null && c.precio < fila.nuestro.precio && <Badge tone="destructive">Vende más barato que nosotros</Badge>}
                  <Badge>
                    Vendió 1 d −{num(c.bajo1)} · 7 d −{num(c.bajo7)} · 30 d −{num(c.bajo30)}
                  </Badge>
                </span>
                <HistorialProducto id={c.id} />
              </div>
            ))}
          </Seccion>
          <Seccion icono={HistorialIcon} titulo="Historial de nuestro producto">
            <HistorialProducto id={fila.nuestro.id} />
          </Seccion>
        </div>
      )}
    </Ventana>
  );
}

// ---------- Vista ----------

export function VistaCompetencia({ datos, puedeEscribir }: { datos: DatosCompetencia; puedeEscribir: boolean }) {
  const [pestana, setPestana] = useState<Pestana>("alertas");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [verVistas, setVerVistas] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();

  const filasNuestras = useMemo<FilaNuestro[]>(() => {
    const iguales = new Map<string, ProductoC[]>();
    for (const p of datos.productos) if (p.igualA && p.estado === "activo") iguales.set(p.igualA, [...(iguales.get(p.igualA) ?? []), p]);
    return datos.productos
      .filter((p) => p.esNuestro && p.estado === "activo")
      .map((n) => {
        const lista = (iguales.get(n.id) ?? []).sort((a, b) => (a.precio ?? 1e9) - (b.precio ?? 1e9));
        const minimo = lista.length ? Math.min(...lista.map((l) => l.precio ?? Infinity)) : null;
        const min = minimo === null || !Number.isFinite(minimo) ? null : minimo;
        return { nuestro: n, iguales: lista, minimo: min, diferencia: min !== null && n.precio !== null ? Math.round((min - n.precio) * 100) / 100 : null, bajo7: lista.reduce((t, l) => t + l.bajo7, 0) };
      })
      .sort((a, b) => b.iguales.length - a.iguales.length || a.nuestro.nombre.localeCompare(b.nuestro.nombre));
  }, [datos.productos]);

  const nuestros = filasNuestras.length;
  const conCompetencia = filasNuestras.filter((f) => f.iguales.length).length;
  const masBaratos = filasNuestras.filter((f) => f.diferencia !== null && f.diferencia < 0).length;
  const sinVer = datos.alertas.filter((a) => !a.vista);
  const alertas = verVistas ? datos.alertas : sinVer;
  const nuevosSinTener = datos.nuevos.filter((n) => !n.yaLoTenemos);
  const filaAbierta = filasNuestras.find((f) => f.nuestro.id === abierta) ?? null;
  const vendido7 = datos.competidores.reduce((t, c) => t + c.bajo7, 0);

  const marcar = (ids?: string[]) =>
    iniciar(async () => {
      const r = await marcarAlertasVistas(ids);
      if (r.error) return mostrarToast(r.error, "destructive");
      router.refresh();
    });

  if (!datos.productos.length)
    return (
      <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        Todavía no hay búsquedas del catálogo de Dropi de {datos.pais}. La primera se corre con la sesión de dropshipper de ese país.
      </p>
    );

  const tarjeta = (p: Pestana, titulo: string, valor: string | number, sub: string, tono: "neutral" | "info" | "success" | "warning" | "destructive" = "neutral") => (
    <button type="button" aria-pressed={pestana === p} onClick={() => setPestana(p)} className={claseKpi(tono, true, pestana === p, true)}>
      <ContenidoKpi titulo={titulo} valor={valor} subtexto={sub} tono={tono} />
    </button>
  );
  const pestanas: [Pestana, string, number][] = [
    ["alertas", "Alertas", sinVer.length],
    ["nuestros", "Nuestros productos vs competencia", nuestros],
    ["nuevos", "Nuevos que no tenemos", nuevosSinTener.length],
    ["competidores", "Competidores", datos.competidores.length],
    ["bitacora", "Bitácora de cambios", datos.bitacora.length],
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Análisis de competencia · {datos.pais}</h2>
          <p className="text-sm text-muted-foreground">
            {num(datos.ultima?.productos ?? null)} productos de {num(datos.ultima?.proveedores ?? null)} proveedores en Dropi · {nuestros} nuestros (ECOMFIVE)
            {datos.ultima ? ` · última búsqueda ${formatearFechaHora(datos.ultima.inicio)}, duró ${segundos(datos.ultima.duracionMs)}` : ""}
          </p>
        </div>
      </div>

      <KpiGrid compacta>
        {tarjeta("alertas", "Alertas sin ver", sinVer.length, datos.busquedas > 1 ? "desde la última vez que las marcaste" : "empiezan en la segunda búsqueda", sinVer.length ? "destructive" : "neutral")}
        {tarjeta("nuestros", "Nuestros productos con competencia", `${conCompetencia} de ${nuestros}`, `${masBaratos} con un competidor más barato`, masBaratos ? "warning" : "neutral")}
        {tarjeta("nuevos", "Nuevos que no tenemos", nuevosSinTener.length, datos.busquedas > 1 ? "aparecieron desde la primera búsqueda" : "desde la segunda búsqueda", "info")}
        {tarjeta("competidores", "Stock vendido por la competencia", vendido7.toLocaleString("es-PA"), "unidades en 7 días (bajadas de stock)")}
        {tarjeta("bitacora", "Cambios anotados", datos.bitacora.length, "los últimos 500")}
      </KpiGrid>

      <div role="tablist" aria-label="Vistas del análisis" className="flex gap-5 overflow-x-auto border-b border-border">
        {pestanas.map(([id, texto, cuenta]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 py-2.5 text-sm whitespace-nowrap ${pestana === id ? "border-foreground font-semibold" : "border-transparent text-muted-foreground"} ${anilloFoco}`}
          >
            {texto}
            <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{cuenta}</span>
          </button>
        ))}
      </div>

      {pestana === "alertas" && (
        <section className="flex flex-col gap-3" aria-label="Alertas">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={verVistas} onChange={(e) => setVerVistas(e.target.checked)} />
              Ver también las ya vistas
            </label>
            {puedeEscribir && sinVer.length > 0 && (
              <Button type="button" variant="secondary" disabled={pendiente} onClick={() => marcar()}>
                Marcar todas como vistas
              </Button>
            )}
          </div>
          {!alertas.length && (
            <p className="rounded-[10px] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              {datos.busquedas > 1 ? "Sin alertas nuevas." : "Las alertas empiezan en la segunda búsqueda: la primera solo guarda cómo está todo hoy."}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {alertas.map((a) => {
              const t = TIPO[a.tipo] ?? TIPO.competidor_nuevo;
              const abre = a.nuestroId ? () => setAbierta(a.nuestroId) : a.tipo === "nuevo" ? () => setPestana("nuevos") : null;
              return (
                <li key={a.id} className={`flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-card px-3 py-2.5 ${a.vista ? "opacity-70" : ""}`}>
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 self-start rounded-full mt-2 ${t.punto}`} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    {abre ? (
                      <button type="button" onClick={abre} className={`text-left font-medium hover:underline ${anilloFoco}`}>
                        {a.titulo}
                      </button>
                    ) : (
                      <span className="font-medium">{a.titulo}</span>
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
        </section>
      )}

      {pestana === "nuestros" && (
        <TablaDatos
          def={DEF_NUESTROS}
          filas={filasNuestras}
          columnas={COL_NUESTROS}
          iconos={ICONOS}
          nombre={{ singular: "producto", plural: "productos" } satisfies NombreFilas}
          claveFila={(f) => f.nuestro.id}
          abrirFila={{ etiqueta: (f) => `Comparar ${f.nuestro.nombre} con la competencia`, alAbrir: (f) => setAbierta(f.nuestro.id) }}
          ariaLabel="Nuestros productos frente a la competencia"
          vacio="No hay productos nuestros en esta búsqueda."
        />
      )}

      {pestana === "nuevos" && (
        <TablaDatos
          def={DEF_NUEVOS}
          filas={datos.nuevos}
          columnas={COL_NUEVOS}
          iconos={ICONOS}
          nombre={{ singular: "producto", plural: "productos" }}
          claveFila={(p) => p.id}
          ariaLabel="Productos nuevos de la competencia"
          vacio={datos.busquedas > 1 ? "Ningún producto nuevo en la competencia." : "Los nuevos se ven desde la segunda búsqueda: la primera guarda todo el catálogo de hoy."}
        />
      )}

      {pestana === "competidores" && (
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
      )}

      {pestana === "bitacora" && (
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
      )}

      <Comparacion fila={filaAbierta} alCerrar={() => setAbierta(null)} />
    </>
  );
}
