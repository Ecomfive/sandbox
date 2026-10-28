"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearFechaHora } from "@/lib/formato";
import { ActualizarIcon, BuscarIcon, ConectadoIcon, DesconectadoIcon, MasIcon } from "@/lib/nav-icons";
import { rellenar, textoLimite, vistaPrevia, type EstadoPlantilla } from "@/lib/whatsapp/plantillas";
import { PLANTILLAS_SUGERIDAS } from "@/lib/whatsapp/plantillas-sugeridas";
import type { PlantillaGuardada } from "@/lib/whatsapp/plantillas-servidor";
import { actualizarEstadoPlantillas, agregarSugerida, eliminarPlantilla, enviarPlantillaABorrador, marcarAlertasVistas } from "./actions";
import type { AlertaVista, NumeroLimite } from "./datos-plantillas";
import { FichaPlantilla, type InicioPlantilla } from "./ficha-plantilla";

const ESTADO: Record<EstadoPlantilla, { etiqueta: string; tono: Tone }> = {
  borrador: { etiqueta: "Borrador", tono: "neutral" },
  pendiente: { etiqueta: "En revisión", tono: "azul" },
  aprobada: { etiqueta: "Aprobada", tono: "success" },
  rechazada: { etiqueta: "Rechazada", tono: "destructive" },
  pausada: { etiqueta: "Pausada", tono: "warning" },
  deshabilitada: { etiqueta: "Deshabilitada", tono: "destructive" },
};
const CATEGORIA: Record<string, string> = { marketing: "Marketing", utility: "Utilidad", authentication: "Autenticación" };
const CALIDAD: Record<string, { texto: string; punto: string }> = {
  alta: { texto: "Calidad alta", punto: "bg-success" },
  media: { texto: "Calidad media", punto: "bg-warning" },
  baja: { texto: "Calidad baja", punto: "bg-destructive" },
  pendiente: { texto: "Calidad pendiente", punto: "bg-muted-foreground" },
};
const PUNTO_ALERTA = { info: "bg-success", aviso: "bg-warning", critica: "bg-destructive" } as const;

type Filtro = "todas" | "aprobada" | "pendiente" | "borrador" | "problemas";
const FILTROS: { id: Filtro; texto: string; cuenta: (p: PlantillaGuardada) => boolean }[] = [
  { id: "todas", texto: "Todas", cuenta: () => true },
  { id: "aprobada", texto: "Aprobadas", cuenta: (p) => p.estado === "aprobada" },
  { id: "pendiente", texto: "En revisión", cuenta: (p) => p.estado === "pendiente" },
  { id: "borrador", texto: "Borradores", cuenta: (p) => p.estado === "borrador" },
  { id: "problemas", texto: "Con problemas", cuenta: (p) => p.estado === "rechazada" || p.estado === "pausada" || p.estado === "deshabilitada" || !!p.error_envio },
];

