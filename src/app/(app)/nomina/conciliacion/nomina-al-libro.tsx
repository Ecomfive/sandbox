"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { dinero2 } from "@/lib/af4/formato";
import { devolverNominaDelLibro, pasarNominaAlLibro } from "./actions";
import { DesplazableX } from "@/components/ui/desplazable-x";

export interface FilaCuadroVista {
  unidad: string;
  libroSueldos: number;
  nominaFormal: number;
  libroOtros: number;
  nominaExterna: number;
  seQuedan: number;
  diferencia: number;
}

const th = `${claseEncabezadoColumna} whitespace-nowrap`;
const thNum = `${th} text-right`;
const td = `${claseCeldaColumna} whitespace-nowrap`;
const tdNum = `${td} text-right tabular-nums`;

function Celda({ valor }: { valor: number }) {
  return <td className={tdNum}>{valor ? dinero2(valor) : "—"}</td>;
}

export function NominaAlLibro({
  periodo,
  mes,
  filas,
  reemplazar,
  yaPasado,
  activo,
  cerrado,
  puedeEscribir,
}: {
  periodo: string;
  /** «mar 26». */
  mes: string;
  filas: FilaCuadroVista[];
  /** Ids de los sueldos del libro que se reemplazan (los que la persona confirma). */
  reemplazar: string[];
  yaPasado: boolean;
  activo: boolean;
  cerrado: boolean;
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [confirmado, setConfirmado] = useState(false);
  const [deshacer, setDeshacer] = useState(false);

  const total = (f: (x: FilaCuadroVista) => number) => filas.reduce((a, x) => a + f(x), 0);
  const diferencia = total((x) => x.diferencia);
  const hayNomina = total((x) => x.nominaFormal + x.nominaExterna) !== 0;
  const listo = hayNomina && (reemplazar.length === 0 || confirmado);

  function pasar() {
    if (!listo) return;
    empezar(async () => {
      const r = await pasarNominaAlLibro(periodo, confirmado ? reemplazar : []).catch(() => ({ error: "No se pudo pasar la nómina al libro." }) as { error?: string; mensaje?: string });
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(r.mensaje ?? "Listo");
        setConfirmado(false);
        router.refresh();
      }
    });
  }

  function devolver() {
    empezar(async () => {
      const r = await devolverNominaDelLibro(periodo).catch(() => ({ error: "No se pudo deshacer." }) as { error?: string; mensaje?: string });
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(r.mensaje ?? "Listo");
        setDeshacer(false);
        router.refresh();
      }
    });
  }

  return (
    <MarcoAF4 id="titulo-al-libro" titulo="Nómina al libro" detalle={yaPasado ? `${mes} · en el libro` : mes} sinRelleno>
      <DesplazableX ariaLabel={`Libro contra nómina por tienda, ${mes}`}>
        <table className="tabla-datos w-full text-sm">
          <caption className="sr-only">Sueldos del libro que la nómina reemplaza y lo que se crea, por tienda</caption>
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={th}>Tienda</th>
              <th scope="col" className={thNum}>SUELDOS libro</th>
              <th scope="col" className={thNum}>Planilla (neto)</th>
              <th scope="col" className={thNum}>OTROS SUELDOS libro</th>
              <th scope="col" className={thNum}>Externa (USDT)</th>
              <th scope="col" className={thNum}>Se quedan</th>
              <th scope="col" className={thNum}>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.unidad} className="border-t border-border/60">
                <th scope="row" className={`${td} text-left font-normal`}>{f.unidad}</th>
                <Celda valor={f.libroSueldos} />
                <Celda valor={f.nominaFormal} />
                <Celda valor={f.libroOtros} />
                <Celda valor={f.nominaExterna} />
                <td className={`${tdNum} text-muted-foreground`}>{f.seQuedan ? dinero2(f.seQuedan) : "—"}</td>
                <td className={`${tdNum} font-medium`}>{dinero2(f.diferencia)}</td>
              </tr>
            ))}
            <tr className="border-t border-border-control border-b-[3px] border-b-border-control border-double font-semibold">
              <th scope="row" className={`${td} text-left`}>Total</th>
              <td className={tdNum}>{dinero2(total((x) => x.libroSueldos))}</td>
              <td className={tdNum}>{dinero2(total((x) => x.nominaFormal))}</td>
              <td className={tdNum}>{dinero2(total((x) => x.libroOtros))}</td>
              <td className={tdNum}>{dinero2(total((x) => x.nominaExterna))}</td>
              <td className={tdNum}>{dinero2(total((x) => x.seQuedan))}</td>
              <td className={tdNum}>{dinero2(diferencia)}</td>
            </tr>
          </tbody>
        </table>
      </DesplazableX>

      {cerrado ? (
        <p className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
          {mes} está cerrado: el libro de ese mes no se cambia.
        </p>
      ) : (
        puedeEscribir && (
          <div className="flex flex-col gap-3 border-t border-border p-4 text-sm">
            {activo && reemplazar.length > 0 && (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} disabled={pendiente} />
                <span>
                  Sacar del EERR y del flujo {reemplazar.length === 1 ? "el sueldo" : `los ${reemplazar.length} sueldos`} del Excel de {mes} y poner la
                  nómina en su lugar. El gasto en sueldos {diferencia === 0 ? "no cambia" : `${diferencia > 0 ? "sube" : "baja"} ${dinero2(Math.abs(diferencia))}`}.
                </span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {activo && (
                <Button type="button" onClick={pasar} disabled={pendiente || !listo}>
                  {pendiente ? "Guardando…" : `${yaPasado ? "Volver a pasar" : "Pasar"} la nómina de ${mes} al libro`}
                </Button>
              )}
              {yaPasado &&
                (deshacer ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span>Borrar los sueldos de la nómina de {mes} y devolver los del Excel</span>
                    <Button type="button" variant="secondary" onClick={devolver} disabled={pendiente}>
                      Devolver
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setDeshacer(false)} disabled={pendiente}>
                      Cancelar
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="secondary" onClick={() => setDeshacer(true)} disabled={pendiente}>
                    Volver a los sueldos del Excel
                  </Button>
                ))}
            </div>
          </div>
        )
      )}
    </MarcoAF4>
  );
}
