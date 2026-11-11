"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { dinero, entero } from "@/lib/af4/formato";
import { leerCsvMeta, MAX_BYTES_META, TEXTO_MAX_META } from "@/lib/finanzas/meta-ads-csv";
import { PapeleraIcon } from "@/lib/nav-icons";
import { crearReglaMeta, eliminarReglaMeta, importarMetaCsv, type ResultadoImportacionMeta } from "./actions";

export interface OpcionNombre {
  valor: string;
  etiqueta: string;
}

export interface ReglaVista {
  id: string;
  patron: string;
  tienda: string;
  producto: string | null;
  prioridad: number;
}

function Aviso({ tono, children }: { tono: "error" | "ok" | "aviso"; children: React.ReactNode }) {
  const punto = tono === "error" ? "bg-destructive" : tono === "ok" ? "bg-success" : "bg-warning";
  return (
    <p role={tono === "error" ? "alert" : "status"} className="flex items-start gap-1.5 text-sm">
      <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${punto}`} />
      <span>{children}</span>
    </p>
  );
}

/** Importa el CSV exportado de Meta Ads Manager: vista previa en el navegador y el servidor lo vuelve a leer y validar. */
export function ImportarMeta() {
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<{ filas: number; gasto: number; errores: number; problema: string | null } | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacionMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();

  const elegir = async (f: File | null) => {
    setArchivo(f);
    setResultado(null);
    setError(null);
    setPrevia(null);
    if (!f) return;
    if (f.size > MAX_BYTES_META) {
      setPrevia({ filas: 0, gasto: 0, errores: 0, problema: `Pesa más de ${TEXTO_MAX_META}.` });
      return;
    }
    const l = leerCsvMeta(await f.text());
    const problema = l.faltan.length
      ? `Faltan columnas: ${l.faltan.join(", ")}.`
      : l.moneda && l.moneda !== "USD"
        ? `El gasto viene en ${l.moneda}: exporta el informe en USD.`
        : !l.filas.length
          ? "No tiene filas válidas."
          : null;
    setPrevia({ filas: l.filas.length, gasto: l.filas.reduce((a, x) => a + x.gasto, 0), errores: l.errores.length, problema });
  };

  return (
    <MarcoAF4 id={`${id}-titulo`} titulo="Importar campañas de Meta">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!archivo) return;
          const datos = new FormData();
          datos.set("archivo", archivo);
          setError(null);
          empezar(async () => {
            const r = await importarMetaCsv(datos).catch(() => ({ error: "Se cortó la conexión." }));
            if ("error" in r) setError(r.error);
            else {
              setResultado(r);
              setArchivo(null);
              setPrevia(null);
              if (entrada.current) entrada.current.value = "";
              mostrarToast(`${entero(r.filas)} filas importadas`);
              router.refresh();
            }
          });
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-archivo`} className={labelClassSm}>
              CSV exportado del Ads Manager (por día, campaña y conjunto)
            </label>
            <input
              ref={entrada}
              id={`${id}-archivo`}
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => void elegir(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:h-8 file:rounded-md file:border file:border-border-control file:bg-card file:px-3 file:text-sm file:font-medium"
            />
          </div>
          <button
            type="submit"
            disabled={!archivo || !!previa?.problema || pendiente}
            className={`inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
          >
            {pendiente ? "Importando…" : "Importar"}
          </button>
        </div>
        {previa?.problema && <Aviso tono="error">{previa.problema}</Aviso>}
        {previa && !previa.problema && (
          <Aviso tono={previa.errores ? "aviso" : "ok"}>
            {entero(previa.filas)} filas · gasto {dinero(previa.gasto, "USD", { decimales: 2 })}
            {previa.errores ? ` · ${entero(previa.errores)} filas con error no se importan` : ""}
          </Aviso>
        )}
        {error && <Aviso tono="error">{error}</Aviso>}
        {resultado && (
          <Aviso tono={resultado.sinAsignar || resultado.errores.length ? "aviso" : "ok"}>
            {entero(resultado.filas)} filas ({dinero(resultado.gasto, "USD", { decimales: 2 })}) · {entero(resultado.asignadas)} asignadas
            {resultado.sinAsignar ? ` · ${entero(resultado.sinAsignar)} sin tienda: agrega una regla` : ""}
            {resultado.errores.length ? ` · ${entero(resultado.errores.length)} con error (fila ${resultado.errores[0].fila}: ${resultado.errores[0].motivo})` : ""}
          </Aviso>
        )}
      </form>
    </MarcoAF4>
  );
}

/** Reglas por nombre: si la campaña o el conjunto contiene un texto, es de esa tienda (y de ese producto). */
export function ReglasMeta({ reglas, tiendas, productos, puedeEditar }: { reglas: ReglaVista[]; tiendas: OpcionNombre[]; productos: OpcionNombre[]; puedeEditar: boolean }) {
  const id = useId();
  const [patron, setPatron] = useState("");
  const [tienda, setTienda] = useState("");
  const [producto, setProducto] = useState("");
  const [prioridad, setPrioridad] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();

  const borrar = (r: ReglaVista) =>
    empezar(async () => {
      const res = await eliminarReglaMeta(r.id).catch(() => ({ error: "Se cortó la conexión." }));
      if (res.error) mostrarToast(res.error, "destructive");
      else {
        mostrarToast("Regla eliminada");
        router.refresh();
      }
    });

  return (
    <MarcoAF4 id={`${id}-titulo`} titulo="Reglas de asignación" detalle={`${entero(reglas.length)} reglas`}>
      <div className="flex flex-col gap-4">
        {reglas.length > 0 && (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {reglas.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  Contiene <span className="font-medium">«{r.patron}»</span> → {r.tienda}
                  {r.producto ? ` · ${r.producto}` : ""}
                  <span className="ml-2 text-xs text-muted-foreground">prioridad {r.prioridad}</span>
                </span>
                {puedeEditar && (
                  <Tooltip texto="Eliminar regla">
                    <button
                      type="button"
                      aria-label={`Eliminar la regla «${r.patron}»`}
                      disabled={pendiente}
                      onClick={() => borrar(r)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 ${anilloFoco}`}
                    >
                      <PapeleraIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </Tooltip>
                )}
              </li>
            ))}
          </ul>
        )}
        {puedeEditar && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              empezar(async () => {
                const r = await crearReglaMeta({ patron, unidadId: tienda, productoClave: producto, prioridad: Number(prioridad) }).catch(() => ({ error: "Se cortó la conexión." }));
                if (r.error) setError(r.error);
                else {
                  setPatron("");
                  setProducto("");
                  mostrarToast("Regla creada");
                  router.refresh();
                }
              });
            }}
          >
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>El nombre contiene</span>
              <input value={patron} onChange={(e) => setPatron(e.target.value)} placeholder="Ej: KENKU" className={`${fieldClassSm} w-44`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Tienda</span>
              <select value={tienda} onChange={(e) => setTienda(e.target.value)} className={`${fieldClassSm} w-44`}>
                <option value="">Elegir…</option>
                {tiendas.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Producto</span>
              <select value={producto} onChange={(e) => setProducto(e.target.value)} className={`${fieldClassSm} w-56`}>
                <option value="">Toda la tienda</option>
                {productos.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Prioridad</span>
              <input inputMode="numeric" value={prioridad} onChange={(e) => setPrioridad(e.target.value)} placeholder="Ej: 100" className={`${fieldClassSm} w-20 text-right`} />
            </label>
            <button type="submit" disabled={pendiente || patron.trim().length < 2 || !tienda} className={`${claseAccionAF4} ${anilloFoco} disabled:opacity-50`}>
              Agregar regla
            </button>
            {error && <Aviso tono="error">{error}</Aviso>}
          </form>
        )}
      </div>
    </MarcoAF4>
  );
}
