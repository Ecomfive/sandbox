"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cerrarSesion } from "@/app/login/actions";
import { IdiomaProveedor, Traducido, useIdioma } from "@/components/proveedor/idioma-contexto";
import { BotonExcel } from "@/components/proveedor/boton-excel";
import { ColumnaCasilla, SeleccionProveedor, useSeleccion } from "@/components/proveedor/seleccion";
import { BarraFiltroPortal, FiltroPortalProveedor, SinResultados, useFiltroPortal } from "@/components/proveedor/filtro-portal";
import { Foto, Pestanas, Producto as ProductoBase, TONO, Tarjeta, Vacio, botonNormal, botonPrincipal, dinero, viaTexto } from "@/components/proveedor/piezas-proveedor";
import type { CambioRegistro } from "@/components/proveedor/registro-pagos";
import type { FilaRegistro } from "@/lib/proveedor/registro-pagos";
import { claseTdLista, claseThLista } from "@/components/panel/piezas-panel";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { cambioDeUnidades, unitarioDesdeTotal } from "@/lib/proveedor/cotizacion";
import { clavePlazo, type PedidoPortal } from "@/lib/proveedor/datos";
import { hojaCotizados, hojaEnviados, hojaPorCotizar, hojaProduccion, type ContextoExcel } from "@/lib/proveedor/excel-portal";
import { diaPanama, hoyPanama, horaPanama } from "@/lib/proveedor/fechas";
import type { LineaHistorial } from "@/lib/proveedor/historial";
import { HistorialIcon } from "@/lib/nav-icons";
import { historialPedidoEcomfive } from "@/app/(app)/compras/tablero-chin/historial-actions";
import { paisesDe } from "@/lib/proveedor/filtro";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";
import { BUCKET_PROVEEDOR } from "@/lib/proveedor/rutas";
import type { Idioma } from "@/lib/proveedor/textos";
import { estadoTransito, textoPlazo, type Plazo } from "@/lib/proveedor/transito";
import { supabase } from "@/lib/supabase/client";
import { cambiarIdiomaProveedor, cotizarPedido, historialPedidoProveedor, marcarEnviado, marcarVistoPorProveedor, prepararSubidaFotoReal } from "./actions";
import { FormularioClave } from "./cambiar-clave";
import { PagosChin } from "./pagos-chin";

export interface AvisoEcomfive {
  id: string;
  texto: string;
  creadoEn: string;
}

export type TabPortal = "cotizar" | "cotizado" | "produccion" | "enviado" | "pagos";
type Tab = TabPortal;

/** Lo que el Tablero de Shen Zhen de Ecomfive le cambia al portal: su propia vista de pagos (editable) y la pestaña con que abre. */
interface DesdeEcomfive {
  /** En la pestaña «Pagos» va esto (el Registro de pagos que edita Ecomfive) en vez de la vista de Shen Zhen. */
  pagosEcomfive?: ReactNode;
  tabInicial?: TabPortal;
  alCambiarTab?: (tab: TabPortal) => void;
}

export interface DatosPortalChin {
  cuenta: { nombre: string; proveedor: string; diasAnticipo: number };
  pedidos: PedidoPortal[];
  plazos: Record<string, Plazo>;
  fotosReales: Record<string, string>;
  avisos: AvisoEcomfive[];
  /** Pagos (fase 4); null si falta la migración 0127. */
  pagos: { resumen: ResumenPagos; filas: FilaRegistro[]; cambios: CambioRegistro[] } | null;
  /** Lo escrito por personas, ya traducido al idioma de la pantalla (texto original → traducción). */
  traducciones: Record<string, string>;
}

/**
 * El portal de Shen Zhen: Por cotizar, Cotizado, En producción, Enviado y Pagos, en su idioma (chino simplificado por defecto). Cotizar (con
 * foto real y unidades por caja) y marcar enviado cambian la compra en el sistema de Ecomfive; los pagos y la llegada que anota en
 * Pagos (Registro de pagos) quedan en su registro y avisan a Ecomfive. Con `soloLectura` es «Lo que ve Shen Zhen» del Tablero de Shen Zhen de
 * Ecomfive: lo mismo que él ve, en español y sin botones (su pestaña «Pagos» trae el Registro de pagos que edita Ecomfive, `pagosEcomfive`).
 */
export function PortalChin({ idioma, soloLectura = false, ...datos }: DatosPortalChin & DesdeEcomfive & { idioma: Idioma; soloLectura?: boolean }) {
  return (
    <IdiomaProveedor idioma={idioma} traducciones={datos.traducciones}>
      <FiltroPortalProveedor>
        <SeleccionProveedor>
          <PortalChinContenido {...datos} soloLectura={soloLectura} />
        </SeleccionProveedor>
      </FiltroPortalProveedor>
    </IdiomaProveedor>
  );
}

