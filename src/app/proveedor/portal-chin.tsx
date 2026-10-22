"use client";

import { useEffect, useMemo, useState } from "react";
import { cerrarSesion } from "@/app/login/actions";
import { Foto, Pestanas, Producto, TONO, Tarjeta, Vacio, botonNormal, botonPrincipal, dinero, ent, fecha, viaTexto } from "@/components/proveedor/piezas-proveedor";
import { claseTdLista, claseThLista } from "@/components/panel/piezas-panel";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { cambioDeUnidades, totalDesdeUnitario, unitarioDesdeTotal } from "@/lib/proveedor/cotizacion";
import { clavePlazo, type PedidoPortal } from "@/lib/proveedor/datos";
import { hoyPanama } from "@/lib/proveedor/fechas";
import { BUCKET_PROVEEDOR } from "@/lib/proveedor/rutas";
import { estadoTransito, textoPlazo, type Plazo } from "@/lib/proveedor/transito";
import { supabase } from "@/lib/supabase/client";
import { cotizarPedido, marcarEnviado, marcarVistoPorProveedor, prepararSubidaFotoReal } from "./actions";
import { PagosChin } from "./pagos-chin";
import type { AvisoVista, FilaPlazo } from "@/components/proveedor/pagos-proveedor";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";

export interface AvisoEcomfive {
  id: string;
  texto: string;
  creadoEn: string;
}

type Tab = "cotizar" | "cotizado" | "produccion" | "enviado" | "pagos";

/**
 * El portal de Chin (la vista del proveedor del prototipo aprobado, en español y con los colores del sistema): Por cotizar, Cotizado,
 * En producción y Enviado. Cotizar (con foto real y unidades por caja) y marcar enviado cambian la compra en el sistema de Ecomfive.
 * Pagos llega en la fase 4.
 */
