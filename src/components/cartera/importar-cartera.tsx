"use client";

import { ComparacionImportacion } from "@/components/importar/comparacion-importacion";
import { compararCartera } from "@/lib/importar/cargas/comparar";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { resumirImportacionCartera } from "@/lib/finanzas/cartera-actions";
import type { LecturaCartera } from "@/lib/finanzas/cxc-cxp-excel";
import { RUTA_DE_CLASE, type Clase } from "@/lib/finanzas/cxc-cxp";
import { cargarCartera, leerArchivoCartera, saldoLeido } from "@/lib/importar/cargas/cartera";
import type { ResumenImportacion } from "@/lib/finanzas/guardar-cartera";
import { dinero, entero } from "@/lib/af4/formato";

const MAX_BYTES = 30 * 1024 * 1024;
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

type Paso =
  | { tipo: "elegir" }
  | { tipo: "leyendo" }
  | { tipo: "revisar" }
  | { tipo: "cargando"; hechos: number }
  | { tipo: "listo"; borrados: number; conservados: number; rechazados: number; tiendas: string[] }
  | { tipo: "error"; mensaje: string };

/**
 * Importar las cuentas por cobrar (hoja «CPC») o por pagar (hojas «CPP…») del Excel de gastos. El archivo se lee en el
 * navegador (pesa varios MB y una acción del servidor acepta 1 MB); antes de guardar se ve qué es nuevo, qué se
 * actualiza, qué se borra y qué no cuadra con la hoja. Se guarda por lotes que el servidor vuelve a validar.
 */
