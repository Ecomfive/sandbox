"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import type { FaltantesDeNumero } from "@/lib/whatsapp/plantillas-servidor";
import { enviarPlantillaANumero, faltantesParaIgualar } from "./actions";

const boton = `inline-flex min-h-9 items-center rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const botonPrincipal = `inline-flex min-h-9 items-center rounded-md bg-foreground px-3 text-xs font-semibold text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`;

/** Una plantilla que le falta a un número. */
interface Item {
  canal: string;
  numero: string;
  nombre: string;
  idioma: string;
}
type Estado = "espera" | "enviando" | "creada" | "ya estaba" | "error";
interface EnCola {
  item: Item;
  estado: Estado;
  detalle?: string;
}

const claveDe = (i: Item) => `${i.canal}|${i.nombre}|${i.idioma}`;
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const ESTADO_PRINCIPAL: Record<string, { etiqueta: string; tono: Tone }> = {
  pendiente: { etiqueta: "En revisión en el principal", tono: "azul" },
  aprobada: { etiqueta: "Aprobada en el principal", tono: "success" },
};
const ESTADO_COLA: Record<Estado, { etiqueta: string; tono: Tone }> = {
  espera: { etiqueta: "En espera", tono: "neutral" },
  enviando: { etiqueta: "Enviando…", tono: "azul" },
  creada: { etiqueta: "Enviada · en revisión", tono: "success" },
  "ya estaba": { etiqueta: "Ya la tenía", tono: "neutral" },
  error: { etiqueta: "No se pudo", tono: "destructive" },
};

/**
 * «Igualar números» (31 oct 2026, pedido de Hernán): en vez de mandar a Meta todas las que faltan de golpe, muestra qué plantillas le faltan a
 * cada número para elegir una, varias o todas, y las manda **de a una, una cada dos minutos** (la regla para que no parezca un envío en masa).
 * Quien decide cuándo se puede es el servidor (`enviarPlantillaANumero` responde cuántos segundos faltan): la ventana espera con una cuenta
 * regresiva y vuelve a intentar. Cerrar la ventana o la página detiene la cola; lo que ya salió queda enviado.
 */
export function IgualarNumeros({ alCerrar }: { alCerrar: () => void }) {
  const [datos, setDatos] = useState<{ numeros: FaltantesDeNumero[]; esperaS: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [cola, setCola] = useState<EnCola[] | null>(null);
  const [terminada, setTerminada] = useState(false);
  const [siguienteEn, setSiguienteEn] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const detener = useRef(false);

  useEffect(() => {
    let vigente = true;
    faltantesParaIgualar()
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) setError(r.error);
        else {
          setDatos(r);
          // Elegidas de entrada: todas las que faltan.
          setElegidas(new Set(r.numeros.flatMap((n) => n.plantillas.map((p) => claveDe({ canal: n.canal, numero: n.numero, nombre: p.nombre, idioma: p.idioma })))));
        }
      })
      .catch(() => vigente && setError("No se pudo revisar qué falta. Inténtalo de nuevo."));
    return () => {
      vigente = false;
      detener.current = true;
    };
  }, []);

  // La cuenta regresiva hasta la siguiente plantilla.
  useEffect(() => {
    if (siguienteEn === null) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [siguienteEn]);

  const todos: Item[] = (datos?.numeros ?? []).flatMap((n) => n.plantillas.map((p) => ({ canal: n.canal, numero: n.numero, nombre: p.nombre, idioma: p.idioma })));
  const elegidosItems = todos.filter((i) => elegidas.has(claveDe(i)));
  const corriendo = cola !== null && !terminada;

  const poner = (k: number, estado: Estado, detalle?: string) => setCola((c) => (c ? c.map((x, i) => (i === k ? { ...x, estado, detalle } : x)) : c));

  async function esperarHasta(t: number) {
    setAhora(Date.now());
    setSiguienteEn(t);
    while (Date.now() < t && !detener.current) await esperar(500);
    setSiguienteEn(null);
  }

  async function enviar() {
    const items = elegidosItems;
    if (!items.length) return;
    detener.current = false;
    setTerminada(false);
    setCola(items.map((item) => ({ item, estado: "espera" })));
    for (let k = 0; k < items.length && !detener.current; k++) {
      const it = items[k];
      for (;;) {
        if (detener.current) break;
        poner(k, "enviando");
        const r = await enviarPlantillaANumero(it.nombre, it.idioma, it.canal).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", esperaS: undefined }));
        if ("error" in r && r.esperaS) {
          // Todavía no pasaron los dos minutos desde la última: se espera lo que dice el servidor y se vuelve a intentar.
          poner(k, "espera");
          await esperarHasta(Date.now() + (r.esperaS + 1) * 1000);
          continue;
        }
        if ("error" in r) poner(k, "error", r.error);
        else poner(k, r.hecho);
        break;
      }
    }
    setTerminada(true);
  }

  function cerrar() {
    detener.current = true;
    alCerrar();
  }

  const restante = siguienteEn ? Math.max(0, Math.ceil((siguienteEn - ahora) / 1000)) : 0;
  const hechas = cola ? cola.filter((x) => x.estado !== "espera" && x.estado !== "enviando").length : 0;
  const cuenta = (e: Estado) => (cola ?? []).filter((x) => x.estado === e).length;
  // Una cada dos minutos: la primera puede salir ya (o cuando toque) y las demás, cada dos minutos.
  const minutos = Math.max(0, elegidosItems.length - 1) * 2 + Math.ceil((datos?.esperaS ?? 0) / 60);

  return (
    <Ventana abierto alCerrar={cerrar} titulo="Igualar números" ancho="lg">
      <div className="flex flex-col gap-4 p-5">
        {error ? (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        ) : !datos ? (
          <p className="m-0 text-sm text-muted-foreground">Revisando en Meta qué plantillas le faltan a cada número…</p>
        ) : cola ? (
          <>
            <p className="m-0 text-sm" aria-live="polite">
              {terminada
                ? `Terminó: ${cuenta("creada")} enviadas${cuenta("ya estaba") ? `, ${cuenta("ya estaba")} ya estaban` : ""}${cuenta("error") ? `, ${cuenta("error")} con error` : ""}${detener.current && hechas < cola.length ? " (detenida)" : ""}.`
                : `Enviando ${Math.min(hechas + 1, cola.length)} de ${cola.length}${restante > 0 ? ` · la siguiente sale en ${reloj(restante)}` : ""}`}
            </p>
            {!terminada && <p className="m-0 text-xs text-muted-foreground">Sale una cada dos minutos. Deja esta ventana abierta: si la cierras, se detiene (lo que ya salió queda enviado).</p>}
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {cola.map((x) => (
                <li key={claveDe(x.item)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <span>
                    <span className="font-mono font-semibold">{x.item.nombre}</span> <span className="text-xs text-muted-foreground">{x.item.idioma} · para {x.item.numero}</span>
                    {x.detalle && <span className="block text-xs text-destructive">{x.detalle}</span>}
                  </span>
                  <Badge tone={ESTADO_COLA[x.estado].tono}>{ESTADO_COLA[x.estado].etiqueta}</Badge>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="m-0 text-sm text-muted-foreground">
              Las plantillas que ya están aprobadas o en revisión en el número principal y le faltan a cada número. Elige cuáles mandar: salen de a una, una cada dos minutos.
            </p>
            {datos.numeros.map((n) => {
              const suyas = n.plantillas.map((p) => ({ item: { canal: n.canal, numero: n.numero, nombre: p.nombre, idioma: p.idioma }, estado: p.estado }));
              const todasElegidas = suyas.length > 0 && suyas.every((s) => elegidas.has(claveDe(s.item)));
              return (
                <fieldset key={n.canal} className="m-0 flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
                  <legend className="px-1 text-sm font-semibold">
                    {n.numero} · {n.error ? "no respondió" : suyas.length ? `le faltan ${suyas.length}` : "tiene todas"}
                  </legend>
                  {n.error && <p className="m-0 text-sm text-destructive">{n.error}</p>}
                  {suyas.length > 0 && (
                    <>
                      <button
                        type="button"
                        className={`self-start text-xs font-medium underline-offset-2 hover:underline ${anilloFoco}`}
                        onClick={() =>
                          setElegidas((x) => {
                            const y = new Set(x);
                            for (const s of suyas) {
                              if (todasElegidas) y.delete(claveDe(s.item));
                              else y.add(claveDe(s.item));
                            }
                            return y;
                          })
                        }
                      >
                        {todasElegidas ? "Quitar todas" : "Elegir todas"}
                      </button>
                      <ul className="m-0 flex list-none flex-col gap-1 p-0">
                        {suyas.map((s) => {
                          const k = claveDe(s.item);
                          const e = ESTADO_PRINCIPAL[s.estado];
                          return (
                            <li key={k}>
                              <label className="flex min-h-9 flex-wrap items-center gap-3 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-foreground"
                                  checked={elegidas.has(k)}
                                  onChange={(ev) =>
                                    setElegidas((x) => {
                                      const y = new Set(x);
                                      if (ev.target.checked) y.add(k);
                                      else y.delete(k);
                                      return y;
                                    })
                                  }
                                />
                                <span className="font-mono font-semibold">{s.item.nombre}</span>
                                <span className="text-xs text-muted-foreground">{s.item.idioma}</span>
                                {e && <Badge tone={e.tono}>{e.etiqueta}</Badge>}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </fieldset>
              );
            })}
            {todos.length === 0 && <p className="m-0 text-sm font-medium">Todos los números tienen las mismas plantillas.</p>}
          </>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {datos && !cola && todos.length > 0 && (
            <span className="mr-auto text-xs text-muted-foreground">
              {elegidosItems.length} elegidas{elegidosItems.length > 1 ? ` · tardan unos ${minutos} minutos` : ""}
              {datos.esperaS > 0 ? ` · la primera sale en ${reloj(datos.esperaS)}` : ""}
            </span>
          )}
          {corriendo ? (
            <button type="button" className={boton} onClick={() => (detener.current = true)}>
              Detener
            </button>
          ) : (
            <>
              {datos && !cola && todos.length > 0 && (
                <button type="button" className={botonPrincipal} disabled={!elegidosItems.length} onClick={() => void enviar()}>
                  {elegidosItems.length === 1 ? "Enviar 1 plantilla" : `Enviar ${elegidosItems.length} plantillas`}
                </button>
              )}
              <button type="button" className={boton} onClick={cerrar}>
                Cerrar
              </button>
            </>
          )}
        </div>
      </div>
    </Ventana>
  );
}
