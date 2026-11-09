import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { nombreDePais } from "@/lib/finanzas/pais-finanzas";
import { paisDeOperacionActual } from "@/lib/finanzas/pais-servidor";
import Link from "next/link";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { anilloFoco } from "@/components/ui/field";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama } from "@/lib/af4/fecha";
import { dias, dinero, dineroKpi, entero, porcentaje, veces } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarInventario } from "@/lib/finanzas/cargar-inventario";
import { DIAS_VENTAS, ETIQUETA_TRAMO, resumirInventario, vencimientosValorizados, type TramoLento } from "@/lib/finanzas/inventario-valorizado";
import { createServiceClient } from "@/lib/supabase/server";
import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { cargarDecisiones } from "@/lib/finanzas/cargar-compras-costos";
import { esModoMerma, inventarioMuerto, mermaPorMes, montoMerma, sobrestock, type ModoMerma } from "@/lib/finanzas/inventario-decisiones";
import { AjusteInventario } from "./ajuste-inventario";
import { TablaBodegas, TablaProductos, TablaVencimientos } from "./tablas-inventario";
import { TablaMerma, TablaMuerto, TablaSobrestock } from "./tablas-decisiones";
import { TasaMantener } from "./tasa-mantener";

export const metadata = { title: "Inventario valorizado" };

export const dynamic = "force-dynamic";

const TRAMOS: TramoLento[] = ["60", "90", "180", "sin_salidas"];
const CONTEO = { href: "/rentabilidad/inventario/conteo", etiqueta: "Importar conteo" };

const VENTANAS_MUERTO = ["60", "90"] as const;