export function ImportarCartera({ clase }: { clase: Clase }) {
  const [paso, setPaso] = useState<Paso>({ tipo: "elegir" });
  const [archivo, setArchivo] = useState("");
  const [lectura, setLectura] = useState<LecturaCartera | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const hojasEsperadas = clase === "cobrar" ? "«CPC»" : "«CPP»";

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setPaso({ tipo: "error", mensaje: "El archivo pasa de 30 MB." });
      return;
    }
    setPaso({ tipo: "leyendo" });
    setLectura(null);
    try {
      const l = leerArchivoCartera(await f.arrayBuffer(), clase);
      if (!l.hojas.length) {
        setPaso({ tipo: "error", mensaje: `No encontré una hoja ${hojasEsperadas} en el archivo.` });
        return;
      }
      const r = await resumirImportacionCartera(clase, l.hojas, l.documentos.map((d) => d.origen_clave));
      if ("error" in r) {
        setPaso({ tipo: "error", mensaje: r.error });
        return;
      }
      setArchivo(f.name);
      setLectura(l);
      setResumen(r);
      setPaso({ tipo: "revisar" });
    } catch {
      setPaso({ tipo: "error", mensaje: "No pude leer el archivo. ¿Es un Excel (.xlsx)?" });
    }
  }

  async function cargar() {
    if (!lectura) return;
    setPaso({ tipo: "cargando", hechos: 0 });
    const r = await cargarCartera(clase, archivo, lectura, (hechos) => setPaso({ tipo: "cargando", hechos }));
    if ("error" in r) {
      setPaso({ tipo: "error", mensaje: r.error });
      return;
    }
    setPaso({ tipo: "listo", ...r });
  }

  const saldo = lectura ? saldoLeido(lectura) : 0;
  const abonos = lectura ? lectura.documentos.reduce((a, d) => a + d.abonos.length, 0) : 0;
  const ocupado = paso.tipo === "leyendo" || paso.tipo === "cargando";

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Excel de gastos (.xlsx)</span>
        <input
          type="file"
          accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={alElegir}
          disabled={ocupado}
          className={fieldClass}
        />
      </label>

      {paso.tipo === "leyendo" && <ProgresoCarga mensaje="Leyendo el Excel…" />}

      {paso.tipo === "error" && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          {paso.mensaje}
        </p>
      )}

      {lectura && resumen && (paso.tipo === "revisar" || paso.tipo === "cargando") && (
        <>
          <section aria-labelledby="titulo-revision-cartera" className="rounded-xl border border-border bg-card">
            <h2 id="titulo-revision-cartera" className="border-b border-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
              {archivo} · {lectura.hojas.map((h) => `«${h}»`).join(", ")}
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4">
              <Dato titulo="Documentos" valor={entero(lectura.documentos.length)} />
              <Dato titulo="Abonos" valor={entero(abonos)} />
              <Dato titulo={clase === "cobrar" ? "Saldo por cobrar" : "Saldo por pagar"} valor={usd(saldo)} />
              <Dato titulo="Nuevos" valor={entero(resumen.nuevos)} />
              <Dato titulo="Se actualizan" valor={entero(resumen.actualizan)} />
              <Dato titulo="Se borran" valor={entero(resumen.borran)} alerta={resumen.borran > 0} />
              {resumen.conservan > 0 && <Dato titulo="Se conservan (tocados en el portal)" valor={entero(resumen.conservan)} />}
              <Dato titulo="Filas de plantilla ignoradas" valor={entero(lectura.plantilla)} />
            </dl>
          </section>

          <Lista
            titulo="No cuadra con la hoja"
            vacio="El saldo y el estado de cada documento coinciden con los de la hoja."
            filas={lectura.controles.map((c) => `«${c.hoja}» fila ${c.fila} · ${c.contraparte}${c.documento ? ` ${c.documento}` : ""}: ${c.qué} en la hoja ${c.excel}, en el portal ${c.portal}`)}
          />
          <Lista titulo="Filas descartadas" filas={lectura.descartadas.map((d) => `«${d.hoja}» fila ${d.fila}: ${d.motivo}`)} />
          <Lista titulo="Fechas corregidas (día y mes invertidos)" filas={lectura.fechasCorregidas.map((c) => `«${c.hoja}» fila ${c.fila}: ${c.excel} → ${c.portal}`)} />

          {paso.tipo === "cargando" ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <ProgresoCarga mensaje={`Cargando ${entero(paso.hechos)} de ${entero(lectura.documentos.length)}…`} />
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full bg-foreground transition-[width]" style={{ width: `${(100 * paso.hechos) / Math.max(lectura.documentos.length, 1)}%` }} />
              </div>
            </div>
          ) : (
            <>
            {lectura && <ComparacionImportacion key={archivo} comparar={() => compararCartera(clase === "cobrar" ? "cuentas-por-cobrar" : "cuentas-por-pagar", archivo, lectura)} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={cargar} disabled={!lectura.documentos.length}>
                Cargar al portal
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setLectura(null); setPaso({ tipo: "elegir" }); }}>
                Cancelar
              </Button>
            </div>
            </>
          )}
        </>
      )}

      {paso.tipo === "listo" && lectura && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            {entero(lectura.documentos.length)} documentos cargados
            {paso.borrados ? `, ${entero(paso.borrados)} borrados` : ""}.
          </p>
          {(paso.conservados > 0 || paso.rechazados > 0 || paso.tiendas.length > 0) && (
            <ul className="flex flex-col gap-1 text-muted-foreground">
              {paso.conservados > 0 && <li>{entero(paso.conservados)} ya no están en la hoja pero se tocaron en el portal: se dejaron.</li>}
              {paso.rechazados > 0 && <li>{entero(paso.rechazados)} filas rechazadas por datos inválidos.</li>}
              {paso.tiendas.length > 0 && <li>Tiendas que no están en el catálogo (quedaron sin tienda): {paso.tiendas.join(", ")}.</li>}
            </ul>
          )}
          <div>
            <Link href={RUTA_DE_CLASE[clase]} className={`inline-block rounded-md bg-foreground px-3 py-1.5 font-medium text-background ${anilloFoco}`}>
              {clase === "cobrar" ? "Ver cuentas por cobrar" : "Ver cuentas por pagar"}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Dato({ titulo, valor, alerta = false }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {alerta && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
        {titulo}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}

function Lista({ titulo, filas, vacio }: { titulo: string; filas: string[]; vacio?: string }) {
  if (!filas.length && !vacio) return null;
  return (
    <section className="rounded-xl border border-border bg-card text-sm">
      <h2 className="flex items-center gap-2 border-b border-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${filas.length ? "bg-warning" : "bg-success"}`} />
        {titulo} ({filas.length})
      </h2>
      {filas.length ? (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto p-4">
          {filas.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-muted-foreground">{vacio}</p>
      )}
    </section>
  );
}
