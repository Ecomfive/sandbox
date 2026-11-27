"use client";

import { dolaresEnteros } from "@/lib/meta-ads/metricas";
import { claveDeHallazgo } from "@/lib/meta-ads/sugerencias";
import { claveDeProducto } from "@/lib/meta-ads/nombre";
import { GuiaEnLinea } from "./aviso-tope";
import { BotonesDecidir, Omitidas, useDecisiones } from "./decidir";
import { tieneSenales, type CausaCreativa, type SenalesCreativas, type VideoSenal } from "@/lib/meta-ads/senales-creativas";
import { NOMBRE_MODULO_SENAL, type Gravedad, type SenalModulo } from "@/lib/meta-ads/senales-modulos";
import { BarraProgreso } from "./graficas";
import { SeccionPlegable } from "./plegable";
import { VerVideoEjemplo } from "./ver-video-ejemplo";
import { AvisoRentable } from "./aviso-rentable";
import type { VideoEjemplo } from "@/lib/meta-ads/video-ejemplo";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);
const cambio = (rec: number | null, prev: number | null) => (rec === null || prev === null || prev === 0 ? null : rec / prev - 1);

type Tono = "rojo" | "ambar" | "azul";
const CLASE: Record<Tono, { suave: string; solido: string; icono: string }> = {
  rojo: { suave: "bg-destructive-soft text-destructive", solido: "bg-destructive text-white", icono: "bg-destructive-soft text-destructive" },
  ambar: { suave: "bg-warning-soft text-warning", solido: "bg-warning text-white", icono: "bg-warning-soft text-warning" },
  azul: { suave: "bg-meta-3/15 text-meta-3", solido: "bg-meta-3 text-white", icono: "bg-meta-3/15 text-meta-3" },
};

/** Cada tipo de señal: su etiqueta corta, su color y su ícono (el significado va también en la forma, no solo en el color). */
const DE_CAUSA: Record<CausaCreativa["tipo"], { etiqueta: string; tono: Tono; icono: string }> = {
  cansancio: { etiqueta: "Creativo cansado", tono: "rojo", icono: "M3 12h3l2-6 3 12 2-6h3" },
  dependencia: { etiqueta: "Un solo video", tono: "ambar", icono: "M8 2.5 14 13H2L8 2.5Zm0 4v3m0 1.8v.1" },
  sin_renovacion: { etiqueta: "Sin videos nuevos", tono: "ambar", icono: "M8 3v5l3 2M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" },
  nuevos_peores: { etiqueta: "Lo nuevo rinde peor", tono: "rojo", icono: "M2.5 5 6 8.5l2.5-2.5 5 5.5M10.5 11.5h3v-3" },
};
const TONO_GRAVEDAD: Record<Gravedad, Tono> = { alta: "rojo", media: "ambar", info: "azul" };
const ETIQUETA_OTRA: Record<SenalModulo["tipo"], string> = {
  sin_stock: "Sin inventario",
  poco_stock: "Poco inventario",
  precio_cambio: "Cambió el precio",
  margen_bajo: "Margen bajo",
  competencia: "Avisos de competencia",
  mas_baratos: "Competencia más barata",
  test_mejor: "Rendía mejor en su test",
};
const ICONO_OTRA: Record<SenalModulo["modulo"], string> = {
  inventario: "M2.5 5.5 8 2.5l5.5 3v5L8 13.5l-5.5-3v-5ZM2.5 5.5 8 8.5l5.5-3M8 8.5v5",
  "publicaciones-dropi": "M8 2v12M10.5 5H7a1.8 1.8 0 0 0 0 3.6h2A1.8 1.8 0 0 1 9 12.2H5.5",
  "analisis-competencia": "M2.5 12.5 6 8l2.5 2.5L13.5 4M10 4h3.5v3.5",
  "productos-test": "M6 2.5h4M7 2.5v4L3.5 12.5a1 1 0 0 0 .9 1.5h7.2a1 1 0 0 0 .9-1.5L9 6.5v-4",
};

interface Fila {
  clave: string;
  etiqueta: string;
  tono: Tono;
  icono: string;
  titulo: string;
  detalle: string;
  accion: string;
  modulo?: string;
  /** La llave con la que se recuerda lo decidido sobre esta señal de este producto. */
  decision: string;
  /** El video de ejemplo del ángulo que se recomienda (solo en las de creativos). */
  video?: VideoEjemplo | null;
}