function PortalChinContenido({ cuenta, pedidos, plazos, fotosReales, avisos, pagos, soloLectura, pagosEcomfive, tabInicial, alCambiarTab }: DatosPortalChin & DesdeEcomfive & { soloLectura: boolean }) {
  const { t, tr, fecha, idioma } = useIdioma();
  const [lista, setLista] = useState(pedidos);
  const [fotos, setFotos] = useState(fotosReales);
  const [tab, setTabEstado] = useState<Tab>(tabInicial === "pagos" && !pagos ? "cotizar" : (tabInicial ?? "cotizar"));
  const seleccion = useSeleccion();
  const setTab = (t: Tab) => {
    seleccion?.limpiar();
    setTabEstado(t);
    alCambiarTab?.(t);
  };
  const [cotizando, setCotizando] = useState<PedidoPortal | null>(null);
  const [historial, setHistorial] = useState<PedidoPortal | null>(null);
  const hoy = useMemo(() => hoyPanama(), []);

  // Lo nuevo de Ecomfive queda visto al abrir su portal (se sigue viendo hasta recargar). Desde Ecomfive no se marca nada.
  useEffect(() => {
    if (!soloLectura && avisos.length) void marcarVistoPorProveedor();
  }, [avisos.length, soloLectura]);

  // El buscador y el país filtran todas las pestañas (también sus contadores y el Registro de pagos).
  const { pasa, activo } = useFiltroPortal();
  const de = (e: PedidoPortal["etapa"]) => lista.filter((p) => p.etapa === e && pasa(p.producto, p.referencia, p.paisCodigo));
  const paises = useMemo(() => paisesDe([...lista.map((p) => p.paisCodigo), ...(pagos?.filas ?? []).map((f) => f.paisCodigo)]), [lista, pagos]);
  const filasPagos = (pagos?.filas ?? []).filter((f) => pasa(String(f.valores.producto ?? ""), f.referencia, f.paisCodigo));
  /** La pestaña, o el aviso de que el filtro la dejó vacía. */
  const conFiltro = (n: number, contenido: ReactNode) => (activo && n === 0 ? <SinResultados /> : contenido);
  const cambiar = (id: string, cambios: Partial<PedidoPortal>) => setLista((xs) => xs.map((p) => (p.id === id ? { ...p, ...cambios } : p)));

  const cuerpo = (
    <>
      {avisos.length > 0 && (
        <Tarjeta titulo={t.loNuevo}>
          <ul className="m-0 list-none p-0">
            {avisos.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 border-b border-border px-3.5 py-2 text-sm last:border-b-0">
                <span>{tr(a.texto)}</span>
                <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{fecha(a.creadoEn.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Pestanas
        etiqueta={t.marca}
        tabs={[
          { clave: "cotizar" as const, titulo: t.tabCotizar, cuenta: de("por_cotizar").length },
          { clave: "cotizado" as const, titulo: t.tabCotizado, cuenta: de("cotizado").length },
          { clave: "produccion" as const, titulo: t.tabProduccion, cuenta: de("produccion").length },
          { clave: "enviado" as const, titulo: t.tabEnviado, cuenta: de("enviado").length },
          ...(pagos ? [{ clave: "pagos" as const, titulo: t.tabPagos, cuenta: filasPagos.filter((f) => Number(f.valores.sin_pagar ?? 0) > 0).length }] : []),
        ]}
        valor={tab}
        alCambiar={setTab}
      />

      <BarraFiltroPortal paises={paises} />

      {tab === "cotizar" && conFiltro(de("por_cotizar").length, <PorCotizar pedidos={de("por_cotizar")} alCotizar={soloLectura ? null : setCotizando} />)}
      {tab === "cotizado" && conFiltro(de("cotizado").length, <Cotizados pedidos={de("cotizado")} fotos={fotos} alCorregir={soloLectura ? null : setCotizando} />)}
      {tab === "produccion" &&
        conFiltro(
          de("produccion").length,
          <EnProduccion
            pedidos={de("produccion")}
            hoy={hoy}
            diasAnticipo={cuenta.diasAnticipo}
            soloLectura={soloLectura}
            alEnviar={(id, f) => cambiar(id, { etapa: "enviado", fechaEnvio: f })}
            alEditar={soloLectura ? null : setCotizando}
          />,
        )}
      {tab === "enviado" && conFiltro(de("enviado").length, <Enviados pedidos={de("enviado")} plazos={plazos} hoy={hoy} />)}
      {tab === "pagos" && pagos && (soloLectura && pagosEcomfive ? pagosEcomfive : <PagosChin resumen={pagos.resumen} filas={pagos.filas} cambios={pagos.cambios} soloLectura={soloLectura} />)}

      {cotizando && (
        <PanelCotizar
          key={cotizando.id}
          p={cotizando}
          fotoReal={fotos[cotizando.id] ?? null}
          alCerrar={() => setCotizando(null)}
          alCotizar={(cambios, preview) => {
            // En producción la cotización se edita sin cambiar de etapa.
            cambiar(cotizando.id, { ...cambios, etapa: cotizando.etapa === "produccion" ? "produccion" : "cotizado" });
            if (preview) setFotos((f) => ({ ...f, [cotizando.id]: preview }));
            setCotizando(null);
          }}
        />
      )}
      {historial && <VentanaHistorial key={historial.id} p={historial} soloLectura={soloLectura} alCerrar={() => setHistorial(null)} />}
    </>
  );

  if (soloLectura)
    return (
      <AbrirHistorial.Provider value={setHistorial}>
        <div className="flex flex-col gap-5" lang={idioma === "zh" ? "zh-CN" : "es"}>
          {t.soloLectura && <p className="m-0 rounded-lg border border-border bg-muted px-3.5 py-2 text-[13px] text-muted-foreground">{t.soloLectura}</p>}
          {cuerpo}
        </div>
      </AbrirHistorial.Provider>
    );

  return (
    <div className="flex min-h-full flex-col" lang={idioma === "zh" ? "zh-CN" : "es"}>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="m-0 text-lg font-semibold">{t.marca}</h1>
            <p className="m-0 text-[13px] text-muted-foreground">{t.sesion(cuenta.nombre)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelectorIdioma />
            <CambiarClave />
            <form action={cerrarSesion}>
              <button type="submit" className={botonNormal}>
                {t.salir}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-5">
        <AbrirHistorial.Provider value={setHistorial}>{cuerpo}</AbrirHistorial.Provider>
      </main>
    </div>
  );
}

/** «Cambiar clave»: abre el formulario en una ventana; la sesión sigue abierta con la clave nueva. */
function CambiarClave() {
  const { t } = useIdioma();
  const { mostrarToast } = useToast();
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className={botonNormal} onClick={() => setAbierta(true)}>
        {t.cambiarClave}
      </button>
      {abierta && (
        <Ventana abierto alCerrar={() => setAbierta(false)} ancho="sm" titulo={t.cambiarClave}>
          <div className="p-4">
            <FormularioClave
              temporal={false}
              alCancelar={() => setAbierta(false)}
              alGuardar={() => {
                setAbierta(false);
                mostrarToast(t.claveCambiada);
              }}
            />
          </div>
        </Ventana>
      )}
    </>
  );
}

/** 中文 / Español: queda guardado en su cuenta y la página se vuelve a cargar en ese idioma. */
function SelectorIdioma() {
  const { idioma, t } = useIdioma();
  const [ocupado, setOcupado] = useState(false);
  const elegir = async (nuevo: Idioma) => {
    if (nuevo === idioma || ocupado) return;
    setOcupado(true);
    const r = await cambiarIdiomaProveedor(nuevo);
    if (!r.error) window.location.reload();
    else setOcupado(false);
  };
  return (
    <div role="group" aria-label={t.idioma} className="flex gap-0.5 rounded-[7px] border border-border bg-card p-0.5">
      {(
        [
          ["zh", "中文"],
          ["es", "Español"],
        ] as const
      ).map(([clave, nombre]) => (
        <button
          key={clave}
          type="button"
          lang={clave === "zh" ? "zh-CN" : "es"}
          aria-pressed={idioma === clave}
          disabled={ocupado}
          onClick={() => elegir(clave)}
          className={`rounded-[5px] px-2 py-0.5 text-xs ${anilloFoco} ${idioma === clave ? "bg-primario text-white" : "text-muted-foreground hover:text-foreground"}`}
        >
          {nombre}
        </button>
      ))}
    </div>
  );
}

function Cabecera({ columnas, ids }: { columnas: { texto: string; derecha?: boolean }[]; ids: string[] }) {
  return (
    <thead className="sticky top-0 z-[1] bg-card">
      <tr>
        <ColumnaCasilla encabezado ids={ids} />
        {columnas.map((c, i) => (
          <th key={i} scope="col" className={`${claseThLista} ${c.derecha ? "text-right" : ""}`}>
            {c.texto}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="max-h-[620px] overflow-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

/** Lo que necesita el Excel de cada pestaña: textos, traducción y cómo se ve la vía. */
function useContextoExcel(): ContextoExcel {
  const { t, tr, idioma } = useIdioma();
  return { t, tr, via: (p) => viaTexto(p, idioma) };
}

function PorCotizar({ pedidos, alCotizar }: { pedidos: PedidoPortal[]; alCotizar: ((p: PedidoPortal) => void) | null }) {
  const { t, idioma, numero, tr } = useIdioma();
  const hoja = hojaPorCotizar(pedidos, useContextoExcel());
  return (
    <Tarjeta
      titulo={t.cotizarTitulo}
      accion={
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">{t.cotizarPista}</span>
          <BotonExcel clave="por-cotizar" titulo={t.tabCotizar} columnas={hoja.columnas} filas={hoja.filas} />
        </span>
      }
    >
      {pedidos.length === 0 ? (
        <Vacio>{t.cotizarVacio}</Vacio>
      ) : (
        <Tabla>
          <Cabecera ids={pedidos.map((p) => p.id)} columnas={[{ texto: t.colProducto }, { texto: t.colDestino }, { texto: t.colVia }, { texto: t.colUnidades, derecha: true }, { texto: t.colNota }, { texto: "" }]} />
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id}>
                <ColumnaCasilla id={p.id} nombre={tr(p.producto)} />
                <td className={claseTdLista}>
                  <Producto p={p} />
                </td>
                <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
                <td className={claseTdLista}>{viaTexto(p, idioma)}</td>
                <td className={`${claseTdLista} text-right tabular-nums`}>{numero(p.unidades)}</td>
                <td className={`${claseTdLista} max-w-[22rem] whitespace-normal text-muted-foreground`}>{tr(p.notaParaProveedor)}</td>
                <td className={`${claseTdLista} text-right`}>
                  <button type="button" className={botonPrincipal} disabled={!alCotizar} onClick={() => alCotizar?.(p)} aria-label={`${t.cotizar}: ${tr(p.producto)}`}>
                    {t.cotizar}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  );
}

function Cotizados({ pedidos, fotos, alCorregir }: { pedidos: PedidoPortal[]; fotos: Record<string, string>; alCorregir: ((p: PedidoPortal) => void) | null }) {
  const { t, idioma, numero, tr } = useIdioma();
  const hoja = hojaCotizados(pedidos, useContextoExcel());
  return (
    <Tarjeta titulo={t.cotizadoTitulo} accion={<BotonExcel clave="cotizado" titulo={t.tabCotizado} columnas={hoja.columnas} filas={hoja.filas} />}>
      {pedidos.length === 0 ? (
        <Vacio>{t.cotizadoVacio}</Vacio>
      ) : (
        <Tabla>
          <Cabecera
            ids={pedidos.map((p) => p.id)}
            columnas={[
              { texto: t.colProducto },
              { texto: t.colDestino },
              { texto: t.colVia },
              { texto: t.colUnidades, derecha: true },
              { texto: t.colPorUnidad, derecha: true },
              { texto: t.colTotal, derecha: true },
              { texto: t.colFotoReal },
              { texto: t.colEstado },
              { texto: "" },
            ]}
          />
          <tbody>
            {pedidos.map((p) => {
              const cambio = cambioDeUnidades(p.unidadesPedidas, p.unidades);
              return (
                <tr key={p.id}>
                  <ColumnaCasilla id={p.id} nombre={tr(p.producto)} />
                  <td className={claseTdLista}>
                    <Producto p={p} />
                    {p.comentarioProveedor && (
                      <span className="mt-1 block max-w-[24rem] text-xs whitespace-normal text-muted-foreground">
                        «<Traducido texto={p.comentarioProveedor} />»
                      </span>
                    )}
                  </td>
                  <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
                  <td className={claseTdLista}>{viaTexto(p, idioma)}</td>
                  <td className={`${claseTdLista} text-right tabular-nums`}>
                    {numero(p.unidades)}
                    {cambio && <span className="block text-xs text-muted-foreground">{t.pidieron(numero(cambio.pedidas))}</span>}
                  </td>
                  <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(p.costoUnitario, 2)}</td>
                  <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(p.montoTotal)}</td>
                  <td className={claseTdLista}>
                    <Foto url={fotos[p.id] ?? null} nombre={tr(p.producto)} real />
                  </td>
                  <td className={claseTdLista}>
                    <Badge tone="warning">{t.esperaEcomfive}</Badge>
                  </td>
                  <td className={`${claseTdLista} text-right`}>
                    <button type="button" className={botonNormal} disabled={!alCorregir} onClick={() => alCorregir?.(p)} aria-label={`${t.corregir}: ${tr(p.producto)}`}>
                      {t.corregir}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  );
}

function EnProduccion({
  pedidos,
  hoy,
  diasAnticipo,
  soloLectura,
  alEnviar,
  alEditar,
}: {
  pedidos: PedidoPortal[];
  hoy: string;
  diasAnticipo: number;
  soloLectura: boolean;
  alEnviar: (id: string, fecha: string) => void;
  alEditar: ((p: PedidoPortal) => void) | null;
}) {
  const { t } = useIdioma();
  const hoja = hojaProduccion(pedidos, useContextoExcel());
  return (
    <Tarjeta
      titulo={t.produccionTitulo}
      accion={
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">{t.produccionPista}</span>
          <BotonExcel clave="en-produccion" titulo={t.tabProduccion} columnas={hoja.columnas} filas={hoja.filas} />
        </span>
      }
    >
      {pedidos.length === 0 ? (
        <Vacio>{t.produccionVacio}</Vacio>
      ) : (
        <Tabla>
          <Cabecera
            ids={pedidos.map((p) => p.id)}
            columnas={[
              { texto: t.colProducto },
              { texto: t.colDestino },
              { texto: t.colVia },
              { texto: t.colUnidades, derecha: true },
              { texto: t.colTotal, derecha: true },
              { texto: t.colConfirmado },
              { texto: t.colFechaEnvio },
              { texto: "" },
            ]}
          />
          <tbody>
            {pedidos.map((p) => (
              <FilaProduccion key={p.id} p={p} hoy={hoy} diasAnticipo={diasAnticipo} soloLectura={soloLectura} alEnviar={alEnviar} alEditar={alEditar} />
            ))}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  );
}

function FilaProduccion({
  p,
  hoy,
  diasAnticipo,
  soloLectura,
  alEnviar,
  alEditar,
}: {
  p: PedidoPortal;
  hoy: string;
  diasAnticipo: number;
  soloLectura: boolean;
  alEnviar: (id: string, fecha: string) => void;
  alEditar: ((p: PedidoPortal) => void) | null;
}) {
  const { t, idioma, numero, tr, fecha, error } = useIdioma();
  const { mostrarToast } = useToast();
  const [f, setF] = useState(hoy);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  async function enviar() {
    setOcupado(true);
    const r = await marcarEnviado(p.id, f);
    setOcupado(false);
    if (r.error || !r.fechaEnvio) return mostrarToast(error(r.error ?? "No se pudo marcar el envío."), "destructive");
    alEnviar(p.id, r.fechaEnvio);
    const vence = new Date(Date.parse(r.fechaEnvio) + diasAnticipo * 864e5).toISOString().slice(0, 10);
    mostrarToast(t.enviadoOk(fecha(vence)));
  }
  return (
    <tr>
      <ColumnaCasilla id={p.id} nombre={tr(p.producto)} />
      <td className={claseTdLista}>
        <Producto p={p} />
      </td>
      <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
      <td className={claseTdLista}>{viaTexto(p, idioma)}</td>
      <td className={`${claseTdLista} text-right tabular-nums`}>{numero(p.unidades)}</td>
      <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(p.montoTotal)}</td>
      <td className={`${claseTdLista} tabular-nums`}>{p.confirmadoEn ? fecha(diaPanama(p.confirmadoEn)) : "—"}</td>
      <td className={claseTdLista}>
        <input type="date" value={f} max={hoy} onChange={(e) => setF(e.target.value)} disabled={confirmar || soloLectura} aria-label={`${t.colFechaEnvio}: ${tr(p.producto)}`} className={`h-8 rounded-md border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`} />
      </td>
      <td className={`${claseTdLista} text-right`}>
        {confirmar ? (
          <span className="inline-flex gap-1.5">
            <button type="button" className={botonNormal} disabled={ocupado} onClick={() => setConfirmar(false)}>
              {t.no}
            </button>
            <button type="button" className={botonPrincipal} disabled={ocupado} onClick={enviar}>
              {ocupado ? t.guardando : t.salioEl(fecha(f))}
            </button>
          </span>
        ) : (
          <span className="inline-flex gap-1.5">
            <button type="button" className={botonNormal} disabled={!alEditar} onClick={() => alEditar?.(p)} aria-label={`${t.editarCotizacion}: ${tr(p.producto)}`}>
              {t.editarCotizacion}
            </button>
            <button type="button" className={botonPrincipal} disabled={!f || soloLectura} onClick={() => setConfirmar(true)}>
              {t.marcarEnviado}
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

function Enviados({ pedidos, plazos, hoy }: { pedidos: PedidoPortal[]; plazos: Record<string, Plazo>; hoy: string }) {
  const { t, idioma, numero, fecha, tr } = useIdioma();
  const filas = pedidos
    .filter((p) => p.fechaEnvio)
    .map((p) => {
      const plazo = plazos[clavePlazo(p.paisCodigo, p.via)] ?? null;
      const e = estadoTransito(p.fechaEnvio!, null, plazo, hoy);
      const max = plazo?.max ?? plazo?.min ?? null;
      const texto = max == null ? t.sinPlazo : e.dias > max ? t.diasAtraso(e.dias - max) : t.faltanDias(max - e.dias);
      return { p, plazo, e, texto };
    })
    .sort((a, b) => b.p.fechaEnvio!.localeCompare(a.p.fechaEnvio!));
  const plazoTexto = (plazo: Plazo | null) => (idioma === "zh" ? textoPlazo(plazo).replace(/ d$/, " 天") : textoPlazo(plazo));
  const hoja = hojaEnviados(
    filas.map(({ p, plazo, e, texto }) => ({ p, dias: e.dias, plazo: plazoTexto(plazo), estado: texto })),
    useContextoExcel(),
  );
  return (
    <Tarjeta
      titulo={t.enviadoTitulo}
      accion={
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">{t.enviadoPista}</span>
          <BotonExcel clave="enviado" titulo={t.tabEnviado} columnas={hoja.columnas} filas={hoja.filas} />
        </span>
      }
    >
      {filas.length === 0 ? (
        <Vacio>{t.enviadoVacio}</Vacio>
      ) : (
        <Tabla>
          <Cabecera
            ids={filas.map(({ p }) => p.id)}
            columnas={[
              { texto: t.colProducto },
              { texto: t.colDestino },
              { texto: t.colVia },
              { texto: t.colUnidades, derecha: true },
              { texto: t.colConfirmado },
              { texto: t.colEnviado },
              { texto: t.colDias, derecha: true },
              { texto: t.colPrometido },
              { texto: t.colEstado },
            ]}
          />
          <tbody>
            {filas.map(({ p, plazo, e, texto }) => (
              <tr key={p.id}>
                <ColumnaCasilla id={p.id} nombre={tr(p.producto)} />
                <td className={claseTdLista}>
                  <Producto p={p} />
                </td>
                <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
                <td className={claseTdLista}>{viaTexto(p, idioma)}</td>
                <td className={`${claseTdLista} text-right tabular-nums`}>{numero(p.unidades)}</td>
                <td className={`${claseTdLista} tabular-nums`}>{p.confirmadoEn ? fecha(diaPanama(p.confirmadoEn)) : "—"}</td>
                <td className={`${claseTdLista} tabular-nums`}>{fecha(p.fechaEnvio)}</td>
                <td className={`${claseTdLista} text-right tabular-nums`}>{t.dias(e.dias)}</td>
                <td className={`${claseTdLista} text-muted-foreground tabular-nums`}>{plazoTexto(plazo)}</td>
                <td className={claseTdLista}>
                  <Badge tone={TONO[e.tono]}>{texto}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  );
}

/** El panel para cotizar (o corregir): unidades por caja, costo por unidad o total (uno calcula el otro), foto real y comentario. */
function PanelCotizar({ p, fotoReal, alCerrar, alCotizar }: { p: PedidoPortal; fotoReal: string | null; alCerrar: () => void; alCotizar: (cambios: Partial<PedidoPortal>, preview: string | null) => void }) {
  const { t, idioma, numero, tr, error: errorEn } = useIdioma();
  const { mostrarToast } = useToast();
  // Corregir: ya cotizado o, en producción, la cotización de lo que Ecomfive confirmó (puede ser otra cantidad).
  const corrigiendo = p.etapa === "cotizado" || p.etapa === "produccion";
  const [unidades, setUnidades] = useState(String(p.unidades ?? p.unidadesPedidas ?? ""));
  const [total, setTotal] = useState(corrigiendo && p.montoTotal ? String(p.montoTotal) : "");
  const [comentario, setComentario] = useState(p.comentarioProveedor ?? "");
  const [foto, setFoto] = useState<{ ruta: string; preview: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uds = Number(unidades) || 0;
  // El proveedor pone solo las unidades y el monto total; el costo por unidad sale de la fórmula (total ÷ unidades).
  const unitario = uds > 0 && Number(total) > 0 ? unitarioDesdeTotal(Number(total), uds) : null;

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    if (!archivo.type.startsWith("image/")) return setError(t.errorImagen);
    if (archivo.size > 10 * 1024 * 1024) return setError(t.errorPesoFoto);
    setSubiendo(true);
    const permiso = await prepararSubidaFotoReal(p.id, archivo.name);
    if ("error" in permiso) {
      setSubiendo(false);
      return setError(errorEn(permiso.error));
    }
    const { error: errorSubida } = await supabase.storage.from(BUCKET_PROVEEDOR).uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type });
    setSubiendo(false);
    if (errorSubida) return setError(t.errorSubida);
    setFoto({ ruta: permiso.ruta, preview: URL.createObjectURL(archivo) });
  }

  async function enviar() {
    setError(null);
    if (!uds || !Number(total)) return setError(t.errorFaltaPrecio);
    setGuardando(true);
    const r = await cotizarPedido(p.id, { unidades, montoTotal: total, comentario, fotoRuta: foto?.ruta ?? null });
    setGuardando(false);
    if (r.error) return setError(errorEn(r.error));
    const montoTotal = Math.round(Number(total) * 100) / 100;
    alCotizar(
      { unidades: uds, unidadesPedidas: p.unidadesPedidas, montoTotal, costoUnitario: unitarioDesdeTotal(montoTotal, uds), comentarioProveedor: comentario.trim() || null, ...(foto ? { fotoRealRuta: foto.ruta } : {}) },
      foto?.preview ?? null,
    );
    mostrarToast(corrigiendo ? t.correccionOk : t.cotizacionOk);
  }

  const cambio = cambioDeUnidades(p.unidadesPedidas, uds || null);
  const nombre = tr(p.producto);
  return (
    <Ventana abierto alCerrar={() => !guardando && !subiendo && alCerrar()} lado="derecha" ancho="md" titulo={<span className="text-base font-semibold">{nombre}</span>}>
      <div className="flex flex-col gap-4 p-4" lang={idioma === "zh" ? "zh-CN" : "es"}>
        <div className="grid grid-cols-2 gap-2">
          <Foto url={p.fotoReferencia} nombre={nombre} grande />
          <Foto url={foto?.preview ?? fotoReal} nombre={nombre} real grande />
        </div>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          {nombre !== p.producto && (
            <>
              <dt className="text-muted-foreground">{t.original}</dt>
              <dd className="m-0 font-medium" lang="es">
                {p.producto}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">{t.colDestino}</dt>
          <dd className="m-0 font-medium">{p.paisCodigo ?? "—"}</dd>
          <dt className="text-muted-foreground">{t.colVia}</dt>
          <dd className="m-0 font-medium">{viaTexto(p, idioma)}</dd>
          <dt className="text-muted-foreground">{t.ecomfivePide}</dt>
          <dd className="m-0 font-medium tabular-nums">{t.unidadesTexto(numero(p.unidadesPedidas ?? p.unidades))}</dd>
          {p.referencia && (
            <>
              <dt className="text-muted-foreground">{t.referencia}</dt>
              <dd className="m-0 font-medium tabular-nums">{p.referencia}</dd>
            </>
          )}
          {p.notaParaProveedor && (
            <>
              <dt className="text-muted-foreground">{t.nota}</dt>
              <dd className="m-0 font-medium">
                <Traducido texto={p.notaParaProveedor} />
              </dd>
            </>
          )}
        </dl>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t.unidadesPuedes}</span>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={unidades}
            onChange={(e) => setUnidades(e.target.value)}
            className={fieldClass}
          />
          <span className="text-xs text-muted-foreground">{cambio ? t.cambioUnidades(numero(cambio.pedidas)) : t.pistaUnidades}</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t.totalUsd}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              data-enfocar
              placeholder={t.ejemploTotal}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className={fieldClass}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className={labelClass}>{t.costoUnidad}</span>
            <output aria-live="polite" className="flex h-9 items-center rounded-md border border-border bg-muted px-3 text-sm font-semibold tabular-nums">
              {unitario != null ? `$${unitario.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : "—"}
            </output>
            <span className="text-xs text-muted-foreground">{t.costoCalculado}</span>
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t.fotoProductoReal}</span>
          <input type="file" accept="image/*" disabled={subiendo || guardando} onChange={(e) => elegirFoto(e.target.files?.[0])} className="text-[13px]" />
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {subiendo ? t.subiendoFoto : foto ? t.fotoLista : fotoReal ? t.yaSubiste : t.pistaFoto}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t.comentario}</span>
          <textarea value={comentario} maxLength={600} rows={3} onChange={(e) => setComentario(e.target.value)} placeholder={t.ejemploComentario} className={fieldClass} />
        </label>
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={botonNormal} disabled={guardando || subiendo} onClick={alCerrar}>
            {t.cancelar}
          </button>
          <button type="button" className={botonPrincipal} disabled={guardando || subiendo} onClick={enviar}>
            {guardando ? t.enviando : corrigiendo ? t.guardarCorreccion : t.enviarCotizacion}
          </button>
        </div>
      </div>
    </Ventana>
  );
}

/** Abre el historial de un pedido (lo pone `PortalChinContenido`). */
const AbrirHistorial = createContext<(p: PedidoPortal) => void>(() => {});

/** El producto de una fila, con «Historial» debajo de su código. */
function Producto({ p }: { p: PedidoPortal }) {
  const { t, tr } = useIdioma();
  const abrir = useContext(AbrirHistorial);
  return (
    <ProductoBase
      p={p}
      extra={
        <button
          type="button"
          onClick={() => abrir(p)}
          aria-label={`${t.historial}: ${tr(p.producto)}`}
          className={`mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-azul hover:underline ${anilloFoco}`}
        >
          <HistorialIcon aria-hidden="true" className="h-3.5 w-3.5" />
          {t.historial}
        </button>
      }
    />
  );
}

/** El historial de un pedido: cotizaciones, unidades, etapas, envío, nota y registro de pagos, del más nuevo al más viejo. */
function VentanaHistorial({ p, soloLectura, alCerrar }: { p: PedidoPortal; soloLectura: boolean; alCerrar: () => void }) {
  const { t, tr, fecha, idioma, error: errorEn } = useIdioma();
  const [datos, setDatos] = useState<{ lineas: LineaHistorial[]; traducciones: Record<string, string> } | { error: string } | null>(null);
  useEffect(() => {
    let vigente = true;
    (soloLectura ? historialPedidoEcomfive(p.id) : historialPedidoProveedor(p.id)).then((r) => vigente && setDatos(r));
    return () => {
      vigente = false;
    };
  }, [p.id, soloLectura]);

  const TIPO: Record<LineaHistorial["tipo"], string> = {
    cotizacion: t.histCotizacion,
    unidades: t.histUnidades,
    monto: t.histMonto,
    cantidad: t.histCantidad,
    etapa: t.histEtapa,
    envio: t.histEnvio,
    llegada: t.histLlegada,
    nota: t.histNota,
    pagos: t.histPagos,
  };
  const ETAPA: Record<string, string> = {
    por_cotizar: t.tabCotizar,
    cotizado: t.tabCotizado,
    produccion: t.tabProduccion,
    enviado: t.tabEnviado,
    llegado: t.etapaLlegado,
    descartado: t.etapaDescartado,
  };
  const traducciones = datos && "lineas" in datos ? datos.traducciones : {};
  const valor = (l: LineaHistorial, v: string | null) => {
    if (v === null) return null;
    if (l.tipo === "etapa") return ETAPA[v] ?? v;
    if (l.tipo === "envio" || l.tipo === "llegada") return /^\d{4}-\d{2}-\d{2}/.test(v) ? fecha(v.slice(0, 10)) : v;
    if (l.tipo === "nota" || l.tipo === "pagos") return traducciones[v.trim()] ?? tr(v);
    return v;
  };
  const quien = (l: LineaHistorial) => (l.lado === "proveedor" ? (l.autor ?? "—") : (l.autor ?? "Ecomfive"));

  return (
    <Ventana abierto alCerrar={alCerrar} lado="derecha" ancho="md" titulo={<span className="text-base font-semibold">{t.historialDe(tr(p.producto))}</span>}>
      <div className="flex flex-col gap-3 p-4" lang={idioma === "zh" ? "zh-CN" : "es"}>
        {datos === null ? (
          <p className="m-0 text-sm text-muted-foreground" aria-live="polite">
            {t.cargandoHistorial}
          </p>
        ) : "error" in datos ? (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {errorEn(datos.error)}
          </p>
        ) : datos.lineas.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t.historialVacio}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col p-0">
            {datos.lineas.map((l, i) => {
              const antes = valor(l, l.antes);
              const despues = valor(l, l.despues);
              return (
                <li key={i} className="flex gap-3 border-b border-border py-2.5 last:border-b-0">
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${l.lado === "proveedor" ? "bg-primario" : "bg-foreground"}`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{quien(l)}</span>
                      <time dateTime={l.fecha} className="tabular-nums">
                        {fecha(diaPanama(l.fecha))} · {horaPanama(l.fecha)}
                      </time>
                    </span>
                    <span className="text-[13px] [overflow-wrap:anywhere]">
                      <span className="text-muted-foreground">{TIPO[l.tipo]}: </span>
                      {antes !== null && (
                        <>
                          <span className="text-muted-foreground line-through decoration-1">{antes}</span>
                          <span aria-hidden="true" className="text-muted-foreground">
                            {" "}
                            →{" "}
                          </span>
                        </>
                      )}
                      <span className="font-semibold tabular-nums">{despues ?? "—"}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Ventana>
  );
}
