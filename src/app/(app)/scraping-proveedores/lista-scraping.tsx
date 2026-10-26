"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ComponentType, type ReactNode } from "react";
import { useFiltros } from "@/components/tabla/ganchos";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearFecha } from "@/lib/formato";
import { ActualizarIcon, BuscarIcon, CalendarioIcon, CatalogoIcon, ChevronRightIcon, HistorialIcon, InteligenciaIcon, InventarioIcon, MasIcon, PersonaIcon, ProductoIcon, SugerenciaIcon, VentasIcon } from "@/lib/nav-icons";
import { RECOMENDACIONES } from "@/lib/scraping/recomendar";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import { SIN_VALOR, type Filtro } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { COLORES, type Color } from "../publicaciones-dropi/tablero-acciones";
import { enviarASeleccion } from "./actions";
import { CLASE_RECOMENDACION, DEF_SCRAPING, formatoNumero, formatoPrecio, formatoUsd, nombrePais, type FilaScraping } from "./def-scraping";
import { BotonYaLoTenemos, FichaProducto, Foto } from "./vista-scraping";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  recomendacion: InteligenciaIcon,
  senal: HistorialIcon,
  pais: CatalogoIcon,
  proveedor: PersonaIcon,
  ventas30: InventarioIcon,
  estado: InventarioIcon,
  cruce: BuscarIcon,
  precioUsd: CatalogoIcon,
  movimiento: HistorialIcon,
  nombre: ProductoIcon,
  categoria: CatalogoIcon,
  precio: CatalogoIcon,
  stock: InventarioIcon,
  ultima: CalendarioIcon,
  creado: CalendarioIcon,
};
const COLUMNAS = "lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_1rem]";
const seleccion = (campo: string, ...valores: string[]): Filtro => ({ campo, valor: { tipo: "seleccion", valores } });

interface Tarjeta {
  id: string;
  titulo: string;
  detalle: string;
  icono: ComponentType<{ className?: string }>;
  color: Color;
  cuenta: (f: FilaScraping) => boolean;
  atajo: AtajoFiltro;
}

/** El tablero, como el de Gestión de IDs Dropi: cada tarjeta cuenta (sobre lo que está a la vista) y filtra la lista. */
const TARJETAS: Tarjeta[] = [
  { id: "testear", titulo: "Para testear", detalle: "Se venden y no los tenemos", icono: SugerenciaIcon, color: "violeta", cuenta: (f) => f.recomendacion === "testear", atajo: { id: "testear", etiqueta: "Para testear", ayuda: "Filtrar: para testear", filtro: seleccion("recomendacion", "testear") } },
  { id: "vende", titulo: "Se están vendiendo", detalle: "Bajó el stock esta semana", icono: VentasIcon, color: "verde", cuenta: (f) => f.ventas7 > 0 && f.estado !== "desaparecido", atajo: { id: "vende", etiqueta: "Se están vendiendo", ayuda: "Filtrar: bajó el stock esta semana", filtro: seleccion("senal", "vende_semana") } },
  { id: "nuevo", titulo: "Nuevos", detalle: "Aparecieron hace menos de 14 días", icono: MasIcon, color: "azul", cuenta: (f) => f.nuevo, atajo: { id: "nuevo", etiqueta: "Nuevos", ayuda: "Filtrar: nuevos", filtro: seleccion("senal", "nuevo") } },
  { id: "parecido", titulo: "Parecidos a lo nuestro", detalle: "Revísalos antes de testear", icono: BuscarIcon, color: "ambar", cuenta: (f) => !f.yaVisto && !f.marcado && f.parecidos.length > 0, atajo: { id: "parecido", etiqueta: "Parecidos", ayuda: "Filtrar: parecidos a algo nuestro", filtro: seleccion("cruce", "parecido") } },
  { id: "varios", titulo: "En varios proveedores", detalle: "El mismo producto en otros lados", icono: ActualizarIcon, color: "rojo", cuenta: (f) => f.repetidoEn.length > 0, atajo: { id: "varios", etiqueta: "En varios proveedores", ayuda: "Filtrar: en varios proveedores", filtro: seleccion("cruce", "prioridad") } },
];

function TarjetaScraping({ t, valor }: { t: Tarjeta; valor: number }) {
  const [filtros, cambiarFiltros] = useFiltros(DEF_SCRAPING);
  const activa = atajoActivo(filtros, t.atajo);
  const c = COLORES[t.color];
  const Icono = t.icono;
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={() => cambiarFiltros(alternarAtajo(filtros, t.atajo))}
      className={`group flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${anilloFoco} ${activa ? `ring-2 ${c.activa}` : "border-border"}`}
    >
      <span className="flex items-center gap-3">
        <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
          <Icono className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 text-sm font-semibold">{t.titulo}</span>
      </span>
      <span className={`text-3xl leading-none font-bold tabular-nums ${c.numero}`}>{formatoNumero(valor)}</span>
      <span className="text-xs text-muted-foreground">{t.detalle}</span>
    </button>
  );
}