function filasDe(s: SenalesCreativas): Fila[] {
  const llave = (tipo: string) => claveDeHallazgo(`senal:${s.producto}:${tipo}`);
  // Lo que va dentro del tope queda «en espera», en azul: se prepara, pero todavía no se toca.
  const a: Fila[] = s.causas.map((c) => ({ clave: c.titulo, etiqueta: c.enEspera ? `En espera · ${DE_CAUSA[c.tipo].etiqueta}` : DE_CAUSA[c.tipo].etiqueta, tono: c.enEspera ? "azul" : DE_CAUSA[c.tipo].tono, icono: DE_CAUSA[c.tipo].icono, titulo: c.titulo, detalle: c.detalle, accion: c.accion, decision: llave(c.tipo), video: s.mejorAngulo?.video ?? null }));
  const b: Fila[] = (s.otras ?? []).map((o) => ({ clave: o.titulo, etiqueta: ETIQUETA_OTRA[o.tipo], tono: TONO_GRAVEDAD[o.gravedad], icono: ICONO_OTRA[o.modulo], titulo: o.titulo, detalle: o.detalle, accion: o.accion, modulo: NOMBRE_MODULO_SENAL[o.modulo], decision: llave(o.tipo) }));
  const peso = (f: Fila) => (f.tono === "rojo" ? 0 : f.tono === "ambar" ? 1 : 2);
  return [...a, ...b].sort((x, y) => peso(x) - peso(y));
}

function FilaVideo({ v }: { v: VideoSenal }) {
  const c = cambio(v.ctrRec, v.ctrPrev);
  const h = cambio(v.hookRec, v.hookPrev);
  const fmt = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n * 100)} %`);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 text-xs sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
      <span className="min-w-0">
        <span className="block truncate font-medium" title={v.nombre}>
          {v.nombre}
        </span>
        <span className="text-muted-foreground">
          {v.edadDias} días · {v.angulo ?? "sin ángulo"}
        </span>
      </span>
      <span className="hidden sm:block">
        <BarraProgreso valor={v.parte * 100} maximo={100} color={v.cansado ? "var(--destructive)" : "var(--meta-1)"} alto={8} />
      </span>
      <span className="flex flex-wrap items-center justify-end gap-1.5 tabular-nums">
        <span className="text-muted-foreground">{pct(v.parte)} del gasto</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${c !== null && c < -0.15 ? CLASE.rojo.suave : "bg-muted text-muted-foreground"}`}>CTR {fmt(c)}</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${h !== null && h < -0.15 ? CLASE.rojo.suave : "bg-muted text-muted-foreground"}`}>Hook {fmt(h)}</span>
        {v.cansado && <span className={`rounded-full px-2 py-0.5 font-medium ${CLASE.rojo.solido}`}>Cansado</span>}
      </span>
    </li>
  );
}

function Icono({ d, tono }: { d: string; tono: Tono }) {
  return (
    <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${CLASE[tono].icono}`}>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

