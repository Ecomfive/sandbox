"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Indicador, Pastilla, TableroIndicadores, claseTdLista, claseThLista } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { useToast } from "@/components/ui/toast";
import { AlertaIcon, CheckIcon, ChatIcon, PedidoIcon, RobotIcon, SugerenciaIcon } from "@/lib/nav-icons";
import type { Combinado, ResultadoModelo } from "@/lib/confirmacion-ia/combinar";
import type { ConfigConfirmacion, FilaAnalisis } from "@/lib/confirmacion-ia/servidor";
import type { Zona } from "@/lib/confirmacion-ia/zonas";
import { tiempoEsperando } from "@/lib/tienda/confirmacion";
import { EjemplosDirecciones } from "./ejemplos-direcciones";
import { InstruccionesIA } from "./instrucciones-ia";
import { PalabrasZona } from "./palabras-zona";
import { SeccionCard } from "./seccion";
import {
  analizarPedidoAhora,
  analizarPendientesAhora,
  cambiarInterruptor,
  guardarAnalisisComoEjemplo,
  probarDireccion,
  type InterruptorConfirmacion,
  type PalabraZona,
} from "../ia-actions";

const ZONA_TEXTO: Record<Zona, string> = { ciudad: "Ciudad", interior: "Interior" };
const NOMBRE_IA: Record<string, string> = { openai: "ChatGPT", anthropic: "Claude" };
const MENSAJE: Record<FilaAnalisis["mensajeEstado"], { texto: string; tono: "neutro" | "exito" | "aviso" | "peligro" }> = {
  no_aplica: { texto: "No hace falta", tono: "neutro" },
  apagado: { texto: "Sin enviar (apagado)", tono: "neutro" },
  enviado: { texto: "Enviado", tono: "exito" },
  pendiente_plantilla: { texto: "Falta plantilla", tono: "aviso" },
  sin_chat: { texto: "Sin chat", tono: "aviso" },
  error: { texto: "No se pudo enviar", tono: "peligro" },
};

