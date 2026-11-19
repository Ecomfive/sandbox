"use client";

import { useRef, useState } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import { candidatosDe, leerNombre, type MovLote } from "@/lib/finanzas/comprobantes-lote";
import { AdjuntoIcon } from "@/lib/nav-icons";
import { supabase } from "@/lib/supabase/client";
import { descartarComprobanteSubido, guardarComprobante, prepararSubidaComprobante } from "./comprobantes-actions";

const ACEPTA = "image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf";
const MAX = 15 * 1024 * 1024;
const MAX_ARCHIVOS = 40;
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

interface Fila {
  archivo: File;
  monto: number | null;
  fecha: string | null;
  candidatos: MovLote[];
  elegido: string;
  estado: "pendiente" | "subiendo" | "listo" | "error";
  error?: string;
}

/**
 * «Comprobantes en lote» (mejora 7): se eligen varios archivos y cada uno se propone para el movimiento del mes con el
 * mismo monto (y la fecha más cercana) que dice su nombre. La persona revisa y adjunta; un archivo sin pareja se deja
 * sin elegir o se elige a mano.
 */
export function ComprobantesLote({ movimientos }: { movimientos: MovLote[] }) {
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const porMonto = [...movimientos].sort((a, b) => a.monto - b.monto);

  function elegir(lista: FileList | null) {
    const archivos = [...(lista ?? [])].slice(0, MAX_ARCHIVOS);
    setFilas(
      archivos.map((archivo) => {
        const lectura = leerNombre(archivo.name);
        const { candidatos, sugerido } = candidatosDe(lectura, movimientos);
        return {
          archivo,
          ...lectura,
          candidatos,
          elegido: sugerido ?? "",
          estado: archivo.size > MAX ? "error" : "pendiente",
          error: archivo.size > MAX ? "Pesa más de 15 MB." : undefined,
        };
      }),
    );
  }

  const cambiar = (i: number, c: Partial<Fila>) => setFilas((a) => a.map((f, j) => (j === i ? { ...f, ...c } : f)));

  async function adjuntar() {
    setTrabajando(true);
    let listos = 0;
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (f.estado !== "pendiente" || !f.elegido) continue;
      cambiar(i, { estado: "subiendo" });
      try {
        const permiso = await prepararSubidaComprobante(f.elegido, f.archivo.name);
        if ("error" in permiso) throw new Error(permiso.error);
        const { error } = await supabase.storage.from("fin-comprobantes").uploadToSignedUrl(permiso.ruta, permiso.token, f.archivo, { contentType: f.archivo.type || "application/octet-stream" });
        if (error) {
          await descartarComprobanteSubido(f.elegido, permiso.ruta);
          throw new Error("No se pudo subir el archivo.");
        }
        const r = await guardarComprobante(f.elegido, permiso.ruta, f.archivo.name);
        if (r.error) throw new Error(r.error);
        cambiar(i, { estado: "listo" });
        listos++;
      } catch (e) {
        cambiar(i, { estado: "error", error: e instanceof Error ? e.message : "No se pudo adjuntar." });
      }
    }
    setTrabajando(false);
    if (listos) mostrarToast(`${listos} ${listos === 1 ? "comprobante adjuntado" : "comprobantes adjuntados"}`);
  }

  const listosParaSubir = filas.filter((f) => f.estado === "pendiente" && f.elegido).length;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAbierto(true)}
        className={`inline-flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco} !rounded-md`}
      >
        <AdjuntoIcon className="h-4 w-4" />
        Comprobantes en lote
      </button>
      {abierto && (
        <Ventana
          abierto
          alCerrar={() => {
            if (trabajando) return;
            setAbierto(false);
            setFilas([]);
          }}
          lado="derecha"
          ancho="lg"
          titulo={<span className="text-lg font-semibold">Comprobantes en lote</span>}
        >
          <div className="flex flex-col gap-4 p-5">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Archivos (imagen o PDF, hasta {MAX_ARCHIVOS})</span>
              <input ref={entrada} type="file" multiple accept={ACEPTA} data-enfocar disabled={trabajando} onChange={(e) => elegir(e.target.files)} className="text-sm" />
            </label>
            {filas.length > 0 && (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {filas.map((f, i) => (
                  <li key={`${f.archivo.name}-${i}`} className="flex flex-col gap-2 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{f.archivo.name}</span>
                      <span className={`text-muted-foreground ${claseCifra}`}>
                        {f.monto !== null ? usd(f.monto) : "Sin monto en el nombre"}
                        {f.fecha ? ` · ${fechaCorta(f.fecha)}` : ""}
                      </span>
                    </div>
                    {f.estado === "listo" ? (
                      <p className="flex items-center gap-1.5">
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
                        Adjuntado
                      </p>
                    ) : (
                      <label className="flex flex-col gap-1">
                        <span className="sr-only">Movimiento para {f.archivo.name}</span>
                        <select
                          value={f.elegido}
                          disabled={trabajando || f.estado === "subiendo"}
                          onChange={(e) => cambiar(i, { elegido: e.target.value, estado: f.archivo.size > MAX ? "error" : "pendiente", error: undefined })}
                          className={`${fieldClass} w-full`}
                        >
                          <option value="">{f.candidatos.length ? `Elegir (${f.candidatos.length} con ese monto)` : "Sin pareja: elegir a mano"}</option>
                          {f.candidatos.length > 0 && (
                            <optgroup label="Con el mismo monto">
                              {f.candidatos.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.fecha ? `${fechaCorta(m.fecha)} · ` : ""}
                                  {m.descripcion.slice(0, 60)}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="Todos los del mes">
                            {porMonto.map((m) => (
                              <option key={m.id} value={m.id}>
                                {usd(m.monto)} · {m.descripcion.slice(0, 50)}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </label>
                    )}
                    {f.estado === "error" && f.error && (
                      <p role="alert" className="text-destructive">
                        {f.error}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {filas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={trabajando || !listosParaSubir}
                  onClick={adjuntar}
                  className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50"
                >
                  {trabajando ? "Adjuntando…" : `Adjuntar ${listosParaSubir}`}
                </button>
                <button
                  type="button"
                  disabled={trabajando}
                  onClick={() => {
                    setFilas([]);
                    if (entrada.current) entrada.current.value = "";
                  }}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Empezar de nuevo
                </button>
              </div>
            )}
          </div>
        </Ventana>
      )}
    </>
  );
}
