"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha } from "@/lib/formato";
import { CalendarioIcon, EstadoIcon, InventarioIcon, ProductoIcon, UsuariosIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { MAX_MOTIVO_TRASLADO, revisarTrasladoDanado } from "@/lib/wms/defectuosos";
import { transferirDefectuoso } from "./actions";
import { DEF_DEFECTUOSOS, type FilaDefectuoso } from "./def-defectuosos";

const NOMBRE: NombreFilas = { singular: "producto dañado", plural: "productos dañados" };
const ICONOS: Record<string, IconoComp> = { bodega: InventarioIcon, producto: ProductoIcon, danado: InventarioIcon, marcado: CalendarioIcon, motivo: EstadoIcon, por: UsuariosIcon };
const num = (n: number) => n.toLocaleString("es-PA");
const hace = (d: number | null) => (d === null ? "" : d === 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${num(d)} días`);

type Contexto = { puedeTransferir: boolean; abrir: (f: FilaDefectuoso) => void };

const COLUMNAS: ColumnaTabla<FilaDefectuoso, Contexto>[] = [
  {
    id: "producto",
    label: "Producto",
    ocultable: false,
    render: (f) => (
      <span className="flex items-start gap-2">
        <MiniaturaFoto url={f.foto} nombre={f.producto} />
        <span className="min-w-0">
          <span className="block font-medium">{f.producto}</span>
          <span className="block text-xs text-muted-foreground">{f.sku}</span>
        </span>
      </span>
    ),
  },
  { id: "codigos", label: "N.º y barras", ocultable: true, render: (f) => <CodigosProducto numero={f.numero} barras={f.barras} /> },
  { id: "bodega", label: "Bodega", ocultable: true, render: (f) => f.bodega },
  { id: "danado", label: "Unidades dañadas", ocultable: false, alinear: "derecha", clase: "tabular-nums font-semibold", render: (f) => num(f.danado), total: (fs) => num(fs.reduce((t, f) => t + f.danado, 0)) },
  {
    id: "marcado",
    label: "Marcado el",
    ocultable: true,
    render: (f) =>
      f.marcadoEn ? (
        <span>
          <span className="block">{formatearFecha(f.marcadoEn.slice(0, 10))}</span>
          <span className="block text-xs text-muted-foreground">
            {hace(f.dias)}
            {f.primeraEn && f.primeraEn.slice(0, 10) !== f.marcadoEn.slice(0, 10) ? ` · el primero el ${formatearFecha(f.primeraEn.slice(0, 10))}` : ""}
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground">Sin fecha en el libro</span>
      ),
  },
  { id: "motivo", label: "Motivo", ocultable: true, render: (f) => (f.motivo || f.referencia ? <span className="text-sm">{f.motivo ?? f.referencia}</span> : <span className="text-muted-foreground">—</span>) },
  { id: "por", label: "Marcado por", ocultable: true, render: (f) => f.por ?? <span className="text-muted-foreground">—</span> },
  {
    id: "acciones",
    label: "",
    ocultable: false,
    render: (f, c) =>
      c.puedeTransferir ? (
        f.conVencimiento ? (
          <span className="text-xs text-muted-foreground">Con lotes: usa un traslado por lote</span>
        ) : (
          <button type="button" onClick={() => c.abrir(f)} className="min-h-9 cursor-pointer rounded-md border border-primario/30 bg-primario-suave px-3 text-xs font-semibold text-primario hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
            Transferir
          </button>
        )
      ) : null,
  },
];

/**
 * Inventario › Defectuosos (27 nov 2026, pedido de Hernán): lo dañado de cada bodega del país, con el día en que se marcó, el motivo y quién. La persona a cargo del inventario (Dinora) o un administrador lo puede
 * transferir a otra bodega: allá llega como dañado. Para marcar, devolver a disponible o dar de baja está «Defectuoso» en la ficha del producto (pestaña Stock).
 */
export function TablaDefectuosos({ filas, bodegas, puedeTransferir }: { filas: FilaDefectuoso[]; bodegas: { id: string; nombre: string }[]; puedeTransferir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [elegida, setElegida] = useState<FilaDefectuoso | null>(null);
  const [hacia, setHacia] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, iniciar] = useTransition();
  // Los botones de bodega de arriba (como en el prototipo): «Todas» o una.
  const [filtro, setFiltro] = useState<string | null>(null);
  const abrir = (f: FilaDefectuoso) => {
    setElegida(f);
    setHacia("");
    setCantidad(String(f.danado));
    setMotivo("");
  };
  const destinos = elegida ? bodegas.filter((b) => b.id !== elegida.bodegaId) : [];
  const revisado = elegida ? revisarTrasladoDanado({ desde: elegida.bodegaId, hacia, cantidad, danado: elegida.danado, motivo }) : null;
  const enviar = () =>
    iniciar(async () => {
      if (!elegida || !revisado || "error" in revisado) return;
      const r = await transferirDefectuoso({ skuId: elegida.skuId, desde: elegida.bodegaId, hacia: revisado.hacia, cantidad: revisado.cantidad, motivo: revisado.motivo ?? "" }).catch(() => ({ error: "No se pudo hacer el traslado." }) as { error?: string; mensaje?: string });
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(r.mensaje ?? "Traslado hecho.");
      setElegida(null);
      router.refresh();
    });

  const unidades = filas.reduce((t, f) => t + f.danado, 0);
  const conDanado = [...new Map(filas.map((f) => [f.bodegaId, f.bodega])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const enBodegas = conDanado.length;
  const visibles = filtro ? filas.filter((f) => f.bodegaId === filtro) : filas;
  const chip = (activo: boolean) =>
    `min-h-9 cursor-pointer rounded-full border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${activo ? "border-primario bg-primario text-white" : "border-border-control bg-card text-foreground hover:bg-muted"}`;

  return (
    <>
      <p className="m-0 flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
        <span>
          <b className="tabular-nums">{num(unidades)}</b> {unidades === 1 ? "unidad dañada" : "unidades dañadas"}
        </span>
        <span>
          <b className="tabular-nums">{num(filas.length)}</b> {filas.length === 1 ? "producto" : "productos"}
        </span>
        <span>
          en <b className="tabular-nums">{num(enBodegas)}</b> {enBodegas === 1 ? "bodega" : "bodegas"}
        </span>
        <span className="text-muted-foreground">Para marcar, devolver a disponible o dar de baja: «Defectuoso» en la ficha del producto (pestaña Stock).</span>
      </p>
      {conDanado.length > 1 && (
        <div role="group" aria-label="Filtrar por bodega" className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={!filtro} onClick={() => setFiltro(null)} className={chip(!filtro)}>
            Todas · {num(unidades)}
          </button>
          {conDanado.map(([id, nombre]) => (
            <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(filtro === id ? null : id)} className={chip(filtro === id)}>
              {nombre} · {num(filas.filter((f) => f.bodegaId === id).reduce((t, f) => t + f.danado, 0))}
            </button>
          ))}
        </div>
      )}
      <TablaDatos
        def={DEF_DEFECTUOSOS}
        filas={visibles}
        columnas={COLUMNAS}
        contexto={{ puedeTransferir, abrir }}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        ariaLabel="Productos dañados por bodega"
        vacio="No hay unidades dañadas en las bodegas de este país."
      />
      <Ventana abierto={!!elegida} alCerrar={() => !enviando && setElegida(null)} titulo={elegida ? `Transferir dañados: ${elegida.producto}` : ""} ancho="sm">
        {elegida && (
          <form
            className="flex flex-col gap-3 p-5 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <p className="m-0 text-muted-foreground">
              Desde <b className="text-foreground">{elegida.bodega}</b>, donde hay {num(elegida.danado)} {elegida.danado === 1 ? "unidad dañada" : "unidades dañadas"}. Allá llegan como dañadas: siguen sin venderse.
            </p>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>A qué bodega</span>
              <select value={hacia} onChange={(e) => setHacia(e.target.value)} className={fieldClass} required>
                <option value="">Elige la bodega</option>
                {destinos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Cuántas unidades</span>
              <input type="number" inputMode="numeric" min={1} max={elegida.danado} step={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={`${fieldClass} w-32 tabular-nums`} required />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Motivo (opcional)</span>
              <input type="text" maxLength={MAX_MOTIVO_TRASLADO} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: van a garantía" className={fieldClass} />
            </label>
            {revisado && "error" in revisado && (hacia || cantidad !== String(elegida.danado)) && (
              <p role="alert" className="m-0 text-xs font-semibold text-destructive">
                {revisado.error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setElegida(null)} disabled={enviando} className="min-h-9 cursor-pointer rounded-md border border-border-control bg-card px-4 text-sm font-medium hover:bg-muted">
                Cancelar
              </button>
              <button type="submit" disabled={enviando || !revisado || "error" in revisado} className="min-h-9 cursor-pointer rounded-md bg-primario px-4 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-50">
                {enviando ? "Transfiriendo…" : "Transferir"}
              </button>
            </div>
          </form>
        )}
      </Ventana>
    </>
  );
}
