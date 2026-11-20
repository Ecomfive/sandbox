import Link from "next/link";
import { claseCifra } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { anilloFoco } from "@/components/ui/field";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, entero } from "@/lib/af4/formato";
import type { AntiguedadCuenta } from "@/lib/conciliacion/antiguedad";

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

function Tramo({ n, monto, alerta }: { n: number; monto: number; alerta?: boolean }) {
  if (!n) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col items-end">
      <span className="inline-flex items-center gap-1.5">
        {alerta && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
        {entero(n)}
      </span>
      <span className="text-xs text-muted-foreground">{usd(monto)}</span>
    </span>
  );
}

/**
 * Lo que falta conciliar en cada cuenta por antigüedad (0-7, 8-30, más de 30 días) y cuándo se concilió por última vez
 * (mejoras 14 y 17). Una cuenta con algo abierto y sin conciliar hace más de `diasAlerta` días lleva el punto de aviso.
 */
export function EstadoCuentas({ filas, nombres, diasAlerta, href }: { filas: AntiguedadCuenta[]; nombres: Map<string, string>; diasAlerta: number; href: (cuenta: string) => string }) {
  if (!filas.length) return null;
  const atrasadas = filas.filter((f) => f.atrasada).length;
  return (
    <MarcoAF4
      id="estado-cuentas"
      titulo="Estado de las cuentas"
      detalle={atrasadas ? `${entero(atrasadas)} ${atrasadas === 1 ? "atrasada" : "atrasadas"} · más de ${diasAlerta} días sin conciliar` : `al día · aviso a los ${diasAlerta} días`}
      sinRelleno
    >
      <ContenedorTabla ariaLabel="Lo que falta conciliar en cada cuenta, por antigüedad">
        <table className="tabla-datos w-full text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={claseEncabezadoColumna}>Cuenta</th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>0 a 7 días</th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>8 a 30 días</th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Más de 30 días</th>
              <th scope="col" className={claseEncabezadoColumna}>Última conciliación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map((f) => (
              <tr key={f.cuentaId}>
                <th scope="row" className={`${claseCeldaColumna} text-left font-medium`}>
                  <Link href={href(f.cuentaId)} className={`hover:underline ${anilloFoco} rounded-sm`}>
                    {nombres.get(f.cuentaId) ?? "Cuenta"}
                  </Link>
                </th>
                <td className={`${claseCeldaColumna} text-right ${claseCifra}`}>
                  <Tramo n={f.tramos.hasta7} monto={f.montos.hasta7} />
                </td>
                <td className={`${claseCeldaColumna} text-right ${claseCifra}`}>
                  <Tramo n={f.tramos.hasta30} monto={f.montos.hasta30} />
                </td>
                <td className={`${claseCeldaColumna} text-right ${claseCifra}`}>
                  <Tramo n={f.tramos.mas30} monto={f.montos.mas30} alerta />
                </td>
                <td className={claseCeldaColumna}>
                  <span className="inline-flex items-center gap-1.5">
                    {f.atrasada && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />}
                    {f.ultimaConciliacion ? fechaCorta(f.ultimaConciliacion.slice(0, 10)) : "Nunca"}
                    {f.diasSinConciliar !== null && <span className="text-muted-foreground">· hace {entero(f.diasSinConciliar)} días</span>}
                    {f.atrasada && <span className="sr-only"> (atrasada)</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ContenedorTabla>
    </MarcoAF4>
  );
}
