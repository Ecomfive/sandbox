"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { anilloFoco } from "@/components/ui/field";
import { KpiGrid } from "@/components/ui/kpi-card";
import { KpiFiltro } from "@/components/ui/kpi-filtro";
import { useToast } from "@/components/ui/toast";
import { formatearFecha } from "@/lib/formato";
import { BuscarIcon, CalendarioIcon, CatalogoIcon, ChevronRightIcon, HistorialIcon, InteligenciaIcon, InventarioIcon, PersonaIcon, ProductoIcon } from "@/lib/nav-icons";
import { ETIQUETA_REFERENCIA } from "@/lib/scraping/cruces";
import { RECOMENDACIONES } from "@/lib/scraping/recomendar";
import { SIN_VALOR } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { enviarASeleccion } from "./actions";
import { DEF_SCRAPING, MOTIVO, formatoNumero, formatoPrecio, formatoUsd, type FilaScraping } from "./def-scraping";
import { FichaProducto, Foto, Linea } from "./vista-scraping";

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
const COLUMNAS = "lg:grid-cols-[minmax(0,2.6fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_1rem]";
const u = (n: number) => `${formatoNumero(n)} u.`;

function Celda({ nombre, principal, apoyo, derecha = false }: { nombre: string; principal: ReactNode; apoyo?: ReactNode; derecha?: boolean }) {
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${derecha ? "lg:items-end lg:text-right" : ""}`}>
      <span className="sr-only">{nombre}: </span>
      <span className="min-w-0 max-w-full text-sm">{principal}</span>
      {apoyo && <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">{apoyo}</span>}
    </span>
  );
}

function Recomendacion({ valor }: { valor: FilaScraping["recomendacion"] }) {
  const r = RECOMENDACIONES.find((x) => x.valor === valor)!;
  return (
    <span className="inline-flex w-fit items-center rounded-lg px-2.5 py-1 text-xs font-bold text-white" style={{ background: r.color }}>
      {r.etiqueta}
    </span>
  );
}

/** Las marcas de cruce, como insignias: en cuántos proveedores está, si es nuevo, si ya lo tenemos o está en Selección. */
function Cruces({ f }: { f: FilaScraping }) {
  const marcas: { texto: string; clase: string; ayuda?: string }[] = [];
  if (f.repetidoEn.length) marcas.push({ texto: `En ${f.repetidoEn.length + 1} proveedores`, clase: "bg-destructive-soft text-destructive", ayuda: `También: ${f.repetidoEn.join(", ")}` });
  if (f.nuevo) marcas.push({ texto: "Nuevo", clase: "bg-azul-soft text-azul" });
  if (f.yaVisto) marcas.push({ texto: ETIQUETA_REFERENCIA[f.yaVisto.tipo], clase: "bg-muted text-muted-foreground", ayuda: f.yaVisto.motivo });
  else if (f.parecidos.length) marcas.push({ texto: "Parecido a algo nuestro", clase: "bg-warning-soft text-warning", ayuda: f.parecidos.map((p) => `${p.nombre} (${ETIQUETA_REFERENCIA[p.tipo]}: ${p.detalle})`).join(" · ") });
  if (f.seleccion) marcas.push({ texto: `En Selección · SEL-${String(f.seleccion.numero).padStart(4, "0")}`, clase: "bg-azul-soft text-azul" });
  if (f.estado === "privado") marcas.push({ texto: "Privado", clase: "bg-warning-soft text-warning" });
  if (f.estado === "desaparecido") marcas.push({ texto: `Desapareció · ${MOTIVO[f.motivo ?? "desconocido"]}`, clase: "bg-warning-soft text-warning" });
  if (!marcas.length) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {marcas.map((m) => (
        <span key={m.texto} title={m.ayuda} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.clase}`}>
          {m.texto}
        </span>
      ))}
    </span>
  );
}

function Encabezado() {
  return (
    <div className={`hidden items-center gap-x-4 py-2.5 pr-4 pl-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid ${COLUMNAS}`}>
      <span>Producto</span>
      <span className="text-right">Precio</span>
      <span className="text-right">Ventas estimadas · 30 días</span>
      <span>Desde</span>
      <span>Cruces</span>
      <span>Recomendación</span>
      <span aria-hidden="true" />
    </div>
  );
}

