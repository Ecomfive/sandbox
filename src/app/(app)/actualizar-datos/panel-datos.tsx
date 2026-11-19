"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Indicador, TableroIndicadores } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { contarFuentes, cuandoFue, GRUPOS_FUENTE, pasaFiltro, type AccionFuente, type EstadoFuente, type FiltroFuentes, type Fuente } from "@/lib/actualizar-datos/estado";
import { pedirExtension } from "@/lib/dropi-actualizar/extension";
import { textoLecturaEffi } from "@/lib/effi/resumen";
import { ActualizarIcon, AlertaIcon, CalendarioIcon, CheckIcon, ReiniciarIcon } from "@/lib/nav-icons";
import { leerAhoraMeta } from "../anuncios-meta/actions";
import { leerQuickbooksAhora } from "../cierre-mes/quickbooks/actions";
import { leerMondayAhora } from "../deliverys/monday/actions";
import { correrTareaAhora } from "../panel-financiero/tareas/actions";
import { actualizarDesdeEffi } from "../publicaciones-effi/actions";
import { ImportarMatriz } from "../tienda-reporteria/importar-matriz";
import { traerProductosShopify } from "../tienda-tiendas/productos/actions";
import { sincronizarTiendaAhora } from "../ventas-tiendas/pipeline/actions";
import { ContenidoVentana, type ExtrasVentanas } from "./ventana-datos";

const ESTADO: Record<EstadoFuente, { texto: string; punto: string; color: string }> = {
  aldia: { texto: "Al día", punto: "bg-success", color: "text-success" },
  corriendo: { texto: "Actualizándose…", punto: "bg-primario", color: "text-primario" },
  atrasada: { texto: "Atrasada", punto: "bg-warning", color: "text-warning" },
  error: { texto: "Falló la última vez", punto: "bg-destructive", color: "text-destructive" },
  nunca: { texto: "Sin registro", punto: "bg-border-control", color: "text-muted-foreground" },
};

const COLUMNAS = "md:grid-cols-[minmax(0,2.3fr)_minmax(0,1.25fr)_minmax(0,1.35fr)_minmax(0,1fr)_8.5rem]";
const boton = `inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-border-control bg-card px-3 text-[13px] font-semibold hover:bg-accent disabled:opacity-55 ${anilloFoco}`;

type Correr = Extract<AccionFuente, { tipo: "correr" }>;
type ConVentana = Extract<AccionFuente, { tipo: "ventana" }>;

/** Corre una lectura del servidor con la acción de su pantalla de siempre (la barrera de permisos sigue allí). Devuelve el texto para el aviso. */
async function correrAccion(a: Correr): Promise<{ ok: boolean; texto: string }> {
  const mal = (texto: string) => ({ ok: false, texto });
  switch (a.clave) {
    case "effi": {
      const r = await actualizarDesdeEffi();
      if (r.error) return mal(r.error);
      if (!r.resumen) return { ok: true, texto: "Effi actualizado." };
      const t = textoLecturaEffi(r.resumen);
      return { ok: !t.error, texto: t.texto };
    }
    case "shopify-productos": {
      for (const t of a.tiendas ?? []) {
        const r = await traerProductosShopify(t.id);
        if (r.error) return mal(`${t.nombre}: ${r.error}`);
      }
      return { ok: true, texto: "Productos de Shopify traídos." };
    }
    case "shopify-pedidos": {
      for (const t of a.tiendas ?? []) {
        const r = await sincronizarTiendaAhora(t.id);
        if ("error" in r) return mal(`${t.nombre}: ${r.error}`);
      }
      return { ok: true, texto: "Pedidos de Shopify sincronizados." };
    }
    case "monday": {
      const r = await leerMondayAhora();
      return r.error ? mal(r.error) : { ok: true, texto: r.resumen ?? "Monday leído." };
    }
    case "quickbooks": {
      const r = await leerQuickbooksAhora();
      return r.error ? mal(r.error) : { ok: true, texto: r.resumen ?? "QuickBooks leído." };
    }
    case "dropi-finanzas":
    case "shopify-ventas": {
      const r = await correrTareaAhora(a.clave);
      if (r.error) return mal(r.error);
      return { ok: true, texto: r.omitida ? "Ya estaba corriendo: espera unos minutos." : (r.resumen ?? "Listo.") };
    }
    case "meta": {
      const r = await leerAhoraMeta();
      return r.error ? mal(r.error) : { ok: true, texto: "Meta leído." };
    }
  }
}

