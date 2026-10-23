"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cerrarSesion } from "@/app/login/actions";
import { IdiomaProveedor, Traducido, useIdioma } from "@/components/proveedor/idioma-contexto";
import { Foto, Pestanas, Producto, TONO, Tarjeta, Vacio, botonNormal, botonPrincipal, dinero, viaTexto } from "@/components/proveedor/piezas-proveedor";
import type { FilaRegistro } from "@/lib/proveedor/registro-pagos";
import { claseTdLista, claseThLista } from "@/components/panel/piezas-panel";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { cambioDeUnidades, totalDesdeUnitario, unitarioDesdeTotal } from "@/lib/proveedor/cotizacion";
import { clavePlazo, type PedidoPortal } from "@/lib/proveedor/datos";
import { hoyPanama } from "@/lib/proveedor/fechas";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";
import { BUCKET_PROVEEDOR } from "@/lib/proveedor/rutas";
import type { Idioma } from "@/lib/proveedor/textos";
import { estadoTransito, textoPlazo, type Plazo } from "@/lib/proveedor/transito";
import { supabase } from "@/lib/supabase/client";
import { cambiarIdiomaProveedor, cotizarPedido, marcarEnviado, marcarVistoPorProveedor, prepararSubidaFotoReal } from "./actions";
import { FormularioClave } from "./cambiar-clave";
import { PagosChin } from "./pagos-chin";

export interface AvisoEcomfive {
  id: string;
  texto: string;
  creadoEn: string;
}

type Tab = "cotizar" | "cotizado" | "produccion" | "enviado" | "pagos";

export interface DatosPortalChin {
  cuenta: { nombre: string; proveedor: string; diasAnticipo: number };
  pedidos: PedidoPortal[];
  plazos: Record<string, Plazo>;
  fotosReales: Record<string, string>;
  avisos: AvisoEcomfive[];
  /** Pagos (fase 4); null si falta la migración 0127. */
  pagos: { resumen: ResumenPagos; filas: FilaRegistro[] } | null;
  /** Lo escrito por personas, ya traducido al idioma de la pantalla (texto original → traducción). */
  traducciones: Record<string, string>;
}

/**
 * El portal de Chin: Por cotizar, Cotizado, En producción, Enviado y Pagos, en su idioma (chino simplificado por defecto). Cotizar (con
 * foto real y unidades por caja) y marcar enviado cambian la compra en el sistema de Ecomfive; los pagos y la llegada que anota en
 * Pagos (Registro de pagos) quedan en su registro y avisan a Ecomfive. Con `soloLectura` es «Lo que ve Chin» del Tablero de Chin de
 * Ecomfive: lo mismo que él ve, en español y sin botones.
 */
export function PortalChin({ idioma, soloLectura = false, ...datos }: DatosPortalChin & { idioma: Idioma; soloLectura?: boolean }) {
  return (
    <IdiomaProveedor idioma={idioma} traducciones={datos.traducciones}>
      <PortalChinContenido {...datos} soloLectura={soloLectura} />
    </IdiomaProveedor>
  );
}