const boton = `inline-flex min-h-9 items-center rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

type Abierta = { tipo: "nueva"; inicio?: InicioPlantilla } | { tipo: "editar"; id: string };

/**
 * CRM Dropshippers › Plantillas de WhatsApp (28 oct 2026): las plantillas que Meta aprueba para escribirle a alguien pasadas 24 h de su
 * último mensaje. Se crean y se cambian desde aquí y se mandan solas a Meta; la lista dice cómo va cada una (borrador, en revisión,
 * aprobada, rechazada, pausada), su calidad y su categoría —que Meta puede cambiar—, y las alertas dicen cuándo algo cambió.
 */
export function Plantillas({
  inicial,
  conexion,
  escribe,
  esAdmin,
}: {
  inicial: { plantillas: PlantillaGuardada[]; alertas: AlertaVista[]; numeros: NumeroLimite[] };
  conexion: { conectado: boolean; via: "360dialog" | "meta" | null; motivo: string | null };
  escribe: boolean;
  esAdmin: boolean;
}) {
  const { plantillas, alertas, numeros } = inicial;
  const { mostrarToast } = useToast();
  const [ocupado, empezar] = useTransition();
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [enCurso, setEnCurso] = useState<string | null>(null);

  const editada = abierta?.tipo === "editar" ? (plantillas.find((p) => p.id === abierta.id) ?? null) : null;
  const sinVer = alertas.filter((a) => !a.vista).slice(0, 5);
  const sugeridas = PLANTILLAS_SUGERIDAS.filter((s) => !plantillas.some((p) => p.sugerida === s.clave || p.nombre === s.nombre));
  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const f = FILTROS.find((x) => x.id === filtro)!;
    return plantillas.filter((p) => f.cuenta(p) && (!q || p.nombre.toLowerCase().includes(q) || p.cuerpo.toLowerCase().includes(q)));
  }, [plantillas, buscar, filtro]);

  function accion(clave: string, hacer: () => Promise<{ error: string } | object>, ok: string) {
    setEnCurso(clave);
    empezar(async () => {
      const r = await hacer().catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      setEnCurso(null);
      if ("error" in r) mostrarToast(r.error as string, "destructive");
      else mostrarToast(ok);
    });
  }

  function actualizar() {
    setEnCurso("actualizar");
    empezar(async () => {
      const r = await actualizarEstadoPlantillas().catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      setEnCurso(null);
      if ("error" in r) mostrarToast(r.error, "destructive");
      else mostrarToast(r.actualizadas || r.nuevas ? `Al día: ${r.actualizadas} cambiadas, ${r.nuevas} nuevas.` : "Todo al día: no hubo cambios.");
    });
  }

  function agregarTodas() {
    setEnCurso("sugeridas");
    empezar(async () => {
      let agregadas = 0;
      for (const s of sugeridas) {
        const r = await agregarSugerida(s.clave).catch(() => ({ error: "No se pudo agregar." }));
        if ("error" in r) {
          mostrarToast(r.error, "destructive");
          break;
        }
        agregadas++;
      }
      setEnCurso(null);
      if (agregadas) mostrarToast(`${agregadas} plantillas agregadas como borrador. Revísalas y mándalas a Meta.`);
    });
  }

  const limites = numeros.filter((n) => textoLimite(n.limite));

  return (
    <div className="flex flex-col gap-5">
      {sinVer.length > 0 && (
        <section aria-label="Avisos de WhatsApp" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {sinVer.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5 text-sm">
                <span aria-hidden="true" className={`mt-1.5 h-2 w-2 flex-none rounded-full ${PUNTO_ALERTA[a.severidad]}`} />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{a.titulo}</span>
                  {a.detalle && <span className="text-muted-foreground [overflow-wrap:anywhere]">{a.detalle}</span>}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" disabled={ocupado} onClick={() => accion("alertas", () => marcarAlertasVistas(), "Listo.")} className={`${boton} self-end`}>
            Entendido
          </button>
        </section>
      )}

      <section aria-label="Conexión de WhatsApp" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {conexion.conectado ? <ConectadoIcon aria-hidden="true" className="h-5 w-5 flex-none text-success" /> : <DesconectadoIcon aria-hidden="true" className="h-5 w-5 flex-none text-muted-foreground" />}
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">{conexion.conectado ? `WhatsApp conectado por ${conexion.via === "360dialog" ? "360dialog" : "Meta"}` : "WhatsApp sin conectar"}</span>
            <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {conexion.conectado ? "Lo que mandes a Meta se revisa de minutos a 24 horas." : "Mientras tanto, las plantillas se guardan como borrador y se mandan a Meta cuando se conecte."}
            </span>
          </div>
        </div>
        {limites.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-xs text-muted-foreground">
            {limites.map((n) => (
              <li key={n.id}>
                {n.nombre}: <span className="font-medium text-foreground">{textoLimite(n.limite) === "Sin límite" ? "sin límite de envío" : `escribe a ${textoLimite(n.limite)} personas nuevas cada 24 h`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details open={plantillas.length === 0} className="rounded-xl border border-border bg-card">
        <summary className={`cursor-pointer px-4 py-3 text-sm font-semibold ${anilloFoco}`}>¿Qué es una plantilla?</summary>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm">
          <p className="m-0">Es un mensaje que Meta revisa antes de que lo uses. Pasadas 24 horas del último mensaje de una persona, es la única forma de escribirle por WhatsApp.</p>
          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
            {[
              ["Marketing", "Ofertas, novedades y mensajes para que alguien vuelva. Es la que se usa para retomar conversaciones. Cuesta más."],
              ["Utilidad", "Avisos de algo que la persona ya pidió: un pedido, un envío, una consulta. Sin promociones."],
              ["Autenticación", "Códigos de verificación. No se crean aquí."],
            ].map(([t, d]) => (
              <div key={t} className="flex flex-col gap-0.5">
                <dt className="font-medium">{t}</dt>
                <dd className="m-0 text-xs text-muted-foreground">{d}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0">
            <span className="font-mono font-semibold">{"{{1}}"}</span> es una variable: un hueco que se llena con un dato de cada persona (su nombre, su tienda…) al enviar. Meta pide un ejemplo de cada una para aprobar la plantilla.
          </p>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const n = plantillas.filter(f.cuenta).length;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={filtro === f.id}
                onClick={() => setFiltro(f.id)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${filtro === f.id ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"} ${anilloFoco}`}
              >
                {f.texto}
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="relative ml-auto flex min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Buscar plantillas</span>
          <BuscarIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar plantillas" className={`${fieldClass} w-full pl-9`} />
        </label>
        {conexion.conectado && (
          <button type="button" disabled={ocupado} onClick={actualizar} className={`${boton} gap-1.5`}>
            <ActualizarIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {enCurso === "actualizar" ? "Actualizando…" : "Actualizar estado"}
          </button>
        )}
        {escribe && (
          <button type="button" onClick={() => setAbierta({ tipo: "nueva" })} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md bg-foreground px-3.5 text-xs font-semibold text-background hover:opacity-90 ${anilloFoco}`}>
            <MasIcon aria-hidden="true" className="h-3.5 w-3.5" />
            Nueva plantilla
          </button>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {plantillas.length === 0 ? "Todavía no hay plantillas. Agrega una sugerida o crea la tuya." : "Ninguna plantilla coincide."}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card p-0">
          {lista.map((p) => {
            const e = ESTADO[p.estado];
            const q = CALIDAD[p.calidad];
            const cambioCategoria = p.categoria_actual && p.categoria_actual !== p.categoria ? p.categoria_actual : null;
            const puedeEnviar = escribe && conexion.conectado && (p.estado === "borrador" || (!!p.error_envio && p.estado !== "pendiente"));
            return (
              <li key={p.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setAbierta({ tipo: "editar", id: p.id })} className={`font-mono text-sm font-semibold hover:underline ${anilloFoco}`}>
                    {p.nombre}
                  </button>
                  <Badge tone={e.tono}>{e.etiqueta}</Badge>
                  <Badge tone="neutral">{CATEGORIA[cambioCategoria ?? p.categoria]}</Badge>
                  {(p.estado === "aprobada" || p.estado === "pausada") && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${q.punto}`} />
                      {q.texto}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{p.idioma}</span>
                </div>
                <p className="m-0 text-sm text-foreground-soft [overflow-wrap:anywhere]">{vistaPrevia({ cuerpo: p.cuerpo, variables: p.variables }) || rellenar(p.cuerpo, [])}</p>
                {cambioCategoria && (
                  <p className="m-0 text-xs text-warning">
                    Pediste {CATEGORIA[p.categoria]} y Meta la dejó como {CATEGORIA[cambioCategoria]}.{cambioCategoria === "marketing" ? " Marketing cuesta más por mensaje." : ""}
                  </p>
                )}
                {p.motivo && (p.estado === "rechazada" || p.estado === "pausada" || p.estado === "deshabilitada") && <p className="m-0 text-xs text-destructive [overflow-wrap:anywhere]">{p.motivo}</p>}
                {p.error_envio && <p className="m-0 text-xs text-destructive [overflow-wrap:anywhere]">No se pudo mandar a Meta: {p.error_envio}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setAbierta({ tipo: "editar", id: p.id })} className={boton}>
                    {escribe && p.estado !== "pendiente" && p.estado !== "deshabilitada" ? "Editar" : "Ver"}
                  </button>
                  {puedeEnviar && (
                    <button type="button" disabled={ocupado} onClick={() => accion(p.id, () => enviarPlantillaABorrador(p.id), "Plantilla enviada a Meta. Te avisamos cuando responda.")} className={boton}>
                      {enCurso === p.id ? "Enviando…" : "Enviar a Meta"}
                    </button>
                  )}
                  {esAdmin && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => {
                        if (confirm(`¿Eliminar la plantilla ${p.nombre}?${p.meta_id ? " También se borra en Meta y su nombre no se puede reusar por 30 días." : ""}`)) accion(`del-${p.id}`, () => eliminarPlantilla(p.id), "Plantilla eliminada.");
                      }}
                      className={`${boton} text-destructive`}
                    >
                      Eliminar
                    </button>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{p.enviada_en ? `Enviada ${formatearFechaHora(p.enviada_en)}` : `Creada ${formatearFechaHora(p.creado_en)}`}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {sugeridas.length > 0 && escribe && (
        <section aria-labelledby="sugeridas" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <h2 id="sugeridas" className="m-0 text-base font-semibold">
                Plantillas sugeridas para retomar conversaciones
              </h2>
              <p className="m-0 text-xs text-muted-foreground">Listas para usar. Se agregan como borrador y las mandas a Meta cuando quieras.</p>
            </div>
            <button type="button" disabled={ocupado} onClick={agregarTodas} className={boton}>
              {enCurso === "sugeridas" ? "Agregando…" : `Agregar las ${sugeridas.length} como borrador`}
            </button>
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
            {sugeridas.map((s) => (
              <li key={s.clave} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="m-0 text-sm font-semibold">{s.titulo}</h3>
                  <Badge tone="neutral">{CATEGORIA[s.categoria]}</Badge>
                </div>
                <p className="m-0 text-xs text-muted-foreground">{s.paraQue}</p>
                <p className="m-0 rounded-lg bg-muted px-3 py-2 text-sm [overflow-wrap:anywhere]">{vistaPrevia({ cuerpo: s.cuerpo, variables: s.variables })}</p>
                <button
                  type="button"
                  onClick={() => setAbierta({ tipo: "nueva", inicio: { nombre: s.nombre, categoria: s.categoria, cuerpo: s.cuerpo, botones: s.botones, variables: s.variables } })}
                  className={`${boton} self-start`}
                >
                  Revisar y agregar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {abierta?.tipo === "nueva" && <FichaPlantilla key="nueva" plantilla={null} inicio={abierta.inicio} conectado={conexion.conectado} puedeEscribir={escribe} alCerrar={() => setAbierta(null)} />}
      {abierta?.tipo === "editar" && editada && <FichaPlantilla key={`${editada.id}-${editada.actualizado_en}`} plantilla={editada} conectado={conexion.conectado} puedeEscribir={escribe} alCerrar={() => setAbierta(null)} />}
    </div>
  );
}
