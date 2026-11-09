import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { dinero, dineroKpi, entero, fraccion } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarCierres, semanasDisponibles } from "@/lib/deliverys/cargar";
import { TASA_OBJETIVO, textoSemana } from "@/lib/deliverys/liquidacion";
import { createServiceClient } from "@/lib/supabase/server";
import { SelectorSemana, semanaElegida } from "./selector-semana";
import { TablaCierres } from "./tabla-cierres";

export const metadata = { title: "Deliverys" };

export const dynamic = "force-dynamic";

const MODULO = "deliverys";

const tasaTexto = (v: number | null) => fraccion(v, { decimales: 0 });

export default async function DeliverysPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo(MODULO);
  const puedeEscribir = !usuario.modulosSoloLectura.includes(MODULO);
  const supabase = createServiceClient();
  const { semana: pedida } = await searchParams;

  const disponibles = await semanasDisponibles(supabase);
  const semana = "error" in disponibles ? null : semanaElegida(disponibles.semanas, pedida);
  const todo = semana ? await cargarCierres(supabase, semana) : "error" in disponibles ? disponibles : null;
  if (todo && "error" in todo) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Deliverys" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudieron leer los cierres">{todo.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  if (!semana || !todo) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Deliverys" imprimir={false} />
        <EstadoVacioAF4
          titulo="Todavía no hay entregas cargadas"
          accion={puedeEscribir ? { href: "/deliverys/importar", etiqueta: "Importar la hoja de deliverys" } : undefined}
        />
      </Pagina>
    );
  }

  const filas = todo.filas;
  const t = filas.reduce(
    (a, f) => ({
      enRuta: a.enRuta + f.enRuta,
      entregas: a.entregas + f.entregas,
      fallidas: a.fallidas + f.fallidas,
      efectivo: a.efectivo + f.cobradoEfectivo,
      aPagar: a.aPagar + f.aPagar,
      neto: a.neto + Math.max(0, f.neto),
      porRendir: a.porRendir + Math.max(0, -f.neto),
      aparte: a.aparte + f.aparte,
      pagados: a.pagados + (f.estado === "pagado" ? 1 : 0),
      abiertos: a.abiertos + (f.estado === "abierto" ? 1 : 0),
    }),
    { enRuta: 0, entregas: 0, fallidas: 0, efectivo: 0, aPagar: 0, neto: 0, porRendir: 0, aparte: 0, pagados: 0, abiertos: 0 },
  );
  const tasa = t.enRuta ? t.entregas / t.enRuta : null;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Deliverys" filtros={<SelectorSemana semanas={todo.semanas} elegida={semana} ruta="/deliverys" />} />

      <FilaKpiAF4>
        <KpiAF4
          titulo="A pagar a repartidores"
          destacado
          valor={dineroKpi(t.neto)}
          subtexto={`Tarifas y propinas ${dinero(t.aPagar)}`}
        />
        <KpiAF4
          titulo="Efectivo por rendir"
          tono={t.efectivo ? "warning" : "neutral"}
          valor={dineroKpi(t.efectivo)}
          subtexto={t.porRendir ? `${dinero(t.porRendir)} deben entregar` : undefined}
        />
        <KpiAF4
          titulo="Entregas"
          valor={entero(t.entregas)}
          subtexto={`${entero(t.enRuta)} en ruta · ${entero(t.fallidas)} fallidas`}
        />
        <KpiAF4
          titulo="Tasa de entrega"
          tono={tasa !== null && tasa < TASA_OBJETIVO ? "warning" : "success"}
          valor={tasaTexto(tasa)}
          subtexto={`Objetivo ${tasaTexto(TASA_OBJETIVO)}`}
        />
        <KpiAF4 titulo="Clicksi (aparte)" valor={dineroKpi(t.aparte)} />
      </FilaKpiAF4>

      <KpiGroup titulo="Cierres de la semana">
        <KpiGrid compacta>
          <KpiCard compacta tono={t.abiertos ? "warning" : "success"} titulo="Pagados" valor={`${entero(t.pagados)} de ${entero(filas.length)}`} />
          {t.abiertos > 0 && <KpiCard compacta tono="warning" titulo="Sin cerrar" valor={entero(t.abiertos)} />}
        </KpiGrid>
      </KpiGroup>

      <section aria-labelledby="titulo-cierres" className="flex flex-col gap-2">
        <h2 id="titulo-cierres" className="text-sm font-semibold">
          Cierres <span className="font-normal text-muted-foreground">· semana del {textoSemana(semana)}</span>
        </h2>
        <TablaCierres filas={filas} puedeEscribir={puedeEscribir} />
      </section>
    </Pagina>
  );
}
