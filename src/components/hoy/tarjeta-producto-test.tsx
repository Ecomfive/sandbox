import Link from "next/link";
import { CabeceraTarjeta, Punto } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { CPA_OBJETIVO, porcentaje, usd } from "@/app/(app)/productos-test/informe";
import type { ResumenTestHoy } from "@/lib/hoy";

/** «Producto en test»: lo testeado en el período elegido, con su CPA frente al objetivo y el enlace al informe. */
export function TarjetaProductoTest({ resumen, periodo }: { resumen: ResumenTestHoy; periodo: string }) {
  const celdas: { titulo: string; valor: string; detalle: string; punto?: "exito" }[] = [
    { titulo: "Testeados", valor: resumen.testeados.toLocaleString("es-CR"), detalle: periodo },
    {
      titulo: "Winners",
      valor: resumen.ganadores.toLocaleString("es-CR"),
      detalle: resumen.testeados ? `${porcentaje(resumen.tasa, 0)} de los testeados` : "sin tests",
      punto: resumen.ganadores > 0 ? "exito" : undefined,
    },
    { titulo: "Fallidos", valor: resumen.fallidos.toLocaleString("es-CR"), detalle: `CPA no menor a ${usd(CPA_OBJETIVO)}` },
    { titulo: "En consulta", valor: resumen.consulta.toLocaleString("es-CR"), detalle: "por decidir" },
  ];

  return (
    <section aria-labelledby="titulo-test-hoy" className="min-w-0 rounded-[10px] border border-border bg-card">
      <CabeceraTarjeta id="titulo-test-hoy" titulo="Producto en test">
        <Link href="/productos-test" className={`rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground ${anilloFoco}`}>
          Ver informe
        </Link>
      </CabeceraTarjeta>
      {resumen.testeados === 0 ? (
        <p className="m-0 px-4 py-8 text-center text-sm text-muted-foreground">No hay productos con «Fecha Test» en este período.</p>
      ) : (
        <>
          <div className="flex flex-wrap">
            {celdas.map((c) => (
              <div key={c.titulo} className="-mr-px -mb-px min-w-0 flex-[1_1_8rem] border-r border-b border-border px-3.5 py-3">
                <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {c.punto && <Punto tono={c.punto} />}
                  {c.titulo}
                </p>
                <p className="m-0 mt-0.5 text-[22px] leading-tight font-semibold tracking-tight tabular-nums">{c.valor}</p>
                <p className="m-0 text-xs text-muted-foreground">{c.detalle}</p>
              </div>
            ))}
          </div>
          <p className="m-0 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
            {resumen.cpa === null ? (
              "Sin compras en el período: no hay CPA."
            ) : (
              <>
                CPA global <b className="font-semibold text-foreground tabular-nums">{usd(resumen.cpa)}</b>
                {" · "}
                <span className={resumen.cpa < CPA_OBJETIVO ? "text-success" : "text-destructive"}>
                  {resumen.cpa < CPA_OBJETIVO ? "dentro del objetivo" : "por encima del objetivo"} de {usd(CPA_OBJETIVO)}
                </span>
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}
