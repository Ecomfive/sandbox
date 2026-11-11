"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { claseAccionAF4, claseCifra, claseSigno } from "@/components/af4/estilos-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { HiloCifra } from "@/components/finanzas/comentarios/hilo-cifra";
import { IconoComentario } from "@/components/finanzas/comentarios/icono-comentario";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { fechaCorta, mesCorto } from "@/lib/af4/fecha";
import { dinero, porcentaje, puntos, type Moneda } from "@/lib/af4/formato";
import { totalFila, type ColumnaAF4, type FilaAF4 } from "@/lib/af4/tabla-financiera";
import { claveCelda, type Ancla, type PaginaComentarios } from "@/lib/finanzas/comentarios";
import { seccionesDeFila } from "@/lib/finanzas/desglose";
import type { BaseReparto } from "@/lib/finanzas/reparto";
import { desglosarCifraEerr, marcarIntercompania, type ResultadoDesglose } from "./desglose-actions";

/** Cómo se escribe una columna: en una moneda, una variación (con signo; en un margen, puntos) o un %. */
export type FormatoColumna = { moneda: string; variacion?: boolean } | "porcentaje";

export interface AmbitoDesglose {
  meses: string[];
  unidadId: string | null;
}

export interface DesgloseTabla {
  /** De qué meses y tienda sale cada columna (y la columna Total). */
  columnas: AmbitoDesglose[];
  total: AmbitoDesglose | null;
  entidadId: string | null;
  base: BaseReparto;
  sinIntercompania: boolean;
  local: boolean;
  moneda: string;
  /** Si puede marcar movimientos como intercompañía (modificar el libro). */
  puedeMarcar: boolean;
}

/** Comentarios en las cifras (mejora 92): qué hilos hay y cómo se arma la clave de cada celda. */
export interface ComentariosTabla {
  pagina: PaginaComentarios;
  /** El período del ancla ('' = el hilo de una celda de mes vale para cualquier período elegido). */
  periodo: string;
  /** Lo que distingue la vista (entidad, moneda, tienda, vista del EERR): va al principio de la clave. */
  ambito: string;
  /** El período que suma la columna Total (su hilo es de ese período). */
  periodoTotal: string;
  hilos: Record<string, number>;
}

interface Abierta {
  clave: string;
  etiqueta: string;
  ambito: AmbitoDesglose;
  columna: string;
}

/**
 * La tabla del Estado de resultados con lo que la `TablaFinanciera` sola no sabe hacer desde el servidor: una moneda o
 * un formato por columna (EERR en moneda local y en USD, comparación con el año anterior) y el desglose de cualquier
 * cifra hasta sus movimientos con un clic (panel lateral con la lista y el enlace a cada movimiento del libro).
 */
