import { CLASE_FILA_AF4, claseCeldaAF4, claseNumeroAF4 } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { DesplazableX } from "@/components/ui/desplazable-x";
import { dinero, porcentaje } from "@/lib/af4/formato";
import { sobreTecho, type PautaTienda } from "@/lib/finanzas/pauta";

/**
 * La pauta de cada tienda propia contra su techo (mejora 6): pauta (mayor entre libro y Meta), ventas esperadas, el %,
 * el techo y cuánto vale bajar al techo (en el período y al año). La comparten el Comité, Rentabilidad y el Panel.
 */
export function TablaTechoPauta({
  id,
  titulo,
  detalle,
  filas,
  nombres,
}: {
  id: string;
  titulo: string;
  detalle?: string;
  filas: PautaTienda[];
  /** id de la tienda → nombre. */
  nombres: Record<string, string>;
}) {
  const total = filas.reduce(
    (a, f) => ({ pauta: a.pauta + f.pauta, ventas: a.ventas + f.ventas, excedente: a.excedente + f.excedente, anual: a.anual + f.excedenteAnual }),
    { pauta: 0, ventas: 0, excedente: 0, anual: 0 },
  );
  return (
    <MarcoAF4 id={id} titulo={titulo} detalle={detalle} sinRelleno>
      {filas.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Sin pauta ni ventas de tiendas propias en este período</p>
      ) : (
        <DesplazableX ariaLabel={titulo} className="rounded-b-xl">
          <table className="tabla-datos w-full text-[13px]">
            <caption className="sr-only">{titulo}</caption>
            <thead>
              <tr className={claseFilaEncabezado}>
                {["Tienda", "Pauta", "Ventas", "Pauta ÷ ventas", "Techo", "Excedente", "Excedente al año"].map((c, i) => (
                  <th key={c} scope="col" className={`${claseEncabezadoColumna} whitespace-nowrap ${i ? "text-right" : "text-left"}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const sobre = sobreTecho(f);
                return (
                  <tr key={f.unidadId} className={CLASE_FILA_AF4.seccion}>
                    <th scope="row" className={`${claseCeldaAF4} text-left font-medium`}>
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${sobre ? "bg-destructive" : "bg-success"}`} />
                        {nombres[f.unidadId] ?? "—"}
                        <span className="sr-only">{sobre ? " (sobre el techo)" : " (dentro del techo)"}</span>
                      </span>
                    </th>
                    <td className={claseNumeroAF4}>{dinero(f.pauta)}</td>
                    <td className={claseNumeroAF4}>{dinero(f.ventas)}</td>
                    <td className={`${claseNumeroAF4} ${sobre ? "font-semibold" : ""}`}>{f.pct === null ? "Sin ventas" : porcentaje(f.pct)}</td>
                    <td className={claseNumeroAF4}>{porcentaje(f.techo, { decimales: 0 })}</td>
                    <td className={claseNumeroAF4}>{f.excedente > 0 ? dinero(f.excedente) : "—"}</td>
                    <td className={claseNumeroAF4}>{f.excedenteAnual > 0 ? dinero(f.excedenteAnual) : "—"}</td>
                  </tr>
                );
              })}
              <tr className={CLASE_FILA_AF4.total}>
                <th scope="row" className={`${claseCeldaAF4} text-left`}>
                  Total
                </th>
                <td className={claseNumeroAF4}>{dinero(total.pauta)}</td>
                <td className={claseNumeroAF4}>{dinero(total.ventas)}</td>
                <td className={claseNumeroAF4}>{total.ventas > 0 ? porcentaje((total.pauta / total.ventas) * 100) : "—"}</td>
                <td className={claseNumeroAF4} />
                <td className={claseNumeroAF4}>{total.excedente > 0 ? dinero(total.excedente) : "—"}</td>
                <td className={claseNumeroAF4}>{total.anual > 0 ? dinero(total.anual) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </DesplazableX>
      )}
    </MarcoAF4>
  );
}
