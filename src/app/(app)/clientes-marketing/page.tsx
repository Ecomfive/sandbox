import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero, dinero2, entero, fraccion, veces } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { LTV_CAC_MINIMO, POAS_MINIMO, ltvCacBajo, poasBajo } from "@/lib/clientes/metricas";
import { createServiceClient } from "@/lib/supabase/server";
import { BotonRecalcular } from "./boton-recalcular";
import { cargarDatosPagina, comparador, filasTiendaMes, hrefClientes, indicadoresDe } from "./datos";
import { meses } from "./formato";
import { Selectores } from "./selectores";
import { TablaTiendasMes } from "./tabla-tiendas-mes";

export const metadata = { title: "Clientes y marketing" };

export const dynamic = "force-dynamic";

const MODULO = "clientes-marketing";
const TITULO = "Clientes y marketing";

export default async function ClientesMarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireModulo(MODULO);
  const puedeEscribir = !usuario.modulosSoloLectura.includes(MODULO);
  const datos = await cargarDatosPagina(createServiceClient(), await searchParams);

  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={TITULO} imprimir={false} />
        <EstadoVacioAF4 titulo="Faltan las tablas de clientes">Correr la migración 0920 (clientes y marketing) en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }

  const { periodo, tienda, ambito, calidad } = datos;
  const clientesCalculados = Object.values(calidad.clientesPorTipo).some((n) => n > 0);
  if (!datos.conDatos.length || !clientesCalculados) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4
          titulo={TITULO}
          imprimir={false}
          acciones={datos.conDatos.length > 0 && puedeEscribir ? <BotonRecalcular pendientes={0} /> : undefined}
        />
        {datos.conDatos.length ? (
          <EstadoVacioAF4 titulo="Todavía no se calcularon los clientes" />
        ) : (
          <EstadoVacioAF4 titulo="Todavía no hay órdenes en Ventas por tienda" accion={{ href: "/ventas-tiendas", etiqueta: "Ir a Ventas por tienda" }} />
        )}
      </Pagina>
    );
  }

  const i = indicadoresDe(datos, ambito, periodo.meses);
  const { vs, vsPuntos } = comparador(datos, ambito);
  const filas = filasTiendaMes(datos);
  const totalOrdenes = Object.values(calidad.ordenesPorCalidad).reduce((a, b) => a + b, 0);
  const sinTelefono = calidad.ordenesPorCalidad.invalido + calidad.ordenesPorCalidad.sospechoso + calidad.ordenesPorCalidad.sin_dato;
  const descarga = {
    href: hrefClientes("/clientes-marketing/exportar", { periodo: periodo.clave, tienda: tienda?.id }),
    etiqueta: "Todo en Excel",
    detalle: "Por tienda y mes, cohortes y marketing",
  };

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={TITULO}
        filtros={<Selectores datos={datos} ruta="/clientes-marketing" />}
        datosHasta={datos.conDatos.at(-1) ?? null}
        descarga={{ href: descarga.href }}
        acciones={puedeEscribir ? <BotonRecalcular pendientes={calidad.ordenesSinCliente} /> : undefined}
      />

      <FilaKpiAF4>
        <KpiAF4
          titulo="Clientes nuevos"
          destacado
          valor={entero(i.nuevos)}
          comparaciones={vs(i.nuevos, (x) => x.nuevos)}
          subtexto={`${entero(i.compradores)} compraron · ${entero(i.recurrentes)} recurrentes`}
        />
        <KpiAF4
          titulo="Recompra a 90 días"
          valor={fraccion(i.recompra90)}
          comparaciones={vsPuntos(i.recompra90, (x) => x.recompra90)}
          subtexto={i.recompra90Estimado ? "De cohortes anteriores" : undefined}
          href={hrefClientes("/clientes-marketing/cohortes", { tienda: tienda?.id })}
        />
        <KpiAF4
          titulo="CAC"
          valor={dinero2(i.cac)}
          comparaciones={vs(i.cac, (x) => x.cac, "menos-es-mejor")}
          subtexto={`Marketing ${dinero(i.gasto)}`}
        />
        <KpiAF4
          titulo="LTV 180 días"
          valor={dinero2(i.ltv180)}
          comparaciones={vs(i.ltv180, (x) => x.ltv180)}
          subtexto={i.ltv180Estimado ? "De cohortes anteriores" : "Margen de contribución por cliente"}
        />
        <KpiAF4
          titulo="LTV/CAC"
          tono={ltvCacBajo(i.ltvCac) ? "destructive" : "neutral"}
          valor={veces(i.ltvCac)}
          comparaciones={vs(i.ltvCac, (x) => x.ltvCac)}
          subtexto={i.sinRecuperar ? "No recupera el CAC todavía" : i.recuperacion ? `Recupera el CAC en ${meses(i.recuperacion)}` : `Mínimo ${veces(LTV_CAC_MINIMO)}`}
        />
        <KpiAF4
          titulo="ROAS"
          valor={veces(i.roas)}
          comparaciones={vs(i.roas, (x) => x.roas)}
          subtexto={`Ventas ${dinero(i.ventas)}`}
          href={hrefClientes("/clientes-marketing/marketing", { periodo: periodo.clave, tienda: tienda?.id })}
        />
        <KpiAF4
          titulo="ROAS de margen"
          tono={poasBajo(i.poas) ? "destructive" : "neutral"}
          valor={veces(i.poas)}
          comparaciones={vs(i.poas, (x) => x.poas)}
          subtexto={`Mínimo ${veces(POAS_MINIMO)}`}
        />
      </FilaKpiAF4>

      {(i.mesesSinLibro.length > 0 || sinTelefono > 0) && (
        <KpiGroup titulo="Pendientes de datos">
          <KpiGrid compacta>
            {i.mesesSinLibro.length > 0 && (
              <KpiCard compacta tono="warning" titulo="Meses sin libro" valor={i.mesesSinLibro.map(mesCorto).join(", ")} subtexto="Fuera de CAC y ROAS" />
            )}
            {sinTelefono > 0 && (
              <KpiCard
                compacta
                tono="warning"
                titulo="Órdenes sin teléfono válido"
                valor={entero(sinTelefono)}
                subtexto={`${fraccion(totalOrdenes ? sinTelefono / totalOrdenes : null)} · ${entero(calidad.ordenesPorCalidad.sospechoso)} sospechosos`}
              />
            )}
          </KpiGrid>
        </KpiGroup>
      )}

      <section aria-labelledby="titulo-tienda-mes" className="flex flex-col gap-2">
        <h2 id="titulo-tienda-mes" className="text-sm font-semibold">
          Por tienda y mes <span className="font-normal text-muted-foreground">· {tienda?.nombre ?? "Todas las tiendas"} · {periodo.etiqueta}</span>
        </h2>
        <TablaTiendasMes filas={filas} descarga={descarga} />
      </section>
    </Pagina>
  );
}
