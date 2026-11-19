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
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { mesCorto } from "@/lib/af4/fecha";
import { cargarInventarioContable } from "@/lib/finanzas/cargar-inventario-contable";
import { ajusteProvision, provisionObsoleto, separarConsignacion } from "@/lib/finanzas/inventario-contable";
import { BodegasConsignacion, BotonProvision } from "./contable-inventario";

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
  const mesHoy = `${hoy.slice(0, 7)}-01`;
  const costosWms = new Map<string, number>();
  for (const f of datos.filas) if (f.costoUnitario !== null) costosWms.set(f.skuId, f.costoUnitario);
  const contable = await cargarInventarioContable(supabase, pais, mesHoy, costosWms);
  // Mejora 78: lo de las bodegas en consignación no es nuestro y no suma al inventario contable.
  const { propias, consignacion } = separarConsignacion(datos.filas, contable.consignacion);
  const valorConsignacion = consignacion.reduce((a, f) => a + f.valor, 0);
  const r = resumirInventario(propias, datos.vendido, hoy, datos.tasa);
  const provision = provisionObsoleto(r.porProducto, hoy);
  const ajusteProv = ajusteProvision(provision.total, contable.provisionAnterior);
  const bodegasPais = [...new Map(datos.filas.map((f) => [f.bodegaId, { id: f.bodegaId, nombre: f.bodega, valor: 0 }])).values()]
    .map((b) => ({ ...b, valor: Math.round(datos.filas.filter((f) => f.bodegaId === b.id).reduce((a, f) => a + f.valor, 0) * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor);
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

      <KpiGroup titulo="Inventario contable · USD">
        <KpiGrid compacta>
          <KpiCard compacta titulo="Propio" valor={dinero(r.valor)} subtexto={valorConsignacion > 0 ? "Sin lo que está en consignación" : "Todo lo de las bodegas"} />
          <KpiCard compacta titulo="En consignación" valor={dinero(valorConsignacion)} subtexto="No es nuestro: no suma" href="#titulo-consignacion" />
          <KpiCard
            compacta
            titulo="En plataformas"
            valor={contable.plataformas ? dinero(contable.plataformas.valor) : "—"}
            subtexto={
              contable.plataformas
                ? `${entero(contable.plataformas.unidades)} unidades en ${contable.plataformas.porPlataforma.map((p) => p.plataforma[0].toUpperCase() + p.plataforma.slice(1)).join(", ")}${contable.plataformas.sinCosto ? ` · ${entero(contable.plataformas.sinCosto)} sin costo` : ""}`
                : "Sin lecturas de plataformas"
            }
          />
          <KpiCard
            compacta
            titulo="Provisión por obsoleto"
            tono={provision.total > 0 ? "warning" : "neutral"}
            valor={dinero(provision.total)}
            subtexto={`${dinero(provision.valorObsoleto)} con más de 120 días sin salidas`}
            href="#titulo-provision"
          />
          {contable.porPais.length > 1 &&
            contable.porPais.map((p) => <KpiCard key={p.pais} compacta titulo={nombreDePais(p.pais)} valor={dinero(p.valor)} subtexto="Inventario de hoy" />)}
          {pais === "PA" && contable.fotoCierre && (
            <KpiCard compacta titulo={`Balance al cierre de ${mesCorto(contable.fotoCierre.periodo)}`} valor={dinero(contable.fotoCierre.valor)} subtexto="La foto del inventario que usa el balance" href="/balance-general" />
          )}
        </KpiGrid>
      </KpiGroup>

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

      <div className="grid gap-6 lg:grid-cols-2">
        <MarcoAF4
          id="titulo-provision"
          titulo="Provisión por inventario obsoleto"
          detalle="120 a 179 días sin salidas: 50 % · 180 o más o sin salidas: 100 %"
          accion={pais === "PA" && escribe("rentabilidad") && escribe("libro-movimientos") && Math.abs(ajusteProv) >= 0.005 ? <BotonProvision ajuste={ajusteProv} /> : undefined}
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {provision.porTramo.map((t) => (
              <div key={t.etiqueta}>
                <dt className="text-xs text-muted-foreground">{t.etiqueta}</dt>
                <dd className="tabular-nums">
                  {dinero(t.provision)} <span className="text-xs text-muted-foreground">de {dinero(t.valor)}</span>
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-xs text-muted-foreground">Ya en el libro</dt>
              <dd className="tabular-nums">{dinero(contable.provisionAnterior + (contable.provisionMes ?? 0))}</dd>
            </div>
          </dl>
          {provision.lineas.length > 0 && (
            <ul className="mt-3 flex flex-col gap-0.5 text-xs text-muted-foreground">
              {provision.lineas.slice(0, 8).map((l) => (
                <li key={l.skuId} className="flex justify-between gap-3">
                  <span className="truncate">
                    {l.codigo} · {l.diasSinSalida === null ? "sin salidas" : `${entero(l.diasSinSalida)} días`}
                  </span>
                  <span className="tabular-nums">{dinero(l.provision)}</span>
                </li>
              ))}
            </ul>
          )}
          {pais !== "PA" && <p className="mt-2 text-xs text-muted-foreground">Llevarla al libro es solo de Panamá.</p>}
        </MarcoAF4>
        <MarcoAF4 id="titulo-consignacion" titulo="Bodegas en consignación" detalle="Mercancía de un cliente o un proveedor: no es activo nuestro">
          {bodegasPais.length ? (
            <BodegasConsignacion bodegas={bodegasPais} marcadas={contable.consignacion} puedeEscribir={escribe("rentabilidad")} />
          ) : (
            <p className="text-sm text-muted-foreground">Sin bodegas con stock.</p>
          )}
        </MarcoAF4>
      </div>

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