function FilaProducto({ f, alAbrir }: { f: FilaScraping; alAbrir: () => void }) {
  const local = formatoPrecio(f.precio, f.pais);
  return (
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
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="rounded border border-border-control px-1 font-mono font-semibold text-foreground uppercase">{f.pais}</span>
            <span className="truncate">{f.proveedor}</span>
            <span className="tabular-nums">ID {f.dropiId}</span>
            {f.categoria && <span className="truncate">{f.categoria.split(", ")[0]}</span>}
          </span>
        </span>
      </span>
      <span className="order-last col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:order-none lg:contents">
        <Celda nombre="Precio" derecha principal={<span className="font-semibold tabular-nums">{f.pais === "pa" || f.precioUsd === null ? local : formatoUsd(f.precioUsd)}</span>} apoyo={f.pais === "pa" || f.precioUsd === null ? undefined : local} />
        <Celda
          nombre="Ventas estimadas en 30 días"
          derecha
          principal={
            <span className="inline-flex items-center gap-2 tabular-nums">
              <Linea valores={f.serie} ancho={54} alto={20} />
              <span className="font-semibold">{f.ventas30 ? `~${u(f.ventas30)}` : "—"}</span>
            </span>
          }
          apoyo={f.estado === "desaparecido" ? "ya no está" : `stock ${formatoNumero(f.stock)}${f.ventas7 ? ` · bajó ${formatoNumero(f.ventas7)} esta semana` : ""}`}
        />
        <Celda
          nombre="Desde"
          principal={<span className={f.nuevo ? "font-semibold text-azul" : ""}>{f.nuevo ? "Nuevo" : f.creadoEnDropi ? formatearFecha(f.creadoEnDropi) : formatearFecha(f.primeraVez)}</span>}
          apoyo={f.nuevo ? `visto el ${formatearFecha(f.primeraVez)}` : f.creadoEnDropi ? "en Dropi desde" : "visto desde"}
        />
        <Celda nombre="Cruces" principal={<Cruces f={f} />} />
        <Celda nombre="Recomendación" principal={<Recomendacion valor={f.recomendacion} />} />
      </span>
      <ChevronRightIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 lg:order-last" />
    </button>
  );
}

