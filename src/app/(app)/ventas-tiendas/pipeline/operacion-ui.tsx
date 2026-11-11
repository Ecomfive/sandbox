"use client";

// Piezas de la operación del Pipeline: insignias de la orden, diálogos de contacto, notas, envío, entrega y fallo, y la
// pestaña «Control» (indicadores, cobertura, mensajeros, antigüedad de saldos, incidencias, aprobaciones y cierre).

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { fieldClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero2, entero } from "@/lib/af4/formato";
import type { OrdenPipeline, DatosPipeline } from "@/lib/ventas/cargar-pipeline";
import type { DatosOperacion, ExtraOrden } from "@/lib/ventas/cargar-operacion";
import { supabase as clienteNavegador } from "@/lib/supabase/client";
import { BUCKET_COMPROBANTES, ETIQUETA_COMPROBANTE, TIPOS_COMPROBANTE } from "@/lib/ventas/comprobantes";
import { PLANTILLAS, type PlantillaAviso } from "@/lib/ventas/chatmaid-plantillas";
import { ETIQUETA_RESULTADO, ETIQUETA_RIESGO, FRANJAS, MOTIVOS_FALLO, RESULTADOS_CONTACTO, etiquetaFranja, semaforoConfirmacion } from "@/lib/ventas/operacion";
import {
  agregarNota, anularRemesa, borrarCobertura, cerrarMes, congelarOrden, crearIncidencia, guardarAjustesTienda, guardarEtiquetasFranja, guardarCobertura, guardarConfigMensajero, generarEnlaceMensajero,
  enviarWhatsappOrden, marcarClienteLista, obtenerDetalleOrden, reasignarEnvio, recibirDevolucion, registrarContacto, resolverAprobacion, resolverIncidencia, type DetalleOrden,
} from "./operacion-actions";
import { cambiarFase } from "./actions";
import { listarComprobantes, prepararSubidaComprobante, registrarComprobante, type ComprobanteVista } from "./comprobantes-actions";

export const botonPrimario = "rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50";
export const botonSecundario = "rounded-md border border-border-control px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50";
type Res = { error: string } | { ok: true; aviso?: string };
export type Ejecutar = (f: () => Promise<Res>, ok: string, alTerminar?: () => void, mantener?: boolean) => void;

export function Cuadro({ titulo, alCerrar, ancho = "md", children }: { titulo: string; alCerrar: () => void; ancho?: "md" | "lg"; children: React.ReactNode }) {
  return <Ventana abierto alCerrar={alCerrar} titulo={titulo} ancho={ancho}><div className="flex flex-col gap-4 p-4">{children}</div></Ventana>;
}

const Punto = ({ clase }: { clase: string }) => <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${clase}`} />;

/** Semáforo de espera y avisos de la orden: texto con punto, nunca solo color. */
export function Insignias({ o, x, umbrales }: { o: OrdenPipeline; x: ExtraOrden | undefined; umbrales: DatosOperacion["umbrales"] }) {
  if (!x) return null;
  const sem = o.fase === "por_confirmar" ? semaforoConfirmacion(o.horas, umbrales) : null;
  const items: { t: string; punto: string }[] = [];
  if (sem === "rojo") items.push({ t: `Espera ${o.horas} h`, punto: "bg-destructive" });
  else if (sem === "ambar") items.push({ t: `Espera ${o.horas} h`, punto: "bg-warning" });
  if (x.congelada) items.push({ t: "Congelada", punto: "bg-info" });
  if (x.noContactable) items.push({ t: "No contactable", punto: "bg-destructive" });
  if (x.duplicadaDe) items.push({ t: `Posible duplicada de ${x.duplicadaDe}`, punto: "bg-warning" });
  if (x.riesgo === "alto" || x.riesgo === "lista_negra") items.push({ t: ETIQUETA_RIESGO[x.riesgo], punto: "bg-destructive" });
  else if (x.riesgo === "medio") items.push({ t: ETIQUETA_RIESGO.medio, punto: "bg-warning" });
  else if (x.riesgo === "lista_blanca") items.push({ t: ETIQUETA_RIESGO.lista_blanca, punto: "bg-success" });
  if (!x.telefonoValido) items.push({ t: x.telefonoMotivo ?? "Teléfono dudoso", punto: "bg-warning" });
  // Mejora 63: el puntaje junta todas las señales; se muestra con sus dos motivos principales.
  if (x.puntaje && x.puntaje.nivel !== "bajo" && x.riesgo !== "lista_negra")
    items.push({ t: `Riesgo ${x.puntaje.valor}/100 · ${x.puntaje.motivos.slice(0, 2).join(" · ")}`, punto: x.puntaje.nivel === "alto" ? "bg-destructive" : "bg-warning" });
  if (x.conCambios) items.push({ t: "Confirmada con cambios", punto: "bg-info" });
  if (x.estancada) items.push({ t: `${x.diasEnFase} días en esta fase`, punto: "bg-warning" });
  if (!items.length) return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
      {items.map((i) => <span key={i.t} className="inline-flex items-center gap-1.5"><Punto clase={i.punto} />{i.t}</span>)}
    </div>
  );
}

const hora = (iso: string) => new Date(iso).toLocaleString("es-PA", { timeZone: "America/Panama", dateStyle: "short", timeStyle: "short" });

/** Ficha de la orden: historial de contactos, notas, línea de tiempo e incidencias, y las acciones sobre ella. */
/** Comprobantes de entrega o cobro de una orden: foto subida directo al almacén y revisada por su contenido en el servidor. */
function ComprobantesOrden({ ordenId, puedeEscribir, ejecutar }: { ordenId: string; puedeEscribir: boolean; ejecutar: Ejecutar }) {
  const [lista, setLista] = useState<ComprobanteVista[] | { error: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [tipo, setTipo] = useState<string>("entrega");
  const [nota, setNota] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  useEffect(() => { let vivo = true; listarComprobantes(ordenId).then((d) => { if (vivo) setLista(d); }); return () => { vivo = false; }; }, [ordenId, version]);
  const subir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setFalla(null);
    setSubiendo(true);
    try {
      const p = await prepararSubidaComprobante(ordenId, archivo.name);
      if ("error" in p) { setFalla(p.error); return; }
      const { error } = await clienteNavegador.storage.from(BUCKET_COMPROBANTES).uploadToSignedUrl(p.ruta, p.token, archivo, { contentType: archivo.type });
      if (error) { setFalla("No se pudo subir la foto."); return; }
      ejecutar(() => registrarComprobante(ordenId, p.ruta, tipo, nota.trim() || null), "Comprobante guardado", () => { setNota(""); setVersion((v) => v + 1); });
    } finally {
      setSubiendo(false);
    }
  };
  const fotos = lista && !("error" in lista) ? lista : [];
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
      <legend className="px-1 text-xs text-muted-foreground">Comprobantes de entrega</legend>
      {lista && "error" in lista && <p className="text-sm text-destructive">{lista.error}</p>}
      {lista && !("error" in lista) && fotos.length === 0 && <p className="text-sm text-muted-foreground">Sin comprobantes.</p>}
      {fotos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fotos.map((f) => (
            <li key={f.id} className="flex flex-col gap-1 text-xs">
              {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir comprobante de ${ETIQUETA_COMPROBANTE[f.tipo].toLowerCase()}`}><img src={f.url} alt={`Comprobante de ${ETIQUETA_COMPROBANTE[f.tipo].toLowerCase()}`} className="aspect-square w-full rounded-md border border-border object-cover" /></a> : <span className="text-muted-foreground">No disponible</span>}
              <span>{ETIQUETA_COMPROBANTE[f.tipo]} · {hora(f.en)}{f.por ? ` · ${f.por}` : ""}</span>
              {f.nota && <span className="text-muted-foreground">{f.nota}</span>}
            </li>
          ))}
        </ul>
      )}
      {puedeEscribir && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm"><span>Tipo</span><select className={fieldClass} value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS_COMPROBANTE.map((t) => <option key={t} value={t}>{ETIQUETA_COMPROBANTE[t]}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-sm"><span>Nota</span><input className={fieldClass} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: firmó el portero" /></label>
          </div>
          <label className="flex flex-col gap-1 text-sm"><span>Foto (JPG, PNG o WebP, hasta 8 MB)</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={subiendo} className={fieldClass} onChange={(e) => { void subir(e.target.files?.[0]); e.target.value = ""; }} /></label>
          {subiendo && <p className="text-sm text-muted-foreground">Subiendo…</p>}
          {falla && <p className="text-sm text-destructive">{falla}</p>}
        </div>
      )}
    </fieldset>
  );
}

