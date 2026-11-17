"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { leerVentas, type LecturaVentas } from "@/lib/importar/cargas/ventas";
import { resumirLeido } from "@/lib/ventas/matriz";
import { importarLoteMatriz, terminarImportacionMatriz } from "./actions";

// «Actualizar desde la Matriz» (17 nov 2026): mientras el equipo siga llenando el Excel «NUEVA GESTION OCEANS PANAMA», se descarga como .xlsx
// (Archivo › Descargar › Microsoft Excel) y se carga aquí. Se lee en el navegador, se revisa y se guarda por lotes: no duplica (la llave es tienda +
// número), no reescribe los pedidos que llegaron de Shopify (solo los completa) y no pisa lo editado a mano en el sistema.

const MAX_BYTES = 60 * 1024 * 1024;
const LOTE = 400;

type Paso =
  | { tipo: "elegir" }
  | { tipo: "leyendo" }
  | { tipo: "revisar" }
  | { tipo: "cargando"; hechos: number; total: number }
  | { tipo: "listo"; nuevas: number; actualizadas: number; sinCambios: number; completadas: number; rechazadas: number }
  | { tipo: "error"; mensaje: string };

export function ImportarMatriz({ alTerminar }: { alTerminar: () => void }) {
  const [paso, setPaso] = useState<Paso>({ tipo: "elegir" });
  const [lectura, setLectura] = useState<LecturaVentas | null>(null);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) return setPaso({ tipo: "error", mensaje: "El archivo pasa de 60 MB." });
    setPaso({ tipo: "leyendo" });
    await new Promise((r) => setTimeout(r, 30));
    try {
      const l = leerVentas(await f.arrayBuffer(), f.name);
      if ("error" in l) return setPaso({ tipo: "error", mensaje: l.error });
      setLectura(l);
      setPaso({ tipo: "revisar" });
    } catch {
      setPaso({ tipo: "error", mensaje: "No pude leer el archivo. ¿Es la Matriz descargada como Excel (.xlsx)?" });
    }
  }

  const resumen = useMemo(() => {
    const filas = resumirLeido(lectura?.ordenes ?? []);
    const tiendas = [...new Set(filas.map((r) => r.tienda))];
    const meses = [...new Set(filas.map((r) => r.periodo.slice(0, 7)))].sort();
    return { tiendas, desde: meses[0], hasta: meses.at(-1) };
  }, [lectura]);

  async function cargar() {
    if (!lectura) return;
    const ordenes = lectura.ordenes;
    const t = { nuevas: 0, actualizadas: 0, sinCambios: 0, completadas: 0, rechazadas: 0 };
    setPaso({ tipo: "cargando", hechos: 0, total: ordenes.length });
    for (let i = 0; i < ordenes.length; i += LOTE) {
      const r = await importarLoteMatriz(ordenes.slice(i, i + LOTE)).catch(() => ({ error: "Se cortó la conexión." }));
      if ("error" in r) return setPaso({ tipo: "error", mensaje: `Se guardaron ${i} de ${ordenes.length} pedidos y el siguiente lote falló: ${r.error} Puedes volver a cargar el mismo archivo: lo ya guardado no se duplica.` });
      t.nuevas += r.nuevas;
      t.actualizadas += r.actualizadas;
      t.sinCambios += r.sinCambios;
      t.completadas += r.completadas;
      t.rechazadas += r.rechazadas;
      setPaso({ tipo: "cargando", hechos: Math.min(i + LOTE, ordenes.length), total: ordenes.length });
    }
    await terminarImportacionMatriz(lectura.archivo, { ordenes: ordenes.length, nuevas: t.nuevas, completadas: t.completadas }).catch(() => undefined);
    setPaso({ tipo: "listo", ...t });
  }

  const n = (x: number) => x.toLocaleString("es-PA");
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="m-0 text-muted-foreground">
        Mientras el equipo siga llenando el Excel, descárgalo como Excel (en Google Sheets: Archivo › Descargar › Microsoft Excel) y cárgalo aquí. No borra nada y no
        duplica: si el pedido llegó de Shopify, solo le agrega lo que anota la Matriz, y lo que alguien cambió a mano en el sistema se queda como está.
      </p>
      {(paso.tipo === "elegir" || paso.tipo === "error") && (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>La Matriz (.xlsx)</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={alElegir} className={fieldClass} />
        </label>
      )}
      {paso.tipo === "leyendo" && <ProgresoCarga mensaje="Leyendo la Matriz…" />}
      {paso.tipo === "error" && (
        <p role="alert" className="m-0 rounded-md border border-border bg-card px-3 py-2 text-destructive">
          {paso.mensaje}
        </p>
      )}
      {lectura && paso.tipo === "revisar" && (
        <>
          <ul className="m-0 flex flex-col gap-1 pl-5">
            <li>
              <b>{n(lectura.ordenes.length)} pedidos</b> ({n(lectura.lineas)} líneas) de {resumen.tiendas.join(", ")}.
            </li>
            <li>
              Del {resumen.desde} al {resumen.hasta}. {lectura.guias ? `${n(lectura.guias)} guías de Servientrega.` : ""}
            </li>
            {lectura.descartadas.length > 0 && <li>{n(lectura.descartadas.length)} filas sin tienda, número o fecha: se saltan.</li>}
          </ul>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPaso({ tipo: "elegir" })}>
              Elegir otro
            </Button>
            <Button type="button" onClick={() => void cargar()}>
              Cargar {n(lectura.ordenes.length)} pedidos
            </Button>
          </div>
        </>
      )}
      {paso.tipo === "cargando" && <ProgresoCarga mensaje={`Guardando ${n(paso.hechos)} de ${n(paso.total)} pedidos…`} />}
      {paso.tipo === "listo" && (
        <>
          <ul className="m-0 flex flex-col gap-1 pl-5">
            <li>
              <b>{n(paso.nuevas)}</b> pedidos nuevos y <b>{n(paso.actualizadas)}</b> actualizados.
            </li>
            <li>
              <b>{n(paso.completadas)}</b> ya venían de Shopify: solo se completaron con lo que anota la Matriz.
            </li>
            <li>{n(paso.sinCambios)} sin cambios desde la última vez.</li>
            {paso.rechazadas > 0 && <li>{n(paso.rechazadas)} con datos que no se pudieron leer: se saltaron.</li>}
          </ul>
          <div className="flex justify-end">
            <Button type="button" onClick={alTerminar}>
              Listo
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
