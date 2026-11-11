import Link from "next/link";
import { paisDeOperacionActual } from "@/lib/finanzas/pais-servidor";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { anilloFoco } from "@/components/ui/field";
import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, hoyPanama } from "@/lib/af4/fecha";
import { dias, dinero, dineroKpi, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarComprasCostos } from "@/lib/finanzas/cargar-compras-costos";
import { cargarInventario } from "@/lib/finanzas/cargar-inventario";
import { cargarProyeccion } from "@/lib/finanzas/cargar-proyeccion";
import { armarReorden } from "@/lib/finanzas/compras-costos";
import { cajaSinReposicion, puntosDeReorden, type CajaProyectada, type EntradaReorden } from "@/lib/finanzas/inventario-decisiones";
import { resumirInventario } from "@/lib/finanzas/inventario-valorizado";
import { armarProyeccion } from "@/lib/finanzas/proyeccion-caja";
import { createServiceClient } from "@/lib/supabase/server";
import { AjusteInventario } from "../inventario/ajuste-inventario";
import { TablaReorden } from "./tabla-reorden";

export const metadata = { title: "Punto de reorden" };

export const dynamic = "force-dynamic";

export default async function ReordenPage() {
  const usuario = await requireModulo("rentabilidad");
  // Inventario, compras y capital de trabajo son de toda la empresa: con tiendas limitadas no se muestran.
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Reorden" />;
  const escribe = usuario.modulos.includes("rentabilidad") && !usuario.modulosSoloLectura.includes("rentabilidad");
  const pais = await paisDeOperacionActual(usuario.paisesPermitidos);
  if (!pais) return <SoloTodaLaEmpresa titulo="Reorden" />;
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const [inv, compras, proyeccion] = await Promise.all([cargarInventario(supabase, pais), cargarComprasCostos(supabase, hoy, pais), cargarProyeccion(supabase, hoy)]);
  if ("error" in inv || "error" in compras) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Punto de reorden" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer el inventario o las compras">{"error" in inv ? inv.error : "error" in compras ? compras.error : ""}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const r = resumirInventario(inv.filas, inv.vendido, hoy, inv.tasa);
  const reorden = armarReorden(compras.compras, compras.items, pais, hoy);

  // Productos con ventas: los que tienen stock (del inventario valorizado) y los vendidos que se quedaron sin stock.
  const porSku = new Map(r.porProducto.map((p) => [p.skuId, p]));
  const ids = [...new Set([...porSku.keys(), ...inv.vendido.keys()])];
  const skus = new Map<string, { codigo: string; nombre: string; tipo: string; clase: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre, tipo, clase").in("id", ids.slice(i, i + 200));
    for (const s of data ?? []) skus.set(String(s.id), { codigo: String(s.codigo ?? ""), nombre: String(s.nombre ?? ""), tipo: String(s.tipo ?? ""), clase: String(s.clase ?? "") });
  }
  const entradas: EntradaReorden[] = ids
    .filter((id) => {
      const s = skus.get(id);
      return s && s.tipo !== "combo" && s.clase === "fisico";
    })
    .map((id) => {
      const p = porSku.get(id);
      const s = skus.get(id)!;
      const plazo = reorden.plazo(id);
      return {
        skuId: id,
        codigo: s.codigo,
        producto: s.nombre,
        stock: p?.unidades ?? 0,
        enCamino: reorden.enCamino.get(id) ?? 0,
        vendidas: inv.vendido.get(id)?.unidades ?? 0,
        costoUnitario: p?.costoUnitario ?? compras.vigente.get(id) ?? null,
        plazoDias: plazo.dias,
        via: plazo.via,
      };
    });

  let caja: CajaProyectada | null = null;
  if (!("error" in proyeccion)) {
    const base = armarProyeccion(proyeccion.lineas, proyeccion.semanas, proyeccion.cajaHoy);
    const reposicion = proyeccion.lineas.filter((l) => l.concepto === "mercancia").map((l) => l.valores);
    caja = { semanas: proyeccion.semanas, cajaFinal: cajaSinReposicion(base.cajaFinal, reposicion), cajaMinima: proyeccion.config.cajaMinima };
  }
  const filas = puntosDeReorden(entradas, compras.ajustes, hoy, caja);
  const ya = filas.filter((f) => f.estado === "comprar_ya");
  const pronto = filas.filter((f) => f.estado === "pronto");
  const enProyeccion = filas.filter((f) => f.semana !== null);
  const suma = (fs: typeof filas) => fs.reduce((a, f) => a + (f.monto ?? 0), 0);
  const noAlcanza = filas.find((f) => f.caja === "no_alcanza") ?? null;
  const ejemplo = reorden.plazo("");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Punto de reorden"
        acciones={
          <Link href="/rentabilidad/plan-compras" className={`${claseAccionAF4} ${anilloFoco}`}>
            Plan de compras
          </Link>
        }
      />
      <FilaKpiAF4>
        <KpiAF4 titulo="Comprar ya" destacado tono={ya.length ? "destructive" : "success"} valor={dineroKpi(suma(ya))} subtexto={`${entero(ya.length)} productos`} />
        <KpiAF4 titulo="En los próximos 14 días" tono={pronto.length ? "warning" : "neutral"} valor={dineroKpi(suma(pronto))} subtexto={`${entero(pronto.length)} productos`} />
        <KpiAF4 titulo="Compras en 13 semanas" valor={dineroKpi(suma(enProyeccion))} subtexto={`${entero(enProyeccion.length)} productos · USD`} />
        <KpiAF4
          titulo="Caja"
          tono={caja === null ? "warning" : noAlcanza ? "destructive" : "success"}
          valor={caja === null ? "Sin proyección" : noAlcanza ? "No alcanza" : "Alcanza"}
          subtexto={
            caja === null
              ? "La proyección de caja no se pudo leer"
              : noAlcanza
                ? `Desde ${fechaCorta(noAlcanza.fechaCompra)} queda bajo ${dinero(caja.cajaMinima)}`
                : `Sobre la caja mínima de ${dinero(caja.cajaMinima)}`
          }
        />
      </FilaKpiAF4>
      {escribe && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <AjusteInventario clave="seguridad" valor={compras.ajustes.seguridadDias} />
          <AjusteInventario clave="cobertura" valor={compras.ajustes.coberturaDias} />
          <p className="text-xs text-muted-foreground">
            Producción {dias(ejemplo.produccion)} · tránsito marítimo {dias(ejemplo.transito)}
          </p>
        </div>
      )}
      <TablaReorden filas={filas} />
    </Pagina>
  );
}
