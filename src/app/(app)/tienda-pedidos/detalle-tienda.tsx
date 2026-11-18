"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Skeleton } from "@/components/ui/skeleton";
import { anilloFoco } from "@/components/ui/field";
import type { FilaProducto } from "@/lib/tienda/detalle-tienda";
import type { ResumenTienda } from "@/lib/tienda/tablero-tiendas";
import { obtenerDetalleTienda, type DetalleTienda } from "./tablero-actions";

// El detalle que se despliega al hacer clic en la tarjeta de una tienda (18 nov 2026, pedido de Hernán): entregados (con quién lo registra), confirmados y
// lo mismo por producto, para ver cuál rinde mejor y cuál peor. Las cuentas están en `src/lib/tienda/detalle-tienda.ts`; los datos, en `tablero-actions.ts`.

const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const pctTxt = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PA", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
const fecha = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "UTC" });

type Columna = "nombre" | "pedidos" | "confirmados" | "confirmacion" | "entregados" | "entrega" | "enCamino" | "devueltos" | "cancelados" | "unidades";
const COLUMNAS: { id: Columna; titulo: string; ayuda?: string }[] = [
  { id: "nombre", titulo: "Producto" },
  { id: "pedidos", titulo: "Pedidos" },
  { id: "confirmados", titulo: "Confirmados" },
  { id: "confirmacion", titulo: "% confirm.", ayuda: "Confirmados de los pedidos" },
  { id: "entregados", titulo: "Entregados" },
  { id: "entrega", titulo: "% entrega", ayuda: "Entregados de lo que salió (en camino, entregado o devuelto)" },
  { id: "enCamino", titulo: "En camino" },
  { id: "devueltos", titulo: "Devueltos" },
  { id: "cancelados", titulo: "Cancelados" },
  { id: "unidades", titulo: "Unidades", ayuda: "Sin los pedidos cancelados" },
];
const POR_PAGINA = 25;

function Bloque({ titulo, valor, detalle, children }: { titulo: string; valor: string; detalle: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-muted px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums">{valor}</span>
        <span className="text-xs font-semibold text-primario tabular-nums">{detalle}</span>
      </span>
      {children}
    </div>
  );
}

function Partes({ partes }: { partes: [string, number][] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-0.5 p-0 text-xs text-muted-foreground tabular-nums">
      {partes.map(([k, v]) => (
        <li key={k}>
          {k} <span className="font-semibold text-foreground">{entero(v)}</span>
        </li>
      ))}
    </ul>
  );
}

function Extremo({ titulo, fila, valor }: { titulo: string; fila: FilaProducto | null; valor: (f: FilaProducto) => string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{titulo}</span>
      {fila ? (
        <>
          <span className="truncate text-[13px] font-semibold" title={fila.nombre}>
            {fila.nombre}
          </span>
          <span className="text-xs text-primario tabular-nums">{valor(fila)}</span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">Falta con qué medir</span>
      )}
    </div>
  );
}

