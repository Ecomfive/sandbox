"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Badge } from "@/components/ui/badge";
import { fieldClassSm } from "@/components/ui/field";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { useToast } from "@/components/ui/toast";
import { formatearTiempoRelativo } from "@/lib/formato";
import { BuscarIcon, MasIcon, PapeleraIcon } from "@/lib/nav-icons";
import { guardarLevantamiento } from "./actions";
import { ImportarLista } from "./importar-lista";

export interface ProductoConteo {
  id: string;
  codigo: string;
  nombre: string;
  clase: string;
  manejaVencimiento: boolean;
  foto: string | null;
  /** Lo que el sistema tiene hoy en esta bodega. */
  enSistema: number;
  /** Sus lotes con unidades en esta bodega (solo si maneja vencimiento). */
  lotes: { codigo: string; vencimiento: string; cantidad: number }[];
}

interface LineaLote {
  codigo: string;
  vencimiento: string;
  cantidad: string;
  /** Un lote que el sistema ya tiene en esta bodega (su código y fecha no se cambian aquí). */
  existente: boolean;
}

const ETIQUETA_CLASE: Record<string, string> = { inactivo: "Inactivo", descontinuado: "Descontinuado" };
const sinAcentos = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const numero = (t: string) => (t.trim() === "" ? null : Number(t));

/** Una cifra con signo para la diferencia: verde si sobra, rojo si falta, nada si cuadra. */
function Diferencia({ n }: { n: number | null }) {
  if (n === null) return <span className="text-muted-foreground">—</span>;
  if (n === 0) return <span className="text-muted-foreground tabular-nums">0</span>;
  return <span className={`font-semibold tabular-nums ${n > 0 ? "text-success" : "text-destructive"}`}>{n > 0 ? `+${n}` : n}</span>;
}

/**
 * Levantamiento (conteo físico) de una bodega: una fila por producto con lo que hay en el sistema, lo contado y la
 * diferencia. Solo se guarda lo que se escribió (un producto en blanco no se toca). Un producto con vencimiento se cuenta
 * por lote: sus lotes con unidades aparecen solos y se agrega una línea por lote nuevo.
 */
