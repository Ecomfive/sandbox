"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { enviarTuWinnerASeleccion } from "./actions";
import type { FilaCanales } from "./datos";
import { n } from "./formato";

const COLUMNAS = ["Tu Winner PA", "Tu Winner MX", "Competencia Dropi", "Scraping de proveedores", "Biblioteca de anuncios", "Drop Killer", "Sugerencias de clientes"];

function Celda({ v, texto }: { v: number; texto?: string }) {
  return <td className="c">{v ? <span className="si">{texto ?? n(v)}</span> : <span className="vacio">—</span>}</td>;
}

/** «Se repite en varios canales» (igual al boceto): un producto por fila, en cuántas fuentes aparece y cómo está en el sistema; los que no tenemos, «A Selección». */
export function TablaCanales({ filas, puedeSeleccion }: { filas: FilaCanales[]; puedeSeleccion: boolean }) {
  const { mostrarToast } = useToast();
  const [enviando, setEnviando] = useState<string | null>(null);
  const [enviadas, setEnviadas] = useState<Record<string, string>>({});

  async function aSeleccion(f: FilaCanales) {
    setEnviando(f.clave);
    const r = await enviarTuWinnerASeleccion(f.pais, f.dropiId).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
    setEnviando(null);
    if ("error" in r) return mostrarToast(r.error, "destructive");
    setEnviadas((x) => ({ ...x, [f.clave]: r.codigo }));
    mostrarToast(r.descartado ? `${r.codigo} quedó en Selección como descartado: ya lo habíamos visto.` : `${r.codigo} quedó en Selección de productos.`);
  }

  return (
    <div className="scroll">
      <table className="tabla">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Canales</th>
            {COLUMNAS.map((c) => (
              <th key={c} className="c">
                {c}
              </th>
            ))}
            <th>En el sistema</th>
          </tr>
        </thead>
        <tbody>
          {filas.length ? (
            filas.map((f) => {
              const codigo = enviadas[f.clave] ?? f.enSeleccion;
              return (
                <tr key={f.clave}>
                  <td style={{ fontWeight: 600 }}>{f.nombre}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className="puntos" aria-hidden="true">
                      {Array.from({ length: 7 }, (_, i) => (
                        <i key={i} className={i < f.canales ? "on" : ""} />
                      ))}
                    </span>{" "}
                    <span className="meta">{f.canales}</span>
                  </td>
                  <Celda v={f.ventas.PA} />
                  <Celda v={f.ventas.MX} />
                  <Celda v={f.competencia} texto={`${n(f.competencia)} prov.`} />
                  <Celda v={f.scraping} texto={`${n(f.scraping)} prov.`} />
                  <Celda v={f.anuncios} />
                  <Celda v={f.dropKiller} />
                  <Celda v={f.sugerencias} />
                  <td>
                    {f.estado === "nuestro" ? (
                      <span className="et nuestro">Nuestro{f.skuCodigo ? ` · ${f.skuCodigo}` : ""}</span>
                    ) : f.estado === "tenemos" ? (
                      <span className="et tenemos">{f.skuCodigo ?? "Ya lo tenemos"}</span>
                    ) : (
                      <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        <span className="et no">No lo tenemos</span>
                        {codigo ? (
                          <span className="et canal">{codigo}</span>
                        ) : (
                          puedeSeleccion && (
                            <button className="btn" type="button" style={{ minHeight: 28 }} disabled={enviando === f.clave} onClick={() => void aSeleccion(f)}>
                              {enviando === f.clave ? "Enviando…" : "A Selección"}
                            </button>
                          )
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={10} className="meta">
                Todavía no hay ganadores leídos: pulsa «Leer ahora».
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
