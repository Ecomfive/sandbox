"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { KpiFiltro } from "@/components/ui/kpi-filtro";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha, formatearFechaHora } from "@/lib/formato";
import { BuscarIcon, CalendarioIcon, CatalogoIcon, EnlaceIcon, HistorialIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { agregarProveedor, obtenerHistorialProducto, pedirBusqueda, registrarDatosProveedor, type EventoProducto } from "./actions";
import { DEF_SCRAPING, MOTIVO, formatoNumero, formatoPrecio, type FilaScraping } from "./def-scraping";

export interface ProveedorResumen {
  id: string;
  nombre: string;
  pais: string;
  url: string;
  dropiId: number | null;
}

export interface Registro {
  proveedorId: string;
  fecha: string;
  ordenes: number;
  productos: number;
  dropshippers: number;
  origen: string;
}

export interface BusquedaResumen {
  id: string;
  proveedorId: string;
  inicio: string;
  fin: string | null;
  estado: string;
  vistos: number | null;
  nuevos: number | null;
  desaparecidos: number | null;
  duracionMs: number | null;
}

const PAIS: Record<string, string> = { mx: "México", co: "Colombia", cr: "Costa Rica", pa: "Panamá", cl: "Chile", ec: "Ecuador", pe: "Perú", gt: "Guatemala" };

const duracion = (ms: number | null) => {
  if (ms === null) return "";
  const s = Math.round(ms / 1000);
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
};

function Delta({ ahora, antes, formato = formatoNumero }: { ahora: number | null; antes: number | null; formato?: (n: number) => string }) {
  if (ahora === null || antes === null) return null;
  const d = ahora - antes;
  if (d === 0) return <span className="text-xs text-muted-foreground">sin cambio</span>;
  const pct = antes ? ` (${d > 0 ? "+" : ""}${((d / antes) * 100).toFixed(1)} %)` : "";
  return (
    <span className={`text-xs tabular-nums ${d > 0 ? "text-success" : "text-destructive"}`}>
      {d > 0 ? "▲" : "▼"} {formato(Math.abs(d))}
      {pct}
    </span>
  );
}

/** Línea pequeña del stock en cada búsqueda (verde si terminó arriba de donde empezó, roja si abajo). */
function Linea({ valores, ancho = 90, alto = 26 }: { valores: number[]; ancho?: number; alto?: number }) {
  if (valores.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const min = Math.min(...valores);
  const rango = Math.max(...valores) - min || 1;
  const puntos = valores.map((v, i) => [(i / (valores.length - 1)) * (ancho - 4) + 2, alto - 3 - ((v - min) / rango) * (alto - 6)]);
  const d = puntos.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const color = valores[valores.length - 1] >= valores[0] ? "var(--success)" : "var(--destructive)";
  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

function Foto({ fila, grande = false }: { fila: FilaScraping; grande?: boolean }) {
  const tam = grande ? "h-16 w-16" : "h-10 w-10";
  if (!fila.foto)
    return (
      <span className={`${tam} flex shrink-0 items-center justify-center rounded-md border border-dashed border-border-control text-[10px] text-muted-foreground`}>
        {fila.estado === "privado" ? "Privado" : "Sin foto"}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element -- fotos de Dropi (CloudFront), sin optimizar
  return <img src={fila.foto} alt="" loading="lazy" className={`${tam} shrink-0 rounded-md border border-border object-cover`} />;
}

function EstadoProducto({ fila }: { fila: FilaScraping }) {
  if (fila.estado === "desaparecido") return <Badge tone="destructive">Desapareció · {MOTIVO[fila.motivo ?? "desconocido"]}</Badge>;
  if (fila.estado === "privado")
    return fila.vinculo?.seguro ? <Badge tone="warning">Privado · vinculado</Badge> : fila.vinculo ? <Badge tone="warning">Privado · posible pareja</Badge> : <Badge>Privado · sin pareja</Badge>;
  if (fila.movimientos.includes("nuevo")) return <Badge tone="azul">Nuevo</Badge>;
  return <Badge tone="success">Activo</Badge>;
}

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  estado: InventarioIcon,
  movimiento: HistorialIcon,
  nombre: ProductoIcon,
  categoria: CatalogoIcon,
  precio: CatalogoIcon,
  stock: InventarioIcon,
  ultima: CalendarioIcon,
  creado: CalendarioIcon,
};

const COLUMNAS: ColumnaTabla<FilaScraping, string>[] = [
  {
    id: "producto",
    label: "Producto",
    ocultable: false,
    render: (f) => (
      <span className="flex min-w-[16rem] items-center gap-3">
        <Foto fila={f} />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{f.nombre}</span>
          <span className="text-xs text-muted-foreground">
            {f.vinculo ? `${f.vinculo.seguro ? "Igual a" : "¿Igual a"} «${f.vinculo.nombre}» (${f.vinculo.parecido} %)${f.vinculo.seguro ? "" : "?"}` : `ID ${f.dropiId}${f.categoria ? ` · ${f.categoria}` : ""}`}
          </span>
        </span>
      </span>
    ),
  },
  {
    id: "precio",
    label: "Precio",
    ocultable: true,
    clase: "text-right tabular-nums",
    render: (f, pais) => (
      <span className="flex flex-col items-end">
        {formatoPrecio(f.precio, pais)}
        <Delta ahora={f.precio} antes={f.precioAntes} formato={(n) => formatoPrecio(n, pais)} />
      </span>
    ),
  },
  {
    id: "stock",
    label: "Stock",
    ocultable: true,
    clase: "text-right tabular-nums",
    render: (f) => (
      <span className="flex flex-col items-end">
        {f.estado === "desaparecido" ? "—" : formatoNumero(f.stock)}
        {f.estado !== "desaparecido" && <Delta ahora={f.stock} antes={f.stockAntes} />}
      </span>
    ),
  },
  { id: "serie", label: "Stock 4 semanas", ocultable: true, render: (f) => <Linea valores={f.serie} /> },
  {
    id: "estado",
    label: "Estado",
    ocultable: true,
    render: (f) => (
      <span className="flex flex-col items-start gap-1">
        <EstadoProducto fila={f} />
        <span className="text-xs text-muted-foreground">
          {f.estado === "desaparecido" ? `Visto por última vez ${formatearFecha(f.ultimaVez)}` : `Revisado ${formatearFecha(f.ultimaVez)}`}
        </span>
      </span>
    ),
  },
  { id: "sugerido", label: "Precio sugerido", ocultable: true, oculta: true, clase: "text-right tabular-nums", render: (f, pais) => formatoPrecio(f.precioSugerido, pais) },
  { id: "creado", label: "Creado en Dropi", ocultable: true, oculta: true, render: (f) => (f.creadoEnDropi ? formatearFecha(f.creadoEnDropi) : "—") },
];

const ETIQUETA_EVENTO: Record<string, string> = {
  primera_vez: "Primera vez que lo vimos",
  precio: "Cambió el precio",
  stock: "Cambió el stock",
  desaparecio: "Desapareció",
  reaparecio: "Volvió a aparecer",
  privatizado: "Lo hicieron privado",
  publicado: "Lo publicaron",
  vinculado: "Vinculado a un producto con foto",
};

function FichaProducto({ fila, pais, alCerrar }: { fila: FilaScraping | null; pais: string; alCerrar: () => void }) {
  const [eventos, setEventos] = useState<EventoProducto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!fila) return;
    let vigente = true;
    setEventos(null);
    setError(null);
    obtenerHistorialProducto(fila.id).then((r) => {
      if (!vigente) return;
      if (r.error) setError(r.error);
      else setEventos(r.eventos ?? []);
    });
    return () => {
      vigente = false;
    };
  }, [fila]);

  const texto = (e: EventoProducto) => {
    if (e.evento === "precio") return `${formatoPrecio(e.precioAntes, pais)} → ${formatoPrecio(e.precio, pais)}`;
    if (e.evento === "stock") return `${formatoNumero(e.stockAntes)} → ${formatoNumero(e.stock)}`;
    if (e.evento === "primera_vez") return `${formatoPrecio(e.precio, pais)} · ${formatoNumero(e.stock)} en stock${e.detalle ? ` · ${e.detalle}` : ""}`;
    if (e.evento === "desaparecio") return `${e.detalle ?? ""}${e.stockAntes !== null ? ` · tenía ${formatoNumero(e.stockAntes)} en stock` : ""}`;
    return e.detalle ?? "";
  };

  return (
    <Ventana abierto={!!fila} alCerrar={alCerrar} titulo={fila?.nombre ?? ""} lado="derecha" ancho="md">
      {fila && (
        <div className="flex flex-col divide-y divide-border p-5">
          <Seccion icono={ProductoIcon} titulo="Producto">
            <div className="flex items-start gap-3">
              <Foto fila={fila} grande />
              <div className="flex min-w-0 flex-col items-start gap-1 text-sm">
                <EstadoProducto fila={fila} />
                <span className="text-muted-foreground">
                  ID Dropi {fila.dropiId}
                  {fila.sku ? ` · ${fila.sku}` : ""}
                  {fila.categoria ? ` · ${fila.categoria}` : ""}
                </span>
                {fila.vinculo && (
                  <span>
                    {fila.vinculo.seguro ? "Vinculado a" : "Posible pareja:"} «{fila.vinculo.nombre}» ({fila.vinculo.parecido} % por nombre)
                  </span>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Precio</dt>
                <dd className="font-semibold tabular-nums">{formatoPrecio(fila.precio, pais)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sugerido</dt>
                <dd className="font-semibold tabular-nums">{formatoPrecio(fila.precioSugerido, pais)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Stock</dt>
                <dd className="font-semibold tabular-nums">{fila.estado === "desaparecido" ? "—" : formatoNumero(fila.stock)}</dd>
              </div>
            </dl>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Stock en cada búsqueda (4 semanas)</p>
              <Linea valores={fila.serie} ancho={360} alto={64} />
            </div>
          </Seccion>
          <Seccion icono={HistorialIcon} titulo="Historial">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!eventos && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {eventos && (
              <ol className="flex flex-col gap-3">
                {eventos.map((e, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-border-control" />
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {e.evento === "stock" && e.stock !== null && e.stockAntes !== null ? (e.stock > e.stockAntes ? "Subió el stock" : "Bajó el stock") : e.evento === "precio" && e.precio !== null && e.precioAntes !== null ? (e.precio > e.precioAntes ? "Subió el precio" : "Bajó el precio") : ETIQUETA_EVENTO[e.evento] ?? e.evento}
                      </span>
                      <span className="text-muted-foreground tabular-nums">{texto(e)}</span>
                      <span className="text-xs text-muted-foreground">{formatearFechaHora(e.fecha)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Seccion>
        </div>
      )}
    </Ventana>
  );
}

function CamposCifras({ faltante, invalido, prefijo }: { faltante: string | null; invalido: (id: string) => true | undefined; prefijo: string }) {
  const campos = [
    ["ordenes", "Órdenes", "Ej: 390186"],
    ["productos", "Productos", "Ej: 1436"],
    ["dropshippers", "Dropshippers", "Ej: 2065"],
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {campos.map(([nombre, etiqueta, ejemplo]) => (
        <Campo key={nombre} etiqueta={etiqueta} id={`${prefijo}-${nombre}`} obligatorio faltante={faltante}>
          <input
            id={`${prefijo}-${nombre}`}
            name={nombre}
            inputMode="numeric"
            pattern="[0-9.,\s]*"
            required
            aria-invalid={invalido(`${prefijo}-${nombre}`)}
            placeholder={ejemplo}
            className={`${fieldClass} w-full tabular-nums`}
          />
        </Campo>
      ))}
    </div>
  );
}

function AgregarProveedor() {
  return (
    <FichaCrear titulo="Agregar proveedor" etiquetaBoton="Agregar proveedor" etiquetaCrear="Agregar y pedir la primera búsqueda" action={agregarProveedor} mensajeExito="Proveedor agregado. Su primera búsqueda quedó pedida.">
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={ProductoIcon} titulo="Proveedor">
            <Campo etiqueta="Nombre del proveedor" id="prov-nombre" obligatorio faltante={faltante}>
              <input id="prov-nombre" name="nombre" required data-enfocar aria-invalid={invalido("prov-nombre")} placeholder="Ej: MODA EJEMPLO IMPORTACIONES" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Enlace del proveedor en Dropi" id="prov-url" obligatorio faltante={faltante}>
              <input id="prov-url" name="url" type="url" required aria-invalid={invalido("prov-url")} placeholder="Ej: https://app.dropi.mx/dashboard/provider/1234/MODA" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Cifras de hoy">
            <CamposCifras faltante={faltante} invalido={invalido} prefijo="prov" />
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}

function ActualizarDatos({ proveedor }: { proveedor: ProveedorResumen }) {
  return (
    <FichaCrear
      titulo="Actualizar datos del proveedor"
      etiquetaCrear="Guardar datos de hoy"
      action={registrarDatosProveedor}
      mensajeExito="Datos guardados"
      ocultos={{ proveedor_id: proveedor.id }}
      boton={(abrir) => (
        <Button type="button" variant="secondary" onClick={abrir}>
          Actualizar datos
        </Button>
      )}
    >
      {({ faltante, invalido }) => (
        <Seccion icono={CalendarioIcon} titulo={proveedor.nombre}>
          <CamposCifras faltante={faltante} invalido={invalido} prefijo="act" />
        </Seccion>
      )}
    </FichaCrear>
  );
}

function BuscarAhora({ proveedorId, pedida }: { proveedorId: string; pedida: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const { mostrarToast } = useToast();
  return (
    <Button
      type="button"
      disabled={pendiente || pedida}
      onClick={() =>
        iniciar(async () => {
          const r = await pedirBusqueda(proveedorId);
          mostrarToast(r.error ?? "Búsqueda pedida", r.error ? "destructive" : "success");
        })
      }
    >
      {pedida ? "Búsqueda pedida" : pendiente ? "Pidiendo…" : "Buscar ahora"}
    </Button>
  );
}

export function VistaScraping({
  proveedores,
  elegidoId,
  registros,
  busquedas,
  filas,
  puedeEscribir,
}: {
  proveedores: ProveedorResumen[];
  elegidoId: string | null;
  registros: Registro[];
  busquedas: BusquedaResumen[];
  filas: FilaScraping[];
  puedeEscribir: boolean;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const elegido = proveedores.find((p) => p.id === elegidoId) ?? null;
  const delProveedor = (id: string) => registros.filter((r) => r.proveedorId === id);
  const ultimaBusqueda = (id: string) => busquedas.find((b) => b.proveedorId === id);
  const filaAbierta = filas.find((f) => f.id === abierto) ?? null;

  const cuenta = (pred: (f: FilaScraping) => boolean) => filas.filter(pred).length;
  const regs = elegido ? delProveedor(elegido.id) : [];
  const busqueda = elegido ? ultimaBusqueda(elegido.id) : undefined;
  const pais = elegido?.pais ?? "mx";

  return (
    <>
      <section className="flex flex-col gap-3" aria-labelledby="titulo-proveedores">
        <div className="flex items-center justify-between gap-3">
          <h2 id="titulo-proveedores" className="text-sm font-semibold">
            Proveedores que sigues
          </h2>
          {puedeEscribir && <AgregarProveedor />}
        </div>
        {proveedores.length === 0 ? (
          <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Todavía no hay proveedores.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {proveedores.map((p) => {
              const r = delProveedor(p.id);
              const a = r[r.length - 1];
              const b = r.length > 1 ? r[r.length - 2] : null;
              const u = ultimaBusqueda(p.id);
              return (
                <Link
                  key={p.id}
                  href={`?p=${p.id}`}
                  aria-current={p.id === elegidoId ? "true" : undefined}
                  className={`flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 ${p.id === elegidoId ? "border-foreground" : "border-border"}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{p.nombre}</span>
                    <span className="text-xs text-muted-foreground">{PAIS[p.pais] ?? p.pais}</span>
                  </span>
                  <span className="grid grid-cols-3 gap-2">
                    {(["ordenes", "productos", "dropshippers"] as const).map((k) => (
                      <span key={k} className="flex flex-col">
                        <span className="text-xs text-muted-foreground">{k === "ordenes" ? "Órdenes" : k === "productos" ? "Productos" : "Dropshippers"}</span>
                        <span className="font-semibold tabular-nums">{a ? formatoNumero(a[k]) : "—"}</span>
                        {b ? <Delta ahora={a[k]} antes={b[k]} /> : <span className="text-xs text-muted-foreground">primer registro</span>}
                      </span>
                    ))}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${u?.estado === "lista" ? "bg-success" : u?.estado === "fallida" ? "bg-destructive" : "bg-warning"}`} />
                    {u
                      ? u.estado === "lista"
                        ? `Última búsqueda: ${formatearFechaHora(u.inicio)} · duró ${duracion(u.duracionMs)}`
                        : u.estado === "fallida"
                          ? `La última búsqueda falló (${formatearFechaHora(u.inicio)})`
                          : "Búsqueda pedida, esperando a correr"
                      : "Sin búsquedas"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {elegido && (
        <section className="flex flex-col gap-6" aria-labelledby="titulo-proveedor">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="titulo-proveedor" className="text-lg font-semibold">
                {elegido.nombre}
              </h2>
              <p className="text-sm text-muted-foreground">
                {PAIS[elegido.pais] ?? elegido.pais} · Proveedor {elegido.dropiId} en Dropi ·{" "}
                <a href={elegido.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                  Abrir en Dropi <EnlaceIcon className="h-3.5 w-3.5" />
                </a>
              </p>
            </div>
            {puedeEscribir && (
              <div className="flex flex-wrap gap-2">
                <ActualizarDatos proveedor={elegido} />
                <BuscarAhora proveedorId={elegido.id} pedida={busqueda?.estado === "pendiente" || busqueda?.estado === "corriendo"} />
              </div>
            )}
          </div>

          <KpiGrid compacta>
            <KpiCard compacta titulo="Productos en la base" valor={formatoNumero(filas.length)} subtexto={`${cuenta((f) => f.estado === "activo")} publicados · ${cuenta((f) => f.estado === "privado")} privados`} />
            <KpiFiltro compacta def={DEF_SCRAPING} tono="success" titulo="Subieron de stock" valor={cuenta((f) => f.movimientos.includes("subio"))} subtexto="desde la búsqueda anterior" atajo={{ id: "subio", etiqueta: "Subió stock", ayuda: "Filtrar: subieron de stock", filtro: { campo: "movimiento", valor: { tipo: "seleccion", valores: ["subio"] } }, suma: true }} />
            <KpiFiltro compacta def={DEF_SCRAPING} tono="destructive" titulo="Bajaron de stock" valor={cuenta((f) => f.movimientos.includes("bajo"))} subtexto="desde la búsqueda anterior" atajo={{ id: "bajo", etiqueta: "Bajó stock", ayuda: "Filtrar: bajaron de stock", filtro: { campo: "movimiento", valor: { tipo: "seleccion", valores: ["bajo"] } }, suma: true }} />
            <KpiFiltro compacta def={DEF_SCRAPING} tono="warning" titulo="Cambiaron de precio" valor={cuenta((f) => f.movimientos.includes("precio"))} subtexto="desde la búsqueda anterior" atajo={{ id: "precio", etiqueta: "Cambió precio", ayuda: "Filtrar: cambiaron de precio", filtro: { campo: "movimiento", valor: { tipo: "seleccion", valores: ["precio"] } }, suma: true }} />
            <KpiFiltro compacta def={DEF_SCRAPING} tono="info" titulo="Nuevos" valor={cuenta((f) => f.movimientos.includes("nuevo"))} subtexto="en la última búsqueda" atajo={{ id: "nuevo", etiqueta: "Nuevos", ayuda: "Filtrar: nuevos", filtro: { campo: "movimiento", valor: { tipo: "seleccion", valores: ["nuevo"] } }, suma: true }} />
            <KpiFiltro compacta def={DEF_SCRAPING} tono="warning" titulo="Privados" valor={cuenta((f) => f.estado === "privado")} subtexto={`${cuenta((f) => f.estado === "privado" && !!f.vinculo?.seguro)} vinculados por nombre`} atajo={{ id: "privado", etiqueta: "Privados", ayuda: "Filtrar: privados", filtro: { campo: "estado", valor: { tipo: "seleccion", valores: ["privado"] } }, suma: true }} />
            <KpiFiltro compacta def={DEF_SCRAPING} tono="destructive" titulo="Desaparecieron" valor={cuenta((f) => f.estado === "desaparecido")} subtexto={`${cuenta((f) => f.motivo === "agotado")} agotados · ${cuenta((f) => f.motivo === "privatizado")} privatizados`} atajo={{ id: "desaparecido", etiqueta: "Desaparecidos", ayuda: "Filtrar: desaparecidos", filtro: { campo: "estado", valor: { tipo: "seleccion", valores: ["desaparecido"] } }, suma: true }} />
          </KpiGrid>

          <section className="flex flex-col gap-2" aria-labelledby="titulo-registros">
            <h3 id="titulo-registros" className="text-sm font-semibold">
              Datos del proveedor
            </h3>
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
                  {regs.length === 0 && (
                    <tr>
                      <td colSpan={5} className={`${claseCeldaColumna} text-center text-muted-foreground`}>
                        Sin datos todavía.
                      </td>
                    </tr>
                  )}
                  {regs
                    .slice()
                    .reverse()
                    .slice(0, 30)
                    .map((r, i, lista) => {
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
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="titulo-productos">
            <h3 id="titulo-productos" className="flex items-center gap-2 text-sm font-semibold">
              <BuscarIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Productos
            </h3>
            <TablaDatos
              def={DEF_SCRAPING}
              filas={filas}
              columnas={COLUMNAS}
              contexto={pais}
              iconos={ICONOS}
              nombre={NOMBRE}
              claveFila={(f) => f.id}
              abrirFila={{ etiqueta: (f) => `Ver historial de ${f.nombre}`, alAbrir: (f) => setAbierto(f.id) }}
              ariaLabel={`Productos de ${elegido.nombre}`}
              vacio={busqueda && busqueda.estado !== "lista" ? "La primera búsqueda todavía no ha corrido." : "Sin productos."}
            />
          </section>
        </section>
      )}

      <FichaProducto fila={filaAbierta} pais={pais} alCerrar={() => setAbierto(null)} />
    </>
  );
}