export function Levantamiento({
  bodegas,
  bodegaElegida,
  productos,
  ultimo,
  puedeEscribir,
}: {
  bodegas: { id: string; nombre: string }[];
  bodegaElegida: string;
  productos: ProductoConteo[];
  ultimo: { fecha: string; referencia: string | null; productos: number } | null;
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { mostrarToast } = useToast();
  const [pendiente, startTransition] = useTransition();
  const [contados, setContados] = useState<Record<string, string>>({});
  const [lotes, setLotes] = useState<Record<string, LineaLote[]>>({});
  const [buscar, setBuscar] = useState("");
  const [verTodos, setVerTodos] = useState(false);
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lineasDe = (p: ProductoConteo): LineaLote[] =>
    lotes[p.id] ?? p.lotes.map((l) => ({ codigo: l.codigo, vencimiento: l.vencimiento, cantidad: "", existente: true }));
  const cambiarLinea = (p: ProductoConteo, i: number, cambio: Partial<LineaLote>) =>
    setLotes((x) => ({ ...x, [p.id]: lineasDe(p).map((l, j) => (j === i ? { ...l, ...cambio } : l)) }));

  // Lo contado de cada producto (null si no se tocó).
  const contadoDe = (p: ProductoConteo): number | null => {
    if (!p.manejaVencimiento) {
      const n = numero(contados[p.id] ?? "");
      return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
    }
    const ls = lotes[p.id];
    if (!ls || !ls.some((l) => l.cantidad.trim() !== "")) return null;
    return ls.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  };

  const visibles = useMemo(() => {
    const q = sinAcentos(buscar.trim());
    return productos.filter((p) => {
      if (q && !sinAcentos(`${p.codigo} ${p.nombre}`).includes(q)) return false;
      if (verTodos || q) return true;
      return p.clase === "fisico" || p.enSistema !== 0 || contados[p.id] !== undefined || lotes[p.id] !== undefined;
    });
  }, [productos, buscar, verTodos, contados, lotes]);

  const contadosTotal = productos.filter((p) => contadoDe(p) !== null);
  const conDiferencia = contadosTotal.filter((p) => contadoDe(p) !== p.enSistema).length;
  const nombreBodega = bodegas.find((b) => b.id === bodegaElegida)?.nombre ?? "";

  const guardar = () => {
    setError(null);
    const items = contadosTotal.map((p) =>
      p.manejaVencimiento
        ? {
            sku: p.id,
            lotes: (lotes[p.id] ?? [])
              .filter((l) => l.codigo.trim() !== "")
              .map((l) => ({ codigo: l.codigo.trim(), vencimiento: l.existente ? null : l.vencimiento || null, cantidad: Number(l.cantidad) || 0 })),
          }
        : { sku: p.id, cantidad: contadoDe(p) },
    );
    startTransition(async () => {
      const r = await guardarLevantamiento(bodegaElegida, referencia, items);
      if (r.error) {
        setError(r.error);
        return;
      }
      mostrarToast(`Levantamiento de ${nombreBodega} guardado: ${r.productos} productos, ${r.ajustes} con diferencia`);
      setContados({});
      setLotes({});
      setReferencia("");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">Bodega</span>
          <select
            value={bodegaElegida}
            onChange={(e) => router.replace(`${pathname}?bodega=${e.target.value}`)}
            disabled={pendiente}
            className={`${fieldClassSm} min-w-48`}
          >
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </label>
        {puedeEscribir && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Referencia (opcional)</span>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} placeholder="Ej: Conteo inicial" className={`${fieldClassSm} w-56`} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">Buscar</span>
          <span className="relative">
            <BuscarIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Código o nombre" className={`${fieldClassSm} w-56 pl-8`} />
          </span>
        </label>
        {puedeEscribir && (
          <ImportarLista
            productos={productos}
            deshabilitado={pendiente}
            alAplicar={(cantidades) => setContados((x) => ({ ...x, ...Object.fromEntries(Object.entries(cantidades).map(([id, n]) => [id, String(n)])) }))}
          />
        )}
        <button
          type="button"
          aria-pressed={verTodos}
          onClick={() => setVerTodos((v) => !v)}
          className={`min-h-9 rounded-md border px-3 text-sm ${verTodos ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`}
        >
          Ver inactivos y descontinuados
        </button>
        {ultimo && (
          <p className="text-xs text-muted-foreground">
            Último levantamiento: {formatearTiempoRelativo(ultimo.fecha)}
            {ultimo.referencia ? ` · ${ultimo.referencia}` : ""} · {ultimo.productos} productos
          </p>
        )}
      </div>

      <ContenedorTabla ariaLabel={`Levantamiento de ${nombreBodega}`}>
        <table className="tabla-datos w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={claseEncabezadoColumna}>
                Foto
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Producto
              </th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
                En sistema
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Contado
              </th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
                Diferencia
              </th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No hay productos con ese nombre.
                </td>
              </tr>
            )}
            {visibles.map((p) => {
              const contado = contadoDe(p);
              const dif = contado === null ? null : contado - p.enSistema;
              return (
                <tr key={p.id} className="border-b border-border align-top">
                  <td className={claseCeldaColumna}>
                    <MiniaturaFoto url={p.foto} nombre={p.nombre} />
                  </td>
                  <td className={claseCeldaColumna}>
                    <span className="block font-medium">{p.codigo}</span>
                    <span className="block text-xs text-muted-foreground">{p.nombre}</span>
                    {ETIQUETA_CLASE[p.clase] && (
                      <span className="mt-1 inline-block">
                        <Badge tone="neutral">{ETIQUETA_CLASE[p.clase]}</Badge>
                      </span>
                    )}
                  </td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums ${p.enSistema < 0 ? "text-destructive" : p.enSistema === 0 ? "text-muted-foreground" : ""}`}>{p.enSistema}</td>
                  <td className={claseCeldaColumna}>
                    {!p.manejaVencimiento ? (
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        aria-label={`Contado de ${p.codigo}`}
                        disabled={!puedeEscribir || pendiente}
                        value={contados[p.id] ?? ""}
                        onChange={(e) =>
                          setContados((x) => {
                            const y = { ...x };
                            if (e.target.value === "") delete y[p.id];
                            else y[p.id] = e.target.value;
                            return y;
                          })
                        }
                        placeholder="—"
                        className={`${fieldClassSm} w-28 text-right tabular-nums`}
                      />
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {lineasDe(p).map((l, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-1.5">
                            <input
                              aria-label={`Lote de ${p.codigo}`}
                              value={l.codigo}
                              readOnly={l.existente}
                              disabled={!puedeEscribir || pendiente}
                              onChange={(e) => cambiarLinea(p, i, { codigo: e.target.value })}
                              placeholder="Lote"
                              maxLength={80}
                              className={`${fieldClassSm} w-28 ${l.existente ? "bg-muted" : ""}`}
                            />
                            <input
                              type="date"
                              aria-label={`Vencimiento del lote de ${p.codigo}`}
                              value={l.vencimiento}
                              readOnly={l.existente}
                              disabled={!puedeEscribir || pendiente}
                              onChange={(e) => cambiarLinea(p, i, { vencimiento: e.target.value })}
                              className={`${fieldClassSm} w-36 ${l.existente ? "bg-muted" : ""}`}
                            />
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              aria-label={`Contado del lote ${l.codigo || "nuevo"} de ${p.codigo}`}
                              disabled={!puedeEscribir || pendiente}
                              value={l.cantidad}
                              onChange={(e) => cambiarLinea(p, i, { cantidad: e.target.value })}
                              placeholder={l.existente ? "0" : "—"}
                              className={`${fieldClassSm} w-20 text-right tabular-nums`}
                            />
                            {!l.existente && (
                              <button
                                type="button"
                                aria-label={`Quitar el lote nuevo de ${p.codigo}`}
                                onClick={() => setLotes((x) => ({ ...x, [p.id]: lineasDe(p).filter((_, j) => j !== i) }))}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <PapeleraIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        ))}
                        {puedeEscribir && (
                          <button
                            type="button"
                            disabled={pendiente}
                            onClick={() => setLotes((x) => ({ ...x, [p.id]: [...lineasDe(p), { codigo: "", vencimiento: "", cantidad: "", existente: false }] }))}
                            className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <MasIcon className="h-3.5 w-3.5" aria-hidden="true" /> Agregar lote
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={`${claseCeldaColumna} text-right`}>
                    <Diferencia n={dif} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ContenedorTabla>

      {puedeEscribir && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
          <p className="text-sm">
            <strong className="tabular-nums">{contadosTotal.length}</strong> productos contados · <strong className="tabular-nums">{conDiferencia}</strong> con diferencia
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={pendiente || contadosTotal.length === 0}
            className="ml-auto min-h-10 rounded-md bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
          >
            {pendiente ? "Guardando…" : `Guardar levantamiento de ${nombreBodega}`}
          </button>
        </div>
      )}
    </div>
  );
}