function Producto({ s }: { s: SenalesCreativas }) {
  const { ocultas, guias } = useDecisiones();
  const filas = filasDe(s).filter((f) => !ocultas.has(f.decision));
  const guia = guias[claveDeProducto(s.producto)];
  const peor: Tono = filas[0]?.tono ?? "azul";
  const visibles = filas.slice(0, 4);
  return (
    <li className="rounded-lg border border-border bg-card">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground [&::-webkit-details-marker]:hidden">
          <Icono d={filas[0]?.icono ?? DE_CAUSA.cansancio.icono} tono={peor} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium leading-snug">{s.producto}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{dolaresEnteros(s.gasto14)} en 14 días</span>
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              {visibles.map((f) => (
                <span key={f.clave} className={`rounded-full px-2 py-0.5 font-medium ${f.tono === "rojo" ? CLASE.rojo.solido : CLASE[f.tono].suave}`}>
                  {f.etiqueta}
                </span>
              ))}
              {filas.length > visibles.length && <span className="text-muted-foreground">+{filas.length - visibles.length} más</span>}
            </span>
          </span>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className="mt-1.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </summary>
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          {guia && <GuiaEnLinea guia={guia} />}
          <AvisoRentable aviso={s.rentabilidad} />
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {filas.map((f) => (
              <li key={f.clave} className="flex gap-3 rounded-md border border-border p-2.5 text-sm">
                <Icono d={f.icono} tono={f.tono} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 flex flex-wrap items-center gap-2 font-medium leading-snug">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${f.tono === "rojo" ? CLASE.rojo.solido : CLASE[f.tono].suave}`}>{f.etiqueta}</span>
                    {f.modulo && <span className="text-[11px] font-normal text-muted-foreground">{f.modulo}</span>}
                  </p>
                  <p className="m-0 mt-1 text-sm">{f.titulo}</p>
                  <p className="m-0 mt-0.5 text-xs text-muted-foreground">{f.detalle}</p>
                  <p className="m-0 mt-1.5 flex gap-2 rounded-md bg-success-soft px-2.5 py-1.5 text-xs">
                    <span className="shrink-0 font-semibold text-success">Qué hacer</span>
                    <span>{f.accion}</span>
                  </p>
                  <VerVideoEjemplo video={f.video} className="mt-1" />
                  <BotonesDecidir clave={f.decision} titulo={`${s.producto}: ${f.titulo}`} accion={f.accion} className="mt-2" />
                </div>
              </li>
            ))}
          </ul>
          {s.causas.length > 0 && s.videos.length > 0 && (
            <div className="flex flex-col gap-1">
              <h4 className="m-0 text-xs font-semibold text-muted-foreground">Los videos que más gastan (últimos 14 días, frente a la semana anterior)</h4>
              <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                {s.videos.map((v) => (
                  <FilaVideo key={v.id} v={v} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

/**
 * «Por qué empeora» (24 nov 2026; rehecha el mismo día a pedido de Alcides: más vistosa y solo con lo que hay que ver): por producto, lo que se encontró en sus creativos (cansancio, dependencia de un video, falta de renovación, lo nuevo
 * rinde peor) y en otros módulos (inventario, precio, competencia, test), cada señal con su color, su etiqueta, su ícono y la acción concreta. Un producto sin ninguna señal no aparece: no hay nada que decir.
 */
export function SenalesCreativasVista({ senales, abierta = true }: { senales: SenalesCreativas[]; abierta?: boolean }) {
  const { ocultas } = useDecisiones();
  const todas = senales.filter(tieneSenales);
  if (todas.length === 0) return null;
  const visibles = (s: SenalesCreativas) => filasDe(s).filter((f) => !ocultas.has(f.decision));
  const con = todas.filter((s) => visibles(s).length > 0);
  const omitidas = todas.flatMap((s) => filasDe(s).filter((f) => ocultas.has(f.decision)).map((f) => ({ clave: f.decision, titulo: `${s.producto}: ${f.titulo}` })));
  const grado = (s: SenalesCreativas) => (visibles(s)[0]?.tono === "rojo" ? 0 : visibles(s)[0]?.tono === "ambar" ? 1 : 2);
  const orden = [...con].sort((a, b) => grado(a) - grado(b) || visibles(b).length - visibles(a).length || b.gasto14 - a.gasto14);
  const graves = orden.filter((s) => grado(s) === 0).length;
  const avisos = orden.filter((s) => grado(s) === 1).length;
  return (
    <SeccionPlegable
      titulo="Por qué empeora: creativos y otros módulos"
      abierta={abierta}
      resumen={`${orden.length} ${orden.length === 1 ? "producto" : "productos"} con señales`}
      derecha={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {graves > 0 && <span className={`rounded-full px-2 py-0.5 font-medium ${CLASE.rojo.solido}`}>{graves} graves</span>}
          {avisos > 0 && <span className={`rounded-full px-2 py-0.5 font-medium ${CLASE.ambar.suave}`}>{avisos} por cuidar</span>}
        </span>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {orden.map((s) => (
          <Producto key={s.producto} s={s} />
        ))}
      </ul>
      {orden.length === 0 && <p className="m-0 text-sm text-muted-foreground">Nada pendiente aquí.</p>}
      <div className="mt-2">
        <Omitidas items={omitidas} />
      </div>
    </SeccionPlegable>
  );
}
