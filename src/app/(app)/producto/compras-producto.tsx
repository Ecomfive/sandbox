"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { compraCuenta } from "@/lib/compras/cuenta";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { colorEtapa, etiquetaEtapa, numeroOC } from "../compras/def-compras";
import { obtenerComprasProducto, type CompraDeProducto } from "./compras-actions";

const usd = (n: number) => formatearMoneda(n, "USD");
const entero = (n: number) => n.toLocaleString("es-PA");

/**
 * El histórico de compras de un producto (bloque «Compras» de su ficha en Producto y en Inventario): arriba lo comprado desde
 * la primera vez (unidades, total, costo promedio, cuántas compras y entre qué fechas; por país si se compra en varios) y
 * debajo cada compra, de la más nueva a la más vieja, que se abre en Compras. Solo cuenta las compras con el producto
 * vinculado (Compras › Productos). Si se compró en varios países, las compras van **agrupadas por país** (cada país con sus compras
 * juntas, el que más compró primero) y no mezcladas. Con `limite` muestra solo las últimas. Con `pais` (Inventario, que es de un país) cuenta y
 * lista solo las compras de ese país, y dice aparte lo comprado en todos. Una compra descartada se ve en la lista (atenuada) pero **no
 * suma** en ningún total (`compraCuenta`).
 */
export function ComprasProducto({ id, limite, pais }: { id: string; limite?: number; pais?: string }) {
  const [cargadas, setDatos] = useState<CompraDeProducto[] | "error" | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerComprasProducto(id)
      .then((r) => vigente && setDatos("compras" in r ? r.compras : "error"))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [id]);

  if (cargadas === null) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (cargadas === "error")
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudieron cargar las compras.
      </p>
    );
  const todas = cargadas;
  let datos = cargadas;
  const vigentesTodas = todas.filter(compraCuenta);
  const unidadesTodas = vigentesTodas.reduce((t, c) => t + c.unidades, 0);
  const enOtros = pais ? todas.some((c) => c.pais !== pais) : false;
  if (pais) datos = datos.filter((c) => c.pais === pais);
  const otrosPaises = enOtros && (
    <p className="m-0 text-xs text-muted-foreground">En todos los países: {entero(unidadesTodas)} u. en {entero(vigentesTodas.length)} compras (el detalle está en la ficha del producto).</p>
  );
  if (datos.length === 0)
    return (
      <div className="flex flex-col gap-1">
        <p className="m-0 text-sm text-muted-foreground">{pais ? `Todavía no hay compras de este producto en ${pais}.` : "Todavía no hay compras vinculadas a este producto."}</p>
        {otrosPaises}
      </div>
    );

  const vigentes = datos.filter(compraCuenta);
  const unidades = vigentes.reduce((t, c) => t + c.unidades, 0);
  const conCosto = vigentes.filter((c) => c.total !== null);
  const total = conCosto.reduce((t, c) => t + (c.total ?? 0), 0);
  const unidadesConCosto = conCosto.reduce((t, c) => t + c.unidades, 0);
  const porPais = new Map<string, number>();
  // Un país con solo compras descartadas queda en la lista, con 0 unidades.
  for (const c of datos) porPais.set(c.pais ?? "—", (porPais.get(c.pais ?? "—") ?? 0) + (compraCuenta(c) ? c.unidades : 0));
  const primera = vigentes.length ? vigentes[vigentes.length - 1].fecha : null;
  const ultima = vigentes.length ? vigentes[0].fecha : null;
  const vistas = limite ? datos.slice(0, limite) : datos;
  // En varios países: un bloque por país, el que más unidades compró primero; dentro, de la más nueva a la más vieja.
  const grupos =
    !pais && porPais.size > 1
      ? [...porPais]
          .sort((a, b) => b[1] - a[1])
          .map(([nombre, unidadesPais]) => ({ pais: nombre, unidades: unidadesPais, compras: vistas.filter((c) => (c.pais ?? "—") === nombre) }))
          .filter((g) => g.compras.length > 0)
      : null;

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Cifra etiqueta="Unidades compradas" valor={entero(unidades)} />
        <Cifra etiqueta="Total invertido" valor={conCosto.length ? usd(total) : "—"} />
        <Cifra etiqueta="Costo promedio" valor={unidadesConCosto ? usd(total / unidadesConCosto) : "—"} />
        <Cifra etiqueta={vigentes.length === 1 ? "Compra" : "Compras"} valor={entero(vigentes.length)} />
      </dl>
      <p className="m-0 text-xs text-muted-foreground">
        {primera === null || ultima === null ? "Todas las compras están descartadas" : vigentes.length === 1 ? `El ${formatearFecha(primera)}` : `Del ${formatearFecha(primera)} al ${formatearFecha(ultima)}`}
      </p>
      {grupos ? (
        grupos.map((g) => (
          <section key={g.pais} aria-label={`Compras en ${g.pais}`} className="flex flex-col gap-1">
            <h4 className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border pb-1 text-xs font-semibold">
              <span>{g.pais === "—" ? "Sin país" : g.pais}</span>
              <span className="font-normal text-muted-foreground tabular-nums">
                {entero(g.compras.filter(compraCuenta).length)} {g.compras.filter(compraCuenta).length === 1 ? "compra" : "compras"} · {entero(g.unidades)} u.
              </span>
            </h4>
            <ListaCompras compras={g.compras} conPais={false} />
          </section>
        ))
      ) : (
        <ListaCompras compras={vistas} conPais={!pais} />
      )}
      {otrosPaises}
      {limite && datos.length > limite && (
        <p className="m-0 text-xs text-muted-foreground">
          Y {datos.length - limite} compras más: el histórico completo está en la ficha del producto (Producto).
        </p>
      )}
    </div>
  );
}

