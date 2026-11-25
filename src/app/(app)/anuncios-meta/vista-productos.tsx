"use client";

import { useEffect, useState } from "react";
import type { HistorialSecciones } from "@/lib/meta-ads/analisis-tipos";
import type { CostosGuardados, CostosOperacion, EntregasMeta } from "@/lib/meta-ads/costos-operacion";
import { enLaVista, hallazgosEnVista, productoEnMarcha, type EnMarcha, type VistaActividad } from "@/lib/meta-ads/en-marcha";
import type { CampanaVista, ProductoVista, VideoVista } from "@/lib/meta-ads/vistas";
import { entregaPorProductoMeta } from "./actions";
import { CalculadoraCostos } from "./calculadora-costos";
import { HallazgosDeSeccion } from "./hallazgos-tarjetas";
import { EntregaDeProductos, QueGeneraMasVentas } from "./historial-seccion";
import { ListaProductos } from "./lista-productos";
import { ResumenProductos } from "./resumen-productos";
import { SelectorActividad } from "./selector-actividad";

const estadoDe = (p: ProductoVista) => (p.enMarcha ? "activo" : "apagado");

/** El historial recortado a los productos de la vista. La parte de cada uno sigue siendo sobre todas las compras. */
function historialEnVista(h: HistorialSecciones, e: EnMarcha, vista: VistaActividad): HistorialSecciones {
  const va = (producto: string) => enLaVista(productoEnMarcha(e, producto) ? "activo" : "apagado", vista);
  return {
    ...h,
    hallazgos: { ...h.hallazgos, productos: hallazgosEnVista(h.hallazgos.productos, e, vista) },
    entrega: h.entrega.filter((f) => va(f.nombre)),
    rankings: { ...h.rankings, productos: h.rankings.productos.filter((f) => va(f.nombre)) },
  };
}

/**
 * Anuncios Meta › Productos (25 nov 2026, pedido de Alcides): arranca en los productos con campañas activas, que es sobre lo que hay algo que decidir. «Apagados» deja consultar cómo le fue a uno que ya no se anuncia (con el periodo
 * de arriba) y «Todos» los junta. Lo elegido manda sobre el resumen, los hallazgos, la entrega, lo que más vende y la lista.
 */
export function VistaProductos({ productos, campanas, videos, historial, enMarcha, abrirInicial, calculadora, escribe }: { productos: ProductoVista[]; campanas: CampanaVista[]; videos: VideoVista[]; historial: HistorialSecciones | null; enMarcha: EnMarcha; abrirInicial: string | null; calculadora: { costos: CostosOperacion; guardados: CostosGuardados | null }; escribe: boolean }) {
  // La entrega sale de los pedidos y tarda unos segundos la primera vez: se pide después de abrir la pantalla, sin frenarla.
  const [entrega, setEntrega] = useState<EntregasMeta | null>(null);
  useEffect(() => {
    let vivo = true;
    entregaPorProductoMeta(null)
      .then((d) => vivo && setEntrega(d))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  // Si el enlace abre un producto apagado, se arranca viendo todos para que esté en la lista.
  const [vista, setVista] = useState<VistaActividad>(() => (abrirInicial && productos.some((p) => !p.enMarcha && (p.clave || "sin-producto") === abrirInicial) ? "todos" : "activos"));
  const visibles = productos.filter((p) => enLaVista(estadoDe(p), vista));
  const conNombre = productos.filter((p) => p.clave);
  const cuentas = { activos: conNombre.filter((p) => p.enMarcha).length, apagados: conNombre.filter((p) => !p.enMarcha).length, todos: conNombre.length };
  const h = historial && historialEnVista(historial, enMarcha, vista);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SelectorActividad etiqueta="Qué productos ver" vista={vista} alCambiar={setVista} cuentas={cuentas} />
        <p className="m-0 min-w-0 flex-1 basis-64 text-xs text-muted-foreground">
          {vista === "activos"
            ? "Con al menos una campaña activa que gastó en los últimos 7 días."
            : "Salen los que gastaron en el periodo elegido arriba: para ver cómo le fue a uno apagado hace tiempo, elige 6 meses o 1 año."}
        </p>
      </div>
      <ResumenProductos productos={visibles} />
      <CalculadoraCostos productos={visibles} entrega={entrega} costos={calculadora.costos} guardados={calculadora.guardados} escribe={escribe} />
      {h && (
        <div className="flex flex-col gap-3">
          <HallazgosDeSeccion key={`h-${vista}`} titulo="Lo que dicen los datos de los productos" hallazgos={h.hallazgos.productos} />
          <EntregaDeProductos key={`e-${vista}`} historial={h} />
          <QueGeneraMasVentas key={`v-${vista}`} historial={h} claves={["productos"]} />
        </div>
      )}
      <ListaProductos productos={visibles} campanas={campanas} videos={videos} abrirInicial={abrirInicial} entrega={entrega} costos={calculadora.costos} />
    </>
  );
}
