import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, inicioDeMes } from "@/lib/af4/fecha";
import { dinero, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarCostosVigentes } from "@/lib/finanzas/cargar-costos";
import { createServiceClient } from "@/lib/supabase/server";
import { TablaCostos } from "./tabla-costos";

export const metadata = { title: "Costos de mercancía" };

export const dynamic = "force-dynamic";

export default async function CostosMercanciaPage() {
  await requireModulo("costos-mercancia");
  const r = await cargarCostosVigentes(createServiceClient());
  if ("error" in r) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Costos de mercancía" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudieron leer los costos" accion={{ href: "/costos-mercancia/importar", etiqueta: "Importar Excel" }}>
          {r.error}
        </EstadoVacioAF4>
      </Pagina>
    );
  }
  const { filas } = r;
  const lotes = filas.reduce((a, f) => a + f.lotes, 0);
  const subieron = filas.filter((f) => f.lotes > 1 && (f.variacion ?? 0) >= 10);
  const ultima = filas.map((f) => f.llegada).filter(Boolean).sort().at(-1);
  const conUnidades = filas.filter((f) => f.costoPromedio !== null && f.unidades);
  const costoMedio = conUnidades.length ? conUnidades.reduce((a, f) => a + f.costoVigente, 0) / conUnidades.length : null;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Costos de mercancía" datosHasta={ultima ? inicioDeMes(ultima) : null} />
      {!filas.length ? (
        <EstadoVacioAF4 titulo="Todavía no hay costos de mercancía" accion={{ href: "/costos-mercancia/importar", etiqueta: "Importar Excel" }} />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4 titulo="Productos con costo" valor={entero(filas.length)} />
            <KpiAF4 titulo="Lotes cargados" valor={entero(lotes)} subtexto={ultima ? `Última llegada ${fechaCorta(ultima)}` : undefined} />
            <KpiAF4
              titulo="Último lote 10 % más caro"
              tono={subieron.length ? "warning" : "neutral"}
              valor={entero(subieron.length)}
              subtexto="que su promedio"
            />
            {costoMedio !== null && <KpiAF4 titulo="Costo unitario medio" valor={dinero(costoMedio, "USD", { decimales: 2, decimalesMax: 4 })} subtexto="USD" />}
          </FilaKpiAF4>
          <TablaCostos filas={filas} />
        </>
      )}
    </Pagina>
  );
}
