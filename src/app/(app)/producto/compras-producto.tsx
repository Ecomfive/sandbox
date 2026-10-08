"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { colorEtapa, etiquetaEtapa, numeroOC } from "../compras/def-compras";
import { obtenerComprasProducto, type CompraDeProducto } from "./compras-actions";

const usd = (n: number) => formatearMoneda(n, "USD");
const entero = (n: number) => n.toLocaleString("es-PA");

/**
 * El histórico de compras de un producto (bloque «Compras» de su ficha en Producto y en Inventario): arriba lo comprado desde
 * la primera vez (unidades, total, costo promedio, cuántas compras y entre qué fechas; por país si se compra en varios) y
 * debajo cada compra, de la más nueva a la más vieja, que se abre en Compras. Solo cuenta las compras con el producto
 * vinculado (Compras › Productos). Con `limite` muestra solo las últimas.
 */
export function ComprasProducto({ id, limite }: { id: string; limite?: number }) {
  const [datos, setDatos] = useState<CompraDeProducto[] | "error" | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerComprasProducto(id)
      .then((r) => vigente && setDatos("compras" in r ? r.compras : "error"))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [id]);

  if (datos === null) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (datos === "error")
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudieron cargar las compras.
      </p>
    );
  if (datos.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay compras vinculadas a este producto.</p>;

  const unidades = datos.reduce((t, c) => t + c.unidades, 0);
  const conCosto = datos.filter((c) => c.total !== null);
  const total = conCosto.reduce((t, c) => t + (c.total ?? 0), 0);
  const unidadesConCosto = conCosto.reduce((t, c) => t + c.unidades, 0);
  const porPais = new Map<string, number>();
  for (const c of datos) porPais.set(c.pais ?? "—", (porPais.get(c.pais ?? "—") ?? 0) + c.unidades);
  const primera = datos[datos.length - 1].fecha;
  const ultima = datos[0].fecha;
  const vistas = limite ? datos.slice(0, limite) : datos;

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Cifra etiqueta="Unidades compradas" valor={entero(unidades)} />
        <Cifra etiqueta="Total invertido" valor={conCosto.length ? usd(total) : "—"} />
        <Cifra etiqueta="Costo promedio" valor={unidadesConCosto ? usd(total / unidadesConCosto) : "—"} />
        <Cifra etiqueta={datos.length === 1 ? "Compra" : "Compras"} valor={entero(datos.length)} />
      </dl>
      <p className="m-0 text-xs text-muted-foreground">
        {datos.length === 1 ? `El ${formatearFecha(primera)}` : `Del ${formatearFecha(primera)} al ${formatearFecha(ultima)}`}
        {porPais.size > 1 &&
          ` · ${[...porPais]
            .sort((a, b) => b[1] - a[1])
            .map(([p, n]) => `${p}: ${entero(n)} u.`)
            .join(" · ")}`}
      </p>
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0 text-[13px]">
        {vistas.map((c) => (
          <li key={`${c.compraId}-${c.sku}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <Link href={`/compras/lista?ver=todos&abrir=${c.compraId}`} className={`rounded font-medium hover:underline ${anilloFoco}`}>
              {c.codigo ?? numeroOC(c.numero)}
            </Link>
            <span className="text-xs text-muted-foreground tabular-nums">{formatearFecha(c.fecha)}</span>
            {c.pais && <span className="text-xs text-muted-foreground">{c.pais}</span>}
            <Badge color={colorEtapa(c.etapa)}>{etiquetaEtapa(c.etapa)}</Badge>
            {c.variante && <span className="text-xs text-muted-foreground">{c.variante}</span>}
            <span className="ml-auto text-right tabular-nums">
              <strong className="font-medium">{entero(c.unidades)} u.</strong>
              <span className="text-muted-foreground">{c.costoUnitario !== null ? ` · ${usd(c.costoUnitario)} c/u · ${usd(c.total ?? 0)}` : " · sin costo"}</span>
            </span>
          </li>
        ))}
      </ul>
      {limite && datos.length > limite && (
        <p className="m-0 text-xs text-muted-foreground">
          Y {datos.length - limite} compras más: el histórico completo está en la ficha del producto (Producto).
        </p>
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="m-0 text-base font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}
