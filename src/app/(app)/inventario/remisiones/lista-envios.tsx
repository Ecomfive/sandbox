"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Badge } from "@/components/ui/badge";
import { fieldClassSm } from "@/components/ui/field";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { anilloFoco } from "@/components/ui/field";
import { formatearFechaHoraCompleta } from "@/lib/formato";
import { agruparRemisiones, type EstadoRemision, type LineaEnviada, type RemisionAgrupada } from "@/lib/wms/remision";
import { recibirEnvioDropi } from "../stock-actions";

/** Un producto enviado: una línea de una remisión, con su foto y el motivo si llegó distinto. */
export interface FilaEnvio extends LineaEnviada {
  codigo: string;
  nombre: string;
  foto: string | null;
  motivo: string | null;
  /** Las cajas que salieron, en palabras (migración 0236). */
  cajas: string | null;
}

/** Anotar lo que el tercero dice que llegó de una remisión: arranca con lo enviado; si cambia, pide el motivo. */
function Recibir({ fila }: { fila: FilaEnvio }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, startTransition] = useTransition();
  const [recibida, setRecibida] = useState(String(fila.enviada));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const n = Number(recibida);
  const distinta = recibida.trim() !== "" && n !== fila.enviada;
  const valida = recibida.trim() !== "" && Number.isInteger(n) && n >= 0 && (!distinta || motivo.trim() !== "");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          aria-label={`Unidades que llegaron de ${fila.codigo}`}
          value={recibida}
          onChange={(e) => setRecibida(e.target.value)}
          disabled={pendiente}
          className={`${fieldClassSm} w-24 text-right tabular-nums`}
        />
        {distinta && (
          <input
            aria-label={`Motivo de la diferencia de ${fila.codigo}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
            placeholder="Motivo de la diferencia"
            disabled={pendiente}
            className={`${fieldClassSm} w-56`}
          />
        )}
        <button
          type="button"
          disabled={!valida || pendiente}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await recibirEnvioDropi(fila.id, n, motivo);
              if (r.error) {
                setError(r.error);
                return;
              }
              mostrarToast(n === fila.enviada ? "Remisión recibida completa" : `Remisión recibida: llegaron ${n} de ${fila.enviada}`);
              router.refresh();
            });
          }}
          className="min-h-8 rounded-md bg-foreground px-3 text-xs font-semibold text-background hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
        >
          {pendiente ? "Guardando…" : "Confirmar"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const ESTADO: Record<EstadoRemision, { tono: "warning" | "success" | "destructive"; texto: (r: RemisionAgrupada) => string }> = {
  en_camino: { tono: "warning", texto: () => "En camino" },
  parcial: { tono: "warning", texto: (r) => `Faltan ${r.porConfirmar} por confirmar` },
  completa: { tono: "success", texto: () => "Llegó completo" },
  diferencia: { tono: "destructive", texto: (r) => `Con diferencia (${r.diferencia > 0 ? "+" : ""}${r.diferencia})` },
};

const EstadoBadge = ({ r }: { r: RemisionAgrupada }) => <Badge tone={ESTADO[r.estado].tono}>{ESTADO[r.estado].texto(r)}</Badge>;

/** Lo que se imprimió: el papel de la remisión, en otra pestaña. Una línea anterior a las remisiones no tiene papel. */
function VerPapel({ r, grande = false }: { r: RemisionAgrupada; grande?: boolean }) {
  if (!r.remisionId) return <span className="text-xs text-muted-foreground">Sin papel</span>;
  return (
    <a
      href={`/imprimir/remision/${r.remisionId}`}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center whitespace-nowrap rounded-md border border-border bg-card font-medium hover:bg-muted ${grande ? "min-h-10 px-4 text-sm" : "min-h-8 px-3 text-xs"} ${anilloFoco}`}
    >
      Ver remisión
    </a>
  );
}