/**
 * Scraping de proveedores (rediseño del 26 oct 2026, como Gestión de IDs Dropi; boceto aprobado
 * https://claude.ai/artifact/3LFJ3vrW1e72unXf453jZJ): los productos de TODOS los proveedores referentes, de todos los países, en una
 * lista agrupada por recomendación (Testear, Mirar de cerca, Ya lo tenemos, Sin señales), con el tablero de acciones arriba. Cada
 * fila abre su ficha con el porqué. Los proveedores se ven y se agregan en «Proveedores».
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
  const cuenta = (pred: (f: FilaScraping) => boolean) => filas.filter(pred).length;
  const filaAbierta = filas.find((f) => f.id === abierto) ?? null;
  const boton = `inline-flex min-h-10 items-center gap-2 rounded-lg border border-border-control bg-card px-3.5 text-sm font-semibold hover:bg-muted ${anilloFoco}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-3xl flex-col gap-1">
          <h1 className="m-0 text-2xl font-bold">Scraping de proveedores</h1>
          <p className="m-0 text-sm text-muted-foreground">Lo que venden y testean los proveedores referentes de otros países, sin entrar a Dropi. Las ventas se estiman con lo que baja el stock entre búsquedas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeActualizar && (
            <Link href="/publicaciones-dropi/actualizar" className={boton}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 3v6h-6" />
              </svg>
              Actualizar datos
            </Link>
          )}
          <Link href="/scraping-proveedores/proveedores" className={boton}>
            Proveedores ({proveedores})
          </Link>
        </div>
      </div>

      <KpiGrid compacta>
        <KpiFiltro compacta def={DEF_SCRAPING} titulo="Para testear" valor={cuenta((f) => f.recomendacion === "testear")} subtexto="se venden y no los tenemos" atajo={{ id: "testear", etiqueta: "Para testear", ayuda: "Filtrar: para testear", filtro: { campo: "recomendacion", valor: { tipo: "seleccion", valores: ["testear"] } } }} />
        <KpiFiltro compacta def={DEF_SCRAPING} tono="success" titulo="Se están vendiendo" valor={cuenta((f) => f.ventas7 > 0 && f.estado !== "desaparecido")} subtexto="bajó el stock esta semana" atajo={{ id: "vende", etiqueta: "Se vende", ayuda: "Filtrar: bajó el stock esta semana", filtro: { campo: "senal", valor: { tipo: "seleccion", valores: ["vende_semana"] } } }} />
        <KpiFiltro compacta def={DEF_SCRAPING} tono="destructive" titulo="En varios proveedores" valor={cuenta((f) => f.repetidoEn.length > 0)} subtexto="mismo producto en otros lados" atajo={{ id: "prioridad", etiqueta: "En varios", ayuda: "Filtrar: en varios proveedores", filtro: { campo: "cruce", valor: { tipo: "seleccion", valores: ["prioridad"] } } }} />
        <KpiFiltro compacta def={DEF_SCRAPING} tono="info" titulo="Nuevos" valor={cuenta((f) => f.nuevo)} subtexto="en los últimos 14 días" atajo={{ id: "nuevo", etiqueta: "Nuevos", ayuda: "Filtrar: nuevos", filtro: { campo: "senal", valor: { tipo: "seleccion", valores: ["nuevo"] } } }} />
        <KpiFiltro compacta def={DEF_SCRAPING} tono="warning" titulo="Parecidos a lo nuestro" valor={cuenta((f) => !f.yaVisto && f.parecidos.length > 0)} subtexto="revísalos antes de testear" atajo={{ id: "parecido", etiqueta: "Parecidos", ayuda: "Filtrar: parecidos a algo nuestro", filtro: { campo: "cruce", valor: { tipo: "seleccion", valores: ["parecido"] } } }} />
        <KpiFiltro compacta def={DEF_SCRAPING} titulo="Ya los tenemos" valor={cuenta((f) => f.recomendacion === "tenemos")} subtexto="testeados, en Producto, comprados o en Dropi" atajo={{ id: "tenemos", etiqueta: "Ya los tenemos", ayuda: "Filtrar: ya los tenemos", filtro: { campo: "recomendacion", valor: { tipo: "seleccion", valores: ["tenemos"] } } }} />
        <KpiFiltro compacta def={DEF_SCRAPING} tono="warning" titulo="Desaparecieron" valor={cuenta((f) => f.estado === "desaparecido")} subtexto={`${cuenta((f) => f.motivo === "agotado")} agotados · ${cuenta((f) => f.motivo === "privatizado")} privatizados`} atajo={{ id: "desaparecido", etiqueta: "Desaparecidos", ayuda: "Filtrar: desaparecidos", filtro: { campo: "estado", valor: { tipo: "seleccion", valores: ["desaparecido"] } } }} />
      </KpiGrid>

      <ListaDatos
        def={DEF_SCRAPING}
        filas={filas}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        variante="filas"
        encabezado={<Encabezado />}
        renderFila={(f) => <FilaProducto f={f} alAbrir={() => setAbierto(f.id)} />}
        etiquetaGrupo={(campo, grupo) => {
          const r = campo === "recomendacion" && grupo.clave !== SIN_VALOR ? RECOMENDACIONES.find((x) => x.valor === grupo.clave) : null;
          return r ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: r.color }}>
                {r.etiqueta}
              </span>
              <span className="text-xs text-muted-foreground">{r.detalle}</span>
            </span>
          ) : (
            <span className="font-semibold">{grupo.etiqueta}</span>
          );
        }}
        vacio={proveedores ? "Todavía no hay productos: corre la primera búsqueda de los proveedores." : "Todavía no hay proveedores: agrégalos en «Proveedores»."}
      />

      <FichaProducto fila={filaAbierta} puedeEnviar={puedeEscribir && puedeEnviar} alCerrar={() => setAbierto(null)} alEnviar={(ids) => enviar(ids)} />
    </div>
  );
}