function Interruptor({ activo, etiqueta, deshabilitado, alCambiar }: { activo: boolean; etiqueta: string; deshabilitado?: boolean; alCambiar: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={alCambiar}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${activo ? "bg-success" : "bg-border-control"} ${anilloFoco}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${activo ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/** El resultado de un análisis como lo ve la persona: la zona (con la etiqueta que se pondría) y si la dirección está completa. */
function Resultado({ f }: { f: Pick<FilaAnalisis, "estado" | "zona" | "etiqueta" | "falta"> }) {
  if (f.estado === "error") return <Pastilla tono="peligro">No se pudo analizar</Pastilla>;
  if (f.estado === "falta_dato") return <Pastilla tono="aviso">Falta un dato</Pastilla>;
  if (f.estado === "revisar") return <Pastilla tono="neutro">Revisar</Pastilla>;
  return <Pastilla tono="exito">{f.etiqueta ?? (f.zona ? ZONA_TEXTO[f.zona] : "Completa")}</Pastilla>;
}

type Filtro = "todos" | "listo" | "falta_dato" | "revisar";

export function ConfirmacionIA({
  config,
  paisNombre,
  etiquetasTexto,
  esAdmin,
  puedeEscribir,
  filas,
  tiendas,
  tiendaElegida,
  ahora,
  apagadaPorFaltaDeIA,
  ejemplos,
  palabras,
  instrucciones,
}: {
  config: ConfigConfirmacion;
  paisNombre: string;
  /** Las etiquetas del país, como se leen («CIUDAD · INTERIOR/SERVIENTREGA») o que faltan definirse. */
  etiquetasTexto: string | null;
  esAdmin: boolean;
  puedeEscribir: boolean;
  filas: FilaAnalisis[];
  tiendas: { id: string; nombre: string }[];
  tiendaElegida: string | null;
  ahora: number;
  /** Ninguna IA de texto tiene clave: sin ellas no se puede analizar. */
  apagadaPorFaltaDeIA: boolean;
  /** Las direcciones de ejemplo: cuántas hay y a qué tiendas se pueden agregar. */
  ejemplos: { total: number; tiendaObligatoria: boolean };
  palabras: PalabraZona[];
  /** Las instrucciones extra de la IA; solo llegan (y se muestran) a un administrador. */
  instrucciones: string | null;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [pidiendoClave, setPidiendoClave] = useState<{ campo: InterruptorConfirmacion; valor: boolean } | null>(null);
  const [clave, setClave] = useState("");
  const [errorClave, setErrorClave] = useState<string | null>(null);

  const cuenta = useMemo(() => ({ listo: filas.filter((f) => f.estado === "listo").length, falta_dato: filas.filter((f) => f.estado === "falta_dato").length, revisar: filas.filter((f) => f.estado === "revisar" || f.estado === "error").length }), [filas]);
  const visibles = filas.filter((f) => filtro === "todos" || (filtro === "revisar" ? f.estado === "revisar" || f.estado === "error" : f.estado === filtro));
  const ficha = filas.find((f) => f.id === abierta) ?? null;

  function cambiar(campo: InterruptorConfirmacion, valor: boolean, claveEscrita?: string) {
    empezar(async () => {
      const r = await cambiarInterruptor(campo, valor, claveEscrita);
      if (r.error) {
        if (claveEscrita !== undefined) setErrorClave(r.error);
        else mostrarToast(r.error, "destructive");
        return;
      }
      setPidiendoClave(null);
      setClave("");
      setErrorClave(null);
      mostrarToast(valor ? "Encendido." : "Apagado.");
      router.refresh();
    });
  }
  // Un administrador cambia directo; los demás escriben la contraseña.
  const pulsar = (campo: InterruptorConfirmacion, valor: boolean) => (esAdmin ? cambiar(campo, valor) : setPidiendoClave({ campo, valor }));

  function analizarPendientes() {
    empezar(async () => {
      const r = await analizarPendientesAhora();
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(r.analizadas ? `${r.analizadas} ${r.analizadas === 1 ? "pedido analizado" : "pedidos analizados"}${r.pendientes ? `; quedan ${r.pendientes}` : ""}.` : "No hay pedidos confirmados sin analizar.");
      router.refresh();
    });
  }

  const indice = [
    { id: "pedidos", texto: "Pedidos analizados" },
    { id: "ejemplos", texto: "Direcciones de ejemplo" },
    { id: "zonas", texto: "Palabras de zona" },
    ...(esAdmin ? [{ id: "instrucciones", texto: "Instrucciones de la IA" }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <SeccionCard
        id="estado"
        icono={RobotIcon}
        titulo={`Confirmación automática · ${paisNombre}`}
        derecha={
          <span className="flex items-center gap-2.5">
            <span className="text-xs font-medium text-muted-foreground">{config.activa ? "Encendida" : "Apagada"}</span>
            <Interruptor activo={config.activa} etiqueta="Confirmación automática" deshabilitado={pendiente} alCambiar={() => pulsar("activa", !config.activa)} />
          </span>
        }
        ayuda={config.activa ? "Analiza la dirección de cada pedido que iComfly deja «Confirmada»." : "Apagada: no analiza ningún pedido. Enciéndela para que empiece."}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="m-0 text-sm font-medium">Pedir por WhatsApp el dato que falta</p>
            <p className="m-0 text-xs text-muted-foreground">Si la dirección está incompleta, le escribe al cliente solo lo que falta. Solo con el chat abierto (24 h).</p>
          </div>
          <Interruptor activo={config.enviarMensajes} etiqueta="Pedir por WhatsApp el dato que falta" deshabilitado={pendiente} alCambiar={() => pulsar("enviar_mensajes", !config.enviarMensajes)} />
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>Por ahora solo propone: no cambia etiquetas en Shopify.</span>
          <span aria-hidden="true">·</span>
          <span>{etiquetasTexto ? `Etiquetas de ${paisNombre}: ${etiquetasTexto}` : `Etiquetas de ${paisNombre}: sin definir (solo revisa que la dirección esté completa)`}</span>
        </p>
        {apagadaPorFaltaDeIA && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            Falta conectar ChatGPT o Claude: sin sus claves no se puede analizar ninguna dirección.
          </p>
        )}
      </SeccionCard>

      <nav aria-label="Secciones de esta pantalla" className="-mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Ir a</span>
        {indice.map((i) => (
          <a key={i.id} href={`#${i.id}`} className={`inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground-soft hover:bg-muted ${anilloFoco}`}>
            {i.texto}
          </a>
        ))}
      </nav>

      <SeccionCard
        id="pedidos"
        icono={PedidoIcon}
        titulo="Pedidos analizados"
        derecha={
          puedeEscribir && (
            <button type="button" disabled={pendiente || !config.activa} onClick={analizarPendientes} className={`rounded-md border border-border-control bg-card px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
              {pendiente ? "Analizando…" : "Analizar los confirmados pendientes"}
            </button>
          )
        }
        ayuda="Los pedidos que iComfly dejó «Confirmada» y qué propone el sistema para cada uno. Toca uno para ver el detalle."
      >
        <TableroIndicadores etiqueta="Resumen de los análisis" extra={filas.length ? `Los últimos ${filas.length}` : undefined}>
          <Indicador titulo="Listos para etiquetar" valor={String(cuenta.listo)} detalle="Dirección completa y zona clara" icono={CheckIcon} color="verde" alPulsar={() => setFiltro(filtro === "listo" ? "todos" : "listo")} activo={filtro === "listo"} />
          <Indicador titulo="Falta un dato" valor={String(cuenta.falta_dato)} detalle="Hay que pedirle algo al cliente" icono={ChatIcon} color="ambar" punto={cuenta.falta_dato ? "aviso" : undefined} alPulsar={() => setFiltro(filtro === "falta_dato" ? "todos" : "falta_dato")} activo={filtro === "falta_dato"} />
          <Indicador titulo="Para revisar" valor={String(cuenta.revisar)} detalle="Las IA no coinciden o fallaron" icono={AlertaIcon} color="rojo" punto={cuenta.revisar ? "peligro" : undefined} alPulsar={() => setFiltro(filtro === "revisar" ? "todos" : "revisar")} activo={filtro === "revisar"} />
        </TableroIndicadores>
        {visibles.length === 0 ? (
          <p className="m-0 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {filas.length === 0 ? "Todavía no se analizó ningún pedido. Cuando iComfly deje uno «Confirmada», aparecerá aquí." : "Ningún pedido con ese filtro."}
          </p>
        ) : (
          <div className="-mx-4 -mb-4 overflow-x-auto border-t border-border">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <th scope="col" className={claseThLista}>Pedido</th>
                  <th scope="col" className={claseThLista}>Dirección</th>
                  <th scope="col" className={claseThLista}>Resultado</th>
                  <th scope="col" className={claseThLista}>En Shopify</th>
                  <th scope="col" className={claseThLista}>WhatsApp</th>
                  <th scope="col" className={claseThLista}>Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const m = MENSAJE[f.mensajeEstado];
                  const coincide = f.etiqueta && f.etiquetaActual ? f.etiqueta.toUpperCase().startsWith(f.etiquetaActual.toUpperCase().split("/")[0]) : null;
                  return (
                    <tr key={f.id} onClick={() => setAbierta(f.id)} className="cursor-pointer hover:bg-muted/50">
                      <td className={claseTdLista}>
                        <button type="button" onClick={() => setAbierta(f.id)} className={`rounded text-left font-medium ${anilloFoco}`}>
                          {f.numero ?? "—"}
                        </button>
                        {tiendas.length > 1 && f.tienda && <span className="block text-xs text-muted-foreground">{f.tienda}</span>}
                      </td>
                      <td className={`${claseTdLista} max-w-[22rem] truncate`} title={f.direccion ?? undefined}>
                        {f.direccion ?? "—"}
                        {f.falta && <span className="block truncate text-xs text-warning">Falta {f.falta}</span>}
                      </td>
                      <td className={claseTdLista}>
                        <Resultado f={f} />
                      </td>
                      <td className={claseTdLista}>
                        {f.etiquetaActual ?? <span className="text-muted-foreground">—</span>}
                        {coincide === false && <span className="block text-xs text-warning">No coincide</span>}
                        {coincide === true && <span className="block text-xs text-success">Coincide</span>}
                      </td>
                      <td className={claseTdLista}>
                        <Pastilla tono={m.tono}>{m.texto}</Pastilla>
                      </td>
                      <td className={`${claseTdLista} tabular-nums text-muted-foreground`}>hace {tiempoEsperando(f.actualizadoEn, ahora)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SeccionCard>

      <ProbarDireccion tiendas={tiendas} puedeEscribir={puedeEscribir} tiendaElegida={tiendaElegida} />

      {/* Lo que el equipo le enseña a la IA, lado a lado en pantalla ancha. */}
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <EjemplosDirecciones paisNombre={paisNombre} distingueZona={config.distingueZona} tiendas={tiendas} tiendaObligatoria={ejemplos.tiendaObligatoria} puedeEscribir={puedeEscribir} total={ejemplos.total} />
        <PalabrasZona paisNombre={paisNombre} distingueZona={config.distingueZona} puedeEscribir={puedeEscribir} inicial={palabras} />
      </div>

      {esAdmin && <InstruccionesIA paisNombre={paisNombre} inicial={instrucciones ?? ""} />}

      {ficha && <FichaAnalisis key={ficha.id} f={ficha} distingueZona={config.distingueZona} puedeEscribir={puedeEscribir} alCerrar={() => setAbierta(null)} />}

      {pidiendoClave && (
        <Ventana abierto alCerrar={() => !pendiente && setPidiendoClave(null)} ancho="sm" titulo={<span className="text-base font-semibold">Escribe la contraseña</span>}>
          <form
            className="flex flex-col gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              setErrorClave(null);
              cambiar(pidiendoClave.campo, pidiendoClave.valor, clave);
            }}
          >
            <p className="m-0 text-sm text-muted-foreground">Solo un administrador puede {pidiendoClave.valor ? "encender" : "apagar"} esto. Si no lo eres, escribe la contraseña.</p>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Contraseña</span>
              <input type="password" autoComplete="off" data-enfocar value={clave} onChange={(e) => setClave(e.target.value)} className={fieldClass} />
            </label>
            {errorClave && (
              <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
                {errorClave}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={pendiente} onClick={() => setPidiendoClave(null)} className={`rounded-md border border-border-control bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
                Cancelar
              </button>
              <button type="submit" disabled={pendiente || !clave} className={`rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50 ${anilloFoco}`}>
                {pendiente ? "Comprobando…" : pidiendoClave.valor ? "Encender" : "Apagar"}
              </button>
            </div>
          </form>
        </Ventana>
      )}
    </div>
  );
}

/** Lo que contestó cada IA, en una línea. */
function LineaModelo({ m }: { m: ResultadoModelo | FilaAnalisis["modelos"][number] }) {
  const r = "respuesta" in m ? m.respuesta : (m as FilaAnalisis["modelos"][number]);
  if (!m.ok) return <li className="text-sm text-destructive">{NOMBRE_IA[m.proveedor] ?? m.proveedor}: {(m as { error?: string | null }).error ?? "no contestó"}</li>;
  const zona = r && "zona" in r && r.zona ? (r.zona === "no_se" || r.zona === "no_aplica" ? "zona sin decidir" : `zona ${r.zona}`) : "";
  const completa = r && "completa" in r ? (r.completa ? "completa" : `incompleta (falta ${r.falta ?? "algo"})`) : "";
  return (
    <li className="text-sm">
      <b>{NOMBRE_IA[m.proveedor] ?? m.proveedor}:</b> {[zona, completa].filter(Boolean).join(" · ")}
      {r && "motivo" in r && r.motivo ? <span className="block text-xs text-muted-foreground">{r.motivo}</span> : null}
    </li>
  );
}

function FichaAnalisis({ f, distingueZona, puedeEscribir, alCerrar }: { f: FilaAnalisis; distingueZona: boolean; puedeEscribir: boolean; alCerrar: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [guardando, setGuardando] = useState(false);
  const [completa, setCompleta] = useState(f.completa ?? true);
  const [falta, setFalta] = useState(f.falta ?? "");
  const [zona, setZona] = useState<Zona | "">(f.zona ?? "");
  const m = MENSAJE[f.mensajeEstado];

  function analizar() {
    empezar(async () => {
      const r = await analizarPedidoAhora(f.ordenId);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast("Analizado de nuevo.");
      router.refresh();
    });
  }
  function guardar() {
    empezar(async () => {
      const r = await guardarAnalisisComoEjemplo(f.id, { completa, falta: completa ? null : falta, zona: zona || null });
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast("Guardada como ejemplo.");
      setGuardando(false);
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} lado="derecha" ancho="md" titulo={<span className="text-base font-semibold">Pedido {f.numero ?? ""}</span>}>
      <div className="flex flex-col gap-4 p-4">
        <div>
          <p className={`${labelClass} m-0`}>Dirección analizada</p>
          <p className="m-0 mt-1 text-sm">{f.direccion ?? "Sin dirección"}</p>
          {f.ciudad && <p className="m-0 text-xs text-muted-foreground">Ciudad o corregimiento: {f.ciudad}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Resultado f={f} />
          {f.zona && <Pastilla>{ZONA_TEXTO[f.zona]}{f.zonaPor === "regla" ? " · por palabra de zona" : " · por las IA"}</Pastilla>}
          {f.acuerdo === false && <Pastilla tono="aviso">Las IA no coinciden</Pastilla>}
        </div>
        {f.etiqueta && <p className="m-0 text-sm">Etiqueta que se pondría: <b>{f.etiqueta}</b>{f.etiquetaActual ? ` · en Shopify tiene ${f.etiquetaActual}` : ""}</p>}
        {f.reglas.length > 0 && <p className="m-0 text-sm">Palabras de zona que salieron: {f.reglas.map((r) => `${r.texto} (${ZONA_TEXTO[r.resultado]})`).join(", ")}</p>}
        <div>
          <p className={`${labelClass} m-0`}>Lo que dijo cada IA</p>
          <ul className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0">{f.modelos.map((x) => <LineaModelo key={x.proveedor} m={x} />)}</ul>
        </div>
        {f.mensaje && (
          <div>
            <p className={`${labelClass} m-0`}>Mensaje para el cliente</p>
            <p className="m-0 mt-1 rounded-md bg-muted px-3 py-2 text-sm">{f.mensaje}</p>
            <p className="m-0 mt-1 text-xs text-muted-foreground">
              {m.texto}
              {f.mensajeEstado === "pendiente_plantilla" ? ": pasaron más de 24 horas del último mensaje del cliente; hay que usar una plantilla de iComfly." : f.mensajeEstado === "sin_chat" ? ": el cliente no tiene chat con la tienda." : f.mensajeError ? `: ${f.mensajeError}` : ""}
            </p>
          </div>
        )}
        {puedeEscribir && (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pendiente} onClick={analizar} className={`rounded-md border border-border-control bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
                {pendiente ? "Analizando…" : "Analizar de nuevo"}
              </button>
              <button type="button" aria-expanded={guardando} onClick={() => setGuardando((v) => !v)} className={`rounded-md border border-border-control bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
                Guardar como ejemplo
              </button>
            </div>
            {guardando && (
              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <p className="m-0 text-xs text-muted-foreground">Dile a la IA lo correcto. Así aprende de lo que ves aquí.</p>
                <div role="radiogroup" aria-label="La dirección está" className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5"><input type="radio" checked={completa} onChange={() => setCompleta(true)} /> Completa</label>
                  <label className="flex items-center gap-1.5"><input type="radio" checked={!completa} onChange={() => setCompleta(false)} /> Incompleta</label>
                </div>
                {!completa && (
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>¿Qué le falta?</span>
                    <input value={falta} maxLength={200} onChange={(e) => setFalta(e.target.value)} placeholder="Ej: el número de casa" className={fieldClass} />
                  </label>
                )}
                {completa && distingueZona && (
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>Zona</span>
                    <select value={zona} onChange={(e) => setZona(e.target.value as Zona | "")} className={fieldClass}>
                      <option value="">No sé</option>
                      <option value="ciudad">Ciudad</option>
                      <option value="interior">Interior</option>
                    </select>
                  </label>
                )}
                <button type="button" disabled={pendiente || (!completa && !falta.trim())} onClick={guardar} className={`self-end rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50 ${anilloFoco}`}>
                  Guardar ejemplo
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Ventana>
  );
}

/** «Probar una dirección»: escribe una dirección y ve qué diría el sistema, sin guardar ni mandar nada. */
function ProbarDireccion({ tiendas, puedeEscribir, tiendaElegida }: { tiendas: { id: string; nombre: string }[]; puedeEscribir: boolean; tiendaElegida: string | null }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [resultado, setResultado] = useState<{ combinado: Combinado; modelos: ResultadoModelo[]; palabras: { texto: string; resultado: Zona }[]; etiqueta: string | null } | null>(null);
  if (!puedeEscribir) return null;
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className={`flex cursor-pointer items-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-sm font-semibold ${anilloFoco}`}>
        <SugerenciaIcon aria-hidden="true" className="h-4 w-4 text-primario" />
        Probar una dirección
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-4">
        <p className="m-0 text-sm text-muted-foreground">Escribe una dirección y mira qué diría el sistema. No se guarda ni se le escribe a nadie.</p>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Dirección</span>
          <textarea rows={2} maxLength={600} value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ej: Urb. Los Pinos, calle 5, casa 12, frente a la tienda" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 sm:max-w-sm">
          <span className={labelClass}>Ciudad o corregimiento (opcional)</span>
          <input value={ciudad} maxLength={120} onChange={(e) => setCiudad(e.target.value)} className={fieldClass} />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pendiente || direccion.trim().length < 3}
            onClick={() =>
              empezar(async () => {
                const r = await probarDireccion(direccion, ciudad, tiendaElegida ?? tiendas[0]?.id ?? null);
                if (r.error || !r.combinado) return mostrarToast(r.error ?? "No se pudo probar.", "destructive");
                setResultado({ combinado: r.combinado, modelos: r.modelos ?? [], palabras: r.palabras ?? [], etiqueta: r.etiqueta ?? null });
              })
            }
            className={`rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50 ${anilloFoco}`}
          >
            {pendiente ? "Analizando…" : "Probar"}
          </button>
        </div>
        {resultado && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              <Resultado f={{ estado: resultado.combinado.estado, zona: resultado.combinado.zona, etiqueta: resultado.etiqueta, falta: resultado.combinado.falta }} />
              {resultado.combinado.zona && <Pastilla>{ZONA_TEXTO[resultado.combinado.zona]}{resultado.combinado.zonaPor === "regla" ? " · por palabra de zona" : " · por las IA"}</Pastilla>}
            </div>
            {resultado.combinado.falta && <p className="m-0 text-sm">Le pediría: <b>{resultado.combinado.falta}</b></p>}
            {resultado.palabras.length > 0 && <p className="m-0 text-sm">Palabras de zona que salieron: {resultado.palabras.map((r) => `${r.texto} (${ZONA_TEXTO[r.resultado]})`).join(", ")}</p>}
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{resultado.modelos.map((m) => <LineaModelo key={m.proveedor} m={m} />)}</ul>
          </div>
        )}
      </div>
    </details>
  );
}