export type AccionFicha = "entregar" | "fallo" | "devuelta" | "cancelar";

/** «Siguiente paso» de la orden: lo que se llena aquí mismo, en la ficha, según la fase en la que está. */
export function SiguientePaso({ orden, datos, puedeEscribir, pendiente, ejecutar, alAccion, sugerencia }: {
  orden: OrdenPipeline; datos: DatosPipeline; puedeEscribir: boolean; pendiente: boolean; ejecutar: Ejecutar; alAccion: (a: AccionFicha) => void;
  sugerencia?: { repartidorId: string | null; transportista: string | null; motivo: string } | null;
}) {
  const sugerida = sugerencia?.repartidorId ? `r:${sugerencia.repartidorId}` : sugerencia?.transportista ? `t:${sugerencia.transportista}` : "";
  const inicial = orden.repartidorId ? `r:${orden.repartidorId}` : orden.transportista ? `t:${orden.transportista}` : sugerida;
  const [con, setCon] = useState(inicial);
  const [guia, setGuia] = useState(orden.guia ?? "");
  const [prometida, setPrometida] = useState("");
  const envio = () => ({ repartidorId: con.startsWith("r:") ? con.slice(2) : null, transportista: con.startsWith("t:") ? con.slice(2) : null });
  const selector = (obligatorio: boolean) => (
    <label className="flex flex-col gap-1 text-sm">
      <span>¿Con quién se envía?{obligatorio ? " *" : " (opcional, se puede definir al despachar)"}</span>
      <select className={fieldClass} value={con} onChange={(e) => setCon(e.target.value)} disabled={!puedeEscribir}>
        <option value="">{obligatorio ? "Elige un mensajero o transportadora…" : "Lo defino después"}</option>
        <optgroup label="Mensajeros">{datos.mensajeros.map((m) => <option key={m.id} value={`r:${m.id}`}>{m.nombre}</option>)}</optgroup>
        <optgroup label="Transportadoras">{datos.transportistas.map((t) => <option key={t} value={`t:${t}`}>{t}</option>)}</optgroup>
      </select>
    {sugerencia && <span className="text-xs text-muted-foreground">Sugerido: {sugerencia.repartidorId ? datos.mensajeros.find((m) => m.id === sugerencia.repartidorId)?.nombre : sugerencia.transportista} · {sugerencia.motivo}</span>}
    </label>
  );
  const cobro = orden.codEsperado ? <p className="rounded-md bg-muted px-3 py-2 text-sm">Contra entrega: el mensajero debe cobrar <strong className="tabular-nums">{dinero2(orden.codEsperado)}</strong>.</p> : null;
  let cuerpo: React.ReactNode = null;
  if (orden.fase === "por_confirmar") {
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">Confirmá el pedido con el cliente y registrá el contacto abajo.</p>
        {cobro}{selector(false)}
        <div className="flex flex-wrap gap-2">
          <button className={botonPrimario} disabled={pendiente} onClick={() => ejecutar(() => cambiarFase(orden.id, "confirmada", envio()), "Orden confirmada")}>Confirmar orden</button>
          <button className={botonSecundario} disabled={pendiente} onClick={() => alAccion("cancelar")}>Cancelar orden</button>
        </div>
      </>
    );
  } else if (orden.fase === "confirmada") {
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">Elegí quién la lleva y poné la guía si ya la tenés.</p>
        {cobro}{selector(true)}
        <label className="flex flex-col gap-1 text-sm"><span>Número de guía (opcional)</span><span className="flex gap-2"><input className={`${fieldClass} flex-1`} value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="Ej: PA-123456" /><button type="button" className={botonSecundario} onClick={() => setGuia(`ECO-${orden.numero}`)}>Generar</button></span></label>
        <label className="flex flex-col gap-1 text-sm"><span>Entrega prometida (opcional)</span><input type="date" className={fieldClass} value={prometida} onChange={(e) => setPrometida(e.target.value)} /></label>
        <div className="flex flex-wrap gap-2">
          <button className={botonPrimario} disabled={pendiente || !con} onClick={() => ejecutar(() => cambiarFase(orden.id, "despachada", { ...envio(), guia: guia.trim() || null, prometidaPara: prometida || null }), "Orden despachada")}>Despachar</button>
          <button className={botonSecundario} disabled={pendiente} onClick={() => alAccion("cancelar")}>Cancelar orden</button>
        </div>
      </>
    );
  } else if (orden.fase === "despachada") {
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">En camino{orden.guia ? ` · guía ${orden.guia}` : ""}. Registrá cómo terminó.</p>
        {cobro}
        <div className="flex flex-wrap gap-2">
          <button className={botonPrimario} disabled={pendiente} onClick={() => alAccion("entregar")}>Entregada</button>
          <button className={botonSecundario} disabled={pendiente} onClick={() => alAccion("fallo")}>No se pudo entregar</button>
          <button className={botonSecundario} disabled={pendiente} onClick={() => alAccion("devuelta")}>Devuelta</button>
        </div>
      </>
    );
  } else if (orden.fase === "fallida") {
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">Entrega fallida{orden.motivoFallo ? `: ${orden.motivoFallo}` : ""}. Reprogramala o devolvela.</p>
        {selector(true)}
        <label className="flex flex-col gap-1 text-sm"><span>Número de guía (opcional)</span><input className={fieldClass} value={guia} onChange={(e) => setGuia(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm"><span>Entrega prometida (opcional)</span><input type="date" className={fieldClass} value={prometida} onChange={(e) => setPrometida(e.target.value)} /></label>
        <div className="flex flex-wrap gap-2">
          <button className={botonPrimario} disabled={pendiente || !con} onClick={() => ejecutar(() => cambiarFase(orden.id, "despachada", { ...envio(), guia: guia.trim() || null, prometidaPara: prometida || null }), "Entrega reprogramada")}>Reprogramar</button>
          <button className={botonSecundario} disabled={pendiente} onClick={() => alAccion("devuelta")}>Devuelta</button>
        </div>
      </>
    );
  } else {
    cuerpo = <p className="text-sm text-muted-foreground">Esta orden ya terminó: no tiene más pasos.</p>;
  }
  return (
    <section aria-label="Siguiente paso" className="flex flex-col gap-3 rounded-lg border border-border-control p-4">
      <h3 className="text-sm font-semibold">Siguiente paso</h3>
      {puedeEscribir ? cuerpo : <p className="text-sm text-muted-foreground">Solo lectura: no podés cambiar esta orden.</p>}
    </section>
  );
}

