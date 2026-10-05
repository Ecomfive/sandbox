"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BotonBarra, CabeceraTarjeta, Delta, Indicador, Pastilla, Punto, Segmentado } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { etiquetaEtapa, type FilaCompra } from "./def-compras";
import {
  abiertasPorEtapa,
  diasEntre,
  entero,
  enTransito,
  estadisticasPeriodo,
  estaAbierta,
  etiquetaCorta,
  etiquetaPeriodo,
  finDe,
  hoy,
  paraRevisar,
  periodos as armarPeriodos,
  resumenDias,
  textoInforme,
  transitos,
  umbralesTransito,
  usd,
  type Granularidad,
} from "./calculos-compras";
import { SelectorVista } from "./selector-vista";

const OPCIONES: { valor: Granularidad; etiqueta: string }[] = [
  { valor: "dia", etiqueta: "Día" },
  { valor: "semana", etiqueta: "Semana" },
  { valor: "mes", etiqueta: "Mes" },
];
const BARRAS: Record<Granularidad, number> = { dia: 30, semana: 12, mes: 12 };
const TITULO: Record<Granularidad, string> = { dia: "Informe diario", semana: "Informe semanal", mes: "Informe mensual" };
const VIAS = [
  { valor: "mar", nombre: "🚢 Mar" },
  { valor: "aire", nombre: "🛩️ Aire" },
  { valor: "tierra", nombre: "🛻 Tierra" },
];

/** Una barra horizontal con su número (abiertas por etapa). */
function Barra({ nombre, valor, maximo, href }: { nombre: string; valor: number; maximo: number; href: string }) {
  return (
    <Link href={href} className={`block rounded px-1 py-0.5 hover:bg-muted ${anilloFoco}`}>
      <span className="flex justify-between text-[13px]">
        <span>{nombre}</span>
        <b className="font-medium tabular-nums">{valor}</b>
      </span>
      <span className="mt-1 block h-1.5 rounded-full bg-muted">
        <span className="block h-1.5 rounded-full bg-foreground/70" style={{ width: `${maximo ? (valor / maximo) * 100 : 0}%` }} />
      </span>
    </Link>
  );
}

/**
 * Informe de Compras por día, semana o mes (como el de Productos Test): lo que se creó, pagó, envió y llegó en el periodo
 * (pulsar una barra elige otro), cómo está hoy la operación (abiertas, en tránsito, atrasadas, con inconveniente), las
 * abiertas por etapa, cuánto tarda cada vía de envío y lo que hay que revisar. «Copiar informe» lo deja listo para enviar.
 */
