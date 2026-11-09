"use client";

import { useEffect, useState, useTransition } from "react";
import { fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { MOTIVOS_FALLO } from "@/lib/ventas/operacion";
import type { DatosPipeline } from "@/lib/ventas/cargar-pipeline";
import { cambiarFase } from "../pipeline/actions";
import { botonPrimario, botonSecundario, SiguientePaso, type AccionFicha } from "../pipeline/operacion-ui";
import { obtenerPasoOrden, type PasoOrden } from "./paso-actions";

type Estado = { error: string } | { sinCiclo: true; puedeEscribir: boolean } | PasoOrden;

/** «Siguiente paso» dentro de la ficha de Órdenes: confirmar, elegir con quién se envía, despachar, entregar, fallar o cancelar. */
export function PasoOrdenFicha({ id, alCambiar }: { id: string; alCambiar: () => void }) {
  const [estado, setEstado] = useState<{ id: string; e: Estado } | null>(null);
  const [version, setVersion] = useState(0);
  const [accion, setAccion] = useState<AccionFicha | null>(null);
  const [motivo, setMotivo] = useState("");
  const [codigo, setCodigo] = useState("no_contesta");
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();

  useEffect(() => {
    let vigente = true;
    setAccion(null);
    setMotivo("");
    obtenerPasoOrden(id).then((e) => vigente && setEstado({ id, e }));
    return () => { vigente = false; };
  }, [id, version]);

  const e = estado?.id === id ? estado.e : null;
  if (!e) return <p className="text-sm text-muted-foreground">Cargando el siguiente paso…</p>;
  if ("error" in e) return <p className="text-sm text-destructive">{e.error}</p>;
  if ("sinCiclo" in e) return <p className="text-sm text-muted-foreground">Esta orden es anterior al ciclo de órdenes: no se mueve desde aquí.</p>;

  const refrescar = () => { setVersion((v) => v + 1); alCambiar(); };
  const ejecutar = (f: () => Promise<{ error: string } | { ok: true; aviso?: string }>, ok: string, alTerminar?: () => void) =>
    empezar(async () => {
      const r = await f();
      if ("error" in r) mostrarToast(r.error, "destructive");
      else { mostrarToast(r.aviso ?? ok, "success"); alTerminar?.(); refrescar(); }
    });
  const datos = { mensajeros: e.mensajeros, transportistas: e.transportistas } as unknown as DatosPipeline;
  const o = e.orden;

  const confirmarAccion = () => {
    if (accion === "entregar") return ejecutar(() => cambiarFase(o.id, "entregada", {}), "Orden entregada");
    if (accion === "fallo") return ejecutar(() => cambiarFase(o.id, "fallida", { motivoCodigo: codigo, motivo: motivo.trim() || null }), "Intento fallido anotado");
    const fase = accion === "devuelta" ? "devuelta" : "cancelada";
    return ejecutar(() => cambiarFase(o.id, fase, { motivo: motivo.trim() }), fase === "devuelta" ? "Orden devuelta" : "Orden cancelada");
  };

  if (accion) {
    const titulo = { entregar: "Marcar como entregada", fallo: "No se pudo entregar", devuelta: "Marcar como devuelta", cancelar: "Cancelar la orden" }[accion];
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{titulo}</p>
        {accion === "entregar" && <p className="text-sm text-muted-foreground">{o.codEsperado ? `Se registra cobrado el monto esperado ($${o.codEsperado.toFixed(2)}). Si cobró otra cosa, usá el Pipeline.` : "Se registra como entregada."}</p>}
        {accion === "fallo" && (
          <label className="flex flex-col gap-1 text-sm"><span>Motivo *</span>
            <select className={fieldClass} value={codigo} onChange={(ev) => setCodigo(ev.target.value)}>{MOTIVOS_FALLO.map((m) => <option key={m.codigo} value={m.codigo}>{m.etiqueta}</option>)}</select>
          </label>
        )}
        {accion !== "entregar" && (
          <label className="flex flex-col gap-1 text-sm"><span>{accion === "fallo" ? "Detalle (opcional)" : "Motivo *"}</span>
            <textarea className={fieldClass} rows={2} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} />
          </label>
        )}
        <div className="flex gap-2">
          <button className={botonPrimario} disabled={pendiente || (accion !== "entregar" && accion !== "fallo" && !motivo.trim())} onClick={confirmarAccion}>Confirmar</button>
          <button className={botonSecundario} disabled={pendiente} onClick={() => setAccion(null)}>Volver</button>
        </div>
      </div>
    );
  }
  return <SiguientePaso key={`${o.id}-${o.fase}`} orden={o} datos={datos} puedeEscribir={e.puedeEscribir} pendiente={pendiente} ejecutar={ejecutar} alAccion={setAccion} sugerencia={e.sugerencia} />;
}