export default async function InventarioValorizadoPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("rentabilidad");
  // Inventario, compras y capital de trabajo son de toda la empresa: con tiendas limitadas no se muestran.
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Inventario" />;
  const pais = await paisDeOperacionActual(usuario.paisesPermitidos);
  if (!pais) return <SoloTodaLaEmpresa titulo="Inventario" />;
  const sp = await searchParams;
  const ventanaMuerto: "60" | "90" = sp.muerto === "60" ? "60" : "90";
  const modoMerma: ModoMerma = esModoMerma(sp.merma) ? sp.merma : "faltantes";
  const escribe = (m: string) => usuario.modulos.includes(m) && !usuario.modulosSoloLectura.includes(m);
  const puedeConteo = escribe("inventario");
  const supabase = createServiceClient();
  const hoyCarga = hoyPanama();
  const [datos, decisiones] = await Promise.all([cargarInventario(supabase, pais), cargarDecisiones(supabase, hoyCarga, pais)]);
  const accionConteo = puedeConteo ? (
    <Link href={CONTEO.href} className={`${claseAccionAF4} ${anilloFoco}`}>
      {CONTEO.etiqueta}
    </Link>
  ) : undefined;

  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Inventario valorizado" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer el inventario">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }

  const hoy = hoyCarga;
  const r = resumirInventario(datos.filas, datos.vendido, hoy, datos.tasa);
  const venc = vencimientosValorizados(datos.lotes, datos.filas);
  const ajustes = decisiones.ajustes;
  const sobre = sobrestock(r.porProducto, ajustes.sobrestockDias);
  const vendidasVentana =
    ventanaMuerto === "60" ? decisiones.vendidas60 : new Map([...datos.vendido.entries()].map(([k, v]) => [k, v.unidades]));
  const muerto = inventarioMuerto(r.porProducto, vendidasVentana, decisiones.precios, hoy, datos.tasa);
  const merma = mermaPorMes(decisiones.merma, decisiones.mermaEnLibro);
  const mermaMes = merma.find((m) => m.mes === `${hoy.slice(0, 7)}-01`) ?? null;
  const puedeLlevarMerma = escribe("rentabilidad") && escribe("libro-movimientos");
  const enlace = (cambio: Record<string, string>) => {
    const q = new URLSearchParams({ muerto: ventanaMuerto, merma: modoMerma, ...cambio });
    return `/rentabilidad/inventario?${q.toString()}`;
  };

  if (r.productos === 0) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Inventario valorizado" imprimir={false} />
        <EstadoVacioAF4 titulo={`El WMS de ${nombreDePais(pais)} no tiene stock cargado`} accion={puedeConteo ? { href: CONTEO.href, etiqueta: "Importar un conteo desde Excel" } : undefined}>
          Sin unidades no hay inventario que valorizar ni DIO.
        </EstadoVacioAF4>
      </Pagina>
    );
  }

  const conCosto = r.productos - r.sinCosto.productos;
  const contexto = `${nombreDePais(pais)} al costo · ventas de los últimos ${DIAS_VENTAS} días · USD`;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Inventario valorizado" acciones={accionConteo} />

      <FilaKpiAF4>
        <KpiAF4 titulo="Valor del inventario" destacado valor={dineroKpi(r.valor)} subtexto={`${entero(r.unidades)} unidades · ${contexto}`} />
        <KpiAF4 titulo="Rotación anual" valor={veces(r.rotacion)} subtexto={`${dinero(r.costoVendido)} de costo vendido`} />
        <KpiAF4 titulo="DIO" tono={r.dio === null ? "warning" : "neutral"} valor={r.dio === null ? "Sin ventas" : dias(r.dio)} />
        <KpiAF4
          titulo="Costo de mantener"
          valor={dineroKpi(r.costoMantenerAnual)}
          subtexto={`${dinero(r.costoMantenerMensual)} al mes · ${porcentaje(r.tasaMantener * 100)} anual`}
        />
      </FilaKpiAF4>

      <KpiGroup titulo="Pendientes de datos">
        <KpiGrid compacta>
          <KpiCard
            compacta
            titulo="Productos sin costo"
            tono={r.sinCosto.productos > 0 ? "warning" : "success"}
            valor={entero(r.sinCosto.productos)}
            subtexto={`${entero(r.sinCosto.unidades)} unidades sin valorizar · ${entero(conCosto)} con costo`}
            href={usuario.modulos.includes("costos-mercancia") ? "/costos-mercancia" : undefined}
          />
          <KpiCard
            compacta
            tono={r.negativos > 0 ? "warning" : "success"}
            titulo="Saldos negativos"
            valor={entero(r.negativos)}
            subtexto="Unidades sin valorizar"
            href={usuario.modulos.includes("inventario") ? "/inventario" : undefined}
          />
        </KpiGrid>
      </KpiGroup>

      <KpiGroup titulo="Lento movimiento · días sin salidas · USD">
        <KpiGrid compacta>
          {TRAMOS.map((t) => (
            <KpiCard
              key={t}
              compacta
              tono={r.lento[t].productos > 0 && t !== "60" ? "warning" : "neutral"}
              titulo={ETIQUETA_TRAMO[t]}
              valor={dinero(r.lento[t].valor)}
              subtexto={`${entero(r.lento[t].productos)} productos`}
            />
          ))}
          {(venc.vencido > 0 || venc.porVencer > 0) && (
            <>
              <KpiCard compacta tono={venc.vencido > 0 ? "destructive" : "neutral"} titulo="Vencido" valor={dinero(venc.vencido)} href="/inventario/vencimientos" />
              <KpiCard compacta tono={venc.porVencer > 0 ? "warning" : "neutral"} titulo="Por vencer" valor={dinero(venc.porVencer)} href="/inventario/vencimientos" />
            </>
          )}
        </KpiGrid>
      </KpiGroup>

      <KpiGroup titulo="Decisiones · USD">
        <KpiGrid compacta>
          <KpiCard
            compacta
            titulo={`Sobrestock (más de ${dias(ajustes.sobrestockDias)})`}
            tono={sobre.productos > 0 ? "warning" : "success"}
            valor={dinero(sobre.exceso)}
            subtexto={`${entero(sobre.productos)} productos`}
            href="#titulo-sobrestock"
          />
          <KpiCard
            compacta
            titulo={`Sin venta en ${ventanaMuerto} días`}
            tono={muerto.productos > 0 ? "warning" : "success"}
            valor={dinero(muerto.valor)}
            subtexto={`${entero(muerto.productos)} productos · se recuperan ${dinero(muerto.recuperacion)}`}
            href="#titulo-muerto"
          />
          <KpiCard
            compacta
            titulo="Merma del mes"
            tono={mermaMes && mermaMes.valorFaltante > 0 ? "warning" : "neutral"}
            valor={dinero(mermaMes ? montoMerma(mermaMes, modoMerma) : 0, "USD", { decimales: 2 })}
            subtexto={mermaMes ? `${entero(mermaMes.faltante)} unidades faltantes` : "Sin conteos este mes"}
            href="#titulo-merma"
          />
        </KpiGrid>
      </KpiGroup>

      {escribe("rentabilidad") && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <TasaMantener tasa={datos.tasa} />
          <AjusteInventario clave="sobrestock" valor={ajustes.sobrestockDias} />
        </div>
      )}
      {decisiones.sinMigracion && <EstadoVacioAF4 titulo="Falta la migración 0935">Sin ella no hay precios de liquidación ni merma del conteo.</EstadoVacioAF4>}

      <section aria-labelledby="titulo-sobrestock" className="flex flex-col gap-2">
        <h2 id="titulo-sobrestock" className="text-sm font-semibold">
          Sobrestock
        </h2>
        <TablaSobrestock filas={sobre.filas} />
      </section>

      <section aria-labelledby="titulo-muerto" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-muerto" className="text-sm font-semibold">
            Inventario muerto y liquidación
          </h2>
          <ControlSegmentado
            etiqueta="Días sin venta"
            elegido={ventanaMuerto}
            opciones={VENTANAS_MUERTO.map((v) => ({ valor: v, etiqueta: `${v} días`, href: enlace({ muerto: v }) }))}
          />
        </div>
        <TablaMuerto filas={muerto.filas} />
      </section>

      <section aria-labelledby="titulo-merma" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-merma" className="text-sm font-semibold">
            Merma y faltantes del conteo
          </h2>
          <ControlSegmentado
            etiqueta="Qué se lleva al EERR"
            elegido={modoMerma}
            opciones={[
              { valor: "faltantes", etiqueta: "Solo faltantes", href: enlace({ merma: "faltantes" }) },
              { valor: "neto", etiqueta: "Faltantes − sobrantes", href: enlace({ merma: "neto" }) },
            ]}
          />
        </div>
        <TablaMerma filas={merma} modo={modoMerma} puedeLlevar={puedeLlevarMerma} />
      </section>

      <section aria-labelledby="titulo-bodegas" className="flex flex-col gap-2">
        <h2 id="titulo-bodegas" className="text-sm font-semibold">
          Por bodega
        </h2>
        <TablaBodegas filas={r.porBodega} />
      </section>

      <section aria-labelledby="titulo-productos" className="flex flex-col gap-2">
        <h2 id="titulo-productos" className="text-sm font-semibold">
          Por producto
        </h2>
        <TablaProductos filas={r.porProducto} tasa={datos.tasa} umbral={ajustes.sobrestockDias} />
      </section>

      {venc.lotes.length > 0 && (
        <section aria-labelledby="titulo-vencimientos" className="flex flex-col gap-2">
          <h2 id="titulo-vencimientos" className="text-sm font-semibold">
            Vencimientos
          </h2>
          <TablaVencimientos filas={venc.lotes} />
        </section>
      )}
    </Pagina>
  );
}
