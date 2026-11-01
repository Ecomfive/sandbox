"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Badge } from "@/components/ui/badge";
import { fieldClassSm } from "@/components/ui/field";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { useToast } from "@/components/ui/toast";
import { formatearTiempoRelativo } from "@/lib/formato";
import { recibirEnvioDropi } from "../stock-actions";

export interface FilaEnvio {
  id: string;
  codigo: string;
  nombre: string;
  foto: string | null;
  desde: string;
  /** La bodega externa a la que fue. */
  hacia: string;
  enviadoEn: string;
  enviada: number;
  recibida: number | null;
  estado: "en_camino" | "recibido";
  referencia: string | null;
  motivo: string | null;
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

/** Las remisiones a bodegas externas: las que siguen en camino arriba, con su campo para anotar lo que llegó. */
export function ListaEnvios({ filas, puedeEscribir }: { filas: FilaEnvio[]; puedeEscribir: boolean }) {
  const enCamino = filas.filter((f) => f.estado === "en_camino").length;
  const conDiferencia = filas.filter((f) => f.estado === "recibido" && f.recibida !== f.enviada).length;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <strong className="tabular-nums">{enCamino}</strong> en camino · <strong className="tabular-nums">{conDiferencia}</strong> llegaron con diferencia
      </p>
      <ContenedorTabla ariaLabel="Remisiones">
        <table className="tabla-datos w-full min-w-[62rem] border-collapse text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={claseEncabezadoColumna}>
                Foto
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Producto
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Salió de
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Va a
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
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Todavía no hay remisiones. Se registran desde la ficha de cada producto en Stock.
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.id} className="border-b border-border align-top">
                <td className={claseCeldaColumna}>
                  <MiniaturaFoto url={f.foto} nombre={f.nombre} />
                </td>
                <td className={claseCeldaColumna}>
                  <span className="block font-medium">{f.codigo}</span>
                  <span className="block text-xs text-muted-foreground">{f.nombre}</span>
                </td>
                <td className={claseCeldaColumna}>
                  <span className="block">{f.desde}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatearTiempoRelativo(f.enviadoEn)}
                    {f.referencia ? ` · ${f.referencia}` : ""}
                  </span>
                </td>
                <td className={claseCeldaColumna}>{f.hacia}</td>
                <td className={`${claseCeldaColumna} text-right tabular-nums`}>{f.enviada}</td>
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