/**
 * «Actualizar datos» (19 nov 2026; prototipo aprobado https://claude.ai/artifact/1ZUNXf8dTbszZpskenPs6X): las tarjetas de arriba son filtros; abajo, las
 * fuentes por tema con su estado, la última vez y quién, cómo se actualiza, su pantalla de siempre y el botón.
 */
export function PanelDatos({ fuentes, usaExtension, extras }: { fuentes: Fuente[]; usaExtension: boolean; extras: ExtrasVentanas }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [filtro, setFiltro] = useState<FiltroFuentes>("todas");
  const [corriendo, setCorriendo] = useState<string | null>(null);
  const [matriz, setMatriz] = useState(false);
  // La actualización que se hace aquí mismo, en una ventana (19 nov 2026: Dropi, Drop, Dunamixfy, Servientrega, Tu Winner y los Excel), y si va en marcha.
  const [abierta, setAbierta] = useState<ConVentana | null>(null);
  const [ventanaEnMarcha, setVentanaEnMarcha] = useState(false);
  const cerrarVentana = () => {
    if (ventanaEnMarcha && !window.confirm("La actualización sigue en marcha: si cierras la ventana se corta (al volver a abrirla se retoma). ¿Cerrar igual?")) return;
    setAbierta(null);
    setVentanaEnMarcha(false);
    router.refresh();
  };
  const [extension, setExtension] = useState<"buscando" | "lista" | "falta">("buscando");
  const cuentas = useMemo(() => contarFuentes(fuentes), [fuentes]);

  useEffect(() => {
    if (!usaExtension) return;
    let vivo = true;
    pedirExtension<{ version: string }>({ tipo: "hola" }, 2500)
      .then(() => vivo && setExtension("lista"))
      .catch(() => vivo && setExtension("falta"));
    return () => {
      vivo = false;
    };
  }, [usaExtension]);

  const alternar = (f: FiltroFuentes) => setFiltro((x) => (x === f ? "todas" : f));

  async function correr(f: Fuente, a: Correr) {
    if (corriendo) return;
    setCorriendo(f.clave);
    try {
      const r = await correrAccion(a);
      mostrarToast(r.texto, r.ok ? "success" : "destructive");
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "No se pudo actualizar.", "destructive");
    } finally {
      setCorriendo(null);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-bold">Actualizar datos</h1>
          <p className="m-0 max-w-3xl text-sm text-muted-foreground">
            Todo lo que el sistema trae de otras plataformas, en un solo lugar. Cada botón sigue también en su pantalla de siempre.
          </p>
        </div>
        {usaExtension && (
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs text-accent-foreground" role="status">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${extension === "lista" ? "bg-success" : extension === "falta" ? "bg-warning" : "bg-border-control"}`} />
            {extension === "lista" ? "Extensión Ecomfive lista en este Chrome" : extension === "falta" ? "Falta la extensión Ecomfive en este Chrome" : "Buscando la extensión…"}
          </span>
        )}
      </div>

      <TableroIndicadores etiqueta="Resumen de las fuentes">
        <Indicador titulo="Fuentes" icono={ActualizarIcon} color="violeta" valor={String(cuentas.total)} detalle="Todo lo que se actualiza" alPulsar={() => setFiltro("todas")} activo={filtro === "todas"} />
        <Indicador titulo="Al día" icono={CheckIcon} color="verde" valor={String(cuentas.aldia)} detalle="Actualizadas a tiempo" alPulsar={() => alternar("aldia")} activo={filtro === "aldia"} />
        <Indicador titulo="Atrasadas" icono={CalendarioIcon} color="ambar" valor={String(cuentas.atrasadas)} detalle="Toca actualizarlas" alPulsar={() => alternar("atrasadas")} activo={filtro === "atrasadas"} />
        <Indicador titulo="Fallaron" icono={AlertaIcon} color="rojo" valor={String(cuentas.fallaron)} detalle="La última vez no terminó" alPulsar={() => alternar("fallaron")} activo={filtro === "fallaron"} />
        <Indicador titulo="Se actualizan solas" icono={ReiniciarIcon} color="violeta" valor={String(cuentas.automaticas)} detalle="Con tarea automática" alPulsar={() => alternar("automaticas")} activo={filtro === "automaticas"} />
      </TableroIndicadores>

      {GRUPOS_FUENTE.map((g) => {
        const todas = fuentes.filter((f) => f.grupo === g.id);
        const filas = todas.filter((f) => pasaFiltro(f, filtro));
        if (!filas.length) return null;
        // Por revisar = atrasadas o con error; las que no tienen registro no cuentan (como en la tarjeta «Atrasadas»).
        const porRevisar = todas.filter((f) => f.estado === "atrasada" || f.estado === "error").length;
        const sinRegistro = todas.filter((f) => f.estado === "nunca").length;
        return (
          <section key={g.id} aria-labelledby={`grupo-${g.id}`} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <h2 id={`grupo-${g.id}`} className="m-0 text-[15px] font-bold">
                  {g.titulo}
                </h2>
                <span className="text-xs text-muted-foreground">{g.subtitulo}</span>
              </div>
              <span className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground">{porRevisar ? `${porRevisar} por revisar de ${todas.length}` : sinRegistro ? `${sinRegistro} sin registro de ${todas.length}` : "Todo al día"}</span>
            </div>
            <div className={`hidden gap-4 bg-muted px-4 py-2 text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase md:grid ${COLUMNAS}`} aria-hidden="true">
              <span>Fuente</span>
              <span>Última vez</span>
              <span>Cómo se actualiza</span>
              <span>También en</span>
              <span />
            </div>
            <ul className="m-0 list-none p-0">
              {filas.map((f) => {
                const enMarcha = corriendo === f.clave;
                const e = ESTADO[enMarcha ? "corriendo" : f.estado];
                return (
                  <li key={f.clave} className={`grid grid-cols-2 items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 ${COLUMNAS}`}>
                    <div className="col-span-2 flex min-w-0 items-start gap-2.5 md:col-span-1">
                      <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${e.punto}`} />
                      <div className="flex min-w-0 flex-col">
                        <span className="text-sm font-semibold">{f.nombre}</span>
                        <span className="text-xs text-muted-foreground">{f.que}</span>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className={`text-[13px] font-semibold ${e.color}`}>{e.texto}</span>
                      <span className="text-xs text-muted-foreground">
                        {cuandoFue(f.fecha)}
                        {f.quien ? ` · ${f.quien}` : ""}
                      </span>
                      {f.error && !enMarcha && (
                        <span className="truncate text-xs text-destructive" title={f.error}>
                          {f.error}
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col items-start gap-0.5">
                      <span className="rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground">{f.automatica ?? "A mano"}</span>
                      {f.requisito && <span className="text-[11px] text-muted-foreground">{f.requisito}</span>}
                    </div>
                    <Link href={f.donde.href} className={`text-xs text-accent-foreground underline underline-offset-2 hover:text-foreground ${anilloFoco}`}>
                      {f.donde.texto}
                    </Link>
                    <div>
                      {f.accion?.tipo === "correr" && (
                        <button type="button" className={boton} disabled={corriendo !== null} onClick={() => void correr(f, f.accion as Correr)}>
                          {enMarcha ? "Actualizando…" : f.accion.texto}
                        </button>
                      )}
                      {f.accion?.tipo === "matriz" && (
                        <button type="button" className={boton} disabled={corriendo !== null} onClick={() => setMatriz(true)}>
                          {f.accion.texto}
                        </button>
                      )}
                      {f.accion?.tipo === "ventana" && (
                        <button type="button" className={boton} disabled={corriendo !== null} onClick={() => setAbierta(f.accion as ConVentana)}>
                          {f.accion.texto}
                        </button>
                      )}
                      {f.accion?.tipo === "enlace" && (
                        <Link href={f.accion.href} className={boton}>
                          {f.accion.texto}
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {fuentes.length === 0 && <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">No tienes fuentes que actualizar.</p>}

      <p className="m-0 text-xs text-muted-foreground">
        Todo se actualiza desde aquí: las que pasan por la extensión de Chrome (Dropi, Drop, Dunamixfy, Servientrega y Tu Winner) y los Excel se abren en una
        ventana encima de este panel. Una fuente diaria sale «Atrasada» pasado un día; un Excel, pasado un mes.
      </p>

      <Ventana abierto={abierta !== null} alCerrar={cerrarVentana} titulo={abierta?.titulo ?? ""} ancho={abierta?.ventana.tipo === "dropi" || abierta?.ventana.tipo === "excel" ? "xl" : "lg"}>
        {abierta && <ContenidoVentana key={JSON.stringify(abierta.ventana)} ventana={abierta.ventana} extras={extras} alCambiarEnMarcha={setVentanaEnMarcha} />}
      </Ventana>

      <Ventana
        abierto={matriz}
        alCerrar={() => {
          setMatriz(false);
          router.refresh();
        }}
        titulo="Actualizar desde la Matriz"
        ancho="md"
      >
        <ImportarMatriz
          alTerminar={() => {
            setMatriz(false);
            router.refresh();
          }}
        />
      </Ventana>
    </div>
  );
}