/** La ficha de una remisión: sus datos, el papel y cada producto enviado, con lo que llegó (ahí se confirma). */
function FichaRemision({ r, puedeEscribir, codigoPais }: { r: RemisionAgrupada<FilaEnvio>; puedeEscribir: boolean; codigoPais: string }) {
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EstadoBadge r={r} />
        <VerPapel r={r} grande />
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        {[
          ["Salió de", r.desde],
          ["Va a", r.hacia],
          ["Enviada", formatearFechaHoraCompleta(r.enviadoEn, codigoPais)],
          ["Productos", r.productos.toLocaleString("es-PA")],
          ["Unidades enviadas", r.enviadas.toLocaleString("es-PA")],
          ["Unidades que llegaron", r.porConfirmar === r.productos ? "—" : r.recibidas.toLocaleString("es-PA")],
        ].map(([titulo, valor]) => (
          <div key={titulo} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{titulo}</dt>
            <dd className="m-0 font-medium tabular-nums">{valor}</dd>
          </div>
        ))}
        {r.notas && (
          <div className="col-span-full flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Notas</dt>
            <dd className="m-0">{r.notas}</dd>
          </div>
        )}
      </dl>
      <ContenedorTabla ariaLabel={`Productos de ${r.numero}`}>
        <table className="tabla-datos w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={claseEncabezadoColumna}>
                Producto
              </th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
                Enviadas
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Llegaron según la bodega
              </th>
            </tr>
          </thead>
          <tbody>
            {r.lineas.map((f) => (
              <tr key={f.id} className="border-b border-border align-top last:border-0">
                <td className={claseCeldaColumna}>
                  <span className="flex items-center gap-3">
                    <MiniaturaFoto url={f.foto} nombre={f.nombre} />
                    <span className="min-w-0">
                      <span className="block font-medium">{f.codigo}</span>
                      <span className="block text-xs text-muted-foreground">{f.nombre}</span>
                      {f.cajas && <span className="block text-xs text-muted-foreground">{f.cajas}</span>}
                    </span>
                  </span>
                </td>
                <td className={`${claseCeldaColumna} text-right tabular-nums`}>{f.enviada.toLocaleString("es-PA")}</td>
                <td className={claseCeldaColumna}>
                  {f.estado === "en_camino" ? (
                    puedeEscribir ? (
                      <Recibir fila={f} />
                    ) : (
                      <Badge tone="warning">En camino</Badge>
                    )
                  ) : f.recibida === f.enviada ? (
                    <Badge tone="success">Llegó completo</Badge>
                  ) : (
                    <span className="flex flex-col gap-0.5">
                      <Badge tone="destructive">
                        Llegaron {f.recibida} ({(f.recibida ?? 0) - f.enviada})
                      </Badge>
                      {f.motivo && <span className="text-xs text-muted-foreground">{f.motivo}</span>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ContenedorTabla>
    </div>
  );
}

/**
 * Las remisiones a bodegas externas, una fila por remisión (7 nov 2026, pedido de Hernán): número, fecha, de dónde a dónde, cuántos productos y
 * unidades, cómo van y el papel. Lo que falta por confirmar va arriba. Al tocar una se abre su ficha con los productos, y ahí se confirma lo que llegó.
 */
export function ListaEnvios({ filas, puedeEscribir, codigoPais }: { filas: FilaEnvio[]; puedeEscribir: boolean; codigoPais: string }) {
  const remisiones = useMemo(() => agruparRemisiones(filas), [filas]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const elegida = remisiones.find((r) => r.clave === abierta) ?? null;
  const enCamino = remisiones.filter((r) => r.porConfirmar > 0).length;
  const conDiferencia = remisiones.filter((r) => r.estado === "diferencia").length;
  const columnas = ["Remisión", "Fecha", "Salió de", "Va a"];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <strong className="tabular-nums">{enCamino}</strong> en camino · <strong className="tabular-nums">{conDiferencia}</strong> llegaron con diferencia
      </p>
      <ContenedorTabla ariaLabel="Remisiones">
        <table className="tabla-datos w-full min-w-[60rem] border-collapse text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              {columnas.map((c) => (
                <th key={c} scope="col" className={claseEncabezadoColumna}>
                  {c}
                </th>
              ))}
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
                Productos
              </th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
                Unidades
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Estado
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Papel
              </th>
            </tr>
          </thead>
          <tbody>
            {remisiones.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Todavía no hay remisiones. Crea una con «Nueva remisión» o desde la ficha de un producto en Stock.
                </td>
              </tr>
            )}
            {remisiones.map((r) => (
              <tr key={r.clave} onClick={() => setAbierta(r.clave)} className="cursor-pointer border-b border-border hover:bg-muted/50">
                <td className={claseCeldaColumna}>
                  <button type="button" onClick={() => setAbierta(r.clave)} className={`rounded font-semibold underline-offset-2 hover:underline ${anilloFoco}`}>
                    {r.numero}
                  </button>
                </td>
                <td className={`${claseCeldaColumna} whitespace-nowrap`}>{formatearFechaHoraCompleta(r.enviadoEn, codigoPais)}</td>
                <td className={claseCeldaColumna}>{r.desde}</td>
                <td className={claseCeldaColumna}>{r.hacia}</td>
                <td className={`${claseCeldaColumna} text-right tabular-nums`}>{r.productos.toLocaleString("es-PA")}</td>
                <td className={`${claseCeldaColumna} text-right tabular-nums`}>{r.enviadas.toLocaleString("es-PA")}</td>
                <td className={claseCeldaColumna}>
                  <EstadoBadge r={r} />
                </td>
                <td className={claseCeldaColumna}>
                  <VerPapel r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ContenedorTabla>
      <Ventana abierto={!!elegida} alCerrar={() => setAbierta(null)} titulo={elegida?.numero ?? ""} lado="derecha" ancho="lg">
        {elegida && <FichaRemision r={elegida} puedeEscribir={puedeEscribir} codigoPais={codigoPais} />}
      </Ventana>
    </div>
  );
}