export function TablaEerr({
  id,
  titulo,
  detalle,
  columnas,
  filas,
  moneda = "USD",
  ariaLabel,
  conTotal = true,
  ventas,
  formatos,
  formatoTotal,
  desglose,
  comentarios,
}: {
  id: string;
  titulo: string;
  detalle?: string;
  columnas: ColumnaAF4[];
  filas: FilaAF4[];
  moneda?: Moneda;
  ariaLabel: string;
  conTotal?: boolean;
  ventas?: (number | null)[];
  formatos?: FormatoColumna[];
  formatoTotal?: FormatoColumna;
  desglose?: DesgloseTabla;
  comentarios?: ComentariosTabla;
}) {
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const [hilos, setHilos] = useState(comentarios?.hilos ?? {});
  const [comentando, setComentando] = useState(false);
  const [hilo, setHilo] = useState<{ ancla: Ancla; etiqueta: string } | null>(null);
  const alCambiarHilo = useCallback((clave: string, n: number) => setHilos((h) => (h[clave] === n ? h : { ...h, [clave]: n })), []);

  const celda = (f: FilaAF4, col: number | null, texto: string) => {
    const formato = formatos ? (col === null ? formatoTotal : formatos[col]) : undefined;
    const valor = col === null ? totalFila(f) : f.valores[col];
    let mostrado = texto;
    if (formato && valor !== null && valor !== undefined) {
      if (formato === "porcentaje") mostrado = f.tipo === "porcentaje" ? "" : porcentaje(valor, { conSigno: true });
      else if (f.tipo === "porcentaje") mostrado = formato.variacion ? puntos(valor) : porcentaje(valor);
      else mostrado = formato.variacion ? dinero(valor, formato.moneda, { conSigno: true }) : dinero(valor, formato.moneda, { vacioSiCero: true });
    }
    const ambito = desglose ? (col === null ? desglose.total : desglose.columnas[col]) : null;
    const desglosable = ambito && valor !== null && valor !== undefined && Math.abs(valor) >= 0.005 && seccionesDeFila(f.clave);
    const nombreColumna = col === null ? (conTotal ? "Total" : "") : columnas[col].etiqueta;
    // Comentarios: la clave de la celda y cuántos hay en su hilo.
    const claveHilo = comentarios
      ? `${comentarios.ambito}:${claveCelda(f.clave, col === null ? `total-${comentarios.periodoTotal}` : columnas[col].clave)}`
      : null;
    const n = claveHilo ? (hilos[claveHilo] ?? 0) : 0;
    const etiquetaCifra = `${f.etiqueta} · ${nombreColumna}`;
    const abrirHilo = () => comentarios && claveHilo && setHilo({ ancla: { pagina: comentarios.pagina, periodo: comentarios.periodo, clave: claveHilo }, etiqueta: etiquetaCifra });
    const conteo = `${n} ${n === 1 ? "comentario" : "comentarios"}`;
    if (comentando && claveHilo && f.tipo !== "grupo") {
      // Modo «Comentar»: el clic en la cifra abre su hilo en vez del desglose.
      return (
        <button
          type="button"
          onClick={abrirHilo}
          aria-label={n ? `${etiquetaCifra}: ${mostrado || "vacío"}, ${conteo}` : `Comentar ${etiquetaCifra}`}
          className={`inline-flex items-center justify-end gap-1 rounded-sm tabular-nums underline decoration-dotted underline-offset-4 hover:bg-muted ${anilloFoco}`}
        >
          {mostrado || "—"}
          {n > 0 && <IconoComentario className="h-3 w-3 shrink-0 text-warning" />}
        </button>
      );
    }
    const contenido = desglosable ? (
      <button
        type="button"
        onClick={() => setAbierta({ clave: f.clave, etiqueta: f.etiqueta, ambito, columna: nombreColumna || "Total" })}
        aria-label={`Desglosar ${f.etiqueta}, ${nombreColumna || "Total"}: ${mostrado}`}
        className={`rounded-sm underline decoration-border-control decoration-dotted underline-offset-4 hover:decoration-foreground ${anilloFoco}`}
      >
        {mostrado}
      </button>
    ) : null;
    if (n > 0) {
      return (
        <span className="inline-flex items-center justify-end gap-1">
          {contenido ?? mostrado}
          <button type="button" onClick={abrirHilo} aria-label={`Ver ${conteo}: ${etiquetaCifra}`} className={`inline-flex rounded-sm ${anilloFoco}`}>
            <IconoComentario className="h-3 w-3 shrink-0 text-warning" />
          </button>
        </span>
      );
    }
    if (contenido) return contenido;
    return formato ? mostrado : undefined;
  };

  return (
    <>
      <TablaFinanciera
        id={id}
        titulo={titulo}
        detalle={detalle}
        columnas={columnas}
        filas={filas}
        moneda={moneda}
        ariaLabel={ariaLabel}
        conTotal={conTotal}
        ventas={ventas}
        celdaPropia={formatos || desglose || comentarios ? celda : undefined}
        textoDesplegar="tipos"
        accion={
          comentarios ? (
            <button
              type="button"
              aria-pressed={comentando}
              onClick={() => setComentando((x) => !x)}
              className={`${claseAccionAF4} h-7 ${anilloFoco} ${comentando ? "!border-foreground !bg-foreground !text-background" : ""}`}
            >
              <IconoComentario className="h-3.5 w-3.5" />
              Comentar
            </button>
          ) : undefined
        }
      />
      {comentarios && (
        <HiloCifra ancla={hilo?.ancla ?? null} etiqueta={hilo?.etiqueta ?? ""} abierto={hilo !== null} alCerrar={() => setHilo(null)} alCambiar={alCambiarHilo} />
      )}
      {desglose && abierta && <PanelDesglose key={`${abierta.clave}|${abierta.columna}`} abierta={abierta} desglose={desglose} alCerrar={() => setAbierta(null)} />}
    </>
  );
}