export function PortalChin({
  cuenta,
  pedidos,
  plazos,
  fotosReales,
  avisos,
  pagos,
}: {
  cuenta: { nombre: string; proveedor: string; diasAnticipo: number };
  pedidos: PedidoPortal[];
  plazos: Record<string, Plazo>;
  fotosReales: Record<string, string>;
  avisos: AvisoEcomfive[];
  /** Pagos (fase 4); null si falta la migración 0127. */
  pagos: { resumen: ResumenPagos; avisos: AvisoVista[]; plazos: FilaPlazo[] } | null;
}) {
  const [lista, setLista] = useState(pedidos);
  const [fotos, setFotos] = useState(fotosReales);
  const [tab, setTab] = useState<Tab>("cotizar");
  const [cotizando, setCotizando] = useState<PedidoPortal | null>(null);
  const hoy = useMemo(() => hoyPanama(), []);

  // Lo nuevo de Ecomfive queda visto al abrir el portal (se sigue viendo hasta recargar).
  useEffect(() => {
    if (avisos.length) void marcarVistoPorProveedor();
  }, [avisos.length]);

  const de = (e: PedidoPortal["etapa"]) => lista.filter((p) => p.etapa === e);
  const cambiar = (id: string, cambios: Partial<PedidoPortal>) => setLista((xs) => xs.map((p) => (p.id === id ? { ...p, ...cambios } : p)));

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="m-0 text-lg font-semibold">Ecomfive · Portal de proveedores</h1>
            <p className="m-0 text-[13px] text-muted-foreground">
              Sesión de {cuenta.nombre} · solo tus pedidos de Ecomfive
            </p>
          </div>
          <form action={cerrarSesion}>
            <button type="submit" className={botonNormal}>
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-5">
        {avisos.length > 0 && (
          <Tarjeta titulo="Lo nuevo de Ecomfive">
            <ul className="m-0 list-none p-0">
              {avisos.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 border-b border-border px-3.5 py-2 text-sm last:border-b-0">
                  <span>{a.texto}</span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{fecha(a.creadoEn.slice(0, 10))}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}

        <Pestanas
          etiqueta="Portal de proveedores"
          tabs={[
            { clave: "cotizar" as const, titulo: "Por cotizar", cuenta: de("por_cotizar").length },
            { clave: "cotizado" as const, titulo: "Cotizado", cuenta: de("cotizado").length },
            { clave: "produccion" as const, titulo: "En producción", cuenta: de("produccion").length },
            { clave: "enviado" as const, titulo: "Enviado", cuenta: de("enviado").length },
            ...(pagos ? [{ clave: "pagos" as const, titulo: "Pagos", cuenta: pagos.avisos.length, viva: true }] : []),
          ]}
          valor={tab}
          alCambiar={setTab}
        />

        {tab === "cotizar" && <PorCotizar pedidos={de("por_cotizar")} alCotizar={setCotizando} />}
        {tab === "cotizado" && <Cotizados pedidos={de("cotizado")} fotos={fotos} alCorregir={setCotizando} />}
        {tab === "produccion" && <EnProduccion pedidos={de("produccion")} hoy={hoy} diasAnticipo={cuenta.diasAnticipo} alEnviar={(id, f) => cambiar(id, { etapa: "enviado", fechaEnvio: f })} />}
        {tab === "enviado" && <Enviados pedidos={de("enviado")} plazos={plazos} hoy={hoy} />}
        {tab === "pagos" && pagos && <PagosChin resumen={pagos.resumen} avisos={pagos.avisos} plazos={pagos.plazos} />}
      </main>

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
    </div>
  );
}

const cabecera = (titulos: { t: string; derecha?: boolean }[]) => (
  <thead className="sticky top-0 z-[1] bg-card">
    <tr>
      {titulos.map(({ t, derecha }, i) => (
        <th key={`${t}-${i}`} scope="col" className={`${claseThLista} ${derecha ? "text-right" : ""}`}>
          {t}
        </th>
      ))}
    </tr>
  </thead>
);

function Tabla({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-[620px] overflow-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

function PorCotizar({ pedidos, alCotizar }: { pedidos: PedidoPortal[]; alCotizar: (p: PedidoPortal) => void }) {
  return (
    <Tarjeta titulo="Ecomfive necesita precio" accion={<span className="text-xs text-muted-foreground">Pon el costo por unidad o el total, las unidades por caja y una foto del producto real</span>}>
      {pedidos.length === 0 ? (
        <Vacio>No hay nada por cotizar.</Vacio>
      ) : (
        <Tabla>
          {cabecera([{ t: "Producto" }, { t: "Destino" }, { t: "Vía" }, { t: "Unidades", derecha: true }, { t: "Nota de Ecomfive" }, { t: "" }])}
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id}>
                <td className={claseTdLista}>
                  <Producto p={p} />
                </td>
                <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
                <td className={claseTdLista}>{viaTexto(p)}</td>
                <td className={`${claseTdLista} text-right tabular-nums`}>{ent(p.unidades)}</td>
                <td className={`${claseTdLista} max-w-[22rem] whitespace-normal text-muted-foreground`}>{p.notaParaProveedor ?? ""}</td>
                <td className={`${claseTdLista} text-right`}>
                  <button type="button" className={botonPrincipal} onClick={() => alCotizar(p)} aria-label={`Cotizar ${p.producto}`}>
                    Cotizar
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

function Cotizados({ pedidos, fotos, alCorregir }: { pedidos: PedidoPortal[]; fotos: Record<string, string>; alCorregir: (p: PedidoPortal) => void }) {
  return (
    <Tarjeta titulo="Cotizado · espera la decisión de Ecomfive">
      {pedidos.length === 0 ? (
        <Vacio>No hay nada aquí.</Vacio>
      ) : (
        <Tabla>
          {cabecera([{ t: "Producto" }, { t: "Destino" }, { t: "Vía" }, { t: "Unidades", derecha: true }, { t: "Por unidad", derecha: true }, { t: "Total", derecha: true }, { t: "Foto real" }, { t: "Estado" }, { t: "" }])}
          <tbody>
            {pedidos.map((p) => {
              const cambio = cambioDeUnidades(p.unidadesPedidas, p.unidades);
              return (
                <tr key={p.id}>
                  <td className={claseTdLista}>
                    <Producto p={p} />
                  </td>
                  <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
                  <td className={claseTdLista}>{viaTexto(p)}</td>
                  <td className={`${claseTdLista} text-right tabular-nums`}>
                    {ent(p.unidades)}
                    {cambio && <span className="block text-xs text-muted-foreground">pidieron {ent(cambio.pedidas)}</span>}
                  </td>
                  <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(p.costoUnitario, 2)}</td>
                  <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(p.montoTotal)}</td>
                  <td className={claseTdLista}>
                    <Foto url={fotos[p.id] ?? null} nombre={p.producto} real />
                  </td>
                  <td className={claseTdLista}>
                    <Badge tone="warning">Espera a Ecomfive</Badge>
                  </td>
                  <td className={`${claseTdLista} text-right`}>
                    <button type="button" className={botonNormal} onClick={() => alCorregir(p)} aria-label={`Corregir la cotización de ${p.producto}`}>
                      Corregir
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

function EnProduccion({ pedidos, hoy, diasAnticipo, alEnviar }: { pedidos: PedidoPortal[]; hoy: string; diasAnticipo: number; alEnviar: (id: string, fecha: string) => void }) {
  return (
    <Tarjeta titulo="Confirmado por Ecomfive · en producción" accion={<span className="text-xs text-muted-foreground">Al despacharlo, márcalo enviado: Ecomfive recibe el aviso y empiezan a correr los plazos de pago</span>}>
      {pedidos.length === 0 ? (
        <Vacio>No hay nada en producción.</Vacio>
      ) : (
        <Tabla>
          {cabecera([{ t: "Producto" }, { t: "Destino" }, { t: "Vía" }, { t: "Unidades", derecha: true }, { t: "Total", derecha: true }, { t: "Fecha de envío" }, { t: "" }])}
          <tbody>
            {pedidos.map((p) => (
              <FilaProduccion key={p.id} p={p} hoy={hoy} diasAnticipo={diasAnticipo} alEnviar={alEnviar} />
            ))}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  );
}

function FilaProduccion({ p, hoy, diasAnticipo, alEnviar }: { p: PedidoPortal; hoy: string; diasAnticipo: number; alEnviar: (id: string, fecha: string) => void }) {
  const { mostrarToast } = useToast();
  const [f, setF] = useState(hoy);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  async function enviar() {
    setOcupado(true);
    const r = await marcarEnviado(p.id, f);
    setOcupado(false);
    if (r.error || !r.fechaEnvio) return mostrarToast(r.error ?? "No se pudo marcar el envío.", "destructive");
    alEnviar(p.id, r.fechaEnvio);
    const vence = new Date(Date.parse(r.fechaEnvio) + diasAnticipo * 864e5).toISOString().slice(0, 10);
    mostrarToast(`Marcado como enviado. Ecomfive recibió el aviso; el anticipo vence el ${fecha(vence)}.`);
  }
  return (
    <tr>
      <td className={claseTdLista}>
        <Producto p={p} />
      </td>
      <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
      <td className={claseTdLista}>{viaTexto(p)}</td>
      <td className={`${claseTdLista} text-right tabular-nums`}>{ent(p.unidades)}</td>
      <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(p.montoTotal)}</td>
      <td className={claseTdLista}>
        <input type="date" value={f} max={hoy} onChange={(e) => setF(e.target.value)} disabled={confirmar} aria-label={`Fecha de envío de ${p.producto}`} className={`h-8 rounded-md border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`} />
      </td>
      <td className={`${claseTdLista} text-right`}>
        {confirmar ? (
          <span className="inline-flex gap-1.5">
            <button type="button" className={botonNormal} disabled={ocupado} onClick={() => setConfirmar(false)}>
              No
            </button>
            <button type="button" className={botonPrincipal} disabled={ocupado} onClick={enviar}>
              {ocupado ? "Guardando…" : `Sí, salió el ${fecha(f)}`}
            </button>
          </span>
        ) : (
          <button type="button" className={botonPrincipal} disabled={!f} onClick={() => setConfirmar(true)}>
            Marcar enviado
          </button>
        )}
      </td>
    </tr>
  );
}

function Enviados({ pedidos, plazos, hoy }: { pedidos: PedidoPortal[]; plazos: Record<string, Plazo>; hoy: string }) {
  const filas = pedidos
    .filter((p) => p.fechaEnvio)
    .map((p) => {
      const plazo = plazos[clavePlazo(p.paisCodigo, p.via)] ?? null;
      const e = estadoTransito(p.fechaEnvio!, null, plazo, hoy);
      const max = plazo?.max ?? plazo?.min ?? null;
      const texto = max == null ? "Sin plazo acordado" : e.dias > max ? `${e.dias - max} d de atraso` : `Faltan ${max - e.dias} d`;
      return { p, plazo, e, texto };
    })
    .sort((a, b) => b.p.fechaEnvio!.localeCompare(a.p.fechaEnvio!));
  return (
    <Tarjeta titulo="Enviado · en camino" accion={<span className="text-xs text-muted-foreground">Días en tránsito contra el plazo prometido</span>}>
      {filas.length === 0 ? (
        <Vacio>No hay nada en camino.</Vacio>
      ) : (
        <Tabla>
          {cabecera([{ t: "Producto" }, { t: "Destino" }, { t: "Vía" }, { t: "Unidades", derecha: true }, { t: "Enviado" }, { t: "Días", derecha: true }, { t: "Prometido" }, { t: "Estado" }])}
          <tbody>
            {filas.map(({ p, plazo, e, texto }) => (
              <tr key={p.id}>
                <td className={claseTdLista}>
                  <Producto p={p} />
                </td>
                <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
                <td className={claseTdLista}>{viaTexto(p)}</td>
                <td className={`${claseTdLista} text-right tabular-nums`}>{ent(p.unidades)}</td>
                <td className={`${claseTdLista} tabular-nums`}>{fecha(p.fechaEnvio)}</td>
                <td className={`${claseTdLista} text-right tabular-nums`}>{e.dias} d</td>
                <td className={`${claseTdLista} text-muted-foreground tabular-nums`}>{textoPlazo(plazo)}</td>
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
function PanelCotizar({
  p,
  fotoReal,
  alCerrar,
  alCotizar,
}: {
  p: PedidoPortal;
  fotoReal: string | null;
  alCerrar: () => void;
  alCotizar: (cambios: Partial<PedidoPortal>, preview: string | null) => void;
}) {
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
    if (!archivo.type.startsWith("image/")) return setError("Elige una imagen (JPG, PNG o WebP).");
    if (archivo.size > 10 * 1024 * 1024) return setError("La foto pesa más de 10 MB.");
    setSubiendo(true);
    const permiso = await prepararSubidaFotoReal(p.id, archivo.name);
    if ("error" in permiso) {
      setSubiendo(false);
      return setError(permiso.error);
    }
    const { error: errorSubida } = await supabase.storage.from(BUCKET_PROVEEDOR).uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type });
    setSubiendo(false);
    if (errorSubida) return setError("No se pudo subir la foto. Inténtalo de nuevo.");
    setFoto({ ruta: permiso.ruta, preview: URL.createObjectURL(archivo) });
  }

  async function enviar() {
    setError(null);
    if (!uds || (!Number(unitario) && !Number(total))) return setError("Pon las unidades y el costo por unidad o el total.");
    setGuardando(true);
    const r = await cotizarPedido(p.id, { unidades, costoUnitario: unitario, montoTotal: total, comentario, fotoRuta: foto?.ruta ?? null });
    setGuardando(false);
    if (r.error) return setError(r.error);
    const montoTotal = Number(total) || totalDesdeUnitario(Number(unitario), uds);
    alCotizar(
      { unidades: uds, unidadesPedidas: p.unidadesPedidas, montoTotal, costoUnitario: unitarioDesdeTotal(montoTotal, uds), comentarioProveedor: comentario.trim() || null, ...(foto ? { fotoRealRuta: foto.ruta } : {}) },
      foto?.preview ?? null,
    );
    mostrarToast(corrigiendo ? "Cotización corregida. Ecomfive recibió el aviso." : "Cotización enviada. Ecomfive recibió el aviso.");
  }

  const cambio = cambioDeUnidades(p.unidadesPedidas, uds || null);
  return (
    <Ventana abierto alCerrar={() => !guardando && !subiendo && alCerrar()} lado="derecha" ancho="md" titulo={<span className="text-base font-semibold">{p.producto}</span>}>
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Foto url={p.fotoReferencia} nombre={p.producto} grande />
          <Foto url={foto?.preview ?? fotoReal} nombre={p.producto} real grande />
        </div>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="text-muted-foreground">Destino</dt>
          <dd className="m-0 font-medium">{p.paisCodigo ?? "—"}</dd>
          <dt className="text-muted-foreground">Vía</dt>
          <dd className="m-0 font-medium">{viaTexto(p)}</dd>
          <dt className="text-muted-foreground">Ecomfive pide</dt>
          <dd className="m-0 font-medium tabular-nums">{ent(p.unidadesPedidas ?? p.unidades)} unidades</dd>
          {p.referencia && (
            <>
              <dt className="text-muted-foreground">Referencia</dt>
              <dd className="m-0 font-medium tabular-nums">{p.referencia}</dd>
            </>
          )}
          {p.notaParaProveedor && (
            <>
              <dt className="text-muted-foreground">Nota</dt>
              <dd className="m-0 font-medium">{p.notaParaProveedor}</dd>
            </>
          )}
        </dl>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Unidades que puedes enviar</span>
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
          <span className="text-xs text-muted-foreground">
            {cambio ? `Pidieron ${ent(cambio.pedidas)}: Ecomfive verá el cambio.` : "Si la caja trae otra cantidad (p. ej. 960 en vez de 1,000), cámbiala aquí."}
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Costo por unidad (USD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              data-enfocar
              placeholder="Ej: 2.13"
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
            <span className={labelClass}>Total (USD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="Ej: 2130"
              value={total}
              onChange={(e) => {
                setTotal(e.target.value);
                const t = Number(e.target.value);
                if (t > 0 && uds) setUnitario(String(unitarioDesdeTotal(t, uds)));
              }}
              className={fieldClass}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Foto del producto real</span>
          <input type="file" accept="image/*" disabled={subiendo || guardando} onChange={(e) => elegirFoto(e.target.files?.[0])} className="text-[13px]" />
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {subiendo ? "Subiendo la foto…" : foto ? "Foto lista." : fotoReal ? "Ya subiste una foto; elige otra para cambiarla." : "La del producto que vas a enviar (marca y presentación reales)."}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Comentario para Ecomfive</span>
          <textarea value={comentario} maxLength={600} rows={3} onChange={(e) => setComentario(e.target.value)} placeholder="Ej: Misma fórmula, otra marca. La caja trae 960." className={fieldClass} />
        </label>
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={botonNormal} disabled={guardando || subiendo} onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className={botonPrincipal} disabled={guardando || subiendo} onClick={enviar}>
            {guardando ? "Enviando…" : corrigiendo ? "Guardar corrección" : "Enviar cotización"}
          </button>
        </div>
      </div>
    </Ventana>
  );
}
