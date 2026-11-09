import { ControlPeriodo } from "@/components/af4/control-periodo";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { eerrDelPeriodo, VENTANA_EERR } from "@/lib/af4/eerr-periodo";
import { hoyPanama, inicioDeMes, ultimosMeses } from "@/lib/af4/fecha";
import { dinero, dineroKpi, entero, porcentaje } from "@/lib/af4/formato";
import { rangoPeriodo } from "@/lib/af4/periodo";
import { requireModulo } from "@/lib/auth";
import { cargarCatalogoTP, cargarPrecioTransferencia } from "@/lib/finanzas/cargar-precio-transferencia";
import { cargarPartes } from "@/lib/finanzas/cargar-partes";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { conParametros } from "@/lib/finanzas/entidades";
import { ajustesTP, esMercanciaPredeterminada, proveedoraDe, totalesTP } from "@/lib/finanzas/precio-transferencia";
import { pesosReparto, repartirEerr } from "@/lib/finanzas/reparto";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";
import { PoliticaTPForm, TablaReglasTP } from "./configurar-tp";
import { TablaDiferenciasTP, type FilaDiferenciaTP } from "./tabla-diferencias-tp";

export const metadata = { title: "Precio de transferencia" };

export const dynamic = "force-dynamic";

const RUTA = "/estado-resultados/precio-transferencia";
const TITULO = "Precio de transferencia";

function Vacio({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo={TITULO} imprimir={false} />
      <EstadoVacioAF4 titulo={titulo}>{children}</EstadoVacioAF4>
    </Pagina>
  );
}

/**
 * La importadora vende la mercancía a las tiendas a costo puesto en bodega + margen: lo que el libro le cargó a cada tienda
 * contra lo que le corresponde por lo que entregó, con la diferencia explicada (costo no cargado + margen de la
 * importadora). La política y los márgenes por producto o categoría se configuran aquí; el EERR por tienda con estos
 * ajustes es la vista «Precio de transferencia» del Estado de resultados. Es de toda la empresa.
 */