function PanelDesglose({ abierta, desglose, alCerrar }: { abierta: Abierta; desglose: DesgloseTabla; alCerrar: () => void }) {
  const [datos, setDatos] = useState<ResultadoDesglose | null>(null);
  // Se monta una vez por cifra (lleva `key`): pide sus movimientos al abrirse.
  useEffect(() => {
    let vivo = true;
    desglosarCifraEerr({
      meses: abierta.ambito.meses,
      unidadId: abierta.ambito.unidadId,
      entidadId: desglose.entidadId,
      clave: abierta.clave,
      base: desglose.base,
      sinIntercompania: desglose.sinIntercompania,
      local: desglose.local,
    })
      .catch(() => ({ lineas: [], total: 0, cantidad: 0, error: "No se pudo desglosar la cifra." }))
      .then((r) => {
        if (vivo) setDatos(r);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mon = (v: number) => dinero(v, desglose.moneda, { decimales: 2 });
  return (
    <Ventana abierto alCerrar={alCerrar} lado="derecha" ancho="lg" titulo={`${abierta.etiqueta} · ${abierta.columna}`}>
      <div className="flex flex-col gap-3 p-4">
        {!datos ? (
          <p role="status" className="text-sm text-muted-foreground">
            Buscando los movimientos…
          </p>
        ) : datos.error ? (
          <p role="alert" className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
            {datos.error}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 text-sm">
              <span className="text-muted-foreground">
                {datos.cantidad} {datos.cantidad === 1 ? "movimiento" : "movimientos"}
                {datos.cantidad > datos.lineas.length ? ` · los ${datos.lineas.length} de más peso` : ""}
              </span>
              <span className={`font-semibold ${claseCifra} ${claseSigno(datos.total)}`}>{mon(datos.total)}</span>
            </div>
            {datos.lineas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin movimientos en el libro para esta cifra.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {datos.lineas.map((l) => (
                  <LineaMovimiento key={l.id} linea={l} mon={mon} puedeMarcar={desglose.puedeMarcar} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Ventana>
  );
}

function LineaMovimiento({ linea: l, mon, puedeMarcar }: { linea: ResultadoDesglose["lineas"][number]; mon: (v: number) => string; puedeMarcar: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [ic, setIc] = useState(l.intercompania);
  const [pendiente, iniciar] = useTransition();
  const esMovimiento = !l.id.startsWith("dep-");
  return (
    <li className="flex items-start justify-between gap-3 py-2 text-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        {esMovimiento ? (
          <Link href={`/libro-movimientos?mov=${l.id}`} className={`truncate font-medium hover:underline ${anilloFoco}`}>
            {l.descripcion || l.tipo}
          </Link>
        ) : (
          <Link href="/bienes-de-uso" className={`truncate font-medium hover:underline ${anilloFoco}`}>
            {l.descripcion}
          </Link>
        )}
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span>{l.fecha ? fechaCorta(l.fecha) : mesCorto(l.periodo)}</span>
          <span>· {l.unidad}</span>
          <span>· {l.tipo}</span>
          {l.repartido && <span>· {porcentaje(l.participacion * 100)} de {mon(l.monto)}</span>}
          {ic && (
            <span className="inline-flex items-center gap-1">
              · <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
              Intercompañía
            </span>
          )}
        </span>
        {puedeMarcar && esMovimiento && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await marcarIntercompania(l.id, !ic).catch(() => ({ error: "No se pudo guardar." }));
                if (r.error) mostrarToast(r.error, "destructive");
                else {
                  setIc(!ic);
                  router.refresh();
                }
              })
            }
            className={`${claseAccionAF4} mt-1 h-6 self-start px-2 text-xs ${anilloFoco} disabled:opacity-50`}
          >
            {ic ? "Quitar intercompañía" : "Marcar intercompañía"}
          </button>
        )}
      </div>
      <span className={`shrink-0 ${claseCifra} ${claseSigno(l.aporte)}`}>{mon(l.aporte)}</span>
    </li>
  );
}
