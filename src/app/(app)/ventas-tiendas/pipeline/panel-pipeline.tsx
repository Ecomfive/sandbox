"use client";

import { EscanearCodigo } from "./escanear-codigo";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero2, entero } from "@/lib/af4/formato";
import { fieldClass } from "@/components/ui/field";
import { ETIQUETA_FASE, SIGUIENTE, DIAS_PLAZO_REMESA, porMensajero, repartirRemesa, resumenCod, type Fase } from "@/lib/ventas/ciclo";
import type { DatosPipeline, OrdenPipeline } from "@/lib/ventas/cargar-pipeline";
import type { DatosOperacion } from "@/lib/ventas/cargar-operacion";
import { saludConexion } from "@/lib/ventas/shopify-webhook";
import { cambiarFase, confirmarVarias, conectarTienda, desconectarTienda, despacharVarias, registrarRemesa, sincronizarTiendaAhora } from "./actions";
import { asignarConfirmacion } from "./operacion-actions";
import { botonPrimario, botonSecundario, Cuadro, FichaOrden, FormAsignar, FormEntregaCompleta, FormFallo, FormReasignar, Insignias, PanelControl } from "./operacion-ui";

type Pestana = "por_confirmar" | "confirmada" | "camino" | "plata" | "tiendas" | "control";
const TONO: Record<Fase, Tone> = { por_confirmar: "warning", confirmada: "info", despachada: "azul", fallida: "destructive", entregada: "success", devuelta: "warning", cancelada: "destructive" };
const PAISES = [
  { v: "PA", n: "Panamá" },
  { v: "CR", n: "Costa Rica" },
  { v: "MX", n: "México" },
];

type Dialogo =
  | { tipo: "confirmar"; orden: OrdenPipeline }
  | { tipo: "despachar"; orden: OrdenPipeline }
  | { tipo: "entregar"; orden: OrdenPipeline }
  | { tipo: "motivo"; orden: OrdenPipeline; fase: "fallida" | "devuelta" | "cancelada" }
  | { tipo: "remesa"; clave: string }
  | { tipo: "ficha"; orden: OrdenPipeline }
  | { tipo: "reasignar"; orden: OrdenPipeline }
  | { tipo: "fallo"; orden: OrdenPipeline }
  | { tipo: "asignar" }
  | { tipo: "lote" }
  | null;

