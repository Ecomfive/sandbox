"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fieldClass } from "@/components/ui/field";
import { dinero2 } from "@/lib/af4/formato";
import { supabase as clienteNavegador } from "@/lib/supabase/client";
import { BUCKET_COMPROBANTES, MAX_BYTES_COMPROBANTE } from "@/lib/ventas/comprobantes";
import { MOTIVOS_FALLO } from "@/lib/ventas/operacion";
import type { DatosMensajero, OrdenEnRuta } from "@/lib/ventas/cargar-mensajero";
import { guardarComprobanteMensajero, marcarEntregada, marcarFallida, prepararSubidaMensajero } from "../actions";

const boton = "min-h-11 rounded-lg px-4 text-sm font-medium disabled:opacity-50";
const primario = `${boton} bg-foreground text-background`;
const secundario = `${boton} border border-border-control bg-card`;

function Tarjeta({ token, o, alTerminar }: { token: string; o: OrdenEnRuta; alTerminar: () => void }) {
  const [modo, setModo] = useState<"entregar" | "fallar" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();
  const [fotos, setFotos] = useState(o.comprobantes);
  const [cobrado, setCobrado] = useState(o.cod === null ? "" : String(o.cod));
  const [motivoDif, setMotivoDif] = useState("");
  const [recibe, setRecibe] = useState("");
  const [doc, setDoc] = useState("");
  const [codigo, setCodigo] = useState("");
  const [motivo, setMotivo] = useState("no_contesta");
  const [nota, setNota] = useState("");
  const [reprog, setReprog] = useState("");

  function enviar(f: () => Promise<{ error: string } | { ok: true; aviso?: string }>) {
    setMsg(null);
    empezar(async () => {
      const r = await f();
      if ("error" in r) setMsg(r.error);
      else { if (r.aviso) setMsg(r.aviso); alTerminar(); }
    });
  }

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    if (archivo.size > MAX_BYTES_COMPROBANTE) { setMsg("La foto pesa más de 8 MB."); return; }
    setMsg("Subiendo foto…");
    const permiso = await prepararSubidaMensajero(token, o.id, archivo.name);
    if ("error" in permiso) { setMsg(permiso.error); return; }
    const { error } = await clienteNavegador.storage.from(BUCKET_COMPROBANTES).uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type });
    if (error) { setMsg("No se pudo subir la foto."); return; }
    const r = await guardarComprobanteMensajero(token, o.id, permiso.ruta, "entrega");
    if ("error" in r) setMsg(r.error);
    else { setFotos((n) => n + 1); setMsg("Foto guardada."); }
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{o.cliente ?? "Cliente"}</p>
          <p className="text-xs text-muted-foreground">#{o.numero}{o.guia ? ` · Guía ${o.guia}` : ""}{o.intentos > 0 ? ` · ${o.intentos} intento(s)` : ""}</p>
        </div>
        {o.cod !== null && o.cod > 0 && <p className="shrink-0 rounded-md bg-muted px-2 py-1 text-sm font-semibold tabular-nums">Cobrar {dinero2(o.cod)}</p>}
      </div>
      {(o.direccion || o.zona) && <p className="mt-2 text-sm">{[o.direccion, o.zona].filter(Boolean).join(" · ")}</p>}
      {o.notas && <p className="mt-1 text-sm text-muted-foreground">{o.notas}</p>}
      {o.productos.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{o.productos.map((p, i) => <li key={i}>{p}</li>)}</ul>}

      {modo === null && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className={primario} onClick={() => setModo("entregar")}>Entregado</button>
          <button className={secundario} onClick={() => setModo("fallar")}>No se pudo</button>
          <label className={`${secundario} col-span-2 flex cursor-pointer items-center justify-center`}>
            {fotos > 0 ? `Foto del comprobante (${fotos}) · agregar otra` : "Foto del comprobante"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void subir(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      )}

      {modo === "entregar" && (
        <div className="mt-3 flex flex-col gap-2">
          {o.cod !== null && (
            <label className="flex flex-col gap-1 text-sm">Cobrado
              <input className={fieldClass} inputMode="decimal" value={cobrado} onChange={(e) => setCobrado(e.target.value)} placeholder="Ej: 25.00" />
            </label>
          )}
          {o.cod !== null && cobrado.trim() !== "" && Number(cobrado) !== o.cod && (
            <label className="flex flex-col gap-1 text-sm">Por qué es distinto
              <input className={fieldClass} value={motivoDif} onChange={(e) => setMotivoDif(e.target.value)} placeholder="Ej: el cliente pagó menos" />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">Quién recibió
            <input className={fieldClass} value={recibe} onChange={(e) => setRecibe(e.target.value)} placeholder="Ej: María Pérez" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Documento (opcional)
            <input className={fieldClass} value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Ej: 8-123-456" />
          </label>
          {o.pideCodigo && (
            <label className="flex flex-col gap-1 text-sm">Código de entrega (lo tiene el cliente)
              <input className={fieldClass} inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej: 4821" />
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button className={secundario} disabled={ocupado} onClick={() => setModo(null)}>Volver</button>
            <button className={primario} disabled={ocupado} onClick={() => enviar(() => marcarEntregada(token, o.id, { cobrado: cobrado.trim() === "" ? undefined : Number(cobrado), motivoDiferencia: motivoDif, recibeNombre: recibe, recibeDocumento: doc, codigo }))}>Confirmar entrega</button>
          </div>
        </div>
      )}

      {modo === "fallar" && (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">Motivo
            <select className={fieldClass} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_FALLO.map((m) => <option key={m.codigo} value={m.codigo}>{m.etiqueta}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">Nota (opcional)
            <input className={fieldClass} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: volver en la tarde" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Reprogramar para (opcional)
            <input className={fieldClass} type="date" value={reprog} onChange={(e) => setReprog(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button className={secundario} disabled={ocupado} onClick={() => setModo(null)}>Volver</button>
            <button className={primario} disabled={ocupado} onClick={() => enviar(() => marcarFallida(token, o.id, { motivoCodigo: motivo, motivo: nota, reprogramadaPara: reprog || undefined }))}>Registrar</button>
          </div>
        </div>
      )}

      {msg && <p className="mt-2 text-sm" role="status">{msg}</p>}
    </li>
  );
}

export function AppMensajero({ token, datos }: { token: string; datos: DatosMensajero }) {
  const router = useRouter();
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold">Hola, {datos.nombre}</h1>
        <p className="text-sm text-muted-foreground">{datos.enRuta.length} en ruta · {datos.entregadasHoy} entregadas hoy · Efectivo en mano {dinero2(datos.efectivoEnMano)}</p>
      </header>
      {datos.enRuta.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No tienes entregas en ruta.</p>
      ) : (
        <ul className="flex flex-col gap-3">{datos.enRuta.map((o) => <Tarjeta key={o.id} token={token} o={o} alTerminar={() => router.refresh()} />)}</ul>
      )}
      <button className={secundario} onClick={() => router.refresh()}>Actualizar</button>
    </main>
  );
}
