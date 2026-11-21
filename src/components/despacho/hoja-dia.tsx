"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import type { FilaTablero } from "@/lib/despacho/datos";
import { colorDe, textoSobre, type Columna } from "@/lib/despacho/etiquetas";
import { COLUMNAS_HOJA, diaLargo, gruposHoja } from "@/lib/despacho/hoja";
import { FechaHora } from "@/components/ui/fecha-hora";
import type { ArchivoVisible } from "@/lib/monday/comprobantes";
import { VisorArchivos } from "./visor-archivos";

type FilaConFotos = FilaTablero & { fotos: ArchivoVisible[] };

const plata = (n: number | null) => (n === null ? "" : `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const th = "border-b border-border bg-muted px-2 py-2 text-left text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-muted-foreground uppercase";
const td = "h-11 border-r border-b border-border/60 bg-card px-2 whitespace-nowrap";

/** La hoja del día en pantalla: por repartidor, con las columnas de Monday, los comprobantes que se abren aquí y los botones de imprimir y Excel. */
export function HojaDia({ dia, hoy, filas }: { dia: string; hoy: string; filas: FilaConFotos[] }) {
  const router = useRouter();
  const [vista, setVista] = useState("TODOS");
  const grupos = gruposHoja(filas);
  const visibles = grupos.filter((g) => vista === "TODOS" || g.nombre === vista);
  const total = visibles.reduce((t, g) => t + g.sumas.porCobrar, 0);
  const pedidos = visibles.reduce((t, g) => t + g.filas.length, 0);
  const consulta = `dia=${dia}${vista === "TODOS" ? "" : `&repartidor=${encodeURIComponent(vista)}`}`;
  const chip = (activo: boolean) =>
    `min-h-9 rounded-full border px-3.5 text-[13px] font-medium ${anilloFoco} ${activo ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`;
  const pill = (col: Columna, valor: string | null) => {
    const color = colorDe(col, valor);
    return (
      <td className={`${td} px-0 text-center text-xs font-semibold`} style={color ? { background: color, color: textoSobre(color) } : undefined}>
        {valor ?? ""}
      </td>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-bold">Hoja del día</h1>
          <span className="text-[13px] text-muted-foreground first-letter:uppercase">
            {diaLargo(dia)}
            {dia === hoy ? " (hoy)" : ""} · {pedidos} pedido{pedidos === 1 ? "" : "s"} · {plata(total)} por cobrar
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Día
            <input type="date" value={dia} onChange={(e) => e.target.value && router.push(`/despacho-ciudad/hoja?dia=${e.target.value}`)} className={fieldClass} />
          </label>
          <a href={`/imprimir/hoja-dia?${consulta}`} target="_blank" rel="noreferrer" className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3.5 text-sm font-medium ${anilloFoco}`}>
            Imprimir o guardar PDF
          </a>
          <a href={`/despacho-ciudad/hoja/excel?${consulta}`} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3.5 text-sm font-medium ${anilloFoco}`}>
            Descargar Excel
          </a>
          <Link href="/despacho-ciudad" className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3.5 text-sm ${anilloFoco}`}>
            Volver a Despacho ciudad
          </Link>
        </div>
      </div>

      <nav aria-label="Repartidor" className="flex flex-wrap gap-1.5">
        {["TODOS", ...grupos.map((g) => g.nombre)].map((n) => (
          <button key={n} type="button" aria-pressed={vista === n} onClick={() => setVista(n)} className={chip(vista === n)}>
            {n === "TODOS" ? "Todos los repartidores" : n}
          </button>
        ))}
      </nav>

      {!visibles.length && <p className="m-0 rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Despacho todavía no cargó pedidos para este día.</p>}

      {visibles.map((g) => {
        const color = colorDe("courier", g.nombre) ?? "#9ca3af";
        return (
          <section key={g.nombre} aria-label={g.nombre} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <h2 className="m-0 text-base font-bold" style={{ color }}>
                {g.nombre}
              </h2>
              <span className="text-xs text-muted-foreground">
                {g.filas.length} pedido{g.filas.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="overflow-x-auto rounded-[10px] border border-border bg-card" style={{ borderLeft: `4px solid ${color}` }}>
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr>
                    {COLUMNAS_HOJA.map((c) => (
                      <th key={c} scope="col" className={`${th} ${c.startsWith("$") || c === "Coste envío" ? "text-right" : ""}`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.filas.map((f) => (
                    <tr key={f.itemId}>
                      <td className={`${td} font-semibold`} style={{ borderLeft: `4px solid ${color}` }}>
                        {f.numero ?? ""}
                      </td>
                      {pill("tienda", f.tienda)}
                      <td className={`${td} text-xs text-muted-foreground`}>{f.editadoEn || f.actualizado ? <FechaHora iso={(f.editadoEn ?? f.actualizado)!} /> : ""}</td>
                      {pill("courier", f.courier)}
                      {pill("estado", f.estado)}
                      {pill("edo_pago", f.edoPago)}
                      {pill("forma_pago", f.formaPago)}
                      <td className={`${td} text-right tabular-nums`}>{plata(f.porCobrar)}</td>
                      <td className={`${td} text-right tabular-nums`}>{plata(f.cobrado)}</td>
                      <td className={td}>{f.fotos.length ? <VisorArchivos archivos={f.fotos} titulo={`Comprobante del pedido ${f.numero ?? ""}`} compacto /> : f.comprobantes ? <span className="text-xs text-muted-foreground">No se pudo abrir</span> : null}</td>
                      <td className={`${td} min-w-48 text-xs whitespace-normal`}>{f.comentario ?? ""}</td>
                      <td className={`${td} text-right tabular-nums`}>{plata(f.costeEnvio)}</td>
                      {pill("turno", f.turno)}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7} className="bg-muted px-3 py-2 text-xs text-muted-foreground">
                      {g.sumas.entregados} de {g.sumas.pedidos} entregados
                    </td>
                    <td className="bg-muted px-2 py-2 text-right text-xs font-semibold tabular-nums">{plata(g.sumas.porCobrar)}</td>
                    <td className="bg-muted px-2 py-2 text-right text-xs font-semibold tabular-nums">{plata(g.sumas.cobrado)}</td>
                    <td colSpan={2} className="bg-muted" />
                    <td className="bg-muted px-2 py-2 text-right text-xs font-semibold tabular-nums">{plata(g.sumas.costeEnvio)}</td>
                    <td className="bg-muted" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
