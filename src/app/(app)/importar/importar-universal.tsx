"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClassSm, labelClass, labelClassSm } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { ComparacionImportacion } from "@/components/importar/comparacion-importacion";
import { dinero, entero } from "@/lib/af4/formato";
import { muestraDelArchivo, preparar, type Contexto, type Preparado } from "@/lib/importar/preparar";
import {
  NOMBRE_MODULO,
  ORDEN_CARGA,
  RUTA_IMPORTADOR,
  reconocerArchivo,
  separarPorPermiso,
  type Reconocido,
} from "@/lib/importar/reconocer";

const MAX_BYTES = 40 * 1024 * 1024;
const ACEPTA = ".xlsx,.xlsm,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

type EstadoItem =
  | { tipo: "preparando" }
  | { tipo: "listo"; preparado: Preparado }
  | { tipo: "cargando"; preparado: Preparado; hechos: number; total: number; mensaje?: string }
  | { tipo: "cargado"; hecho: string[] }
  | { tipo: "error"; mensaje: string; preparado?: Preparado };

interface Item {
  clave: string;
  reconocido: Reconocido;
  incluir: boolean;
  cuentaDe: Record<string, string>;
  estado: EstadoItem;
}

interface Archivo {
  id: number;
  nombre: string;
  datos: ArrayBuffer | null;
  estado: "leyendo" | "listo" | "error";
  error?: string;
  items: Item[];
  sinPermiso: Reconocido[];
}

interface Props extends Contexto {
  modulos: string[];
  soloLectura: string[];
}