export function InformeCompras({
  compras,
  vista,
  paises,
  puedeAgregarPais,
}: {
  compras: FilaCompra[];
  vista: string;
  paises: { codigo: string; nombre: string }[];
  puedeAgregarPais: boolean;
}) {
  const { mostrarToast } = useToast();
  const [g, setG] = useState<Granularidad>("mes");
  const [elegida, setElegida] = useState<string | null>(null);

  const lista = useMemo(() => armarPeriodos(compras, g), [compras, g]);
  const umbral = useMemo(() => umbralesTransito(compras), [compras]);
  const revisar = useMemo(() => paraRevisar(compras, umbral), [compras, umbral]);
  const etapas = useMemo(() => abiertasPorEtapa(compras), [compras]);
  const dia = hoy();

  const barraSuperior = (
    <div className="flex flex-wrap items-center gap-2">
      <SelectorVista vista={vista} paises={paises} puedeAgregarPais={puedeAgregarPais} />
      <Segmentado
        etiqueta="Agrupar por"
        valor={g}
        alCambiar={(v) => {
          setG(v);
          setElegida(null);
        }}
        opciones={OPCIONES}
      />
    </div>
  );

  if (!lista.length) {
    return (
      <div className="flex flex-col gap-5">
        {barraSuperior}
        <p className="rounded-[10px] border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">Todavía no hay compras en esta vista.</p>
      </div>
    );
  }

  const enCurso = (clave: string) => finDe(clave, g) >= dia;
  const indice = Math.max(0, lista.findIndex((p) => p.clave === (elegida ?? lista[lista.length - 1].clave)));
  const actual = lista[indice];
  const anterior = indice > 0 ? lista[indice - 1] : null;
  const s = estadisticasPeriodo(compras, actual.clave, g);
  const sa = anterior ? estadisticasPeriodo(compras, anterior.clave, g) : null;
  // La ventana de barras termina en el periodo elegido (o en las primeras, si se eligió uno de los primeros).
  const finVentana = Math.min(lista.length, Math.max(indice + 1, BARRAS[g]));
  const visibles = lista.slice(Math.max(0, finVentana - BARRAS[g]), finVentana);
  const maximo = Math.max(1, ...visibles.map((p) => p.creadas.length));
  const abiertas = compras.filter(estaAbierta);
  const transito = abiertas.filter(enTransito);
  const maxEtapa = Math.max(0, ...etapas.map((e) => e.cantidad));
  const ver = vista === "todos" ? "" : `ver=${vista}&`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoInforme(compras, actual.clave, g, vista, umbral));
      mostrarToast("Informe copiado");
    } catch {
      mostrarToast("No se pudo copiar. Tu navegador bloqueó el acceso al portapapeles.", "destructive");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {barraSuperior}
        <BotonBarra aria-label="Periodo anterior" disabled={indice === 0} onClick={() => setElegida(lista[indice - 1].clave)} className="w-[34px] justify-center px-0 disabled:opacity-40">
          ‹
        </BotonBarra>
        <h2 className="min-w-[10rem] text-[15px] font-semibold tracking-tight">
          {etiquetaPeriodo(actual.clave, g)}
          {enCurso(actual.clave) && (
            <span className="ml-2 align-[2px]">
              <Pastilla tono="aviso">en curso</Pastilla>
            </span>
          )}
        </h2>
        <BotonBarra aria-label="Periodo siguiente" disabled={indice === lista.length - 1} onClick={() => setElegida(lista[indice + 1].clave)} className="w-[34px] justify-center px-0 disabled:opacity-40">
          ›
        </BotonBarra>
        <span className="flex-1" />
        <BotonBarra principal onClick={copiar}>
          Copiar informe
        </BotonBarra>
      </div>

      <section aria-label="Indicadores del periodo" className="overflow-hidden rounded-[10px] border border-border bg-card">
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 border-b border-border bg-muted px-3.5 py-2 text-xs">
          <span className="font-semibold tracking-[0.04em] text-muted-foreground uppercase">{TITULO[g]}</span>
          <span className="text-muted-foreground">{anterior ? `comparado con ${etiquetaPeriodo(anterior.clave, g)}` : "sin periodo anterior para comparar"}</span>
        </div>
        <div className="flex flex-wrap">
          <Indicador titulo="Compras creadas" valor={entero(s.creadas)} detalle={sa ? <><Delta valor={s.creadas - sa.creadas} sufijo="" decimales={0} /> vs anterior</> : "en el periodo"} />
          <Indicador titulo="Pagado a proveedores" valor={usd(s.pagado, true)} detalle={`${s.pagadas} pagos iniciales`} />
          <Indicador titulo="Unidades" valor={entero(s.unidades)} detalle="de las compras creadas" />
          <Indicador titulo="Enviadas / llegadas" valor={`${s.enviadas} / ${s.llegadas}`} detalle="salieron y llegaron en el periodo" />
          <Indicador titulo="Completadas" valor={entero(s.cerradas)} detalle={s.ciclo.mediana !== null ? `ciclo de ${s.ciclo.mediana} días (mediana)` : "en el periodo"} />
        </div>
      </section>

      <section aria-label="La operación hoy" className="overflow-hidden rounded-[10px] border border-border bg-card">
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 border-b border-border bg-muted px-3.5 py-2 text-xs">
          <span className="font-semibold tracking-[0.04em] text-muted-foreground uppercase">Hoy</span>
          <span className="text-muted-foreground">todas las fechas</span>
        </div>
        <div className="flex flex-wrap">
          <Indicador titulo="Abiertas" valor={entero(abiertas.length)} detalle="sin completar ni descartar" href={`/compras/lista?${ver}grupo=abiertas`} />
          <Indicador titulo="En tránsito" valor={entero(transito.length)} detalle="salieron y no han llegado" href={`/compras/lista?${ver}grupo=transito`} />
          <Indicador
            titulo="Atrasadas"
            punto={revisar.atrasadas.length ? "peligro" : undefined}
            valor={entero(revisar.atrasadas.length)}
            detalle="más de lo normal para su vía"
            href={`/compras/lista?${ver}grupo=atrasadas`}
          />
          <Indicador titulo="Con inconveniente" punto={revisar.conInconveniente.length ? "aviso" : undefined} valor={entero(revisar.conInconveniente.length)} detalle="aduana, retrasos…" />
          <Indicador titulo="Pago pendiente" valor={usd(revisar.pagoPendiente.reduce((t, c) => t + (c.pagoPendiente ?? 0), 0), true)} detalle={`en ${revisar.pagoPendiente.length} compras`} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 min-[960px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="c-grafica" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="c-grafica" titulo="Compras creadas">
            <span className="text-xs text-muted-foreground">pulsa una barra para ver ese periodo</span>
          </CabeceraTarjeta>
          <div className="p-3.5">
            <div className="flex h-[170px] items-end gap-1 px-0.5 pt-1.5">
              {visibles.map((p) => (
                <button
                  key={p.clave}
                  type="button"
                  aria-pressed={p.clave === actual.clave}
                  aria-label={`${etiquetaPeriodo(p.clave, g)}: ${p.creadas.length} compras creadas`}
                  onClick={() => setElegida(p.clave)}
                  className={`flex h-full min-w-0 flex-1 flex-col justify-end rounded p-0 hover:bg-muted aria-pressed:bg-muted ${anilloFoco}`}
                >
                  <span
                    className={`block rounded-sm ${p.clave === actual.clave ? "bg-foreground" : "bg-border-control"}`}
                    style={{ height: `${(p.creadas.length / maximo) * 100}%`, minHeight: p.creadas.length ? 2 : 0 }}
                  />
                </button>
              ))}
            </div>
            <div aria-hidden="true" className="flex gap-1 px-0.5 pt-1 text-[11px] text-muted-foreground">
              {visibles.map((p, i) => (
                <span key={p.clave} className={`min-w-0 flex-1 overflow-hidden text-center whitespace-nowrap ${p.clave === actual.clave ? "font-semibold text-foreground" : ""}`}>
                  {g === "mes" || i % Math.ceil(visibles.length / 8) === 0 ? etiquetaCorta(p.clave, g) : ""}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="c-etapas" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="c-etapas" titulo="Abiertas por etapa">
            <span className="text-xs text-muted-foreground tabular-nums">{abiertas.length}</span>
          </CabeceraTarjeta>
          <div className="flex flex-col gap-1.5 p-3">
            {etapas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay compras abiertas.</p>
            ) : (
              etapas.map((e) => <Barra key={e.etapa} nombre={etiquetaEtapa(e.etapa)} valor={e.cantidad} maximo={maxEtapa} href={`/compras/lista?${ver}etapa=${e.etapa}`} />)
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[960px]:grid-cols-2">
        <section aria-labelledby="c-vias" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="c-vias" titulo="Tránsito por vía de envío">
            <span className="text-xs text-muted-foreground">del envío a la llegada</span>
          </CabeceraTarjeta>
          <ul className="m-0 flex list-none flex-col p-0">
            {VIAS.map((v) => {
              const r = resumenDias(transitos(compras, v.valor));
              return (
                <li key={v.valor} className="flex flex-wrap justify-between gap-2 border-b border-border px-3.5 py-2.5 text-[13px] last:border-b-0">
                  <span>
                    {v.nombre} <span className="text-muted-foreground">· {r.n} envíos</span>
                  </span>
                  {r.n ? (
                    <span>
                      <b className="font-medium tabular-nums">{r.mediana} días</b>
                      <span className="text-muted-foreground"> · 9 de cada 10 en {r.p90}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">sin datos</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="c-revisar" className="min-w-0 rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="c-revisar" titulo="Para revisar">
            <Link href={`/compras/tiempos${vista === "todos" ? "" : `?ver=${vista}`}`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              Tiempos y fallas
            </Link>
          </CabeceraTarjeta>
          <ul className="m-0 flex list-none flex-col p-0 text-[13px]">
            {revisar.atrasadas.slice(0, 4).map((c) => (
              <li key={c.id} className="flex items-center gap-2 border-b border-border px-3.5 py-2">
                <Punto tono="peligro" />
                <span className="min-w-0 flex-1 truncate">
                  {c.codigo ? `${c.codigo} · ` : ""}
                  {c.nombre}
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">{diasEntre(c.fechaEnvio, dia)} días en tránsito</span>
              </li>
            ))}
            <li className="flex items-center gap-2 border-b border-border px-3.5 py-2">
              <Punto tono={revisar.cotizacionLarga.length ? "aviso" : "gris"} />
              <span className="flex-1">{revisar.cotizacionLarga.length} esperando cotización hace más de 3 semanas</span>
            </li>
            <li className="flex items-center gap-2 px-3.5 py-2">
              <Punto tono={revisar.conInconveniente.length ? "aviso" : "gris"} />
              <span className="flex-1">{revisar.conInconveniente.length} con inconveniente</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