export function DetalleTiendaPanel({ tienda, href, cerrar }: { tienda: ResumenTienda; href: string; cerrar: () => void }) {
  const sp = useSearchParams();
  const periodo = { periodo: sp.get("periodo") ?? undefined, desde: sp.get("desde") ?? undefined, hasta: sp.get("hasta") ?? undefined };
  const claveParams = `${periodo.periodo}|${periodo.desde}|${periodo.hasta}`;
  const [datos, setDatos] = useState<{ clave: string; r: DetalleTienda | { error: string } } | null>(null);
  const [orden, setOrden] = useState<{ col: Columna; desc: boolean }>({ col: "pedidos", desc: true });
  const [buscar, setBuscar] = useState("");
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    let vivo = true;
    obtenerDetalleTienda(tienda.id, periodo)
      .then((r) => vivo && setDatos({ clave: claveParams, r }))
      .catch(() => vivo && setDatos({ clave: claveParams, r: { error: "No se pudo cargar el detalle. Intenta de nuevo." } }));
    return () => {
      vivo = false;
    };
    // Se vuelve a pedir solo si cambia la tienda o el periodo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tienda.id, claveParams]);

  const r = datos?.clave === claveParams ? datos.r : null;
  const filas = useMemo(() => {
    if (!r || "error" in r) return [];
    const q = buscar.trim().toLowerCase();
    const vistas = q ? r.productos.filter((f) => f.nombre.toLowerCase().includes(q)) : r.productos;
    const { col, desc } = orden;
    return [...vistas].sort((a, b) => {
      const x = a[col];
      const y = b[col];
      const c = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y), "es") : (x ?? -1) - (y ?? -1);
      return desc ? -c : c;
    });
  }, [r, buscar, orden]);
  const vistas = todos ? filas : filas.slice(0, POR_PAGINA);

  return (
    <section id="detalle-tienda" aria-label={`Detalle de ${tienda.nombre}`} className="mt-2.5 rounded-xl border border-primario/40 bg-card p-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 inline-flex items-center gap-1.5 text-sm font-semibold">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px]" style={{ background: tienda.color }} />
          {tienda.nombre}
          {r && !("error" in r) && (
            <span className="font-normal text-muted-foreground">
              · del {fecha(r.desde)} al {fecha(r.hasta)}
            </span>
          )}
        </h3>
        <span className="flex items-center gap-3 text-xs">
          <Link href={href} className={`rounded font-semibold text-primario hover:underline ${anilloFoco}`}>
            Ver pedidos →
          </Link>
          <button type="button" onClick={cerrar} className={`rounded font-semibold text-muted-foreground hover:text-foreground ${anilloFoco}`}>
            Cerrar ✕
          </button>
        </span>
      </div>

      {!r ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <div className="grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-48" />
        </div>
      ) : "error" in r ? (
        <EstadoVacio mensaje={r.error} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Bloque titulo="Entregados" valor={entero(r.total.entregados)} detalle={`${pctTxt(r.total.entrega)} de lo que salió`}>
              <Partes partes={[["Servientrega", r.origen.servientrega], ["Monday", r.origen.monday], ...(r.origen.sin_registro ? ([["Sin registro", r.origen.sin_registro]] as [string, number][]) : [])]} />
              <Partes partes={[["En camino", r.total.enCamino], ["Devueltos", r.total.devueltos]]} />
              <span className="text-[11px] text-muted-foreground">Solo cuenta lo que Monday (ciudad) o Servientrega (interior) registran como entregado: si no lo actualizan, aquí no sale.</span>
            </Bloque>
            <Bloque titulo="Confirmados" valor={entero(r.total.confirmados)} detalle={`${pctTxt(r.total.confirmacion)} de ${entero(r.total.pedidos)} pedidos`}>
              <Partes partes={[["Por confirmar", r.total.porConfirmar], ["Cancelados", r.total.cancelados]]} />
              <span className="text-[11px] text-muted-foreground">Según el estado del pedido (Shopify y la confirmación del sistema): todo lo que pasó la confirmación, aunque ya haya salido.</span>
            </Bloque>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Extremo titulo="Mejor entrega" fila={r.extremos.mejorEntrega} valor={(f) => `${pctTxt(f.entrega)} · ${entero(f.entregados)} entregados`} />
            <Extremo titulo="Peor entrega" fila={r.extremos.peorEntrega} valor={(f) => `${pctTxt(f.entrega)} · ${entero(f.enCamino + f.devueltos)} sin entregar`} />
            <Extremo titulo="Mejor confirmación" fila={r.extremos.mejorConfirmacion} valor={(f) => `${pctTxt(f.confirmacion)} · ${entero(f.pedidos)} pedidos`} />
            <Extremo titulo="Peor confirmación" fila={r.extremos.peorConfirmacion} valor={(f) => `${pctTxt(f.confirmacion)} · ${entero(f.pedidos)} pedidos`} />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="m-0 text-[13px] font-semibold">
                Por producto <span className="font-normal text-muted-foreground">· {entero(r.productos.length)} productos · mejor y peor con al menos 10 pedidos</span>
              </h4>
              <input
                type="search"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar producto…"
                aria-label="Buscar producto"
                className={`h-8 w-56 rounded-md border border-border bg-background px-2.5 text-[13px] ${anilloFoco}`}
              />
            </div>
            {!filas.length ? (
              <EstadoVacio mensaje={r.productos.length ? "Ningún producto con ese nombre." : "La tienda no tiene pedidos con productos en el periodo."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-[11.5px] text-muted-foreground">
                      {COLUMNAS.map((c, i) => {
                        const activa = orden.col === c.id;
                        return (
                          <th
                            key={c.id}
                            scope="col"
                            aria-sort={activa ? (orden.desc ? "descending" : "ascending") : "none"}
                            className={`border-b border-border px-2 py-1.5 font-semibold whitespace-nowrap ${i ? "text-right" : "text-left"}`}
                          >
                            <button
                              type="button"
                              title={c.ayuda}
                              onClick={() => setOrden((o) => ({ col: c.id, desc: o.col === c.id ? !o.desc : c.id !== "nombre" }))}
                              className={`rounded hover:text-foreground ${activa ? "text-primario" : ""} ${anilloFoco}`}
                            >
                              {c.titulo}
                              {activa ? (orden.desc ? " ↓" : " ↑") : ""}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {vistas.map((f) => (
                      <tr key={f.clave} className="tabular-nums hover:bg-muted/60">
                        <th scope="row" className="max-w-[320px] border-b border-border px-2 py-1.5 text-left font-medium">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate" title={f.nombre}>
                              {f.nombre}
                            </span>
                            {!f.vinculado && <Badge tone="warning">Sin vincular</Badge>}
                          </span>
                        </th>
                        {[
                          entero(f.pedidos),
                          entero(f.confirmados),
                          pctTxt(f.confirmacion),
                          entero(f.entregados),
                          pctTxt(f.entrega),
                          entero(f.enCamino),
                          entero(f.devueltos),
                          entero(f.cancelados),
                          entero(f.unidades),
                        ].map((v, i) => (
                          <td key={i} className={`border-b border-border px-2 py-1.5 text-right whitespace-nowrap ${i === 2 || i === 4 ? "font-semibold" : ""}`}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filas.length > POR_PAGINA && (
              <button type="button" onClick={() => setTodos((v) => !v)} className={`self-start rounded text-[13px] font-semibold text-primario ${anilloFoco}`}>
                {todos ? "Ver menos" : `Ver los ${entero(filas.length)} productos`}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