export function ImportarUniversal({ modulos, soloLectura, cuentas, mesesCerrados }: Props) {
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [cargandoTodo, setCargandoTodo] = useState<{ paso: number; de: number; nombre: string } | null>(null);
  const siguienteId = useRef(1);
  const ctx: Contexto = { cuentas, mesesCerrados };

  const cambiarArchivo = (id: number, f: (a: Archivo) => Archivo) => setArchivos((xs) => xs.map((a) => (a.id === id ? f(a) : a)));
  const cambiarItem = (id: number, clave: string, f: (i: Item) => Item) =>
    cambiarArchivo(id, (a) => ({ ...a, items: a.items.map((i) => (i.clave === clave ? f(i) : i)) }));

  async function agregar(lista: FileList | File[]) {
    for (const f of [...lista]) {
      const id = siguienteId.current++;
      setArchivos((xs) => [...xs, { id, nombre: f.name, datos: null, estado: "leyendo", items: [], sinPermiso: [] }]);
      if (f.size > MAX_BYTES) {
        cambiarArchivo(id, (a) => ({ ...a, estado: "error", error: "Pasa de 40 MB." }));
        continue;
      }
      // Deja que se pinte «Leyendo…» antes de bloquear el hilo con el Excel.
      await new Promise((r) => setTimeout(r, 30));
      let datos: ArrayBuffer;
      let reconocidos: Reconocido[];
      try {
        datos = await f.arrayBuffer();
        reconocidos = reconocerArchivo(muestraDelArchivo(datos, f.name));
      } catch {
        cambiarArchivo(id, (a) => ({ ...a, estado: "error", error: "No se pudo leer. ¿Es un Excel (.xlsx) o un CSV?" }));
        continue;
      }
      const { permitidos, sinPermiso } = separarPorPermiso(reconocidos, modulos, soloLectura);
      const items: Item[] = permitidos.map((r) => ({ clave: r.modulo, reconocido: r, incluir: true, cuentaDe: {}, estado: { tipo: "preparando" } }));
      cambiarArchivo(id, (a) => ({ ...a, datos, estado: "listo", items, sinPermiso }));
      for (const it of items) {
        const p = await preparar(it.reconocido, datos, f.name, ctx).catch((e: unknown) => ({ error: e instanceof Error ? e.message : "No se pudo leer." }));
        cambiarItem(id, it.clave, (i) =>
          "error" in p
            ? { ...i, incluir: false, estado: { tipo: "error", mensaje: p.error } }
            : { ...i, cuentaDe: Object.fromEntries((p.extractos ?? []).map((e) => [e.hoja, e.cuentaId])), estado: { tipo: "listo", preparado: p } },
        );
      }
    }
  }

  /** Lo que se carga, en el orden de carga (el libro antes que la conciliación, etc.) y, dentro, en el orden de los archivos. */
  const cola = archivos
    .flatMap((a) => a.items.map((i) => ({ archivo: a, item: i })))
    .filter(({ item }) => item.incluir && item.estado.tipo === "listo")
    .sort((x, y) => ORDEN_CARGA.indexOf(x.item.reconocido.modulo) - ORDEN_CARGA.indexOf(y.item.reconocido.modulo) || x.archivo.id - y.archivo.id);

  async function cargarTodo() {
    const lista = cola;
    for (const [k, { archivo, item }] of lista.entries()) {
      if (item.estado.tipo !== "listo") continue;
      const preparado = item.estado.preparado;
      setCargandoTodo({ paso: k + 1, de: lista.length, nombre: `${NOMBRE_MODULO[item.reconocido.modulo]} · ${archivo.nombre}` });
      cambiarItem(archivo.id, item.clave, (i) => ({ ...i, estado: { tipo: "cargando", preparado, hechos: 0, total: 0 } }));
      const r = await preparado
        .cargar((hechos, total, mensaje) => cambiarItem(archivo.id, item.clave, (i) => ({ ...i, estado: { tipo: "cargando", preparado, hechos, total, mensaje } })), {
          cuentaDe: item.cuentaDe,
        })
        .catch(() => ({ error: "Se cortó la conexión." }));
      cambiarItem(archivo.id, item.clave, (i) => ({
        ...i,
        incluir: "error" in r,
        estado: "error" in r ? { tipo: "error", mensaje: r.error, preparado } : { tipo: "cargado", hecho: r.hecho },
      }));
      // Un fallo no frena lo que sigue, salvo que lo siguiente dependa de esto (la conciliación busca lo cargado antes):
      // se sigue igual y el fallo queda a la vista para reintentar.
    }
    setCargandoTodo(null);
  }

  /** Un ítem que falló al cargar se puede reintentar: vuelve a «listo» (lo ya guardado no se duplica). */
  const reintentar = (id: number, clave: string) =>
    cambiarItem(id, clave, (i) => (i.estado.tipo === "error" && i.estado.preparado ? { ...i, incluir: true, estado: { tipo: "listo", preparado: i.estado.preparado } } : i));

  const ocupado = cargandoTodo !== null;
  const preparando = archivos.some((a) => a.estado === "leyendo" || a.items.some((i) => i.estado.tipo === "preparando"));

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(e) => {
          if (ocupado || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (!ocupado && e.dataTransfer.files.length) void agregar(e.dataTransfer.files);
        }}
        className={`flex max-w-5xl flex-col gap-2 rounded-xl border-2 border-dashed p-6 transition-colors ${arrastrando ? "border-foreground bg-accent" : "border-border-control bg-card"}`}
      >
        <label className="flex flex-col gap-2">
          <span className={labelClass}>Excel o CSV (uno o varios)</span>
          <input
            type="file"
            multiple
            accept={ACEPTA}
            disabled={ocupado}
            onChange={(e) => {
              if (e.target.files?.length) void agregar(e.target.files);
              e.target.value = "";
            }}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border-control file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          />
        </label>
      </div>

      {archivos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={cargarTodo} disabled={ocupado || preparando || cola.length === 0}>
            Cargar todo{cola.length ? ` (${cola.length})` : ""}
          </Button>
          {!ocupado && (
            <Button type="button" variant="secondary" onClick={() => setArchivos([])}>
              Quitar archivos
            </Button>
          )}
        </div>
      )}

      {cargandoTodo && (
        <div className="flex max-w-5xl flex-col gap-2" aria-live="polite">
          <ProgresoCarga mensaje={`Cargando ${cargandoTodo.paso} de ${cargandoTodo.de}: ${cargandoTodo.nombre}…`} />
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Avance de la carga"
            aria-valuemin={0}
            aria-valuemax={cargandoTodo.de}
            aria-valuenow={cargandoTodo.paso - 1}
          >
            <div className="h-full bg-foreground transition-[width]" style={{ width: `${(100 * (cargandoTodo.paso - 1)) / Math.max(cargandoTodo.de, 1)}%` }} />
          </div>
        </div>
      )}

      {archivos.map((a) => (
        <section key={a.id} aria-labelledby={`archivo-${a.id}`} className="max-w-5xl rounded-xl border border-border bg-card">
          <h2 id={`archivo-${a.id}`} className="flex items-center gap-2 border-b border-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
            {a.estado === "error" && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />}
            {a.nombre}
          </h2>
          {a.estado === "leyendo" && (
            <div className="p-4">
              <ProgresoCarga mensaje="Leyendo…" />
            </div>
          )}
          {a.estado === "error" && (
            <p role="alert" className="px-4 py-3 text-sm">
              {a.error}
            </p>
          )}
          {a.estado === "listo" && !a.items.length && !a.sinPermiso.length && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
              No se reconoce: no tiene las hojas ni los títulos de ningún importador.
            </p>
          )}
          <ul className="divide-y divide-border">
            {a.items.map((i) => (
              <FilaModulo
                key={i.clave}
                archivo={a}
                item={i}
                cuentas={cuentas}
                bloqueado={ocupado}
                alIncluir={(v) => cambiarItem(a.id, i.clave, (x) => ({ ...x, incluir: v }))}
                alCuenta={(hoja, cuentaId) => cambiarItem(a.id, i.clave, (x) => ({ ...x, cuentaDe: { ...x.cuentaDe, [hoja]: cuentaId } }))}
                alReintentar={() => reintentar(a.id, i.clave)}
              />
            ))}
            {a.sinPermiso.map((r) => (
              <li key={r.modulo} className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-border-control" />
                {NOMBRE_MODULO[r.modulo]}: sin permiso para modificarlo.
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FilaModulo({
  archivo,
  item,
  cuentas,
  bloqueado,
  alIncluir,
  alCuenta,
  alReintentar,
}: {
  archivo: Archivo;
  item: Item;
  cuentas: { id: string; nombre: string }[];
  bloqueado: boolean;
  alIncluir: (v: boolean) => void;
  alCuenta: (hoja: string, cuentaId: string) => void;
  alReintentar: () => void;
}) {
  const { reconocido: r, estado } = item;
  const nombre = NOMBRE_MODULO[r.modulo];
  const preparado = estado.tipo === "listo" || estado.tipo === "cargando" ? estado.preparado : estado.tipo === "error" ? estado.preparado : undefined;
  const editable = estado.tipo === "listo" && !bloqueado;
  const punto =
    estado.tipo === "cargado" ? "bg-success" : estado.tipo === "error" ? "bg-destructive" : preparado?.cifras.some((c) => c.alerta && c.valor > 0) ? "bg-warning" : null;

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {estado.tipo === "listo" ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.incluir}
              disabled={!editable}
              onChange={(e) => alIncluir(e.target.checked)}
              aria-label={`Incluir ${nombre} de ${archivo.nombre}`}
              className="h-4 w-4 accent-foreground"
            />
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {punto && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${punto}`} />}
              {nombre}
            </span>
          </label>
        ) : (
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {punto && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${punto}`} />}
            {nombre}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{r.detalle}</span>
        <Link href={RUTA_IMPORTADOR[r.modulo]} className={`ml-auto text-xs underline ${anilloFoco}`}>
          Abrir su importador
        </Link>
      </div>

      {estado.tipo === "preparando" && <ProgresoCarga mensaje="Revisando contra lo cargado…" />}

      {preparado && estado.tipo !== "cargado" && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 lg:grid-cols-7">
          {preparado.cifras.map((c) => (
            <div key={c.titulo} className="flex flex-col gap-0.5">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {c.alerta && c.valor > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
                {c.titulo}
              </dt>
              <dd className="font-semibold tabular-nums">
                {c.usd ? dinero(c.valor) : entero(c.valor)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {preparado?.comparar && estado.tipo === "listo" && <ComparacionImportacion comparar={preparado.comparar} />}

      {preparado?.avisos && estado.tipo !== "cargado" && (
        <div className="flex flex-col gap-1 text-xs">
          <span className={labelClassSm}>{preparado.avisos.titulo}</span>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {preparado.avisos.lineas.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {preparado?.extractos && preparado.extractos.length > 0 && estado.tipo !== "cargado" && (
        <div className="flex flex-wrap gap-3">
          {preparado.extractos.map((e) => (
            <label key={e.hoja} className="flex flex-col gap-1">
              <span className={labelClassSm}>
                Cuenta de «{e.hoja}» · {entero(e.lineas)} líneas
              </span>
              <select className={fieldClassSm} value={item.cuentaDe[e.hoja] ?? ""} disabled={!editable} onChange={(ev) => alCuenta(e.hoja, ev.target.value)}>
                <option value="">No importar</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {estado.tipo === "cargando" && (
        <div className="flex flex-col gap-1" aria-live="polite">
          <span className="text-xs text-muted-foreground">
            {estado.mensaje ?? "Cargando…"} {estado.total ? `${entero(estado.hechos)} de ${entero(estado.total)}` : ""}
          </span>
          <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full bg-foreground transition-[width]" style={{ width: `${(100 * estado.hechos) / Math.max(estado.total, 1)}%` }} />
          </div>
        </div>
      )}

      {estado.tipo === "cargado" && <p className="text-sm">{estado.hecho.join(" · ") || "Cargado."}</p>}

      {estado.tipo === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>{estado.mensaje}</span>
          {estado.preparado && !bloqueado && (
            <Button type="button" variant="secondary" onClick={alReintentar}>
              Reintentar
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