function PortalChinContenido({ cuenta, pedidos, plazos, fotosReales, avisos, pagos, soloLectura }: DatosPortalChin & { soloLectura: boolean }) {
  const { t, tr, fecha, idioma } = useIdioma();
  const [lista, setLista] = useState(pedidos);
  const [fotos, setFotos] = useState(fotosReales);
  const [tab, setTab] = useState<Tab>("cotizar");
  const [cotizando, setCotizando] = useState<PedidoPortal | null>(null);
  const hoy = useMemo(() => hoyPanama(), []);

  // Lo nuevo de Ecomfive queda visto al abrir su portal (se sigue viendo hasta recargar). Desde Ecomfive no se marca nada.
  useEffect(() => {
    if (!soloLectura && avisos.length) void marcarVistoPorProveedor();
  }, [avisos.length, soloLectura]);

  const de = (e: PedidoPortal["etapa"]) => lista.filter((p) => p.etapa === e);
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
          ...(pagos ? [{ clave: "pagos" as const, titulo: t.tabPagos, cuenta: pagos.filas.filter((f) => f.sinPagar > 0).length }] : []),
        ]}
        valor={tab}
        alCambiar={setTab}
      />

      {tab === "cotizar" && <PorCotizar pedidos={de("por_cotizar")} alCotizar={soloLectura ? null : setCotizando} />}
      {tab === "cotizado" && <Cotizados pedidos={de("cotizado")} fotos={fotos} alCorregir={soloLectura ? null : setCotizando} />}
      {tab === "produccion" && <EnProduccion pedidos={de("produccion")} hoy={hoy} diasAnticipo={cuenta.diasAnticipo} soloLectura={soloLectura} alEnviar={(id, f) => cambiar(id, { etapa: "enviado", fechaEnvio: f })} />}
      {tab === "enviado" && <Enviados pedidos={de("enviado")} plazos={plazos} hoy={hoy} />}
      {tab === "pagos" && pagos && <PagosChin resumen={pagos.resumen} filas={pagos.filas} soloLectura={soloLectura} />}

      {cotizando && (
        <PanelCotizar
          key={cotizando.id}
          p={cotizando}
          fotoReal={fotos[cotizando.id] ?? null}
          alCerrar={() => setCotizando(null)}
          alCotizar={(cambios, preview) => {
            cambiar(cotizando.id, { ...cambios, etapa: "cotizado" });
            if (preview) setFotos((f) => ({ ...f, [cotizando.id]: preview }));
            setCotizando(null);
          }}
        />
      )}
    </>
  );

  if (soloLectura)
    return (
      <div className="flex flex-col gap-5" lang={idioma === "zh" ? "zh-CN" : "es"}>
        {t.soloLectura && <p className="m-0 rounded-lg border border-border bg-muted px-3.5 py-2 text-[13px] text-muted-foreground">{t.soloLectura}</p>}
        {cuerpo}
      </div>
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
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-5">{cuerpo}</main>
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

function Cabecera({ columnas }: { columnas: { texto: string; derecha?: boolean }[] }) {
  return (
    <thead className="sticky top-0 z-[1] bg-card">
      <tr>
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

function PorCotizar({ pedidos, alCotizar }: { pedidos: PedidoPortal[]; alCotizar: ((p: PedidoPortal) => void) | null }) {
  const { t, idioma, numero, tr } = useIdioma();
  return (
    <Tarjeta titulo={t.cotizarTitulo} accion={<span className="text-xs text-muted-foreground">{t.cotizarPista}</span>}>
      {pedidos.length === 0 ? (
        <Vacio>{t.cotizarVacio}</Vacio>
      ) : (
        <Tabla>
          <Cabecera columnas={[{ texto: t.colProducto }, { texto: t.colDestino }, { texto: t.colVia }, { texto: t.colUnidades, derecha: true }, { texto: t.colNota }, ...(alCotizar ? [{ texto: "" }] : [])]} />
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id}>
                <td className={claseTdLista}>
                  <Producto p={p} />
                </td>
                <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
                <td className={claseTdLista}>{viaTexto(p, idioma)}</td>
                <td className={`${claseTdLista} text-right tabular-nums`}>{numero(p.unidades)}</td>
                <td className={`${claseTdLista} max-w-[22rem] whitespace-normal text-muted-foreground`}>{tr(p.notaParaProveedor)}</td>
                {alCotizar && (
                  <td className={`${claseTdLista} text-right`}>
                    <button type="button" className={botonPrincipal} onClick={() => alCotizar(p)} aria-label={`${t.cotizar}: ${tr(p.producto)}`}>
                      {t.cotizar}
                    </button>
                  </td>
                )}
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
  return (
    <Tarjeta titulo={t.cotizadoTitulo}>
      {pedidos.length === 0 ? (
        <Vacio>{t.cotizadoVacio}</Vacio>
      ) : (
        <Tabla>
          <Cabecera
            columnas={[
              { texto: t.colProducto },
              { texto: t.colDestino },
              { texto: t.colVia },
              { texto: t.colUnidades, derecha: true },
              { texto: t.colPorUnidad, derecha: true },
              { texto: t.colTotal, derecha: true },
              { texto: t.colFotoReal },
              { texto: t.colEstado },
              ...(alCorregir ? [{ texto: "" }] : []),
            ]}
          />
          <tbody>
            {pedidos.map((p) => {
              const cambio = cambioDeUnidades(p.unidadesPedidas, p.unidades);
              return (
                <tr key={p.id}>
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
                  {alCorregir && (
                    <td className={`${claseTdLista} text-right`}>
                      <button type="button" className={botonNormal} onClick={() => alCorregir(p)} aria-label={`${t.corregir}: ${tr(p.producto)}`}>
                        {t.corregir}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  );
}

function EnProduccion({ pedidos, hoy, diasAnticipo, soloLectura, alEnviar }: { pedidos: PedidoPortal[]; hoy: string; diasAnticipo: number; soloLectura: boolean; alEnviar: (id: string, fecha: string) => void }) {
  const { t } = useIdioma();
  return (
    <Tarjeta titulo={t.produccionTitulo} accion={<span className="text-xs text-muted-foreground">{t.produccionPista}</span>}>
      {pedidos.length === 0 ? (
        <Vacio>{t.produccionVacio}</Vacio>
      ) : (
        <Tabla>
          <Cabecera columnas={[{ texto: t.colProducto }, { texto: t.colDestino }, { texto: t.colVia }, { texto: t.colUnidades, derecha: true }, { texto: t.colTotal, derecha: true }, ...(soloLectura ? [] : [{ texto: t.colFechaEnvio }, { texto: "" }])]} />
          <tbody>
            {pedidos.map((p) => (
              <FilaProduccion key={p.id} p={p} hoy={hoy} diasAnticipo={diasAnticipo} soloLectura={soloLectura} alEnviar={alEnviar} />
            ))}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  );
}

function FilaProduccion({ p, hoy, diasAnticipo, soloLectura, alEnviar }: { p: PedidoPortal; hoy: string; diasAnticipo: number; soloLectura: boolean; alEnviar: (id: string, fecha: string) => void }) {
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
      <td className={claseTdLista}>
        <Producto p={p} />
      </td>
      <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
      <td className={claseTdLista}>{viaTexto(p, idioma)}</td>
      <td className={`${claseTdLista} text-right tabular-nums`}>{numero(p.unidades)}</td>
      <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(p.montoTotal)}</td>
      {!soloLectura && (
        <>
          <td className={claseTdLista}>
            <input type="date" value={f} max={hoy} onChange={(e) => setF(e.target.value)} disabled={confirmar} aria-label={`${t.colFechaEnvio}: ${tr(p.producto)}`} className={`h-8 rounded-md border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`} />
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
              <button type="button" className={botonPrincipal} disabled={!f} onClick={() => setConfirmar(true)}>
                {t.marcarEnviado}
              </button>
            )}
          </td>
        </>
      )}
    </tr>
  );
}

function Enviados({ pedidos, plazos, hoy }: { pedidos: PedidoPortal[]; plazos: Record<string, Plazo>; hoy: string }) {
  const { t, idioma, numero, fecha } = useIdioma();
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
  return (
    <Tarjeta titulo={t.enviadoTitulo} accion={<span className="text-xs text-muted-foreground">{t.enviadoPista}</span>}>
      {filas.length === 0 ? (
        <Vacio>{t.enviadoVacio}</Vacio>
      ) : (
        <Tabla>
          <Cabecera columnas={[{ texto: t.colProducto }, { texto: t.colDestino }, { texto: t.colVia }, { texto: t.colUnidades, derecha: true }, { texto: t.colEnviado }, { texto: t.colDias, derecha: true }, { texto: t.colPrometido }, { texto: t.colEstado }]} />
          <tbody>
            {filas.map(({ p, plazo, e, texto }) => (
              <tr key={p.id}>
                <td className={claseTdLista}>
                  <Producto p={p} />
                </td>
                <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
                <td className={claseTdLista}>{viaTexto(p, idioma)}</td>
                <td className={`${claseTdLista} text-right tabular-nums`}>{numero(p.unidades)}</td>
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
  const corrigiendo = p.etapa === "cotizado";
  const [unidades, setUnidades] = useState(String(p.unidades ?? p.unidadesPedidas ?? ""));
  const [unitario, setUnitario] = useState(corrigiendo && p.costoUnitario != null ? String(p.costoUnitario) : "");
  const [total, setTotal] = useState(corrigiendo && p.montoTotal != null ? String(p.montoTotal) : "");
  const [comentario, setComentario] = useState(p.comentarioProveedor ?? "");
  const [foto, setFoto] = useState<{ ruta: string; preview: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uds = Number(unidades) || 0;

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
    if (!uds || (!Number(unitario) && !Number(total))) return setError(t.errorFaltaPrecio);
    setGuardando(true);
    const r = await cotizarPedido(p.id, { unidades, costoUnitario: unitario, montoTotal: total, comentario, fotoRuta: foto?.ruta ?? null });
    setGuardando(false);
    if (r.error) return setError(errorEn(r.error));
    const montoTotal = Number(total) || totalDesdeUnitario(Number(unitario), uds);
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
            onChange={(e) => {
              setUnidades(e.target.value);
              const n = Number(e.target.value);
              if (n > 0 && Number(unitario)) setTotal(String(totalDesdeUnitario(Number(unitario), n)));
            }}
            className={fieldClass}
          />
          <span className="text-xs text-muted-foreground">{cambio ? t.cambioUnidades(numero(cambio.pedidas)) : t.pistaUnidades}</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t.costoUnidad}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              data-enfocar
              placeholder={t.ejemploCosto}
              value={unitario}
              onChange={(e) => {
                setUnitario(e.target.value);
                const u = Number(e.target.value);
                if (u > 0 && uds) setTotal(String(totalDesdeUnitario(u, uds)));
              }}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t.totalUsd}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder={t.ejemploTotal}
              value={total}
              onChange={(e) => {
                setTotal(e.target.value);
                const n = Number(e.target.value);
                if (n > 0 && uds) setUnitario(String(unitarioDesdeTotal(n, uds)));
              }}
              className={fieldClass}
            />
          </label>
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
