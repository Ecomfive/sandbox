"use client";

import { KpiFiltro } from "@/components/ui/kpi-filtro";
import type { AtajoFiltro } from "@/lib/tabla/atajos";
import { DEF_MOVIMIENTOS } from "./def-movimientos";

const REPETIDAS: AtajoFiltro = {
  id: "facturas-repetidas",
  etiqueta: "Facturas repetidas",
  ayuda: "Filtrar la tabla: facturas repetidas",
  filtro: { campo: "factura", valor: { tipo: "seleccion", valores: ["Repetida"] } },
};

/** «Facturas repetidas (este mes)»: filtra la tabla de abajo a los movimientos con la factura en otro movimiento. */
export function TarjetaRepetidas({ cantidad }: { cantidad: number }) {
  return <KpiFiltro def={DEF_MOVIMIENTOS} atajo={REPETIDAS} titulo="Facturas repetidas (este mes)" valor={cantidad} tono={cantidad ? "warning" : "neutral"} compacta />;
}