/** Un bloque plegable de la ficha: lo que no se usa todo el tiempo queda cerrado. */
function Bloque({ titulo, abierto, children }: { titulo: string; abierto?: boolean; children: React.ReactNode }) {
  return (
    <details open={abierto} className="group rounded-lg border border-border">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium">{titulo}</summary>
      <div className="flex flex-col gap-3 border-t border-border p-4">{children}</div>
    </details>
  );
}

export function FichaOrden({ orden, x, datos, umbrales, puedeEscribir, pendiente, ejecutar, alCerrar, alAccion, navegacion }: {
  orden: OrdenPipeline; x: ExtraOrden | undefined; datos: DatosPipeline; umbrales: DatosOperacion["umbrales"]; puedeEscribir: boolean; pendiente: boolean; ejecutar: Ejecutar; alCerrar: () => void;
  alAccion: (a: AccionFicha) => void; navegacion?: React.ReactNode;
}) {
  const [det, setDet] = useState<DetalleOrden | { error: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [canal, setCanal] = useState("whatsapp");
  const [resultado, setResultado] = useState<string>("confirmo");
  const [nota, setNota] = useState("");
  const [texto, setTexto] = useState("");
  const [motivoCongelar, setMotivoCongelar] = useState("");
  const [aviso, setAviso] = useState<PlantillaAviso>("confirmar");
  useEffect(() => { let vivo = true; obtenerDetalleOrden(orden.id).then((d) => { if (vivo) setDet(d); }); return () => { vivo = false; }; }, [orden.id, version]);
  const recargar = () => setVersion((v) => v + 1);
  return (
    <Ventana abierto alCerrar={alCerrar} titulo={`Orden ${orden.numero}`} lado="derecha" ancho="lg" navegacion={navegacion}>
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{orden.tienda} · {orden.pais} · {fechaCorta(orden.fecha)}</p>
        <p className="text-sm text-muted-foreground">{orden.productos}</p>
        <p className="text-sm"><a href={`/ventas-tiendas/imprimir?orden=${orden.id}`} target="_blank" rel="noreferrer" className="float-right text-xs underline">Imprimir etiqueta</a><span className="tabular-nums font-medium">{dinero2(orden.total)}</span> · {orden.codEsperado ? "Contra entrega" : orden.metodo ?? "—"}{orden.guia ? ` · guía ${orden.guia}` : ""}</p>
        <Insignias o={orden} x={x} umbrales={umbrales} />
      </div>
      <SiguientePaso key={`${orden.id}-${orden.fase}`} orden={orden} datos={datos} puedeEscribir={puedeEscribir} pendiente={pendiente} ejecutar={ejecutar} alAccion={alAccion} />
      {det && !("error" in det) && det.etiquetas !== null && (
        <EtiquetasFranja key={`${orden.id}-${version}`} ordenId={orden.id} etiquetas={det.etiquetas} franja={det.franja} puedeEscribir={puedeEscribir} pendiente={pendiente} ejecutar={ejecutar} alGuardar={recargar} />
      )}
      {x && <p className="text-sm">Contactos: {x.contactos} · intentos fallidos: {x.fallidos}{x.ultimoContacto ? ` · último: ${ETIQUETA_RESULTADO[x.ultimoContacto.resultado]} (${x.ultimoContacto.canal})` : ""} · historial del cliente: {x.historial.entregadas} entregadas, {x.historial.devueltas} devueltas, {x.historial.canceladas} canceladas</p>}
      {puedeEscribir && (
        <Bloque titulo="Contacto, notas y avisos al cliente">
        <div className="grid gap-3">
          <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-xs text-muted-foreground">Registrar contacto</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm"><span>Canal</span><select className={fieldClass} value={canal} onChange={(e) => setCanal(e.target.value)}><option value="whatsapp">WhatsApp</option><option value="llamada">Llamada</option><option value="sms">SMS</option></select></label>
              <label className="flex flex-col gap-1 text-sm"><span>Resultado</span><select className={fieldClass} value={resultado} onChange={(e) => setResultado(e.target.value)}>{RESULTADOS_CONTACTO.map((r) => <option key={r} value={r}>{ETIQUETA_RESULTADO[r]}</option>)}</select></label>
            </div>
            <input className={fieldClass} aria-label="Nota del contacto" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: pidió entrega el sábado" />
            <button className={botonSecundario} disabled={pendiente} onClick={() => ejecutar(() => registrarContacto(orden.id, canal, resultado, nota.trim() || null), "Contacto registrado", () => { setNota(""); recargar(); }, true)}>Guardar contacto</button>
          </fieldset>
          <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-xs text-muted-foreground">Nota interna</legend>
            <textarea className={fieldClass} aria-label="Nota interna" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: el cliente prefiere recoger en punto" />
            <button className={botonSecundario} disabled={pendiente || texto.trim().length < 2} onClick={() => ejecutar(() => agregarNota(orden.id, texto.trim()), "Nota guardada", () => { setTexto(""); recargar(); }, true)}>Guardar nota</button>
          </fieldset>
          <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-xs text-muted-foreground">{x?.congelada ? "Orden congelada" : "Congelar orden"}</legend>
            {!x?.congelada && <input className={fieldClass} aria-label="Motivo para congelar" value={motivoCongelar} onChange={(e) => setMotivoCongelar(e.target.value)} placeholder="Ej: el cliente pidió esperar a fin de mes" />}
            <button className={botonSecundario} disabled={pendiente || (!x?.congelada && motivoCongelar.trim().length < 3)} onClick={() => ejecutar(() => congelarOrden(orden.id, x?.congelada ? null : motivoCongelar.trim()), x?.congelada ? "Orden descongelada" : "Orden congelada", alCerrar)}>{x?.congelada ? "Descongelar" : "Congelar"}</button>
          </fieldset>
          <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-xs text-muted-foreground">Avisar por WhatsApp</legend>
            <select className={fieldClass} aria-label="Aviso por WhatsApp" value={aviso} onChange={(e) => setAviso(e.target.value as PlantillaAviso)}>{PLANTILLAS.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
            <button className={botonSecundario} disabled={pendiente || !x?.telefonoValido} onClick={() => ejecutar(() => enviarWhatsappOrden(orden.id, aviso), "WhatsApp enviado", recargar, true)}>Enviar WhatsApp</button>
          </fieldset>
          <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-xs text-muted-foreground">Lista del cliente</legend>
            <p className="text-sm">{det && !("error" in det) && det.lista ? (det.lista === "negra" ? "En lista negra" : "En lista blanca") : "Sin lista"}</p>
            <div className="flex flex-wrap gap-2">
              <button className={botonSecundario} disabled={pendiente} onClick={() => ejecutar(() => marcarClienteLista(orden.id, "negra"), "Cliente en lista negra", recargar, true)}>Lista negra</button>
              <button className={botonSecundario} disabled={pendiente} onClick={() => ejecutar(() => marcarClienteLista(orden.id, "blanca"), "Cliente en lista blanca", recargar, true)}>Lista blanca</button>
              <button className={botonSecundario} disabled={pendiente} onClick={() => ejecutar(() => marcarClienteLista(orden.id, null), "Cliente sin lista", recargar, true)}>Quitar</button>
            </div>
          </fieldset>
        </div>
        </Bloque>
      )}
      <Bloque titulo="Comprobantes (entrega, cobro)"><ComprobantesOrden ordenId={orden.id} puedeEscribir={puedeEscribir} ejecutar={ejecutar} /></Bloque>
      {!det && <p className="text-sm text-muted-foreground">Cargando historial…</p>}
      {det && "error" in det && <p className="text-sm text-destructive">{det.error}</p>}
      {det && !("error" in det) && (
        <Bloque titulo="Historial de la orden" abierto>
        <div className="flex flex-col gap-3">
          {det.incidencias.length > 0 && <div><h3 className="text-sm font-medium">Incidencias</h3><ul className="text-sm">{det.incidencias.map((i) => <li key={i.id}>{i.tipo} · {i.estado}{i.costo ? ` · ${dinero2(i.costo)}` : ""}{i.descripcion ? ` · ${i.descripcion}` : ""}</li>)}</ul></div>}
          {det.notas.length > 0 && <div><h3 className="text-sm font-medium">Notas</h3><ul className="text-sm">{det.notas.map((n, i) => <li key={i}><span className="text-muted-foreground">{hora(n.en)} · {n.autor ?? "—"}:</span> {n.texto}</li>)}</ul></div>}
          <div>
            <h3 className="text-sm font-medium">Línea de tiempo</h3>
            <ul className="max-h-64 overflow-y-auto text-sm">
              {det.eventos.length === 0 && <li className="text-muted-foreground">Sin movimientos todavía.</li>}
              {det.eventos.map((e, i) => <li key={i}><span className="text-muted-foreground">{hora(e.en)} · {e.por ?? "Sistema"}:</span> {e.tipo === "fase" ? `${e.de ?? "—"} → ${e.a ?? "—"}` : e.tipo}{e.detalle ? ` · ${e.detalle}` : ""}{e.monto ? ` · ${dinero2(e.monto)}` : ""}</li>)}
            </ul>
          </div>
          {det.whatsapp.length > 0 && <div><h3 className="text-sm font-medium">WhatsApp</h3><ul className="text-sm">{det.whatsapp.map((m, i) => <li key={i}><span className="text-muted-foreground">{hora(m.en)} · {m.direccion === "entrante" ? "Cliente" : m.por ?? "Sistema"} · {m.estado}:</span> {m.cuerpo}{m.error ? ` · ${m.error}` : ""}</li>)}</ul></div>}
          {det.contactos.length > 0 && <div><h3 className="text-sm font-medium">Contactos</h3><ul className="text-sm">{det.contactos.map((c, i) => <li key={i}><span className="text-muted-foreground">{hora(c.en)} · {c.por ?? "—"}:</span> {c.canal} · {ETIQUETA_RESULTADO[c.resultado as keyof typeof ETIQUETA_RESULTADO] ?? c.resultado}{c.nota ? ` · ${c.nota}` : ""}</li>)}</ul></div>}
        </div>
        </Bloque>
      )}
    </div>
    </Ventana>
  );
}

/** Reasignar el envío con motivo (la sugerencia sale de la cobertura). */
export function FormReasignar({ orden, x, datos, pendiente, ejecutar, alCerrar }: { orden: OrdenPipeline; x: ExtraOrden | undefined; datos: DatosPipeline; pendiente: boolean; ejecutar: Ejecutar; alCerrar: () => void }) {
  const [con, setCon] = useState(orden.repartidorId ? `r:${orden.repartidorId}` : orden.transportista ? `t:${orden.transportista}` : "");
  const [motivo, setMotivo] = useState("");
  return (
    <Cuadro titulo={`Reasignar envío de ${orden.numero}`} alCerrar={alCerrar}>
      {x?.sugerencia && <p className="text-sm">Sugerido: <strong>{x.sugerencia.repartidorId ? datos.mensajeros.find((m) => m.id === x.sugerencia!.repartidorId)?.nombre : x.sugerencia.transportista}</strong> · {x.sugerencia.motivo}</p>}
      <label className="flex flex-col gap-1 text-sm"><span>Nuevo responsable *</span>
        <select className={fieldClass} value={con} onChange={(e) => setCon(e.target.value)}>
          <option value="">Elige…</option>
          <optgroup label="Mensajeros">{datos.mensajeros.map((m) => <option key={m.id} value={`r:${m.id}`}>{m.nombre}</option>)}</optgroup>
          <optgroup label="Transportadoras">{datos.transportistas.map((t) => <option key={t} value={`t:${t}`}>{t}</option>)}</optgroup>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm"><span>Motivo *</span><input className={fieldClass} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: el mensajero anterior no cubre la zona" /></label>
      <div className="flex justify-end gap-2">
        <button className={botonSecundario} onClick={alCerrar}>Cerrar</button>
        <button className={botonPrimario} disabled={pendiente || !con || motivo.trim().length < 3} onClick={() => ejecutar(() => reasignarEnvio(orden.id, con.startsWith("r:") ? con.slice(2) : null, con.startsWith("t:") ? con.slice(2) : null, motivo.trim()), "Envío reasignado", alCerrar)}>Reasignar</button>
      </div>
    </Cuadro>
  );
}

const hoyLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** No se pudo entregar: motivo de la lista, nota y nueva fecha. */
export function FormFallo({ orden, pendiente, alCerrar, alEnviar }: { orden: OrdenPipeline; pendiente: boolean; alCerrar: () => void; alEnviar: (d: { motivoCodigo: string; motivo: string; reprogramadaPara: string | null }) => void }) {
  const [codigo, setCodigo] = useState<string>(MOTIVOS_FALLO[0].codigo);
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState("");
  const etiqueta = MOTIVOS_FALLO.find((m) => m.codigo === codigo)?.etiqueta ?? codigo;
  const exigeNota = codigo === "otro";
  return (
    <Cuadro titulo={`No se pudo entregar: ${orden.numero}`} alCerrar={alCerrar}>
      <label className="flex flex-col gap-1 text-sm"><span>Motivo *</span><select className={fieldClass} value={codigo} onChange={(e) => setCodigo(e.target.value)}>{MOTIVOS_FALLO.map((m) => <option key={m.codigo} value={m.codigo}>{m.etiqueta}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm"><span>Nota{exigeNota ? " *" : ""}</span><input className={fieldClass} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: el portón estaba cerrado" /></label>
      <label className="flex flex-col gap-1 text-sm"><span>Reprogramar para</span><input type="date" className={fieldClass} min={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
      <div className="flex justify-end gap-2">
        <button className={botonSecundario} onClick={alCerrar}>Cerrar</button>
        <button className={botonPrimario} disabled={pendiente || (exigeNota && nota.trim().length < 3)} onClick={() => alEnviar({ motivoCodigo: codigo, motivo: nota.trim() ? `${etiqueta}: ${nota.trim()}` : etiqueta, reprogramadaPara: fecha || null })}>Guardar</button>
      </div>
    </Cuadro>
  );
}

/** Entrega con quién recibió, código y motivo si lo cobrado no calza con lo esperado. */
export function FormEntregaCompleta({ orden, pendiente, alCerrar, alEnviar }: {
  orden: OrdenPipeline; pendiente: boolean; alCerrar: () => void;
  alEnviar: (d: { cobrado: number | null; recibeNombre: string | null; recibeDocumento: string | null; codigo: string | null; motivoDiferencia: string | null }) => void;
}) {
  const [cobrado, setCobrado] = useState(orden.codEsperado ? String(orden.codEsperado) : "");
  const [recibe, setRecibe] = useState("");
  const [doc, setDoc] = useState("");
  const [codigo, setCodigo] = useState("");
  const [dif, setDif] = useState("");
  const hayDif = !!orden.codEsperado && cobrado.trim() !== "" && Math.abs(Number(cobrado) - orden.codEsperado) > 0.009;
  return (
    <Cuadro titulo={`Entregada: ${orden.numero}`} alCerrar={alCerrar}>
      {orden.codEsperado ? (
        <label className="flex flex-col gap-1 text-sm"><span>¿Cuánto cobró el mensajero? *</span><input className={fieldClass} inputMode="decimal" value={cobrado} onChange={(e) => setCobrado(e.target.value)} placeholder={`Ej: ${orden.codEsperado.toFixed(2)}`} /></label>
      ) : <p className="text-sm">La orden ya está pagada: solo queda marcarla entregada.</p>}
      {hayDif && <label className="flex flex-col gap-1 text-sm"><span>Motivo de la diferencia *</span><input className={fieldClass} value={dif} onChange={(e) => setDif(e.target.value)} placeholder="Ej: el cliente pagó menos por un descuento" /></label>}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm"><span>Recibió (si no fue el cliente)</span><input className={fieldClass} value={recibe} onChange={(e) => setRecibe(e.target.value)} placeholder="Ej: María, vecina" /></label>
        <label className="flex flex-col gap-1 text-sm"><span>Documento de quien recibió</span><input className={fieldClass} value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Ej: 8-123-456" /></label>
      </div>
      <label className="flex flex-col gap-1 text-sm"><span>Código de entrega (si se mandó)</span><input className={fieldClass} inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej: 4821" /></label>
      <div className="flex justify-end gap-2">
        <button className={botonSecundario} onClick={alCerrar}>Cerrar</button>
        <button className={botonPrimario} disabled={pendiente || (!!orden.codEsperado && !(Number(cobrado) >= 0 && cobrado.trim() !== "")) || (hayDif && dif.trim().length < 3)} onClick={() => alEnviar({ cobrado: orden.codEsperado ? Number(cobrado) : null, recibeNombre: recibe.trim() || null, recibeDocumento: doc.trim() || null, codigo: codigo.trim() || null, motivoDiferencia: hayDif ? dif.trim() : null })}>Marcar entregada</button>
      </div>
    </Cuadro>
  );
}

/** Reparto equilibrado de las órdenes marcadas entre las personas elegidas. */
export function FormAsignar({ cantidad, personas, pendiente, alCerrar, alEnviar }: { cantidad: number; personas: string[]; pendiente: boolean; alCerrar: () => void; alEnviar: (p: string[]) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [otros, setOtros] = useState("");
  const extra = otros.split(",").map((x) => x.trim()).filter(Boolean);
  const todos = [...new Set([...sel, ...extra])];
  return (
    <Cuadro titulo={`Repartir ${cantidad} órdenes`} alCerrar={alCerrar}>
      {personas.length > 0 && (
        <fieldset className="flex flex-col gap-2"><legend className="text-sm">Quienes ya tienen órdenes</legend>
          {personas.map((p) => <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.has(p)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(p); else s.delete(p); setSel(s); }} />{p}</label>)}
        </fieldset>
      )}
      <label className="flex flex-col gap-1 text-sm"><span>Personas (separadas por coma)</span><input className={fieldClass} value={otros} onChange={(e) => setOtros(e.target.value)} placeholder="Ej: Ana, Luis" /></label>
      <p className="text-xs text-muted-foreground">Se reparte parejo, descontando lo que cada una ya tiene por confirmar.</p>
      <div className="flex justify-end gap-2">
        <button className={botonSecundario} onClick={alCerrar}>Cerrar</button>
        <button className={botonPrimario} disabled={pendiente || !todos.length} onClick={() => alEnviar(todos)}>Repartir</button>
      </div>
    </Cuadro>
  );
}

const Tarjeta = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-medium">{titulo}</h2>{children}</section>
);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");

/** Pestaña «Control»: indicadores de 30 días, cobertura, mensajeros, saldos, incidencias, aprobaciones, cierre y tiendas. */
export function PanelControl({ datos, op, puedeEscribir, pendiente, ejecutar }: { datos: DatosPipeline; op: DatosOperacion; puedeEscribir: boolean; pendiente: boolean; ejecutar: Ejecutar }) {
  const k = op.kpis;
  const g = k.general;
  const [cob, setCob] = useState({ pais: "PA", zona: "", con: "", tarifa: "" });
  const [mes, setMes] = useState("");
  const [anular, setAnular] = useState<{ id: string; motivo: string } | null>(null);
  const [inc, setInc] = useState({ ordenId: "", tipo: "danio", descripcion: "", costo: "" });
  const mensajero = (id: string | null) => datos.mensajeros.find((m) => m.id === id)?.nombre ?? "—";
  const filaK = (f: typeof g, nombre: string) => (
    <tr key={f.clave} className="border-t border-border">
      <td className="px-3 py-2 font-medium">{nombre}</td><td className="px-3 py-2 text-right tabular-nums">{f.creadas}</td><td className="px-3 py-2 text-right tabular-nums">{pct(f.confirmadas, f.creadas)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{pct(f.entregadas, f.despachadas)}</td><td className="px-3 py-2 text-right tabular-nums">{f.devueltas}</td><td className="px-3 py-2 text-right tabular-nums">{f.cicloHoras === null ? "—" : `${Math.round(f.cicloHoras)} h`}</td>
      <td className="px-3 py-2 text-right tabular-nums">{dinero2(f.ventas)}</td><td className="px-3 py-2 text-right tabular-nums">{dinero2(f.margen)}</td>
    </tr>
  );
  const encabezado = (primero: string) => (
    <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">{primero}</th><th className="px-3 py-2 text-right">Creadas</th><th className="px-3 py-2 text-right">Confirmadas</th><th className="px-3 py-2 text-right">Entrega</th><th className="px-3 py-2 text-right">Devueltas</th><th className="px-3 py-2 text-right">Ciclo</th><th className="px-3 py-2 text-right">Ventas</th><th className="px-3 py-2 text-right">Margen</th></tr></thead>
  );
  const nombreTienda = (id: string) => datos.tiendas.find((t) => t.unidadId === id)?.nombre ?? id;
  return (
    <div className="flex flex-col gap-4">
      <Tarjeta titulo="Últimos 30 días">
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          <div><p className="text-xs text-muted-foreground">Creadas</p><p className="text-lg font-semibold tabular-nums">{entero(g.creadas)}</p></div>
          <div><p className="text-xs text-muted-foreground">Confirmadas</p><p className="text-lg font-semibold tabular-nums">{pct(g.confirmadas, g.creadas)}</p></div>
          <div><p className="text-xs text-muted-foreground">Despachadas</p><p className="text-lg font-semibold tabular-nums">{pct(g.despachadas, g.confirmadas)}</p></div>
          <div><p className="text-xs text-muted-foreground">Entregadas</p><p className="text-lg font-semibold tabular-nums">{pct(g.entregadas, g.despachadas)}</p></div>
          <div><p className="text-xs text-muted-foreground">Margen estimado</p><p className="text-lg font-semibold tabular-nums">{dinero2(g.margen)}</p></div>
        </div>
        <p className="text-xs text-muted-foreground">Proyección de caja: {dinero2(op.proyeccion.esperado)} esperados de {entero(op.proyeccion.enRuta)} órdenes en ruta · total por devolver {dinero2(op.proyeccion.total)}.</p>
      </Tarjeta>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Por tienda"><div className="overflow-x-auto"><table className="w-full text-sm">{encabezado("Tienda")}<tbody>{k.porTienda.length === 0 ? <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Sin órdenes en el periodo.</td></tr> : k.porTienda.map((f) => filaK(f, nombreTienda(f.clave)))}</tbody></table></div></Tarjeta>
        <Tarjeta titulo="Por mensajero"><div className="overflow-x-auto"><table className="w-full text-sm">{encabezado("Mensajero")}<tbody>{k.porMensajero.length === 0 ? <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Sin entregas en el periodo.</td></tr> : k.porMensajero.map((f) => filaK(f, mensajero(f.clave)))}</tbody></table></div></Tarjeta>
        <Tarjeta titulo="Por qué fallan o se cancelan">
          <ul className="text-sm">
            {[...k.motivos.map((m) => ({ ...m, t: "Fallo" })), ...k.cancelaciones.map((m) => ({ ...m, t: "Cancelación" }))].sort((a, b) => b.n - a.n).slice(0, 10).map((m) => <li key={m.t + m.motivo} className="flex justify-between border-t border-border py-1 first:border-0"><span>{m.t}: {m.motivo}</span><span className="tabular-nums">{m.n}</span></li>)}
            {k.motivos.length + k.cancelaciones.length === 0 && <li className="text-muted-foreground">Nada que reportar.</li>}
          </ul>
        </Tarjeta>
        <Tarjeta titulo="Antigüedad de la plata por devolver">
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Quién</th><th className="px-3 py-2 text-right">0–3 d</th><th className="px-3 py-2 text-right">4–7 d</th><th className="px-3 py-2 text-right">8–14 d</th><th className="px-3 py-2 text-right">+15 d</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody>{op.edades.length === 0 ? <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Nadie debe plata.</td></tr> : op.edades.map((e) => <tr key={e.clave} className="border-t border-border"><td className="px-3 py-2 font-medium">{e.nombre}</td><td className="px-3 py-2 text-right tabular-nums">{dinero2(e.edad.d0_3)}</td><td className="px-3 py-2 text-right tabular-nums">{dinero2(e.edad.d4_7)}</td><td className="px-3 py-2 text-right tabular-nums">{dinero2(e.edad.d8_14)}</td><td className="px-3 py-2 text-right tabular-nums">{e.edad.d15_mas > 0 ? <span className="inline-flex items-center gap-1.5"><Punto clase="bg-destructive" />{dinero2(e.edad.d15_mas)}</span> : dinero2(0)}</td><td className="px-3 py-2 text-right tabular-nums">{dinero2(e.edad.total)}</td></tr>)}</tbody></table></div>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Remesas recientes">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Entregó</th><th className="px-3 py-2">Referencia</th><th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2" /></tr></thead>
          <tbody>{op.remesas.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Aún no hay remesas.</td></tr>}
            {op.remesas.map((r) => <tr key={r.id} className="border-t border-border"><td className="px-3 py-2">{fechaCorta(r.fecha)}</td><td className="px-3 py-2">{r.quien}</td><td className="px-3 py-2">{r.referencia ?? "—"}</td><td className="px-3 py-2 text-right tabular-nums">{r.anulada ? <span className="text-muted-foreground line-through">{dinero2(r.total)}</span> : dinero2(r.total)}</td>
              <td className="px-3 py-2 text-right">{r.anulada ? <Badge tone="warning">Anulada</Badge> : puedeEscribir && <button className={botonSecundario} onClick={() => setAnular({ id: r.id, motivo: "" })}>Anular</button>}</td></tr>)}</tbody></table></div>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Aprobaciones pendientes">
          {op.aprobaciones.length === 0 ? <p className="text-sm text-muted-foreground">Nada por aprobar.</p> : (
            <ul className="flex flex-col gap-2 text-sm">{op.aprobaciones.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 border-t border-border pt-2 first:border-0 first:pt-0"><span>{a.accion}{a.numero ? ` · ${a.numero}` : ""}{a.monto ? ` · ${dinero2(a.monto)}` : ""}<span className="block text-xs text-muted-foreground">{a.por} · {hora(a.en)}{a.detalle ? ` · ${a.detalle}` : ""}</span></span>
              {puedeEscribir && <span className="flex gap-2"><button className={botonPrimario} disabled={pendiente} onClick={() => ejecutar(() => resolverAprobacion(a.id, true), "Aprobada: ahora quien la pidió puede repetir la acción")}>Aprobar</button><button className={botonSecundario} disabled={pendiente} onClick={() => ejecutar(() => resolverAprobacion(a.id, false), "Rechazada")}>Rechazar</button></span>}</li>)}</ul>
          )}
        </Tarjeta>
        <Tarjeta titulo="Devoluciones por recibir">
          {op.devueltasPorRecibir.length === 0 ? <p className="text-sm text-muted-foreground">No hay devoluciones esperando.</p> : (
            <ul className="flex flex-col gap-2 text-sm">{op.devueltasPorRecibir.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 border-t border-border pt-2 first:border-0 first:pt-0"><span>{d.numero} · {d.tienda}<span className="block text-xs text-muted-foreground">{d.productos}</span></span>
              {puedeEscribir && <span className="flex gap-2"><button className={botonPrimario} disabled={pendiente} onClick={() => ejecutar(() => recibirDevolucion(d.id, "reingresar"), "Recibida y vuelta al inventario")}>Reingresar</button><button className={botonSecundario} disabled={pendiente} onClick={() => ejecutar(() => recibirDevolucion(d.id, "danado"), "Recibida como dañada")}>Dañada</button></span>}</li>)}</ul>
          )}
        </Tarjeta>
        <Tarjeta titulo="Incidencias abiertas">
          <ul className="flex flex-col gap-2 text-sm">{op.incidencias.length === 0 && <li className="text-muted-foreground">Sin incidencias.</li>}
            {op.incidencias.map((i) => <li key={i.id} className="flex items-center justify-between gap-2"><span>{i.numero} · {i.tipo}{i.costo ? ` · ${dinero2(i.costo)}` : ""}<span className="block text-xs text-muted-foreground">{i.descripcion ?? ""}</span></span>{puedeEscribir && <button className={botonSecundario} disabled={pendiente} onClick={() => ejecutar(() => resolverIncidencia(i.id), "Incidencia resuelta")}>Resolver</button>}</li>)}</ul>
          {puedeEscribir && (
            <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
              <select className={fieldClass} aria-label="Orden de la incidencia" value={inc.ordenId} onChange={(e) => setInc({ ...inc, ordenId: e.target.value })}><option value="">Orden…</option>{datos.ordenes.map((o) => <option key={o.id} value={o.id}>{o.numero}</option>)}</select>
              <select className={fieldClass} aria-label="Tipo de incidencia" value={inc.tipo} onChange={(e) => setInc({ ...inc, tipo: e.target.value })}><option value="danio">Producto dañado</option><option value="faltante">Faltante</option><option value="extravio">Extravío</option><option value="reclamo">Reclamo del cliente</option><option value="otro">Otro</option></select>
              <input className={fieldClass} aria-label="Descripción" value={inc.descripcion} onChange={(e) => setInc({ ...inc, descripcion: e.target.value })} placeholder="Ej: llegó con la caja rota" />
              <input className={fieldClass} aria-label="Costo" inputMode="decimal" value={inc.costo} onChange={(e) => setInc({ ...inc, costo: e.target.value })} placeholder="Ej: 12.50" />
              <button className={`${botonSecundario} col-span-2`} disabled={pendiente || !inc.ordenId} onClick={() => ejecutar(() => crearIncidencia(inc.ordenId, { tipo: inc.tipo, descripcion: inc.descripcion.trim() || null, costo: Number(inc.costo) || 0 }), "Incidencia creada", () => setInc({ ordenId: "", tipo: "danio", descripcion: "", costo: "" }))}>Crear incidencia</button>
            </div>
          )}
        </Tarjeta>
        <Tarjeta titulo="Cierre de mes">
          <p className="text-sm text-muted-foreground">Un mes cerrado no admite cambios de fase ni remesas con fecha dentro de él. Cerrados: {op.cierres.length ? op.cierres.join(", ") : "ninguno"}.</p>
          {puedeEscribir && <div className="flex gap-2"><input type="month" className={fieldClass} aria-label="Mes a cerrar" value={mes} onChange={(e) => setMes(e.target.value)} /><button className={botonSecundario} disabled={pendiente || !mes} onClick={() => ejecutar(() => cerrarMes(`${mes}-01`), "Mes cerrado", () => setMes(""))}>Cerrar mes</button></div>}
        </Tarjeta>
      </div>

      <Tarjeta titulo="Cobertura y tarifas por zona">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">País</th><th className="px-3 py-2">Zona</th><th className="px-3 py-2">Cubre</th><th className="px-3 py-2 text-right">Tarifa</th><th className="px-3 py-2" /></tr></thead>
          <tbody>{op.cobertura.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Sin zonas definidas: el sistema no sugerirá a nadie.</td></tr>}
            {op.cobertura.map((c) => <tr key={c.id} className="border-t border-border"><td className="px-3 py-2">{c.pais}</td><td className="px-3 py-2">{c.zona}</td><td className="px-3 py-2">{c.nombreMensajero ?? c.transportista ?? "—"}</td><td className="px-3 py-2 text-right tabular-nums">{c.tarifa === null ? "—" : dinero2(c.tarifa)}</td><td className="px-3 py-2 text-right">{puedeEscribir && <button className={botonSecundario} disabled={pendiente} onClick={() => ejecutar(() => borrarCobertura(c.id), "Zona quitada")}>Quitar</button>}</td></tr>)}</tbody></table></div>
        {puedeEscribir && (
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 md:grid-cols-5">
            <select className={fieldClass} aria-label="País" value={cob.pais} onChange={(e) => setCob({ ...cob, pais: e.target.value })}><option value="PA">Panamá</option><option value="CR">Costa Rica</option><option value="MX">México</option></select>
            <input className={fieldClass} aria-label="Zona" value={cob.zona} onChange={(e) => setCob({ ...cob, zona: e.target.value })} placeholder="Ej: San Francisco" />
            <select className={fieldClass} aria-label="Quién cubre" value={cob.con} onChange={(e) => setCob({ ...cob, con: e.target.value })}><option value="">Quién cubre…</option><optgroup label="Mensajeros">{datos.mensajeros.map((m) => <option key={m.id} value={`r:${m.id}`}>{m.nombre}</option>)}</optgroup><optgroup label="Transportadoras">{datos.transportistas.map((t) => <option key={t} value={`t:${t}`}>{t}</option>)}</optgroup></select>
            <input className={fieldClass} aria-label="Tarifa" inputMode="decimal" value={cob.tarifa} onChange={(e) => setCob({ ...cob, tarifa: e.target.value })} placeholder="Ej: 3.50" />
            <button className={botonSecundario} disabled={pendiente || !cob.zona.trim() || !cob.con} onClick={() => ejecutar(() => guardarCobertura({ pais: cob.pais, zona: cob.zona.trim(), repartidorId: cob.con.startsWith("r:") ? cob.con.slice(2) : null, transportista: cob.con.startsWith("t:") ? cob.con.slice(2) : null, tarifa: cob.tarifa.trim() ? Number(cob.tarifa) : null }), "Zona guardada", () => setCob({ ...cob, zona: "", tarifa: "" }))}>Agregar zona</button>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Mensajeros: capacidad, límite de efectivo y comisión">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Mensajero</th><th className="px-3 py-2 text-right">En ruta</th><th className="px-3 py-2 text-right">Efectivo en mano</th><th className="px-3 py-2">Capacidad diaria</th><th className="px-3 py-2">Límite de efectivo</th><th className="px-3 py-2">Comisión por entrega</th></tr></thead>
          <tbody>{datos.mensajeros.map((m) => <FilaMensajero key={m.id} m={m} cfg={op.config[m.id]} carga={op.carga[m.id]} puedeEscribir={puedeEscribir} pendiente={pendiente} ejecutar={ejecutar} />)}</tbody></table></div>
      </Tarjeta>

      <Tarjeta titulo="Ajustes por tienda">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Tienda</th><th className="px-3 py-2">Bodega que mueve</th><th className="px-3 py-2">Pasarela %</th><th className="px-3 py-2">Pasarela fija</th><th className="px-3 py-2">ITBMS</th><th className="px-3 py-2">Pausada</th><th className="px-3 py-2" /></tr></thead>
          <tbody>{datos.tiendas.filter((t) => t.activa).map((t) => <FilaAjuste key={t.unidadId} t={t} a={op.ajustes[t.unidadId]} bodegas={op.bodegas} puedeEscribir={puedeEscribir} pendiente={pendiente} ejecutar={ejecutar} />)}</tbody></table></div>
      </Tarjeta>

      {anular && (
        <Cuadro titulo="Anular remesa" alCerrar={() => setAnular(null)}>
          <p className="text-sm">La plata de esta remesa vuelve a quedar por devolver. Si el monto es grande, otra persona debe aprobarlo.</p>
          <label className="flex flex-col gap-1 text-sm"><span>Motivo *</span><input className={fieldClass} value={anular.motivo} onChange={(e) => setAnular({ ...anular, motivo: e.target.value })} placeholder="Ej: se registró dos veces" /></label>
          <div className="flex justify-end gap-2"><button className={botonSecundario} onClick={() => setAnular(null)}>Cerrar</button><button className={botonPrimario} disabled={pendiente || anular.motivo.trim().length < 3} onClick={() => ejecutar(() => anularRemesa(anular.id, anular.motivo.trim()), "Remesa anulada", () => setAnular(null))}>Anular</button></div>
        </Cuadro>
      )}
    </div>
  );
}

function FilaMensajero({ m, cfg, carga, puedeEscribir, pendiente, ejecutar }: { m: { id: string; nombre: string }; cfg: DatosOperacion["config"][string] | undefined; carga: DatosOperacion["carga"][string] | undefined; puedeEscribir: boolean; pendiente: boolean; ejecutar: Ejecutar }) {
  const [cap, setCap] = useState(cfg?.capacidad?.toString() ?? "");
  const [lim, setLim] = useState(cfg?.limiteEfectivo?.toString() ?? "");
  const [com, setCom] = useState(cfg?.comision?.toString() ?? "");
  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  const [aviso, setAviso] = useState<string | null>(null);
  async function enlace() {
    if (!confirm(`Crear un enlace nuevo para ${m.nombre}? El anterior deja de funcionar.`)) return;
    const r = await generarEnlaceMensajero(m.id);
    if ("error" in r) { setAviso(r.error); return; }
    const url = `${location.origin}/mensajero/${r.token}`;
    try { await navigator.clipboard.writeText(url); setAviso("Enlace copiado. Mándaselo por WhatsApp."); } catch { setAviso(url); }
  }
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-medium">{m.nombre}{aviso && <span className="mt-1 block break-all text-xs font-normal text-muted-foreground" role="status">{aviso}</span>}</td>
      <td className="px-3 py-2 text-right tabular-nums">{carga?.enRuta ?? 0}</td>
      <td className="px-3 py-2 text-right tabular-nums">{dinero2(carga?.efectivo ?? 0)}</td>
      <td className="px-3 py-2"><input className={fieldClass} aria-label={`Capacidad de ${m.nombre}`} inputMode="numeric" disabled={!puedeEscribir} value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Ej: 25" /></td>
      <td className="px-3 py-2"><input className={fieldClass} aria-label={`Límite de efectivo de ${m.nombre}`} inputMode="decimal" disabled={!puedeEscribir} value={lim} onChange={(e) => setLim(e.target.value)} placeholder="Ej: 300" /></td>
      <td className="px-3 py-2"><input className={fieldClass} aria-label={`Comisión de ${m.nombre}`} inputMode="decimal" disabled={!puedeEscribir} value={com} onChange={(e) => setCom(e.target.value)} placeholder="Ej: 1.50" /></td>
      <td className="px-3 py-2 text-right">{puedeEscribir && <><button className={`${botonSecundario} mr-2`} disabled={pendiente} onClick={enlace}>Enlace de la app</button><button className={botonSecundario} disabled={pendiente} onClick={() => ejecutar(() => guardarConfigMensajero(m.id, { capacidad: n(cap), limiteEfectivo: n(lim), comision: n(com) }), "Mensajero guardado")}>Guardar</button></>}</td>
    </tr>
  );
}

function FilaAjuste({ t, a, bodegas, puedeEscribir, pendiente, ejecutar }: { t: DatosPipeline["tiendas"][number]; a: DatosOperacion["ajustes"][string] | undefined; bodegas: DatosOperacion["bodegas"]; puedeEscribir: boolean; pendiente: boolean; ejecutar: Ejecutar }) {
  const [bodega, setBodega] = useState(a?.bodegaId ?? "");
  const [pct, setPct] = useState(String(a?.pasarelaPct ?? 0));
  const [fijo, setFijo] = useState(String(a?.pasarelaFijo ?? 0));
  const [itbms, setItbms] = useState(String(Math.round((a?.itbmsTasa ?? 0) * 10000) / 100));
  const [pausada, setPausada] = useState(a?.pausada ?? false);
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-medium">{t.nombre}</td>
      <td className="px-3 py-2"><select className={fieldClass} aria-label={`Bodega de ${t.nombre}`} disabled={!puedeEscribir} value={bodega} onChange={(e) => setBodega(e.target.value)}><option value="">No mueve inventario</option>{bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></td>
      <td className="px-3 py-2"><input className={fieldClass} aria-label={`Porcentaje de pasarela de ${t.nombre}`} inputMode="decimal" disabled={!puedeEscribir} value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Ej: 2.9" /></td>
      <td className="px-3 py-2"><input className={fieldClass} aria-label={`Cargo fijo de pasarela de ${t.nombre}`} inputMode="decimal" disabled={!puedeEscribir} value={fijo} onChange={(e) => setFijo(e.target.value)} placeholder="Ej: 0.30" /></td>
      <td className="px-3 py-2"><input className={fieldClass} aria-label={`ITBMS de ${t.nombre}`} inputMode="decimal" disabled={!puedeEscribir} value={itbms} onChange={(e) => setItbms(e.target.value)} placeholder="Ej: 7" /></td>
      <td className="px-3 py-2"><input type="checkbox" aria-label={`Pausar ${t.nombre}`} disabled={!puedeEscribir} checked={pausada} onChange={(e) => setPausada(e.target.checked)} /></td>
      <td className="px-3 py-2 text-right">{puedeEscribir && <button className={botonSecundario} disabled={pendiente} onClick={() => ejecutar(() => guardarAjustesTienda(t.unidadId, { pausada, bodegaId: bodega || null, pasarelaPct: Number(pct) || 0, pasarelaFijo: Number(fijo) || 0, itbmsTasa: (Number(itbms) || 0) / 100 }), "Tienda guardada")}>Guardar</button>}</td>
    </tr>
  );
}

/** Etiquetas libres y franja horaria de entrega de la orden (mejora 54). Se guardan con un botón. */
function EtiquetasFranja({ ordenId, etiquetas, franja, puedeEscribir, pendiente, ejecutar, alGuardar }: {
  ordenId: string; etiquetas: string[]; franja: string | null; puedeEscribir: boolean; pendiente: boolean; ejecutar: Ejecutar; alGuardar: () => void;
}) {
  const [texto, setTexto] = useState(etiquetas.join(", "));
  const [f, setF] = useState(franja ?? "");
  const cambio = texto.trim() !== etiquetas.join(", ") || f !== (franja ?? "");
  if (!puedeEscribir)
    return (
      <p className="text-sm">
        Entrega: {etiquetaFranja(franja)}
        {etiquetas.length > 0 && <> · {etiquetas.map((e) => <span key={e} className="mr-1 rounded-full border border-border px-2 py-0.5 text-xs">{e}</span>)}</>}
      </p>
    );
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
      <label className="flex flex-col gap-1 text-sm"><span>Etiquetas</span><input className={fieldClass} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: regalo, frágil" /></label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Franja de entrega</span>
        <select className={fieldClass} value={f} onChange={(e) => setF(e.target.value)}>
          <option value="">Cualquier hora</option>
          {FRANJAS.map((x) => <option key={x.valor} value={x.valor}>{x.etiqueta}</option>)}
        </select>
      </label>
      <button className={botonSecundario} disabled={pendiente || !cambio} onClick={() => ejecutar(() => guardarEtiquetasFranja(ordenId, texto, f), "Guardado", alGuardar, true)}>Guardar</button>
    </div>
  );
}