export function PanelPipeline({ datos, op, puedeEscribir }: { datos: DatosPipeline; op: DatosOperacion; puedeEscribir: boolean }) {
  const [pestana, setPestana] = useState<Pestana>(datos.ordenes.some((o) => o.fase === "por_confirmar") ? "por_confirmar" : "camino");
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();

  const nombreMensajero = (id: string | null, t: string | null) => (id ? (datos.mensajeros.find((m) => m.id === id)?.nombre ?? "Mensajero") : (t ?? "Sin asignar"));
  const por = (f: Fase[]) => datos.ordenes.filter((o) => f.includes(o.fase));
  const porConfirmar = por(["por_confirmar"]);
  const confirmadas = por(["confirmada"]);
  const enCamino = por(["despachada", "fallida"]);
  const cod = resumenCod(datos.saldos);
  const grupos = useMemo(() => porMensajero(datos.saldos, nombreMensajero), [datos.saldos]); // eslint-disable-line react-hooks/exhaustive-deps

  const [q, setQ] = useState("");
  const buscar = (a: OrdenPipeline[]) => {
    const t = q.trim().toLowerCase().replace(/^#/, "");
    return t ? a.filter((o) => `${o.numero} ${o.productos} ${o.guia ?? ""} ${o.tienda}`.toLowerCase().includes(t)) : a;
  };
  // La pestaña vive en la dirección (?tab=) para poder volver a ella o compartirla.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && ["por_confirmar", "confirmada", "camino", "plata", "tiendas", "control"].includes(t)) setPestana(t as Pestana);
  }, []);
  const elegirPestana = (id: Pestana) => {
    setPestana(id);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", id);
    window.history.replaceState(null, "", u);
  };

  const ejecutar = (f: () => Promise<{ error: string } | { ok: true; aviso?: string }>, ok: string, alTerminar?: () => void, mantener?: boolean) =>
    empezar(async () => {
      const r = await f();
      if ("error" in r) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(r.aviso ?? ok, "success");
        alTerminar?.();
        // Guardar un contacto, una nota o un aviso desde la ficha no la cierra: se sigue trabajando ahí.
        if (!mantener) setDialogo(null);
        setMarcadas(new Set());
      }
    });

  const pestanas: { id: Pestana; etiqueta: string; n: number | string }[] = [
    { id: "por_confirmar", etiqueta: "Por confirmar", n: porConfirmar.length },
    { id: "confirmada", etiqueta: "Por despachar", n: confirmadas.length },
    { id: "camino", etiqueta: "En camino", n: enCamino.length },
    { id: "plata", etiqueta: "Plata por devolver", n: dinero2(cod.porDevolver) },
    { id: "tiendas", etiqueta: "Tiendas conectadas", n: datos.tiendas.filter((t) => t.activa).length },
    { id: "control", etiqueta: "Control", n: op.aprobaciones.length + op.devueltasPorRecibir.length + op.incidencias.length },
  ];
  const personas = useMemo(() => [...new Set(Object.values(op.extra).map((e) => e.asignadaA).filter((x): x is string => !!x))], [op.extra]);

  return (
    <>
      <section aria-label="Resumen del ciclo" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-5">
        <Dato titulo="Por confirmar" valor={entero(porConfirmar.length)} punto={porConfirmar.some((o) => o.horas > 24) ? "bg-warning" : null} />
        <Dato titulo="Por despachar" valor={entero(confirmadas.length)} />
        <Dato titulo="En camino" valor={entero(enCamino.length)} punto={enCamino.some((o) => o.fase === "fallida") ? "bg-destructive" : null} />
        <Dato titulo="Plata con mensajeros" valor={dinero2(cod.porDevolver)} sub={`${entero(cod.ordenes)} órdenes`} punto={cod.vencido > 0 ? "bg-destructive" : null} />
        <Dato titulo={`Con más de ${DIAS_PLAZO_REMESA} días`} valor={dinero2(cod.vencido)} sub={cod.diferencia > 0 ? `Faltante por aclarar ${dinero2(cod.diferencia)}` : undefined} punto={cod.vencido > 0 ? "bg-destructive" : null} />
      </section>

      <div role="tablist" aria-label="Fases" className="flex flex-wrap gap-1 border-b border-border">
        {pestanas.map((p) => (
          <button key={p.id} role="tab" aria-selected={pestana === p.id} onClick={() => elegirPestana(p.id)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${pestana === p.id ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {p.etiqueta} <span className="tabular-nums text-muted-foreground">{p.n}</span>
          </button>
        ))}
      </div>

      {["por_confirmar", "confirmada", "camino"].includes(pestana) && (
        <div className="flex max-w-xl items-center gap-2">
          <input type="search" aria-label="Buscar orden" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por número, producto, guía o tienda" className={`${fieldClass} max-w-md`} />
          <EscanearCodigo alLeer={(t) => setQ(t.replace(/^#/, ""))} />
        </div>
      )}

      {pestana === "por_confirmar" && (
        <>
          {puedeEscribir && porConfirmar.length > 0 && (
            <div className="flex items-center gap-3">
              <button className={botonSecundario} disabled={pendiente || !marcadas.size} onClick={() => ejecutar(() => confirmarVarias([...marcadas]), "Confirmadas")}>
                Confirmar marcadas ({marcadas.size})
              </button>
              <button className={botonSecundario} disabled={pendiente || !marcadas.size} onClick={() => setDialogo({ tipo: "asignar" })}>Repartir marcadas ({marcadas.size})</button>
            </div>
          )}
          <TablaOrdenes
            op={op}
            alAbrir={(o) => setDialogo({ tipo: "ficha", orden: o })}
            filas={buscar(porConfirmar)}
            vacio="No hay órdenes esperando confirmación."
            marcadas={puedeEscribir ? marcadas : undefined}
            alMarcar={setMarcadas}
            acciones={(o) =>
              puedeEscribir && (
                <>
                  <button className={botonPrimario} onClick={() => setDialogo({ tipo: "confirmar", orden: o })}>Confirmar</button>
                  <button className={botonSecundario} onClick={() => setDialogo({ tipo: "motivo", orden: o, fase: "cancelada" })}>Cancelar</button>
                </>
              )
            }
          />
        </>
      )}
      {pestana === "confirmada" && puedeEscribir && confirmadas.length > 0 && (
        <div className="flex items-center gap-3"><button className={botonSecundario} disabled={pendiente || !marcadas.size} onClick={() => setDialogo({ tipo: "lote" })}>Despachar marcadas ({marcadas.size})</button></div>
      )}
      {pestana === "confirmada" && (
        <TablaOrdenes
            op={op}
            alAbrir={(o) => setDialogo({ tipo: "ficha", orden: o })}
          marcadas={puedeEscribir ? marcadas : undefined}
          alMarcar={setMarcadas}
          filas={buscar(confirmadas)}
          vacio="No hay órdenes confirmadas por despachar."
          envio={(o) => nombreMensajero(o.repartidorId, o.transportista)}
          acciones={(o) =>
            puedeEscribir && (
              <>
                <button className={botonPrimario} onClick={() => setDialogo({ tipo: "despachar", orden: o })}>Despachar</button>
                <button className={botonSecundario} onClick={() => setDialogo({ tipo: "reasignar", orden: o })}>Reasignar</button>
                <button className={botonSecundario} onClick={() => setDialogo({ tipo: "motivo", orden: o, fase: "cancelada" })}>Cancelar</button>
              </>
            )
          }
        />
      )}
      {pestana === "camino" && (
        <TablaOrdenes
            op={op}
            alAbrir={(o) => setDialogo({ tipo: "ficha", orden: o })}
          filas={buscar(enCamino)}
          vacio="No hay órdenes en camino."
          envio={(o) => nombreMensajero(o.repartidorId, o.transportista) + (o.guia ? ` · ${o.guia}` : "")}
          acciones={(o) =>
            puedeEscribir &&
            (o.fase === "fallida" ? (
              <>
                <button className={botonPrimario} onClick={() => setDialogo({ tipo: "despachar", orden: o })}>Reprogramar</button>
                <button className={botonSecundario} onClick={() => setDialogo({ tipo: "motivo", orden: o, fase: "devuelta" })}>Devuelta</button>
              </>
            ) : (
              <>
                <button className={botonPrimario} onClick={() => setDialogo({ tipo: "entregar", orden: o })}>Entregada</button>
                <button className={botonSecundario} onClick={() => setDialogo({ tipo: "fallo", orden: o })}>No se pudo</button>
                <button className={botonSecundario} onClick={() => setDialogo({ tipo: "motivo", orden: o, fase: "devuelta" })}>Devuelta</button>
              </>
            ))
          }
        />
      )}
      {pestana === "plata" && (
        <section className="flex flex-col gap-4">
          <div className="flex justify-end">
            <a href="/api/ventas/reporte-cod" download className={botonSecundario}>Descargar efectivo pendiente (CSV)</a>
          <a href="/api/ventas/embudo" download className={botonSecundario}>Descargar embudo (CSV)</a>
          {datos.mensajeros.filter((m) => datos.ordenes.some((o) => o.fase === "despachada" && o.repartidorId === m.id)).map((m) => (
            <a key={m.id} href={`/ventas-tiendas/imprimir?mensajero=${m.id}`} target="_blank" rel="noreferrer" className={botonSecundario}>Hoja de ruta · {m.nombre}</a>
          ))}
          <a href="/api/ventas/desempeno-envio" download className={botonSecundario}>Descargar desempeño de envíos (CSV)</a>
          <a href="/api/ventas/motivos-fallo" download className={botonSecundario}>Descargar motivos de fallo (CSV)</a>
          <a href="/api/ventas/estancadas" download className={botonSecundario}>Descargar órdenes estancadas (CSV)</a>
        <a href="/api/ventas/margen-ordenes" download className={botonSecundario}>Descargar margen por orden (CSV)</a>
        <a href="/api/ventas/antiguedad-efectivo" download className={botonSecundario}>Descargar antigüedad del efectivo (CSV)</a>
        <a href="/api/ventas/proyeccion-caja" download className={botonSecundario}>Descargar proyección de caja (CSV)</a>
        <a href="/api/ventas/resumen-tiendas" download className={botonSecundario}>Descargar resumen por tienda (CSV)</a>
        <a href="/api/ventas/productos-vendidos" download className={botonSecundario}>Descargar productos vendidos (CSV)</a>
        <a href="/api/ventas/ventas-por-dia" download className={botonSecundario}>Descargar ventas por día (CSV)</a>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-3 py-2">Mensajero / transportadora</th><th className="px-3 py-2 text-right">Órdenes</th><th className="px-3 py-2 text-right">Días del más viejo</th><th className="px-3 py-2 text-right">Debe devolver</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody>
                {grupos.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nadie tiene plata pendiente de devolver.</td></tr>}
                {grupos.map((g) => (
                  <tr key={g.clave} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{g.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.ordenes}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.maxDias > DIAS_PLAZO_REMESA ? <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-destructive" />{g.maxDias}</span> : g.maxDias}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dinero2(g.monto)}</td>
                    <td className="px-3 py-2 text-right"><a href={`/api/ventas/estado-cuenta?${g.repartidorId ? `r=${g.repartidorId}` : `t=${encodeURIComponent(g.transportista ?? "")}`}`} download className="mr-2 text-xs underline">Estado de cuenta</a>{puedeEscribir && <button className={botonPrimario} onClick={() => setDialogo({ tipo: "remesa", clave: g.clave })}>Registrar remesa</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {pestana === "control" && <PanelControl datos={datos} op={op} puedeEscribir={puedeEscribir} pendiente={pendiente} ejecutar={ejecutar} />}
      {pestana === "tiendas" && <Tiendas datos={datos} pendiente={pendiente} alConectar={(d) => ejecutar(() => conectarTienda(d), "Tienda conectada")} alDesconectar={(id) => ejecutar(() => desconectarTienda(id), "Tienda desconectada")} alSincronizar={(id, dias) => ejecutar(() => sincronizarTiendaAhora(id, dias), dias ? "Huecos rellenados" : "Tienda sincronizada")} />}

      {dialogo?.tipo === "confirmar" && (
        <FormEnvio titulo={`Confirmar ${dialogo.orden.numero}`} orden={dialogo.orden} datos={datos} exigir={false} boton="Confirmar orden" pendiente={pendiente} alCerrar={() => setDialogo(null)}
          alEnviar={(v) => ejecutar(() => cambiarFase(dialogo.orden.id, "confirmada", v), "Orden confirmada")} />
      )}
      {dialogo?.tipo === "despachar" && (
        <FormEnvio titulo={`Despachar ${dialogo.orden.numero}`} orden={dialogo.orden} datos={datos} exigir boton="Despachar" conGuia pendiente={pendiente} alCerrar={() => setDialogo(null)}
          alEnviar={(v) => ejecutar(() => cambiarFase(dialogo.orden.id, "despachada", v), "Orden despachada")} />
      )}
      {dialogo?.tipo === "entregar" && <FormEntregaCompleta orden={dialogo.orden} pendiente={pendiente} alCerrar={() => setDialogo(null)} alEnviar={(d) => ejecutar(() => cambiarFase(dialogo.orden.id, "entregada", d), "Orden entregada")} />}
      {dialogo?.tipo === "fallo" && <FormFallo orden={dialogo.orden} pendiente={pendiente} alCerrar={() => setDialogo(null)} alEnviar={(d) => ejecutar(() => cambiarFase(dialogo.orden.id, "fallida", d), "Intento registrado")} />}
      {dialogo?.tipo === "ficha" && (() => {
        // La ficha muestra siempre la orden con su estado de ahora (al confirmar o despachar cambia de fase y de pestaña).
        const actual = datos.ordenes.find((o) => o.id === dialogo.orden.id) ?? dialogo.orden;
        const lista = datos.ordenes.filter((o) => (pestana === "por_confirmar" ? o.fase === "por_confirmar" : pestana === "confirmada" ? o.fase === "confirmada" : pestana === "camino" ? o.fase === "despachada" || o.fase === "fallida" : true));
        const i = lista.findIndex((o) => o.id === actual.id);
        const ir = (d: number) => { const n = lista[i + d]; if (n) setDialogo({ tipo: "ficha", orden: n }); };
        const flecha = "rounded-md border border-border-control px-2 py-1 text-xs hover:bg-muted disabled:opacity-40";
        return (
          <FichaOrden orden={actual} x={op.extra[actual.id]} datos={datos} umbrales={op.umbrales} puedeEscribir={puedeEscribir} pendiente={pendiente} ejecutar={ejecutar} alCerrar={() => setDialogo(null)}
            alAccion={(a) => setDialogo(a === "entregar" ? { tipo: "entregar", orden: actual } : a === "fallo" ? { tipo: "fallo", orden: actual } : { tipo: "motivo", orden: actual, fase: a === "devuelta" ? "devuelta" : "cancelada" })}
            navegacion={i >= 0 ? <span className="flex items-center gap-1"><button className={flecha} disabled={i <= 0} onClick={() => ir(-1)} aria-label="Orden anterior">←</button><button className={flecha} disabled={i >= lista.length - 1} onClick={() => ir(1)} aria-label="Orden siguiente">→</button></span> : undefined} />
        );
      })()}
      {dialogo?.tipo === "reasignar" && <FormReasignar orden={dialogo.orden} x={op.extra[dialogo.orden.id]} datos={datos} pendiente={pendiente} ejecutar={ejecutar} alCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === "asignar" && <FormAsignar cantidad={marcadas.size} personas={personas} pendiente={pendiente} alCerrar={() => setDialogo(null)} alEnviar={(p) => ejecutar(() => asignarConfirmacion([...marcadas], p), "Órdenes repartidas")} />}
      {dialogo?.tipo === "lote" && (
        <FormEnvio titulo={`Despachar ${marcadas.size} órdenes`} orden={{ ...confirmadas[0], productos: "Se aplica a todas las órdenes marcadas.", codEsperado: null, guia: null }} datos={datos} exigir boton="Despachar todas" pendiente={pendiente} alCerrar={() => setDialogo(null)}
          alEnviar={(v) => ejecutar(() => despacharVarias([...marcadas], { repartidorId: v.repartidorId, transportista: v.transportista }), "Órdenes despachadas")} />
      )}
      {dialogo?.tipo === "motivo" && (
        <FormMotivo orden={dialogo.orden} fase={dialogo.fase} pendiente={pendiente} alCerrar={() => setDialogo(null)} alEnviar={(m) => ejecutar(() => cambiarFase(dialogo.orden.id, dialogo.fase, { motivo: m }), "Listo")} />
      )}
      {dialogo?.tipo === "remesa" && (() => {
        const g = grupos.find((x) => x.clave === dialogo.clave);
        if (!g) return null;
        const saldos = datos.saldos.filter((s) => (g.repartidorId ? s.repartidorId === g.repartidorId : !s.repartidorId && (s.transportista ?? "—").toUpperCase() === (g.transportista ?? "—").toUpperCase()));
        return <FormRemesa grupo={g} saldos={saldos} cuentas={datos.puedeLibro ? datos.cuentas : []} pendiente={pendiente} alCerrar={() => setDialogo(null)} alEnviar={(d) => ejecutar(() => registrarRemesa({ repartidorId: g.repartidorId, transportista: g.transportista, ...d }), "Remesa registrada")} />;
      })()}
    </>
  );
}

function Dato({ titulo, valor, sub, punto }: { titulo: string; valor: string; sub?: string; punto?: string | null }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">{punto && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${punto}`} />}{titulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function TablaOrdenes({ filas, vacio, acciones, envio, marcadas, alMarcar, op, alAbrir }: {
  op: DatosOperacion; alAbrir: (o: OrdenPipeline) => void;
  filas: OrdenPipeline[]; vacio: string; acciones: (o: OrdenPipeline) => React.ReactNode; envio?: (o: OrdenPipeline) => string;
  marcadas?: Set<string>; alMarcar?: (s: Set<string>) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {marcadas && alMarcar && (
              <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Marcar todas" checked={filas.length > 0 && filas.every((o) => marcadas.has(o.id))} onChange={(e) => alMarcar(e.target.checked ? new Set(filas.map((o) => o.id)) : new Set())} /></th>
            )}
            <th className="px-3 py-2">Orden</th><th className="px-3 py-2">Tienda</th><th className="px-3 py-2">Productos</th><th className="px-3 py-2">Pago</th>
            {envio && <th className="px-3 py-2">Envía</th>}<th className="px-3 py-2">Estado</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">{vacio}</td></tr>}
          {filas.map((o) => (
            <tr key={o.id} className="cursor-pointer border-t border-border align-top hover:bg-muted/40" onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a, input, select, textarea, label")) alAbrir(o); }}>
              {marcadas && alMarcar && (
                <td className="px-3 py-2"><input type="checkbox" aria-label={`Marcar ${o.numero}`} checked={marcadas.has(o.id)} onChange={(e) => { const s = new Set(marcadas); if (e.target.checked) s.add(o.id); else s.delete(o.id); alMarcar(s); }} /></td>
              )}
              <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums"><button className="underline-offset-2 hover:underline" onClick={() => alAbrir(o)}>{o.numero}</button><span className="block text-xs font-normal text-muted-foreground">{fechaCorta(o.fecha)}{op.extra[o.id]?.asignadaA ? ` · ${op.extra[o.id].asignadaA}` : ""}</span><Insignias o={o} x={op.extra[o.id]} umbrales={op.umbrales} /></td>
              <td className="whitespace-nowrap px-3 py-2">{o.tienda}<span className="block text-xs text-muted-foreground">{o.pais}</span></td>
              <td className="max-w-sm px-3 py-2"><span className="line-clamp-2">{o.productos}</span></td>
              <td className="whitespace-nowrap px-3 py-2">{o.codEsperado ? "Contra entrega" : o.metodo ?? "—"}</td>
              {envio && <td className="whitespace-nowrap px-3 py-2">{envio(o)}</td>}
              <td className="px-3 py-2"><Badge tone={TONO[o.fase]}>{ETIQUETA_FASE[o.fase]}</Badge>{o.motivoFallo && o.fase === "fallida" && <span className="mt-1 block text-xs text-muted-foreground">{o.motivoFallo}</span>}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{dinero2(o.total)}</td>
              <td className="whitespace-nowrap px-3 py-2"><div className="flex justify-end gap-2">{acciones(o)}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormEnvio({ titulo, orden, datos, exigir, conGuia, boton, pendiente, alCerrar, alEnviar }: {
  titulo: string; orden: OrdenPipeline; datos: DatosPipeline; exigir: boolean; conGuia?: boolean; boton: string; pendiente: boolean; alCerrar: () => void;
  alEnviar: (v: { repartidorId: string | null; transportista: string | null; guia: string | null }) => void;
}) {
  const inicial = orden.repartidorId ? `r:${orden.repartidorId}` : orden.transportista ? `t:${orden.transportista}` : "";
  const [con, setCon] = useState(inicial);
  const [guia, setGuia] = useState(orden.guia ?? "");
  const falta = exigir && !con;
  return (
    <Cuadro titulo={titulo} alCerrar={alCerrar}>
      <p className="text-sm text-muted-foreground">{orden.productos}</p>
      {orden.codEsperado ? <p className="text-sm">Contra entrega: el mensajero debe cobrar <strong className="tabular-nums">{dinero2(orden.codEsperado)}</strong>.</p> : null}
      <label className="flex flex-col gap-1 text-sm">
        <span>¿Con quién se envía?{exigir ? " *" : ""}</span>
        <select className={fieldClass} value={con} onChange={(e) => setCon(e.target.value)}>
          <option value="">{exigir ? "Elige…" : "Lo defino al despachar"}</option>
          <optgroup label="Mensajeros">{datos.mensajeros.map((m) => <option key={m.id} value={`r:${m.id}`}>{m.nombre}</option>)}</optgroup>
          <optgroup label="Transportadoras">{datos.transportistas.map((t) => <option key={t} value={`t:${t}`}>{t}</option>)}</optgroup>
        </select>
      </label>
      {conGuia && (
        <label className="flex flex-col gap-1 text-sm"><span>Número de guía (si hay)</span><input className={fieldClass} value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="Ej: 1234567890" /></label>
      )}
      <div className="flex justify-end gap-2">
        <button className={botonSecundario} onClick={alCerrar}>Cerrar</button>
        <button className={botonPrimario} disabled={pendiente || falta} onClick={() => alEnviar({ repartidorId: con.startsWith("r:") ? con.slice(2) : null, transportista: con.startsWith("t:") ? con.slice(2) : null, guia: guia.trim() || null })}>{boton}</button>
      </div>
    </Cuadro>
  );
}

const TITULO_MOTIVO = { fallida: "No se pudo entregar", devuelta: "Orden devuelta", cancelada: "Cancelar orden" } as const;
function FormMotivo({ orden, fase, pendiente, alCerrar, alEnviar }: { orden: OrdenPipeline; fase: "fallida" | "devuelta" | "cancelada"; pendiente: boolean; alCerrar: () => void; alEnviar: (m: string) => void }) {
  const [m, setM] = useState("");
  return (
    <Cuadro titulo={`${TITULO_MOTIVO[fase]}: ${orden.numero}`} alCerrar={alCerrar}>
      <label className="flex flex-col gap-1 text-sm"><span>Motivo *</span><textarea className={fieldClass} rows={3} value={m} onChange={(e) => setM(e.target.value)} placeholder="Ej: el cliente no contestó" /></label>
      <div className="flex justify-end gap-2">
        <button className={botonSecundario} onClick={alCerrar}>Cerrar</button>
        <button className={botonPrimario} disabled={pendiente || m.trim().length < 3} onClick={() => alEnviar(m.trim())}>Guardar</button>
      </div>
    </Cuadro>
  );
}

function FormRemesa({ grupo, saldos, cuentas, pendiente, alCerrar, alEnviar }: {
  grupo: { nombre: string; monto: number }; saldos: DatosPipeline["saldos"]; cuentas: DatosPipeline["cuentas"]; pendiente: boolean; alCerrar: () => void;
  alEnviar: (d: { fecha: string; referencia: string | null; metodo: string; cuentaId: string | null; ordenes: { orden_id: string; monto: number }[] }) => void;
}) {
  const [monto, setMonto] = useState(grupo.monto.toFixed(2));
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" }));
  const [metodo, setMetodo] = useState("efectivo");
  const [ref, setRef] = useState("");
  const [cuenta, setCuenta] = useState("");
  const reparto = repartirRemesa(saldos, Number(monto) || 0);
  return (
    <Cuadro titulo={`Remesa de ${grupo.nombre}`} alCerrar={alCerrar}>
      <p className="text-sm">Debe devolver <strong className="tabular-nums">{dinero2(grupo.monto)}</strong> de {saldos.length} órdenes. Lo que entregue se aplica primero a las más viejas.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm"><span>Monto entregado *</span><input className={fieldClass} inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej: 120.00" /></label>
        <label className="flex flex-col gap-1 text-sm"><span>Fecha *</span><input type="date" className={fieldClass} value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm"><span>Método</span>
          <select className={fieldClass} value={metodo} onChange={(e) => setMetodo(e.target.value)}><option value="efectivo">Efectivo</option><option value="yappy">Yappy</option><option value="transferencia">Transferencia</option><option value="otro">Otro</option></select>
        </label>
        <label className="flex flex-col gap-1 text-sm"><span>Referencia</span><input className={fieldClass} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ej: comprobante 4521" /></label>
        {cuentas.length > 0 && (
          <label className="col-span-2 flex flex-col gap-1 text-sm"><span>Cuenta donde entró</span>
            <select className={fieldClass} value={cuenta} onChange={(e) => setCuenta(e.target.value)}><option value="">No asentar en el libro</option>{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
          </label>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Cubre {reparto.items.length} órdenes{reparto.sobra > 0 ? ` · sobran ${dinero2(reparto.sobra)}: baja el monto` : Number(monto) < grupo.monto ? ` · quedan ${dinero2(grupo.monto - Number(monto))} por devolver` : ""}.</p>
      <div className="flex justify-end gap-2">
        <button className={botonSecundario} onClick={alCerrar}>Cerrar</button>
        <button className={botonPrimario} disabled={pendiente || !reparto.items.length || reparto.sobra > 0} onClick={() => alEnviar({ fecha, referencia: ref.trim() || null, metodo, cuentaId: cuenta || null, ordenes: reparto.items })}>Registrar remesa</button>
      </div>
    </Cuadro>
  );
}

const salud = (t: DatosPipeline["tiendas"][number]) => saludConexion(t);

function DireccionWebhook() {
  const [url, setUrl] = useState("/api/shopify/webhooks");
  useEffect(() => setUrl(`${window.location.origin}/api/shopify/webhooks`), []);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <code className="break-all rounded bg-muted px-1.5 py-0.5">{url}</code>
      <button type="button" className={botonSecundario} onClick={() => navigator.clipboard?.writeText(url)}>Copiar</button>
    </span>
  );
}

function Tiendas({ datos, pendiente, alConectar, alDesconectar, alSincronizar }: {
  datos: DatosPipeline; pendiente: boolean;
  alConectar: (d: { unidadId?: string; nombre?: string; pais: string; dominio: string; token: string }) => void; alDesconectar: (id: string) => void; alSincronizar: (id: string, dias?: number) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [unidad, setUnidad] = useState("");
  const [nombre, setNombre] = useState("");
  const [pais, setPais] = useState("PA");
  const [dominio, setDominio] = useState("");
  const [token, setToken] = useState("");
  const elegir = (id: string) => { setUnidad(id); const t = datos.tiendas.find((x) => x.unidadId === id); if (t) { setPais(t.pais); if (t.dominio) setDominio(t.dominio); } };
  return (
    <section className="flex flex-col gap-4">
      <details open={!datos.tiendas.some((t) => t.activa)} className="rounded-lg border border-border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium">Cómo conectar una tienda (3 pasos)</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>En Shopify: Configuración › Apps › Desarrollar apps › Crear una app. Dale permisos de lectura de pedidos y productos (<code>read_orders</code>, <code>read_products</code>; si las órdenes de más de 60 días no aparecen, también <code>read_all_orders</code>), instálala y copiá el token de acceso.</li>
          <li>Acá: «Conectar tienda», elegí la tienda y el país, pegá la dirección <code>mi-tienda.myshopify.com</code> y el token. El sistema prueba la conexión antes de guardarla.</li>
          <li>Para que las órdenes entren al instante, en Shopify: Configuración › Notificaciones › Webhooks, creá uno por cada evento de pedido (creación, actualización, cancelación, pago) en formato JSON con esta dirección: <DireccionWebhook /></li>
        </ol>
      </details>
      {datos.puedeConectar && <div><button className={botonPrimario} onClick={() => setAbierta(true)}>Conectar tienda</button></div>}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Tienda</th><th className="px-3 py-2">País</th><th className="px-3 py-2">Shopify</th><th className="px-3 py-2">Última lectura</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {datos.tiendas.map((t) => (
              <tr key={t.unidadId} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{t.nombre}</td>
                <td className="px-3 py-2">{PAISES.find((p) => p.v === t.pais)?.n ?? t.pais}</td>
                <td className="px-3 py-2">{t.activa ? <span className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${salud(t).tono === "error" ? "bg-destructive" : salud(t).tono === "aviso" ? "bg-warning" : "bg-success"}`} />{t.dominio ?? (t.porEnv ? "Por variable del servidor" : "Conectada")}<span className="text-xs text-muted-foreground">· {salud(t).texto}</span></span> : <span className="text-muted-foreground">Sin conectar</span>}{t.error && <span className="block text-xs text-destructive">{t.error}</span>}</td>
                <td className="px-3 py-2 text-muted-foreground">{t.ultimaLectura ? new Date(t.ultimaLectura).toLocaleString("es-PA", { timeZone: "America/Panama" }) : "—"}</td>
                <td className="px-3 py-2 text-right">{datos.puedeConectar && (t.activa && !t.porEnv ? <span className="inline-flex flex-wrap justify-end gap-2"><button className={botonSecundario} disabled={pendiente} onClick={() => alSincronizar(t.unidadId)}>Sincronizar ahora</button><button className={botonSecundario} disabled={pendiente} onClick={() => alSincronizar(t.unidadId, 7)}>Rellenar 7 días</button><button className={botonSecundario} disabled={pendiente} onClick={() => alDesconectar(t.unidadId)}>Desconectar</button></span> : <button className={botonSecundario} onClick={() => { elegir(t.unidadId); setAbierta(true); }}>Conectar</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {abierta && (
        <Cuadro titulo="Conectar tienda con Shopify" alCerrar={() => setAbierta(false)}>
          <label className="flex flex-col gap-1 text-sm"><span>Tienda *</span>
            <select className={fieldClass} value={unidad} onChange={(e) => elegir(e.target.value)}>
              <option value="">Una tienda nueva…</option>
              {datos.tiendas.map((t) => <option key={t.unidadId} value={t.unidadId}>{t.nombre}</option>)}
            </select>
          </label>
          {!unidad && <label className="flex flex-col gap-1 text-sm"><span>Nombre de la tienda nueva *</span><input className={fieldClass} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: MI TIENDA" /></label>}
          <label className="flex flex-col gap-1 text-sm"><span>País *</span>
            <select className={fieldClass} value={pais} onChange={(e) => setPais(e.target.value)}>{PAISES.map((p) => <option key={p.v} value={p.v}>{p.n}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-sm"><span>Dirección de Shopify *</span><input className={fieldClass} value={dominio} onChange={(e) => setDominio(e.target.value)} placeholder="Ej: mi-tienda.myshopify.com" /></label>
          <label className="flex flex-col gap-1 text-sm"><span>Token de acceso de la app *</span><input className={fieldClass} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Ej: shpat_xxxxxxxxxxxxxxxx" /></label>
          <div className="flex justify-end gap-2">
            <button className={botonSecundario} onClick={() => setAbierta(false)}>Cerrar</button>
            <button className={botonPrimario} disabled={pendiente || !dominio.trim() || !token.trim() || (!unidad && !nombre.trim())} onClick={() => { alConectar({ unidadId: unidad || undefined, nombre, pais, dominio, token }); setToken(""); }}>Conectar</button>
          </div>
        </Cuadro>
      )}
    </section>
  );
}