export default async function PrecioTransferenciaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("estado-resultados");
  const permitidas = await cargarTiendasPermitidas();
  if (!veTodaLaEmpresa(permitidas)) return <Vacio titulo="Solo para quien ve todas las tiendas" />;
  const puedeEscribir = !usuario.modulosSoloLectura.includes("estado-resultados");
  const supabase = createServiceClient();
  const params = await searchParams;
  const hoy = hoyPanama();
  const mesEnCurso = inicioDeMes(hoy);
  const ventana = ultimosMeses(hoy, VENTANA_EERR);
  const [partesR, catalogo, actualizado] = await Promise.all([cargarPartes(supabase, ventana, null), cargarCatalogoTP(supabase), ultimaActualizacionLibro(supabase)]);
  if ("error" in partesR) return <Vacio titulo="Falta el estado de resultados por partes">{partesR.error}</Vacio>;

  // Lo mismo que el EERR consolidado: A DISTRIBUIR repartido con la base guardada y sin lo intercompañía del libro.
  const repartido = repartirEerr(partesR.partes, pesosReparto(partesR.basePredeterminada, partesR.partes, partesR.envios, partesR.unidades), { sinIntercompania: true });
  const conDatos = [...new Set(partesR.partes.map((p) => p.periodo))];
  const { periodo, opciones } = eerrDelPeriodo(repartido.filas, conDatos, params.periodo, mesEnCurso);
  const meses = periodo.meses;
  const tp = meses.length ? await cargarPrecioTransferencia(supabase, meses[0], meses[meses.length - 1]) : null;
  if (tp && "error" in tp) return <Vacio titulo="El precio de transferencia todavía no está instalado">{tp.error}</Vacio>;

  const unidades = partesR.unidades.map((u) => ({ id: u.id, nombre: u.nombre, clase: u.clase }));
  const nombre = new Map(unidades.map((u) => [u.id, u.nombre]));
  const politica = tp?.politica ?? null;
  const r = tp ? ajustesTP({ filas: repartido.filas, ventas: tp.ventas, reglas: tp.reglas, politica: tp.politica, unidades, meses }) : null;
  const filas: FilaDiferenciaTP[] = (r?.diferencias ?? []).map((d) => ({ ...d, id: `${d.periodo}|${d.unidadId}`, tienda: nombre.get(d.unidadId) ?? "—" }));
  const t = totalesTP(r?.diferencias ?? []);
  const proveedora = politica ? proveedoraDe(politica, unidades) : null;
  const tiendas = unidades.filter((u) => u.clase === "tienda").map((u) => ({ id: u.id, nombre: u.nombre }));
  const href = (p: string) => conParametros(RUTA, { periodo: p === "u12" ? null : p });
  const hrefEerr = conParametros("/estado-resultados", { vista: "transferencia", periodo: periodo.clave === "u12" ? null : periodo.clave });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={TITULO}
        filtros={<ControlPeriodo periodo={periodo} opciones={opciones} href={href} />}
        datosHasta={conDatos.filter((m) => m <= mesEnCurso).sort().at(-1) ?? null}
        actualizado={actualizado}
        imprimir={false}
      />

      {!politica ? (
        <EstadoVacioAF4 titulo="Todavía no hay movimientos en el libro para este período" />
      ) : (
        <>
          {!proveedora && <EstadoVacioAF4 compacto titulo="Elige la importadora en la política" />}
          <FilaKpiAF4>
            <KpiAF4
              titulo="Mercancía en el libro"
              valor={dineroKpi(t.registrado)}
              subtexto={t.pctRegistrado === null ? undefined : `${porcentaje(t.pctRegistrado)} de las ventas de las tiendas`}
            />
            <KpiAF4
              titulo="A precio de transferencia"
              destacado
              valor={dineroKpi(t.esperado)}
              subtexto={t.pctEsperado === null ? undefined : `${porcentaje(t.pctEsperado)} de las ventas · ${entero(t.unidades)} unidades`}
              href={hrefEerr}
            />
            <KpiAF4 titulo="Diferencia" tono={t.diferencia > 0 ? "warning" : "neutral"} valor={dineroKpi(t.diferencia)} subtexto={`Menos EBITDA en las tiendas, más en la importadora · ${rangoPeriodo(periodo)}`} />
            <KpiAF4 titulo="Costo no cargado" valor={dineroKpi(t.costoNoCargado)} subtexto={`Costo puesto ${dinero(t.costo)}`} />
            <KpiAF4
              titulo="Margen de la importadora"
              valor={dineroKpi(t.margenImportadora)}
              subtexto={t.sinCosto > 0 ? `${entero(t.sinCosto)} unidades sin costo quedan fuera` : `Margen por defecto ${porcentaje(politica.margenPct)}`}
              tono={t.sinCosto > 0 ? "warning" : "neutral"}
            />
          </FilaKpiAF4>

          <section aria-labelledby="titulo-diferencias-tp" className="flex flex-col gap-2">
            <h2 id="titulo-diferencias-tp" className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
              Diferencia por tienda y mes
              <span className="text-xs font-normal text-muted-foreground">Diferencia = costo no cargado + margen de la importadora</span>
            </h2>
            <TablaDiferenciasTP filas={filas} />
          </section>

          <PoliticaTPForm
            politica={politica}
            proveedora={proveedora}
            tiendas={tiendas}
            tiposCosto={catalogo.tiposCosto}
            tiposPredeterminados={catalogo.tiposCosto.filter(esMercanciaPredeterminada)}
            puedeEscribir={puedeEscribir}
          />
          <TablaReglasTP reglas={tp?.reglas ?? []} productos={catalogo.productos} categorias={catalogo.categorias} puedeEscribir={puedeEscribir} />
        </>
      )}
    </Pagina>
  );
}
