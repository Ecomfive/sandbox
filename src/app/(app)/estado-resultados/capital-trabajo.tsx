import { KpiCard, KpiGrid, KpiGroup, type Tono } from "@/components/ui/kpi-card";
import { formatoDinero } from "./formato";

export interface FilaCapital {
  pais: string;
  moneda: string;
  cxcPlataformas: number;
  retirosEnTransito: number;
  cxpProveedores: number;
  dso: number | null;
  dpo: number | null;
}

/** Días por encima de los cuales el dinero en plataformas se marca en ámbar (lo que tarda en volver a caja). */
const DSO_ALERTA = 30;

const dias = (v: number | null) => (v === null ? "—" : `${Math.round(v)} días`);

/** Capital de trabajo por país, cada uno en su moneda (no se suman colones con dólares). */
export function CapitalDeTrabajo({ filas: todas }: { filas: FilaCapital[] }) {
  // Solo los países con algo que mostrar: un país sin cobros, pagos ni días es una fila de ceros que no dice nada.
  const filas = todas.filter((f) => f.cxcPlataformas !== 0 || f.retirosEnTransito !== 0 || f.cxpProveedores !== 0 || f.dso !== null || f.dpo !== null);
  if (!filas.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {filas.map((f) => {
        const tonoDso: Tono = f.dso !== null && f.dso > DSO_ALERTA ? "warning" : "neutral";
        // Lo que se cobra menos lo que se debe: positivo = el ciclo genera caja con lo que está en la calle.
        const neto = f.cxcPlataformas - f.cxpProveedores;
        return (
          <KpiGroup key={f.pais} titulo={`Capital de trabajo · ${f.pais}`}>
            <KpiGrid compacta>
              <KpiCard
                compacta
                titulo="Por cobrar a plataformas"
                valor={formatoDinero(f.cxcPlataformas, f.moneda)}
                subtexto={`${formatoDinero(f.retirosEnTransito, f.moneda)} en retiros en tránsito`}
                href="/retiros"
              />
              <KpiCard compacta titulo="Por pagar a proveedores" valor={formatoDinero(f.cxpProveedores, f.moneda)} href="/compras" />
              <KpiCard
                compacta
                titulo="Neto en la calle"
                tono={neto < 0 ? "warning" : "neutral"}
                valor={formatoDinero(neto, f.moneda)}
              />
              <KpiCard compacta titulo="DSO" tono={tonoDso} valor={dias(f.dso)} />
              <KpiCard compacta titulo="DPO" valor={dias(f.dpo)} />
            </KpiGrid>
          </KpiGroup>
        );
      })}
    </div>
  );
}