/** Los países: un botón por país con cuántos hay para testear; elegir uno filtra la lista, «Todos» quita el filtro. */
function Paises({ filas }: { filas: FilaScraping[] }) {
  const [filtros, cambiarFiltros] = useFiltros(DEF_SCRAPING);
  const elegido = (() => {
    const f = filtros.find((x) => x.campo === "pais");
    return f && f.valor.tipo === "seleccion" && f.valor.valores.length === 1 ? f.valor.valores[0] : null;
  })();
  const paises = [...new Set(filas.map((f) => nombrePais(f.pais)))].sort();
  const paraTestear = (pais: string | null) => filas.filter((f) => f.recomendacion === "testear" && (!pais || nombrePais(f.pais) === pais)).length;
  const elegir = (pais: string | null) => cambiarFiltros([...filtros.filter((x) => x.campo !== "pais"), ...(pais ? [seleccion("pais", pais)] : [])]);
  if (paises.length === 0) return null;
  return (
    <div role="group" aria-label="País" className="flex flex-wrap items-center gap-2">
      {[null, ...paises].map((p) => {
        const activo = elegido === p;
        return (
          <button
            key={p ?? "todos"}
            type="button"
            aria-pressed={activo}
            onClick={() => elegir(p)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border py-1 pr-1.5 pl-4 text-sm font-semibold transition-colors ${anilloFoco} ${activo ? "border-primario bg-primario text-white" : "border-border-control bg-card hover:bg-muted"}`}
          >
            {p ?? "Todos"}
            <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ${activo ? "bg-white/25 text-white" : "bg-primario-suave text-primario"}`}>{paraTestear(p)}</span>
          </button>
        );
      })}
      <span className="ml-auto text-xs text-muted-foreground">El número: productos para testear en cada país</span>
    </div>
  );
}

function Celda({ nombre, principal, apoyo, derecha = false }: { nombre: string; principal: ReactNode; apoyo?: ReactNode; derecha?: boolean }) {
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${derecha ? "lg:items-end lg:text-right" : ""}`}>
      <span className="sr-only">{nombre}: </span>
      <span className="min-w-0 max-w-full text-sm">{principal}</span>
      {apoyo && <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">{apoyo}</span>}
    </span>
  );
}

function Encabezado({ conAccion }: { conAccion: boolean }) {
  return (
    <div className={`hidden items-center gap-x-4 py-2.5 pl-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid ${conAccion ? "pr-[10rem]" : "pr-4"} ${COLUMNAS}`}>
      <span>Producto</span>
      <span className="text-right">Precio</span>
      <span className="text-right">Ventas estimadas · 30 días</span>
      <span>Recomendación</span>
      <span aria-hidden="true" />
    </div>
  );
}

/** Una fila: foto, nombre con país y proveedor (y a qué se parece de lo nuestro), precio, ventas estimadas y recomendación. */
function FilaProducto({ f, alAbrir, puedeEscribir }: { f: FilaScraping; alAbrir: () => void; puedeEscribir: boolean }) {
  const local = formatoPrecio(f.precio, f.pais);
  const enDolares = f.pais !== "pa" && f.precioUsd !== null;
  const rec = RECOMENDACIONES.find((r) => r.valor === f.recomendacion)!;
  const parecido = !f.yaVisto && !f.marcado ? f.parecidos[0] : null;
  const fila = (
    <button
      type="button"
      onClick={alAbrir}
      aria-label={`Abrir la ficha de ${f.nombre}`}
      className={`group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${COLUMNAS} ${anilloFoco}`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Foto fila={f} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{f.nombre}</span>
          <span className="truncate text-xs text-muted-foreground">
            {nombrePais(f.pais)} · {f.proveedor}
            {f.nuevo ? ` · Nuevo, visto el ${formatearFecha(f.primeraVez)}` : ""}
            {f.repetidoEn.length ? ` · también en ${f.repetidoEn.length} ${f.repetidoEn.length === 1 ? "lado" : "lados"}` : ""}
          </span>
          {parecido && <span className="truncate text-xs font-semibold text-warning">Se parece a «{parecido.nombre}»</span>}
          {f.yaVisto && <span className="truncate text-xs text-muted-foreground">{f.yaVisto.motivo}</span>}
        </span>
      </span>
      <span className="order-last col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:order-none lg:contents">
        <Celda nombre="Precio" derecha principal={<span className="font-semibold tabular-nums">{enDolares ? formatoUsd(f.precioUsd) : local}</span>} apoyo={enDolares ? local : undefined} />
        <Celda
          nombre="Ventas estimadas en 30 días"
          derecha
          principal={<span className={`font-semibold tabular-nums ${f.ventas30 ? "text-success" : "text-muted-foreground"}`}>{f.ventas30 ? `${formatoNumero(f.ventas30)} ventas est.` : "Sin ventas"}</span>}
          apoyo={f.estado === "desaparecido" ? "ya no está en Dropi" : `stock ${formatoNumero(f.stock)}${f.ventas7 ? ` · bajó ${formatoNumero(f.ventas7)} esta semana` : ""}`}
        />
        <Celda nombre="Recomendación" principal={<span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-bold ${CLASE_RECOMENDACION[f.recomendacion]}`}>{rec.etiqueta}</span>} />
      </span>
      <ChevronRightIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 lg:order-last" />
    </button>
  );
  if (!puedeEscribir) return fila;
  return (
    <div className="flex items-center">
      <div className="min-w-0 flex-1">{fila}</div>
      <span className="w-[10rem] shrink-0 pr-4">{f.recomendacion !== "sin_senales" && (f.recomendacion !== "tenemos" || f.marcado) && <BotonYaLoTenemos fila={f} compacto />}</span>
    </div>
  );
}

