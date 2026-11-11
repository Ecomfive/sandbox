"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, porcentaje, SIN_DATO } from "@/lib/af4/formato";
import { anularMovimiento, marcarAtipicoRevisado, marcarNoDuplicado } from "../calidad-actions";

export interface MovRevisar {
  id: string;
  periodo: string;
  fecha: string;
  descripcion: string;
  monto: number;
  tienda: string;
  tipo: string;
  origen: string;
  proveedor: string | null;
}

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });
const boton = `rounded-md border border-border bg-card px-2.5 py-1 text-sm font-medium hover:bg-muted disabled:opacity-40 ${anilloFoco}`;
const enlaceMes = (m: MovRevisar) => `/libro-movimientos?periodo=${m.periodo.slice(0, 7)}`;

function Lado({ m, etiqueta }: { m: MovRevisar; etiqueta: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <span className="truncate font-medium">{m.descripcion || SIN_DATO}</span>
      <span className="text-xs text-muted-foreground">
        {fechaCorta(m.fecha)} · {m.tienda} · {m.tipo} · {m.origen}
      </span>
    </div>
  );
}

export function VistaRevisar({
  pares,
  atipicos,
  puedeEscribir,
}: {
  pares: { clave: string; similitud: number; dias: number; a: MovRevisar; b: MovRevisar }[];
  atipicos: { mov: MovRevisar; veces: number; mediana: number; z: number | null }[];
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();

  const correr = (accion: () => Promise<{ error?: string }>, hecho: string) =>
    empezar(async () => {
      const r = await accion().catch(() => ({ error: "Se cortó la conexión." }));
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(hecho);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-6">
      <MarcoAF4 id="titulo-duplicados" titulo="Posibles duplicados" detalle="mismo monto, ±3 días y descripción o proveedor parecido" sinRelleno>
        {pares.length === 0 ? (
          <div className="p-3">
            <EstadoVacioAF4 compacto titulo="Sin posibles duplicados" />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {pares.map((p) => (
              <li key={p.clave} className="flex flex-col gap-3 px-4 py-3 text-sm lg:flex-row lg:items-center">
                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                  <Lado m={p.a} etiqueta="A" />
                  <Lado m={p.b} etiqueta="B" />
                </div>
                <div className="flex shrink-0 flex-col items-start gap-0.5 lg:items-end">
                  <span className={`font-semibold ${claseCifra}`}>{usd(p.a.monto)}</span>
                  <span className="text-xs text-muted-foreground">
                    {porcentaje(p.similitud * 100, { decimales: 0 })} parecido · {p.dias === 0 ? "mismo día" : `${p.dias} días`}
                  </span>
                </div>
                {puedeEscribir && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" className={boton} disabled={pendiente} onClick={() => correr(() => marcarNoDuplicado(p.a.id, p.b.id), "Marcado: no es duplicado")}>
                      No es duplicado
                    </button>
                    <button type="button" className={boton} disabled={pendiente} onClick={() => correr(() => anularMovimiento(p.a.id, `Duplicado de «${p.b.descripcion.slice(0, 60)}»`), "A anulado")}>
                      Anular A
                    </button>
                    <button type="button" className={boton} disabled={pendiente} onClick={() => correr(() => anularMovimiento(p.b.id, `Duplicado de «${p.a.descripcion.slice(0, 60)}»`), "B anulado")}>
                      Anular B
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </MarcoAF4>

      <MarcoAF4 id="titulo-atipicos" titulo="Montos atípicos" detalle="más de 3× la mediana de su tipo en los 6 meses anteriores" sinRelleno>
        {atipicos.length === 0 ? (
          <div className="p-3">
            <EstadoVacioAF4 compacto titulo="Sin montos atípicos por revisar" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla-datos w-full text-sm">
              <caption className="sr-only">Montos atípicos</caption>
              <thead>
                <tr className={claseFilaEncabezado}>
                  <th scope="col" className={claseEncabezadoColumna}>Fecha</th>
                  <th scope="col" className={claseEncabezadoColumna}>Descripción</th>
                  <th scope="col" className={claseEncabezadoColumna}>Tipo</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Monto</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Mediana</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Veces</th>
                  {puedeEscribir && <th scope="col" className={claseEncabezadoColumna}><span className="sr-only">Acciones</span></th>}
                </tr>
              </thead>
              <tbody>
                {atipicos.map((a) => (
                  <tr key={a.mov.id} className="border-t border-border/60">
                    <td className={`${claseCeldaColumna} whitespace-nowrap ${claseCifra}`}>{fechaCorta(a.mov.fecha)}</td>
                    <td className={`${claseCeldaColumna} max-w-md`}>
                      <Link href={enlaceMes(a.mov)} className={`block truncate underline-offset-2 hover:underline ${anilloFoco}`}>
                        {a.mov.descripcion || SIN_DATO}
                      </Link>
                      <span className="text-xs text-muted-foreground">{a.mov.tienda}</span>
                    </td>
                    <td className={claseCeldaColumna}>{a.mov.tipo}</td>
                    <td className={`${claseCeldaColumna} text-right whitespace-nowrap ${claseCifra}`}>
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                        {usd(a.mov.monto)}
                      </span>
                    </td>
                    <td className={`${claseCeldaColumna} text-right whitespace-nowrap text-muted-foreground ${claseCifra}`}>{usd(a.mediana)}</td>
                    <td className={`${claseCeldaColumna} text-right ${claseCifra}`}>{a.veces}×</td>
                    {puedeEscribir && (
                      <td className={claseCeldaColumna}>
                        <button type="button" className={boton} disabled={pendiente} aria-label={`Marcar revisado «${a.mov.descripcion.slice(0, 40)}»`} onClick={() => correr(() => marcarAtipicoRevisado(a.mov.id), "Marcado como revisado")}>
                          Revisado
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MarcoAF4>
    </div>
  );
}
