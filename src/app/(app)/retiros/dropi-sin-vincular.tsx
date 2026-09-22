import { Badge } from "@/components/ui/badge";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import {
  ETIQUETA_ESTADO_DROPI,
  ETIQUETA_MOTIVO,
  TONO_ESTADO_DROPI,
  type EstadoDropi,
  type MotivoSinVincular,
} from "@/lib/dropi/emparejar-retiros";
import { formatearFechaNumerica, formatearMoneda } from "@/lib/formato";

export interface FilaSinVincular {
  id: string;
  dropi_id: number;
  monto: number | string;
  fecha: string;
  estado_dropi: EstadoDropi;
  banco: string | null;
  concepto: string | null;
  motivo: MotivoSinVincular;
}

/** Retiros que Dropi reporta pero no traen el correlativo (#0007) de un retiro creado. Solo para revisar. */
export function DropiSinVincular({ filas, codigoPais }: { filas: FilaSinVincular[]; codigoPais: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold tracking-tight">Retiros de Dropi sin vincular</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Dropi los reportó, pero su concepto no trae el correlativo de un retiro creado aquí. Escribe el correlativo
        (por ejemplo #0007) en el concepto del retiro en Dropi y vuelve a actualizar.
      </p>

      <div className="mt-3 min-w-0 rounded-xl border border-border bg-card">
        {filas.length === 0 ? (
          <EstadoVacio mensaje="No hay retiros de Dropi pendientes de vincular." />
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-label="Tabla de retiros de Dropi sin vincular, desplazable horizontalmente con las flechas izquierda y derecha"
            className="min-w-0 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
          >
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <caption className="sr-only">Retiros de Dropi sin vincular a un retiro creado</caption>
            <thead>
              <tr className={claseFilaEncabezado}>
                {["Dropi", "Fecha", "Monto", "Estado", "Banco", "Concepto", "Motivo"].map((titulo) => (
                  <th key={titulo} scope="col" className={claseEncabezadoColumna}>
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.id} className="border-b border-border/60 last:border-0">
                  <td className={`${claseCeldaColumna} font-medium tabular-nums`}>#{fila.dropi_id}</td>
                  <td className={claseCeldaColumna}>{formatearFechaNumerica(fila.fecha)}</td>
                  <td className={`${claseCeldaColumna} font-semibold tabular-nums`}>
                    {formatearMoneda(Number(fila.monto), codigoPais)}
                  </td>
                  <td className={claseCeldaColumna}>
                    <Badge tone={TONO_ESTADO_DROPI[fila.estado_dropi]}>{ETIQUETA_ESTADO_DROPI[fila.estado_dropi]}</Badge>
                  </td>
                  <td className={`${claseCeldaColumna} text-muted-foreground`}>{fila.banco ?? "—"}</td>
                  <td className={`${claseCeldaColumna} text-muted-foreground`}>{fila.concepto ?? "—"}</td>
                  <td className={`${claseCeldaColumna} text-muted-foreground`}>{ETIQUETA_MOTIVO[fila.motivo]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