/**
 * Scraping de proveedores, versión sencilla (26 oct 2026, boceto «Versión 2» aprobado: https://claude.ai/artifact/3LFJ3vrW1e72unXf453jZJ):
 * el reporte de qué testear de los proveedores referentes de todos los países. Tablero como el de Gestión de IDs Dropi, un botón
 * por país, y la lista con solo «Testear» y «Mirar de cerca» (lo que ya tenemos y lo que no se mueve, detrás de un botón). Cada
 * fila se puede sacar con «Ya lo tenemos».
 */
export function VistaScraping({
  filas,
  proveedores,
  puedeEscribir,
  puedeEnviar,
  puedeActualizar,
}: {
  filas: FilaScraping[];
  proveedores: number;
  puedeEscribir: boolean;
  /** Puede crear filas en Selección de productos (y modificar Scraping). */
  puedeEnviar: boolean;
  /** Ve «Actualizar datos» (por ahora solo Hernán). */
  puedeActualizar: boolean;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [, iniciarEnvio] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  const enviar = (ids: string[]) =>
    iniciarEnvio(async () => {
      const r = await enviarASeleccion(ids);
      if (r.error) return mostrarToast(r.error, "destructive");
      const partes = [`${r.enviados} enviado${r.enviados === 1 ? "" : "s"} a Selección`];
      if (r.descartados) partes.push(`${r.descartados} llegaron descartados (ya vistos)`);
      if (r.yaEstaban) partes.push(`${r.yaEstaban} ya estaban`);
      mostrarToast(partes.join(" · "), "success");
      router.refresh();
    });
  const filaAbierta = filas.find((f) => f.id === abierto) ?? null;
  const boton = `inline-flex min-h-10 items-center gap-2 rounded-lg border border-border-control bg-card px-3.5 text-sm font-semibold hover:bg-muted ${anilloFoco}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-3xl flex-col gap-1">
          <h1 className="m-0 text-2xl font-bold">Scraping de proveedores</h1>
          <p className="m-0 text-sm text-muted-foreground">Qué testear de lo que venden los proveedores referentes de otros países.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeActualizar && (
            <Link href="/publicaciones-dropi/actualizar" className={boton}>
              <ActualizarIcon className="h-4 w-4" />
              Actualizar datos
            </Link>
          )}
          <Link href="/scraping-proveedores/proveedores" className={`inline-flex min-h-10 items-center rounded-lg bg-gradient-to-r from-primario to-[#6d28d9] px-4 text-sm font-semibold text-white hover:opacity-90 ${anilloFoco}`}>
            Proveedores ({proveedores})
          </Link>
        </div>
      </div>

      <section aria-label="Tablero" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
        {TARJETAS.map((t) => (
          <TarjetaScraping key={t.id} t={t} valor={filas.filter(t.cuenta).length} />
        ))}
      </section>

      <Paises filas={filas} />

      <ListaDatos
        def={DEF_SCRAPING}
        filas={filas}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        variante="filas"
        encabezado={<Encabezado conAccion={puedeEscribir} />}
        renderFila={(f) => <FilaProducto f={f} alAbrir={() => setAbierto(f.id)} puedeEscribir={puedeEscribir} />}
        etiquetaGrupo={(campo, grupo) => {
          const r = campo === "recomendacion" && grupo.clave !== SIN_VALOR ? RECOMENDACIONES.find((x) => x.valor === grupo.clave) : null;
          return r ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CLASE_RECOMENDACION[r.valor]}`}>{r.etiqueta}</span>
              <span className="text-xs text-muted-foreground">{r.detalle}</span>
            </span>
          ) : (
            <span className="font-semibold">{grupo.etiqueta}</span>
          );
        }}
        vacio={proveedores ? "Nada para testear con estos filtros. «Ya lo tenemos y sin señales» muestra el resto." : "Todavía no hay proveedores: agrégalos en «Proveedores»."}
      />

      <FichaProducto fila={filaAbierta} puedeEnviar={puedeEscribir && puedeEnviar} puedeEscribir={puedeEscribir} alCerrar={() => setAbierto(null)} alEnviar={(ids) => enviar(ids)} />
    </div>
  );
}
