// Metas por tienda del plan anual aprobado contra lo real (Planificación › Metas, Comité y Rentabilidad). Server
// Component: solo dibuja lo que arma `cargarMetasMes`.

import Link from "next/link";
import { claseCeldaAF4, claseNumeroAF4, CLASE_FILA_AF4 } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { DesplazableX } from "@/components/ui/desplazable-x";
import { anilloFoco } from "@/components/ui/field";
import { dinero, entero, porcentaje } from "@/lib/af4/formato";
import { ETIQUETA_ESTADO_META, INDICADORES_META, estadoGeneral, type EstadoMeta, type FilaMetaTienda } from "@/lib/finanzas/metas-plan";

export const PUNTO_META: Record<EstadoMeta, string> = { cumple: "bg-success", cerca: "bg-warning", lejos: "bg-destructive", sin_datos: "bg-muted-foreground" };

function valor(formato: "dinero" | "entero" | "porcentaje", v: number | null): string {
  if (formato === "dinero") return dinero(v);
  if (formato === "entero") return entero(v);
  return porcentaje(v);
}

function Punto({ estado }: { estado: EstadoMeta }) {
  return (
    <span className="inline-flex items-center">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_META[estado]}`} />
      <span className="sr-only">{ETIQUETA_ESTADO_META[estado]}</span>
    </span>
  );
}

export function TablaMetas({
  id,
  titulo,
  detalle,
  filas,
  total,
  nombres,
  accion,
}: {
  id: string;
  titulo: string;
  detalle?: string;
  filas: FilaMetaTienda[];
  total?: FilaMetaTienda;
  nombres: Record<string, string>;
  accion?: { href: string; etiqueta: string };
}) {
  const enlace = accion ? (
    <Link href={accion.href} className={`rounded text-xs font-medium text-foreground-soft underline-offset-2 hover:underline ${anilloFoco}`}>
      {accion.etiqueta}
    </Link>
  ) : undefined;
  const fila = (f: FilaMetaTienda, nombre: string, peso: "seccion" | "total") => (
    <tr key={f.unidadId} className={CLASE_FILA_AF4[peso]}>
      <th scope="row" className={`${claseCeldaAF4} text-left font-medium`}>
        <span className="flex items-center gap-2">
          <Punto estado={estadoGeneral(f)} />
          {nombre}
        </span>
      </th>
      {INDICADORES_META.map((d) => (
        <td key={d.clave} className={claseNumeroAF4}>
          <span className="flex items-center justify-end gap-1.5">
            <Punto estado={f.estado[d.clave]} />
            <span className="font-medium">{valor(d.formato, f.real[d.clave])}</span>
          </span>
          <span className="block text-xs text-muted-foreground">Meta {valor(d.formato, f.meta[d.clave])}</span>
        </td>
      ))}
      <td className={claseNumeroAF4}>
        {f.enMeta} de {f.conDato}
      </td>
    </tr>
  );
  return (
    <MarcoAF4 id={id} titulo={titulo} detalle={detalle} accion={enlace} sinRelleno>
      <DesplazableX ariaLabel={titulo} className="rounded-b-xl">
        <table className="tabla-datos w-full text-[13px]">
          <caption className="sr-only">{`${titulo}: lo real de cada tienda contra la meta del plan aprobado, con su semáforo`}</caption>
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={`${claseEncabezadoColumna} text-left`}>
                Tienda
              </th>
              {INDICADORES_META.map((d) => (
                <th key={d.clave} scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                  {d.etiqueta}
                </th>
              ))}
              <th scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                En meta
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => fila(f, nombres[f.unidadId] ?? "—", "seccion"))}
            {total && filas.length > 1 && fila(total, "Total", "total")}
          </tbody>
        </table>
      </DesplazableX>
    </MarcoAF4>
  );
}
