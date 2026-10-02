import Link from "next/link";
import { CabeceraTarjeta, Pastilla, Punto } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import type { FilaCola } from "@/lib/hoy";

/**
 * «Necesita tu atención»: lo que hay por resolver hoy, con lo más pendiente primero y cada fila con su botón al
 * módulo donde se resuelve. Lo que está al día se queda abajo con una marca verde, como una lista de comprobación.
 */
export function ColaAtencion({ filas }: { filas: FilaCola[] }) {
  if (filas.length === 0) return null;
  const porAtender = filas.filter((f) => f.cantidad > 0).length;

  return (
    <section aria-labelledby="titulo-cola" className="min-w-0 rounded-[10px] border border-border bg-card">
      <CabeceraTarjeta id="titulo-cola" titulo="Necesita tu atención">
        <span className="text-xs text-muted-foreground">
          {porAtender === 0 ? "Todo al día" : `${porAtender} ${porAtender === 1 ? "tema por atender" : "temas por atender"}`}
        </span>
      </CabeceraTarjeta>
      <ul className="m-0 list-none p-0">
        {filas.map((f) => (
          <li key={f.clave} className="flex items-center gap-3.5 border-b border-border px-3.5 py-3 last:border-b-0">
            <span
              className={`min-w-[3.4rem] text-[22px] leading-none font-semibold tracking-tight tabular-nums ${f.cantidad === 0 ? "text-success" : ""}`}
            >
              {f.cantidad.toLocaleString("es-CR")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 flex items-center gap-1.5 text-[13px] font-medium">
                {f.cantidad > 0 && <Punto tono="peligro" />}
                {f.titulo}
              </p>
              <p className="m-0 text-xs text-muted-foreground">{f.descripcion}</p>
            </div>
            {f.cantidad > 0 ? (
              <Link
                href={f.href}
                className={`inline-flex h-8 shrink-0 items-center rounded-lg border border-border bg-card px-3 text-[13px] hover:bg-muted ${anilloFoco}`}
              >
                {f.accion}
                <span className="sr-only">: {f.titulo}</span>
              </Link>
            ) : (
              <Pastilla tono="exito">Al día</Pastilla>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
