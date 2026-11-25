"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  archivarCaso,
  avisarClienteCaso,
  cambiarCaso,
  comentarCaso,
  detalleCaso,
  guardarCuentaCaso,
  moverCaso,
  programarEnDespacho,
  restaurarCaso,
  subirAdjuntoCaso,
  type DetalleCaso,
} from "@/app/(app)/despacho-ciudad/cambios/actions";
import type { FilaCaso, Persona } from "@/lib/postventa/datos";
import { CAUSAS, colorDe, ESTADOS, grupoPorEstado, GRUPOS, NOTIFICAR, TIENDAS, TIPOS, type Etiqueta } from "@/lib/postventa/reglas";
import { textoSobre } from "@/lib/despacho/etiquetas";
import { FechaHora } from "@/components/ui/fecha-hora";
import { VisorArchivos } from "./visor-archivos";

type Pill = "tienda" | "tipo" | "causa" | "estado" | "notificar";
type Celda = "numero" | "valor_envio" | "reembolso" | "fecha" | "fecha_notificacion";

const plata = (n: number) => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const diaTexto = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const th = "sticky top-0 z-[1] border-b border-border bg-muted px-2 py-2 text-left text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-muted-foreground uppercase";
const td = "relative h-[38px] border-r border-b border-border/60 bg-card p-0 whitespace-nowrap";

const VALOR: Record<Celda, keyof FilaCaso> = {
  numero: "numero",
  valor_envio: "valorEnvio",
  reembolso: "reembolso",
  fecha: "fecha",
  fecha_notificacion: "fechaNotificacion",
};

/**
 * El tablero de Cambios y reembolsos (16 nov 2026), como «CAMBIOS Y REEMBOLSOS PANAMA» de Monday: sus tres grupos, las mismas columnas, etiquetas y
 * colores, filas que se arrastran de grupo y el panel de cada solicitud. El Estado aplica las automatizaciones de Monday (cambia de grupo solo, pone
 * Notificar al cliente y manda los avisos).
 * 25 nov 2026 (pedido de Hernán): la primera columna es el número de pedido; «Tipo» se llama Solicitud; Responsable dice quién la causó (Cliente o
 * Tienda; la persona del equipo pasa a «Encargado», en el panel); sin Seguimiento; Adjunto sube el comprobante y «Enviar» se lo manda al cliente.
 */