/**
 * Las compras de una lista, cada una con su orden, fecha, etapa, unidades, costo por unidad y total; el país solo si la lista no
 * está ya agrupada por país. En pantalla ancha cada fila es la misma rejilla de columnas fijas, así las cifras quedan alineadas
 * entre filas y entre los grupos de cada país.
 */
function ListaCompras({ compras, conPais }: { compras: CompraDeProducto[]; conPais: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-border p-0 text-[13px]">
      {compras.map((c) => (
        <li
          key={`${c.compraId}-${c.sku}`}
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 sm:grid sm:grid-cols-[7.5rem_6rem_minmax(0,1fr)_4.5rem_5rem_6rem] ${compraCuenta(c) ? "" : "opacity-60"}`}
        >
          <Link href={`/compras/lista?ver=todos&abrir=${c.compraId}`} className={`justify-self-start rounded font-medium hover:underline ${anilloFoco}`}>
            {c.codigo ?? numeroOC(c.numero)}
          </Link>
          <span className="text-xs text-muted-foreground tabular-nums">{formatearFecha(c.fecha)}</span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Badge color={colorEtapa(c.etapa)}>{etiquetaEtapa(c.etapa)}</Badge>
            {conPais && c.pais && <span className="text-xs text-muted-foreground">{c.pais}</span>}
            {c.variante && <span className="text-xs text-muted-foreground">{c.variante}</span>}
          </span>
          <strong className="ml-auto font-medium tabular-nums sm:ml-0 sm:text-right">{entero(c.unidades)} u.</strong>
          {c.costoUnitario !== null ? (
            <>
              <span className="text-muted-foreground tabular-nums sm:text-right">{usd(c.costoUnitario)} c/u</span>
              <span className="tabular-nums sm:text-right">{usd(c.total ?? 0)}</span>
            </>
          ) : (
            <span className="text-muted-foreground sm:col-span-2 sm:text-right">sin costo</span>
          )}
        </li>
      ))}
    </ul>
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