export function TableroCambios({
  filas: iniciales,
  personas,
  puedeEscribir: puedeArchivar,
  archivados = false,
  casoInicial = null,
}: {
  filas: FilaCaso[];
  personas: Persona[];
  puedeEscribir: boolean;
  archivados?: boolean;
  casoInicial?: string | null;
}) {
  const puedeEscribir = puedeArchivar && !archivados;
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [, empezar] = useTransition();
  const [filas, setFilas] = useState(iniciales);
  const [previas, setPrevias] = useState(iniciales);
  if (previas !== iniciales) {
    setPrevias(iniciales);
    setFilas(iniciales);
  }
  const [tienda, setTienda] = useState("TODAS");
  const [tipo, setTipo] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [cerrados, setCerrados] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(casoInicial);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);

  const guardar = (itemId: string, local: Partial<FilaCaso>, accion: () => Promise<{ error?: string }>) => {
    setFilas((fs) => fs.map((f) => (f.itemId === itemId ? { ...f, ...local, editadoEn: new Date().toISOString() } : f)));
    setMenu(null);
    empezar(async () => {
      const r = await accion();
      if (r.error) mostrarToast(r.error, "destructive");
      router.refresh();
    });
  };

  const elegir = (f: FilaCaso, col: Pill, nombre: string) => {
    if (col === "estado") {
      const local: Partial<FilaCaso> = { estado: nombre || null };
      const g = grupoPorEstado(nombre);
      if (g) local.grupo = g;
      if (nombre === "Hecho") local.notificar = "Notificar";
      return guardar(f.itemId, local, () => cambiarCaso(f.itemId, "estado", nombre));
    }
    const local: Partial<FilaCaso> = col === "tienda" ? { tienda: nombre || null } : col === "tipo" ? { tipo: nombre } : col === "causa" ? { causa: nombre || null } : { notificar: nombre || null };
    guardar(f.itemId, local, () => cambiarCaso(f.itemId, col, nombre));
  };

  /** La columna Adjunto: sube el comprobante del pago (Finanzas) sin abrir el panel. */
  const subirComprobante = (f: FilaCaso, archivo: File | undefined) => {
    if (!archivo) return;
    const datos = new FormData();
    datos.set("archivo", archivo);
    datos.set("comprobante", "1");
    setSubiendo(f.itemId);
    empezar(async () => {
      const r = await subirAdjuntoCaso(f.itemId, datos);
      setSubiendo(null);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("Comprobante subido.", "success");
        setFilas((fs) => fs.map((x) => (x.itemId === f.itemId ? { ...x, comprobante: true, adjuntos: x.adjuntos + 1, editadoEn: new Date().toISOString() } : x)));
      }
      router.refresh();
    });
  };

  /** «Enviar» en Notificar al cliente: abre WhatsApp con el mensaje y el enlace al comprobante, y deja la solicitud notificada con la fecha de hoy. */
  const enviarAlCliente = (f: FilaCaso) => {
    // La pestaña se abre en el clic (si se abre después de esperar al servidor, el navegador la bloquea).
    const ventana = window.open("about:blank", "_blank");
    empezar(async () => {
      const r = await avisarClienteCaso(f.itemId);
      if ("error" in r) {
        ventana?.close();
        mostrarToast(r.error, "destructive");
        return;
      }
      if (ventana) {
        ventana.opener = null;
        ventana.location.href = r.url;
      } else window.location.href = r.url;
      setFilas((fs) => fs.map((x) => (x.itemId === f.itemId ? { ...x, notificar: "Hecho", fechaNotificacion: new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" }), editadoEn: new Date().toISOString() } : x)));
      mostrarToast("Se abrió WhatsApp con el mensaje: pulsa Enviar allí.", "success");
      router.refresh();
    });
  };

  const visibles = useMemo(() => {
    const q = normal(busqueda.trim());
    return filas.filter(
      (f) =>
        (tienda === "TODAS" || f.tienda === tienda) &&
        (tipo === "TODOS" || f.tipo === tipo) &&
        (!q || normal(`${f.nombre} ${f.numero ?? ""} ${f.retirar ?? ""} ${f.enviar ?? ""} ${f.responsable ?? ""} ${f.causa ?? ""}`).includes(q)),
    );
  }, [filas, tienda, tipo, busqueda]);

  const grupos = GRUPOS.map((g) => ({ ...g, filas: visibles.filter((f) => f.grupo === g.nombre) }));
  const soltar = (destino: string) => (e: DragEvent) => {
    e.preventDefault();
    const id = arrastrando;
    setArrastrando(null);
    if (!id || !puedeEscribir) return;
    const f = filas.find((x) => x.itemId === id);
    if (f && f.grupo !== destino) guardar(id, { grupo: destino }, () => moverCaso(id, destino));
  };

  const filaSel = filas.find((f) => f.itemId === sel) ?? null;
  const chip = (activo: boolean) =>
    `min-h-9 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap ${anilloFoco} ${activo ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`;

  const listas: Record<Pill, { titulo: string; opciones: Etiqueta[] }> = {
    tienda: { titulo: "Tienda", opciones: TIENDAS },
    tipo: { titulo: "Solicitud", opciones: TIPOS },
    causa: { titulo: "Responsable", opciones: CAUSAS },
    estado: { titulo: "Estado", opciones: ESTADOS },
    notificar: { titulo: "Notificar al cliente", opciones: NOTIFICAR },
  };
  const valorPill = (f: FilaCaso, col: Pill) => (col === "tienda" ? f.tienda : col === "tipo" ? f.tipo : col === "causa" ? f.causa : col === "estado" ? f.estado : f.notificar);

  const pill = (f: FilaCaso, col: Pill) => {
    const valor = valorPill(f, col);
    const color = colorDe(listas[col].opciones, valor);
    const abierto = menu === `${f.itemId}:${col}`;
    return (
      <>
        <button
          type="button"
          disabled={!puedeEscribir}
          onClick={() => setMenu(abierto ? null : `${f.itemId}:${col}`)}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-label={`${listas[col].titulo}: ${valor ?? "vacío"}`}
          className={`block h-[38px] w-full truncate px-2 text-xs font-semibold tracking-wide ${anilloFoco} ${puedeEscribir ? "cursor-pointer" : "cursor-default"}`}
          style={color ? { background: color, color: textoSobre(color) } : { background: "var(--muted)", color: "var(--muted-foreground)" }}
        >
          {valor ?? ""}
        </button>
        {abierto && (
          <div role="listbox" aria-label={listas[col].titulo} className="absolute top-10 left-0 z-30 grid max-h-80 min-w-56 gap-1 overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-lg">
            {listas[col].opciones.map((o) => (
              <button key={o.nombre} type="button" role="option" aria-selected={o.nombre === valor} onClick={() => elegir(f, col, o.nombre)} className={`rounded-md px-2.5 py-1.5 text-left text-xs font-semibold ${anilloFoco}`} style={{ background: o.color, color: textoSobre(o.color) }}>
                {o.nombre}
              </button>
            ))}
            {col !== "tipo" && (
              <button type="button" onClick={() => elegir(f, col, "")} className={`rounded-md bg-muted px-2.5 py-1.5 text-left text-xs font-medium text-foreground-soft ${anilloFoco}`}>
                Dejar vacío
              </button>
            )}
          </div>
        )}
      </>
    );
  };

  const celda = (f: FilaCaso, campo: Celda, etiqueta: string, tipoInput: "text" | "decimal" | "date" = "text", ayuda?: string) => {
    const actual = f[VALOR[campo]] as string | number | null;
    const texto = actual === null || actual === undefined ? "" : String(actual);
    return (
      <input
        key={`${f.itemId}:${campo}:${texto}`}
        type={tipoInput === "date" ? "date" : "text"}
        defaultValue={texto}
        placeholder={puedeEscribir ? ayuda : undefined}
        readOnly={!puedeEscribir}
        inputMode={tipoInput === "decimal" ? "decimal" : undefined}
        aria-label={`${etiqueta} de ${f.numero ?? f.nombre}`}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v === texto) return;
          const local = { [VALOR[campo]]: tipoInput === "decimal" ? (v === "" ? null : Number(v.replace(",", "."))) : v || null } as Partial<FilaCaso>;
          guardar(f.itemId, local, () => cambiarCaso(f.itemId, campo, v));
        }}
        className={`h-[38px] w-full border-0 bg-transparent px-2 text-[13px] focus:outline-2 focus:-outline-offset-2 focus:outline-primario placeholder:text-muted-foreground/70 ${tipoInput === "decimal" ? "text-right tabular-nums" : ""} ${campo === "numero" ? "font-semibold" : ""}`}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {puedeEscribir && (
          <Link href="/despacho-ciudad/cambios/nueva" className={`boton-neon inline-flex min-h-9 items-center rounded-md px-3.5 text-[13px] font-medium text-white ${anilloFoco}`}>
            + Nueva solicitud
          </Link>
        )}
        {["TODAS", ...TIENDAS.map((t) => t.nombre)].map((t) => (
          <button key={t} type="button" aria-pressed={tienda === t} onClick={() => setTienda(t)} className={chip(tienda === t)}>
            {t === "TODAS" ? "Todas las tiendas" : t}
          </button>
        ))}
        <span className="ml-1 text-xs text-muted-foreground">Solicitud:</span>
        {["TODOS", "Cambio", "Reembolso", "Complemento", "Retiro"].map((t) => (
          <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)} className={chip(tipo === t)}>
            {t === "TODOS" ? "Todos" : t}
          </button>
        ))}
        <label className="ml-auto flex min-w-[14rem] items-center">
          <span className="sr-only">Buscar</span>
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar pedido, producto o responsable" className={`${fieldClass} w-full`} />
        </label>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 min-[1300px]:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-5">
          {grupos.map((g) => {
            const abierto = !cerrados[g.nombre];
            const reembolsado = g.filas.reduce((t, f) => t + (f.reembolso ?? 0), 0);
            const envios = g.filas.reduce((t, f) => t + (f.valorEnvio ?? 0), 0);
            return (
              <section key={g.nombre} aria-label={g.nombre} onDragOver={(e) => e.preventDefault()} onDrop={soltar(g.nombre)} className={`flex flex-col gap-1.5 rounded-xl ${arrastrando ? "outline-2 outline-offset-4 outline-primario/30 outline-dashed" : ""}`}>
                <div className="flex items-center gap-3">
                  <button type="button" aria-expanded={abierto} onClick={() => setCerrados((c) => ({ ...c, [g.nombre]: abierto }))} className={`text-base font-bold ${anilloFoco}`} style={{ color: g.color }}>
                    {abierto ? "▾" : "▸"} {g.nombre}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {g.filas.length} solicitud{g.filas.length === 1 ? "" : "es"}
                  </span>
                </div>
                {abierto && (
                  <div className="max-h-[70vh] overflow-auto rounded-[10px] border border-border bg-card" style={{ borderLeft: `4px solid ${g.color}` }}>
                    <table className="w-full border-separate border-spacing-0 text-[13px]">
                      <thead>
                        <tr>
                          <th scope="col" className={`${th} min-w-40`}>Número de pedido</th>
                          <th scope="col" className={`${th} min-w-24`}>Tienda</th>
                          <th scope="col" className={`${th} min-w-28`}>Solicitud</th>
                          <th scope="col" className={`${th} min-w-28`}>Responsable</th>
                          <th scope="col" className={`${th} min-w-52`}>Estado</th>
                          <th scope="col" className={`${th} min-w-32`}>Fecha</th>
                          <th scope="col" className={`${th} min-w-36 text-right`}>Valor envío</th>
                          <th scope="col" className={`${th} min-w-24 text-right`}>Valor reembolso</th>
                          <th scope="col" className={`${th} min-w-40`}>Adjunto</th>
                          <th scope="col" className={`${th} min-w-48`}>Notificar al cliente</th>
                          <th scope="col" className={`${th} min-w-32`}>Fecha notificación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.filas.map((f) => (
                          <tr key={f.itemId} draggable={puedeEscribir} onDragStart={() => setArrastrando(f.itemId)} onDragEnd={() => setArrastrando(null)} className={sel === f.itemId ? "[&>td]:bg-primario-suave" : "hover:[&>td]:bg-muted/60"}>
                            <td className={td} style={{ borderLeft: `4px solid ${g.color}` }}>
                              <div className="flex items-center gap-1 pr-1">
                                {puedeEscribir && (
                                  <span aria-hidden="true" className="cursor-grab pl-1 text-muted-foreground">
                                    ⋮⋮
                                  </span>
                                )}
                                <div className="min-w-0 flex-1" title={f.nombre}>
                                  {celda(f, "numero", "Número de pedido", "text", "#0000")}
                                </div>
                                <button type="button" onClick={() => setSel(f.itemId)} className={`rounded px-1.5 py-1 text-xs font-medium text-primario hover:bg-primario-suave ${anilloFoco}`} aria-label={`Abrir ${f.nombre}`}>
                                  Abrir
                                </button>
                              </div>
                            </td>
                            <td className={td}>{pill(f, "tienda")}</td>
                            <td className={td}>{pill(f, "tipo")}</td>
                            <td className={td}>{pill(f, "causa")}</td>
                            <td className={td}>{pill(f, "estado")}</td>
                            <td className={td}>{celda(f, "fecha", "Fecha", "date")}</td>
                            <td className={td}>{celda(f, "valor_envio", "Valor de envío", "decimal", "Lo paga el cliente")}</td>
                            <td className={td}>{celda(f, "reembolso", "Valor reembolso", "decimal")}</td>
                            <td className={td}>
                              {subiendo === f.itemId ? (
                                <span className="block px-2 text-xs text-muted-foreground">Subiendo…</span>
                              ) : f.comprobante ? (
                                <button type="button" onClick={() => setSel(f.itemId)} className={`h-[38px] w-full px-2 text-left text-xs font-semibold text-primario ${anilloFoco}`}>
                                  ✓ Comprobante
                                </button>
                              ) : puedeEscribir ? (
                                <label className="flex h-[38px] w-full cursor-pointer items-center px-2 text-xs font-medium text-primario focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-primario hover:bg-primario-suave">
                                  + Subir comprobante
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                                    aria-label={`Subir el comprobante de ${f.numero ?? f.nombre}`}
                                    className="sr-only"
                                    onChange={(e) => {
                                      subirComprobante(f, e.target.files?.[0]);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              ) : (
                                <button type="button" onClick={() => setSel(f.itemId)} className={`h-[38px] w-full px-2 text-left text-xs text-muted-foreground ${anilloFoco}`}>
                                  {f.adjuntos ? `Ver (${f.adjuntos})` : "—"}
                                </button>
                              )}
                            </td>
                            <td className={td}>
                              <div className="flex h-[38px] items-stretch">
                                <div className="relative min-w-0 flex-1">{pill(f, "notificar")}</div>
                                {puedeEscribir && (
                                  <button
                                    type="button"
                                    onClick={() => enviarAlCliente(f)}
                                    disabled={f.tipos.includes("reembolso") && !f.comprobante}
                                    title={f.tipos.includes("reembolso") && !f.comprobante ? "Primero sube el comprobante" : "Mandarle el comprobante al cliente por WhatsApp"}
                                    className={`shrink-0 border-l border-border/60 px-2.5 text-xs font-semibold text-primario hover:bg-primario-suave disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent ${anilloFoco}`}
                                  >
                                    Enviar
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className={td}>{celda(f, "fecha_notificacion", "Fecha notificación", "date")}</td>
                          </tr>
                        ))}
                        {!g.filas.length && (
                          <tr>
                            <td colSpan={11} className="px-3 py-4 text-center text-xs text-muted-foreground">
                              Sin solicitudes.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={6} className="bg-muted px-3 py-2 text-xs text-muted-foreground">
                            {g.filas.length} solicitud{g.filas.length === 1 ? "" : "es"}
                          </td>
                          <td className="bg-muted px-2 py-2 text-right text-xs font-semibold tabular-nums">{plata(envios)}</td>
                          <td className="bg-muted px-2 py-2 text-right text-xs font-semibold tabular-nums">{plata(reembolsado)}</td>
                          <td colSpan={3} className="bg-muted" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
        {filaSel && <PanelCaso key={filaSel.itemId} fila={filaSel} personas={personas} puedeEscribir={puedeEscribir} puedeArchivar={puedeArchivar} archivada={archivados} alCerrar={() => setSel(null)} />}
      </div>
      {menu && <button type="button" aria-label="Cerrar la lista" onClick={() => setMenu(null)} className="fixed inset-0 z-20 cursor-default bg-transparent" />}
    </div>
  );
}

const manana = () => {
  const d = new Date(Date.now() + 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Panama" });
};

/** El panel de una solicitud: lo que pidió el cliente, el reparto en Envíos Delivery, los datos del reembolso, adjuntos, actualizaciones y registro. */
function PanelCaso({
  fila,
  personas,
  puedeEscribir,
  puedeArchivar,
  archivada,
  alCerrar,
}: {
  fila: FilaCaso;
  personas: Persona[];
  puedeEscribir: boolean;
  puedeArchivar: boolean;
  archivada: boolean;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const router = useRouter();
  const [detalle, setDetalle] = useState<DetalleCaso | null>(null);
  const [texto, setTexto] = useState("");
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [dia, setDia] = useState(fila.fecha ?? manana());
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, empezar] = useTransition();
  const archivo = useRef<HTMLInputElement>(null);
  const cargar = () =>
    detalleCaso(fila.itemId).then((d) => {
      if ("error" in d) mostrarToast(d.error, "destructive");
      else setDetalle(d);
    });
  useEffect(() => {
    let vivo = true;
    detalleCaso(fila.itemId).then((d) => vivo && !("error" in d) && setDetalle(d));
    return () => {
      vivo = false;
    };
  }, [fila.itemId, fila.editadoEn]);
  const correr = (accion: () => Promise<{ error?: string }>, ok: string, despues?: () => void) =>
    empezar(async () => {
      const r = await accion();
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(ok, "success");
      despues?.();
      await cargar();
      router.refresh();
    });
  const dato = (titulo: string, valor: string | null) =>
    valor ? (
      <div className="grid grid-cols-[96px_1fr] gap-2 border-b border-border/50 py-1.5 text-[13px]">
        <span className="text-xs font-semibold text-muted-foreground">{titulo}</span>
        <span className="whitespace-normal">{valor}</span>
      </div>
    ) : null;
  const tieneReparto = !!(fila.retirar || fila.enviar || fila.tipos.some((t) => ["cambio", "complemento", "faltante", "retiro", "envio"].includes(t)));

  return (
    <aside aria-label={fila.nombre} className="flex w-full flex-col gap-4 rounded-2xl border border-border bg-card p-4 min-[1300px]:sticky min-[1300px]:top-4 min-[1300px]:max-h-[calc(100vh-2rem)] min-[1300px]:w-[400px] min-[1300px]:overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <h2 className="m-0 text-base font-bold">{fila.nombre}</h2>
        <button type="button" onClick={alCerrar} className={`rounded-md border border-border px-3 py-1.5 text-sm ${anilloFoco}`}>
          Cerrar
        </button>
      </div>
      <p className="m-0 text-[13px] text-muted-foreground">{[fila.tienda, fila.tipos.join(" + ") || null, fila.estado ?? "sin estado", fila.causa ? `responsable: ${fila.causa}` : null].filter(Boolean).join(" · ")}</p>
      {!fila.ordenId && fila.numero && <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-xs">No se encontró el pedido {fila.numero} en el sistema: revisa el número y la tienda.</p>}

      <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        Encargado
        <select
          value={fila.responsableId ?? ""}
          disabled={!puedeEscribir || ocupado}
          onChange={(e) => correr(() => cambiarCaso(fila.itemId, "responsable", e.target.value), "Encargado guardado.")}
          className={`${fieldClass} flex-1 font-normal`}
        >
          <option value="">{fila.responsable && !fila.responsableId ? fila.responsable : "Sin encargado"}</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>

      <section aria-label="La solicitud">
        {dato("Pedido", fila.numero)}
        {dato("Retirar", fila.retirar)}
        {dato("Enviar", fila.enviar)}
        {dato("Reembolsar", fila.reembolso !== null ? plata(fila.reembolso) : null)}
        {dato("Motivo", fila.motivo)}
        {dato("Envío", fila.costoEnvio)}
        {dato("Observación", fila.observacion)}
        {dato("Seguimiento", fila.seguimiento)}
      </section>

      {tieneReparto && (
        <section aria-labelledby="t-desp" className="flex flex-col gap-2 rounded-xl border border-primario/30 bg-primario-suave/40 p-3">
          <h3 id="t-desp" className="m-0 text-[13px] font-semibold">
            Envíos Delivery
          </h3>
          {detalle?.despacho ? (
            <p className="m-0 text-xs">
              Programada el {diaTexto(detalle.despacho.dia)}
              {detalle.despacho.courier ? ` con ${detalle.despacho.courier}` : ""} · {detalle.despacho.estado ?? "sin estado"}. Al marcarla ENTREGADO, esta solicitud pasa a Hecho sola.{" "}
              <Link href="/despacho-ciudad" className="font-medium text-primario underline underline-offset-2">
                Ver en Envíos Delivery
              </Link>
            </p>
          ) : puedeEscribir ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Día del reparto
                <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={fieldClass} />
              </label>
              <button type="button" disabled={ocupado || !dia} onClick={() => correr(() => programarEnDespacho(fila.itemId, dia), "Programada en Envíos Delivery.")} className={`boton-neon rounded-md px-3 py-2 text-xs font-medium text-white ${anilloFoco}`}>
                Programar en Envíos Delivery
              </button>
            </div>
          ) : (
            <p className="m-0 text-xs text-muted-foreground">{detalle ? "Todavía no está en ningún reparto." : "Cargando…"}</p>
          )}
        </section>
      )}

      {fila.tipos.includes("reembolso") && detalle && (
        <section aria-labelledby="t-cuenta" className="flex flex-col gap-2">
          <h3 id="t-cuenta" className="m-0 text-[13px] font-semibold">
            Datos para el reembolso
          </h3>
          {detalle.cuenta === undefined ? (
            <p className="m-0 text-xs text-muted-foreground">{detalle.hayCuenta ? "Hay datos guardados: solo los ve Finanzas." : "Sin datos guardados. Solo Finanzas los ve y los escribe."}</p>
          ) : (
            <>
              <textarea
                value={cuenta ?? detalle.cuenta ?? ""}
                onChange={(e) => setCuenta(e.target.value)}
                readOnly={!puedeEscribir}
                rows={3}
                maxLength={1000}
                aria-label="Titular, banco y cuenta"
                placeholder="Titular, banco, tipo y número de cuenta (o Yappy)"
                className={`${fieldClass} resize-y`}
              />
              <p className="m-0 text-[11px] text-muted-foreground">Solo lo ve quien tiene el permiso. Se borra solo cuando la solicitud pasa a Hecho.</p>
              {puedeEscribir && cuenta !== null && cuenta !== (detalle.cuenta ?? "") && (
                <button type="button" disabled={ocupado} onClick={() => correr(() => guardarCuentaCaso(fila.itemId, cuenta), "Datos guardados.", () => setCuenta(null))} className={`self-start rounded-md border border-border px-3 py-1.5 text-xs font-medium ${anilloFoco}`}>
                  Guardar datos
                </button>
              )}
            </>
          )}
        </section>
      )}

      <section aria-labelledby="t-adj" className="flex flex-col gap-2">
        <h3 id="t-adj" className="m-0 text-[13px] font-semibold">
          Adjunto
        </h3>
        {detalle?.adjuntos.length ? (
          <VisorArchivos archivos={detalle.adjuntos} titulo="Adjunto" />
        ) : (
          <p className="m-0 text-xs text-muted-foreground">{detalle ? "Sin adjunto." : "Cargando…"}</p>
        )}
        {puedeEscribir && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const datos = new FormData(e.currentTarget);
              correr(() => subirAdjuntoCaso(fila.itemId, datos), "Adjunto subido.", () => {
                if (archivo.current) archivo.current.value = "";
              });
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <label className="text-xs text-muted-foreground">
              <span className="sr-only">Foto o PDF</span>
              <input ref={archivo} type="file" name="archivo" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" required className="max-w-[14rem] text-xs" />
            </label>
            <button type="submit" disabled={ocupado} className={`rounded-md border border-border px-3 py-1.5 text-xs font-medium ${anilloFoco}`}>
              Subir
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby="t-notas" className="flex flex-col gap-2">
        <h3 id="t-notas" className="m-0 text-[13px] font-semibold">
          Actualizaciones
        </h3>
        {puedeEscribir && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              correr(() => comentarCaso(fila.itemId, texto), "Actualización publicada.", () => setTexto(""));
            }}
            className="flex flex-col gap-1.5"
          >
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Escribe una actualización
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={3000} className={`${fieldClass} resize-y`} />
            </label>
            <button type="submit" disabled={ocupado || !texto.trim()} className={`boton-neon self-start rounded-md px-3 py-1.5 text-xs font-medium text-white ${anilloFoco}`}>
              Publicar
            </button>
          </form>
        )}
        {detalle?.solicitud && (
          <div className="rounded-lg border border-border/70 bg-muted/40 p-2.5 text-[13px]">
            <div className="text-xs font-semibold">La solicitud</div>
            <p className="m-0 mt-1 whitespace-pre-line">{detalle.solicitud}</p>
          </div>
        )}
        {detalle?.notas.map((n) => (
          <div key={n.id} className="rounded-lg border border-border/70 p-2.5 text-[13px]">
            <div className="text-xs font-semibold">
              {n.autor} <span className="font-normal text-muted-foreground">· <FechaHora iso={n.cuando} /></span>
            </div>
            <p className="m-0 mt-1 whitespace-pre-line">{n.texto}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="t-act" className="flex flex-col gap-1">
        <h3 id="t-act" className="m-0 text-[13px] font-semibold">
          Registro de actividad
        </h3>
        {detalle?.actividad.length ? (
          detalle.actividad.map((a) => (
            <p key={a.id} className="m-0 border-b border-border/50 py-1 text-xs">
              {a.texto} <span className="text-muted-foreground">· {a.autor}, <FechaHora iso={a.cuando} /></span>
            </p>
          ))
        ) : (
          <p className="m-0 text-xs text-muted-foreground">{fila.origen === "monday" && !fila.editadoEn ? "Viene de Monday: todavía no se cambió en el sistema." : "Sin cambios registrados."}</p>
        )}
      </section>

      {puedeArchivar && (
        <section className="flex flex-col gap-2 border-t border-border pt-3" aria-label={archivada ? "Restaurar" : "Archivar"}>
          {archivada ? (
            <button type="button" disabled={ocupado} onClick={() => correr(() => restaurarCaso(fila.itemId), "Solicitud restaurada.", alCerrar)} className={`boton-neon self-start rounded-md px-3 py-1.5 text-xs font-medium text-white ${anilloFoco}`}>
              Restaurar al tablero
            </button>
          ) : confirmar ? (
            <>
              <p className="m-0 text-xs">¿Archivar esta solicitud? Sale del tablero; no se borra y la puedes restaurar desde «Archivados».</p>
              <div className="flex gap-2">
                <button type="button" disabled={ocupado} onClick={() => correr(() => archivarCaso(fila.itemId), "Solicitud archivada.", alCerrar)} className={`rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white ${anilloFoco}`}>
                  Sí, archivar
                </button>
                <button type="button" onClick={() => setConfirmar(false)} className={`rounded-md border border-border px-3 py-1.5 text-xs ${anilloFoco}`}>
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmar(true)} className={`self-start rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground-soft hover:bg-muted ${anilloFoco}`}>
              Archivar solicitud
            </button>
          )}
        </section>
      )}
    </aside>
  );
}
