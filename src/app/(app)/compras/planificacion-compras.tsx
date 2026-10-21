"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BotonBarra,
  CabeceraTarjeta,
  Indicador,
  Punto,
  Segmentado,
  claseTd,
  claseTh,
} from "@/components/panel/piezas-panel";
import { Bandera } from "@/components/paises/bandera";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import {
  cubetaLlegada,
  etiquetaMes,
  mesesSiguientes,
} from "@/lib/compras/llegadas";
import {
  GRUPOS_TIENDA,
  VIAS_PLANIFICACION,
  enGrupoTienda,
  enViaPlanificacion,
  type GrupoTienda,
  type ViaPlanificacion,
} from "@/lib/compras/grupos-planificacion";
import {
  etiquetaEtapa,
  etiquetaVia,
  numeroOC,
  type FilaCompra,
} from "./def-compras";
import { entero, hoy, usd } from "./calculos-compras";
import { SelectorVista } from "./selector-vista";

/** Una columna de la planificación: «antes» (debían llegar), un mes («2026-11») o «despues» (más adelante). */
interface Col {
  clave: string;
  titulo: string;
}
type Vista = "pais" | "producto";

const claseSelect = `h-[34px] max-w-[12rem] rounded-lg border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`;
const sumar = (cs: FilaCompra[]) => ({
  compras: cs.length,
  unidades: cs.reduce((s, c) => s + (c.qtyTotal ?? 0), 0),
  monto: cs.reduce((s, c) => s + (c.montoTotal ?? 0), 0),
});
const tituloCol = (k: string) =>
  k === "antes"
    ? "Debían llegar"
    : k === "despues"
      ? "Más adelante"
      : etiquetaMes(k);

/**
 * Compras › Planificación: las compras abiertas que todavía no llegan, por el mes en que se espera que lleguen (su
 * Planificación): «Debían llegar», el mes en curso y los 3 siguientes, y «Más adelante». Se ve por país (país × mes) o por
 * producto (qué SKUs llegan y cuántas unidades); pulsar una celda lista esas compras. Abajo, las abiertas sin fecha de envío,
 * que aún no tienen planificación.
 */
export function PlanificacionCompras({
  compras,
  vista,
  paises,
}: {
  compras: FilaCompra[];
  vista: string;
  paises: { codigo: string; nombre: string }[];
}) {
  const meses = useMemo(() => mesesSiguientes(hoy()), []);
  const [via, setVia] = useState<ViaPlanificacion | "">("");
  const [proveedor, setProveedor] = useState("");
  const [tienda, setTienda] = useState<GrupoTienda | "">("");
  const [modo, setModo] = useState<Vista>("pais");
  const [buscar, setBuscar] = useState("");
  // La celda elegida: fila (país o SKU; "" = todas) y columna ("" = todas).
  const [sel, setSel] = useState<{ fila: string; col: string } | null>(null);

  const nombrePais = useMemo(
    () => new Map(paises.map((p) => [p.codigo, p.nombre])),
    [paises],
  );
  const proveedores = useMemo(
    () =>
      [
        ...new Set(
          compras.map((c) => c.proveedor).filter((x): x is string => !!x),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [compras],
  );

  // Las compras por llegar, con su columna, después de los filtros.
  const porLlegar = useMemo(
    () =>
      compras
        .map((c) => ({ c, col: cubetaLlegada(c, meses) }))
        .filter(
          (x): x is { c: FilaCompra; col: string } =>
            x.col !== null &&
            (!via || enViaPlanificacion(x.c.viaEnvio, via)) &&
            (!proveedor || x.c.proveedor === proveedor) &&
            (!tienda || enGrupoTienda(x.c.tiendas, tienda)),
        ),
    [compras, meses, via, proveedor, tienda],
  );
  const conFecha = useMemo(
    () => porLlegar.filter((x) => x.col !== "sin"),
    [porLlegar],
  );
  const sinFecha = useMemo(
    () => porLlegar.filter((x) => x.col === "sin").map((x) => x.c),
    [porLlegar],
  );
  const cols: Col[] = [
    ...(conFecha.some((x) => x.col === "antes") ? ["antes"] : []),
    ...meses,
    ...(conFecha.some((x) => x.col === "despues") ? ["despues"] : []),
  ].map((clave) => ({ clave, titulo: tituloCol(clave) }));

  const k = useMemo(() => {
    const enMeses = conFecha
      .filter((x) => meses.includes(x.col))
      .map((x) => x.c);
    return {
      meses: sumar(enMeses),
      antes: sumar(conFecha.filter((x) => x.col === "antes").map((x) => x.c)),
      sin: sinFecha.length,
      despues: conFecha.filter((x) => x.col === "despues").length,
    };
  }, [conFecha, sinFecha, meses]);

  // Por país: una fila por país (o «Importadora» sin país).
  const filasPais = useMemo(() => {
    const m = new Map<string, { c: FilaCompra; col: string }[]>();
    for (const x of conFecha) {
      const p = x.c.paisCodigo ?? "—";
      m.set(p, [...(m.get(p) ?? []), x]);
    }
    return [...m]
      .map(([pais, xs]) => ({ clave: pais, xs }))
      .sort((a, b) => b.xs.length - a.xs.length);
  }, [conFecha]);

  // Por producto: una fila por SKU con las unidades pedidas que llegan en cada columna; las compras sin productos vinculados
  // van juntas en una fila aparte, con la cantidad total de la compra.
  const filasProducto = useMemo(() => {
    const m = new Map<
      string,
      { nombre: string; porCol: Map<string, number>; compras: Set<string> }
    >();
    const poner = (
      clave: string,
      nombre: string,
      col: string,
      n: number,
      id: string,
    ) => {
      const f = m.get(clave) ?? {
        nombre,
        porCol: new Map(),
        compras: new Set(),
      };
      f.porCol.set(col, (f.porCol.get(col) ?? 0) + n);
      f.compras.add(id);
      m.set(clave, f);
    };
    for (const { c, col } of conFecha) {
      if (c.lineas.length)
        for (const l of c.lineas)
          poner(l.codigo, l.nombre, col, l.cantidad, c.id);
      else poner("", "Sin productos vinculados", col, c.qtyTotal ?? 0, c.id);
    }
    return [...m]
      .map(([clave, f]) => ({
        clave,
        ...f,
        total: [...f.porCol.values()].reduce((s, n) => s + n, 0),
      }))
      .sort((a, b) =>
        a.clave === "" ? 1 : b.clave === "" ? -1 : b.total - a.total,
      );
  }, [conFecha]);

  const q = buscar.trim().toLowerCase();
  const productosVisibles = q
    ? filasProducto.filter((f) =>
        `${f.clave} ${f.nombre}`.toLowerCase().includes(q),
      )
    : filasProducto;

  const enSel = (x: { c: FilaCompra; col: string }) => {
    if (!sel) return meses.includes(x.col) || x.col === "antes";
    if (sel.col && x.col !== sel.col) return false;
    if (!sel.fila) return true;
    if (modo === "pais") return (x.c.paisCodigo ?? "—") === sel.fila;
    return sel.fila === "__sin"
      ? x.c.lineas.length === 0
      : x.c.lineas.some((l) => l.codigo === sel.fila);
  };
  const lista = conFecha
    .filter(enSel)
    .sort(
      (a, b) =>
        cols.findIndex((c) => c.clave === a.col) -
          cols.findIndex((c) => c.clave === b.col) ||
        (a.c.fechaEnvio ?? "").localeCompare(b.c.fechaEnvio ?? ""),
    );
  const prefijo = `/compras/lista?${vista === "todos" ? "" : `ver=${vista}&`}abrir=`;
  const elegir = (fila: string, col: string) =>
    setSel((s) =>
      s && s.fila === fila && s.col === col ? null : { fila, col },
    );
  const elegida = (fila: string, col: string) =>
    !!sel && sel.fila === fila && sel.col === col;
  const textoSel = !sel
    ? "Todo lo que llega en estos meses y lo que debía llegar"
    : [
        sel.fila
          ? modo === "pais"
            ? (nombrePais.get(sel.fila) ?? sel.fila)
            : sel.fila === "__sin"
              ? "Sin productos vinculados"
              : sel.fila
          : "",
        sel.col ? tituloCol(sel.col) : "",
      ]
        .filter(Boolean)
        .join(" · ");

  const celda = ({
    fila,
    col,
    compras: n,
    texto,
    etiqueta,
  }: {
    fila: string;
    col: string;
    compras: number;
    texto: string;
    etiqueta: string;
  }) => {
    if (!n)
      return (
        <td
          key={col}
          className={`${claseTd} text-center text-muted-foreground`}
        >
          —
        </td>
      );
    const activa = elegida(fila, col);
    return (
      <td key={col} className={`${claseTd} p-0`}>
        <button
          type="button"
          aria-pressed={activa}
          aria-label={etiqueta}
          onClick={() => elegir(fila, col)}
          className={`flex w-full flex-col items-end px-3 py-2 tabular-nums hover:bg-muted ${anilloFoco} ${activa ? "bg-primario-suave text-primario" : ""} ${col === "antes" ? "text-destructive" : ""}`}
        >
          {texto}
        </button>
      </td>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SelectorVista vista={vista} paises={paises} />
        <select
          aria-label="Vía de envío"
          value={via}
          onChange={(e) => setVia(e.target.value as ViaPlanificacion | "")}
          className={claseSelect}
        >
          <option value="">Todas las vías</option>
          {VIAS_PLANIFICACION.map((v) => (
            <option key={v} value={v}>
              {etiquetaVia(v)}
            </option>
          ))}
        </select>
        <select
          aria-label="Proveedor"
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
          className={claseSelect}
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          aria-label="Tienda"
          value={tienda}
          onChange={(e) => setTienda(e.target.value as GrupoTienda | "")}
          className={claseSelect}
        >
          <option value="">Todas las tiendas</option>
          {GRUPOS_TIENDA.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        {(via || proveedor || tienda) && (
          <BotonBarra
            onClick={() => {
              setVia("");
              setProveedor("");
              setTienda("");
            }}
          >
            Quitar filtros
          </BotonBarra>
        )}
      </div>

      <section
        aria-label="Indicadores"
        className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card"
      >
        <div className="flex flex-wrap">
          <Indicador
            titulo={`Llega de ${etiquetaMes(meses[0])} a ${etiquetaMes(meses[meses.length - 1])}`}
            valor={`${entero(k.meses.compras)} compras`}
            detalle={`${entero(k.meses.unidades)} unidades · ${usd(k.meses.monto, true)}`}
          />
          <Indicador
            titulo="Debían llegar"
            punto={k.antes.compras ? "peligro" : undefined}
            valor={entero(k.antes.compras)}
            detalle={`${entero(k.antes.unidades)} unidades · planificadas antes y sin llegar`}
          />
          <Indicador
            titulo="Sin fecha de envío"
            punto={k.sin ? "aviso" : undefined}
            valor={entero(k.sin)}
            detalle="abiertas sin planificación (ver abajo)"
          />
          <Indicador
            titulo="Más adelante"
            valor={entero(k.despues)}
            detalle={`después de ${etiquetaMes(meses[meses.length - 1])}`}
          />
        </div>
      </section>

      <section
        aria-labelledby="p-tabla"
        className="min-w-0 rounded-[10px] border border-border bg-card"
      >
        <CabeceraTarjeta
          id="p-tabla"
          titulo={modo === "pais" ? "Por país" : "Por producto"}
        >
          <span className="flex items-center gap-2">
            {modo === "producto" && (
              <input
                type="search"
                aria-label="Buscar producto"
                placeholder="Buscar SKU o nombre"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                className={`h-7 w-48 rounded-md border border-border-control bg-card px-2 text-xs ${anilloFoco}`}
              />
            )}
            <Segmentado
              etiqueta="Ver la planificación"
              opciones={[
                { valor: "pais", etiqueta: "Por país" },
                { valor: "producto", etiqueta: "Por producto" },
              ]}
              valor={modo}
              alCambiar={(v) => {
                setModo(v);
                setSel(null);
              }}
            />
          </span>
        </CabeceraTarjeta>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-[1]">
              <tr>
                <th scope="col" className={claseTh}>
                  {modo === "pais" ? "País" : "Producto"}
                </th>
                {cols.map((c) => (
                  <th
                    key={c.clave}
                    scope="col"
                    className={`${claseTh} text-right`}
                  >
                    <button
                      type="button"
                      aria-pressed={elegida("", c.clave)}
                      onClick={() => elegir("", c.clave)}
                      className={`rounded uppercase hover:text-foreground ${anilloFoco} ${elegida("", c.clave) ? "text-primario" : ""}`}
                    >
                      {c.clave === "antes" && (
                        <Punto tono="peligro" className="mr-1" />
                      )}
                      {c.titulo}
                    </button>
                  </th>
                ))}
                {modo === "producto" && (
                  <th scope="col" className={`${claseTh} text-right`}>
                    Total
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {modo === "pais" ? (
                <>
                  {filasPais.map((f) => (
                    <tr key={f.clave}>
                      <th
                        scope="row"
                        className={`${claseTd} text-left font-medium`}
                      >
                        <button
                          type="button"
                          aria-pressed={elegida(f.clave, "")}
                          onClick={() => elegir(f.clave, "")}
                          className={`flex items-center gap-2 rounded hover:underline ${anilloFoco}`}
                        >
                          {f.clave !== "—" && <Bandera codigo={f.clave} />}
                          {f.clave === "—"
                            ? "Sin país"
                            : (nombrePais.get(f.clave) ?? f.clave)}
                        </button>
                      </th>
                      {cols.map((c) => {
                        const s = sumar(
                          f.xs.filter((x) => x.col === c.clave).map((x) => x.c),
                        );
                        return celda({
                          fila: f.clave,
                          col: c.clave,
                          compras: s.compras,
                          texto: `${s.compras} · ${entero(s.unidades)} u.`,
                          etiqueta: `${nombrePais.get(f.clave) ?? f.clave}, ${c.titulo}: ${s.compras} compras, ${entero(s.unidades)} unidades, ${usd(s.monto)}`,
                        });
                      })}
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <th scope="row" className={`${claseTd} text-left`}>
                      Total
                    </th>
                    {cols.map((c) => {
                      const s = sumar(
                        conFecha
                          .filter((x) => x.col === c.clave)
                          .map((x) => x.c),
                      );
                      return (
                        <td
                          key={c.clave}
                          className={`${claseTd} text-right tabular-nums`}
                        >
                          {s.compras ? (
                            <>
                              {s.compras} · {entero(s.unidades)} u.
                              <span className="block text-xs font-normal text-muted-foreground">
                                {usd(s.monto, true)}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </>
              ) : (
                productosVisibles.map((f) => {
                  const clave = f.clave || "__sin";
                  return (
                    <tr key={clave}>
                      <th
                        scope="row"
                        className={`${claseTd} max-w-[24rem] text-left font-normal`}
                      >
                        <button
                          type="button"
                          aria-pressed={elegida(clave, "")}
                          onClick={() => elegir(clave, "")}
                          className={`block max-w-full truncate rounded text-left hover:underline ${anilloFoco}`}
                        >
                          {f.clave ? (
                            <span className="text-muted-foreground tabular-nums">
                              {f.clave}{" "}
                            </span>
                          ) : null}
                          <span
                            className={
                              f.clave ? "" : "text-muted-foreground italic"
                            }
                          >
                            {f.nombre}
                          </span>
                        </button>
                      </th>
                      {cols.map((c) => {
                        const n = f.porCol.get(c.clave) ?? 0;
                        return celda({
                          fila: clave,
                          col: c.clave,
                          compras: n,
                          texto: `${entero(n)} u.`,
                          etiqueta: `${f.nombre}, ${c.titulo}: ${entero(n)} unidades`,
                        });
                      })}
                      <td
                        className={`${claseTd} text-right font-medium tabular-nums`}
                      >
                        {entero(f.total)} u.
                      </td>
                    </tr>
                  );
                })
              )}
              {(modo === "pais" ? filasPais : productosVisibles).length ===
                0 && (
                <tr>
                  <td
                    colSpan={cols.length + 2}
                    className={`${claseTd} text-muted-foreground`}
                  >
                    No hay compras por llegar con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="p-lista"
        className="min-w-0 rounded-[10px] border border-border bg-card"
      >
        <CabeceraTarjeta id="p-lista" titulo="Compras">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {textoSel} · {lista.length}
            {sel && (
              <button
                type="button"
                onClick={() => setSel(null)}
                className={`rounded px-1 underline-offset-2 hover:underline ${anilloFoco}`}
              >
                Ver todo
              </button>
            )}
          </span>
        </CabeceraTarjeta>
        <TablaCompras
          filas={lista.map((x) => ({
            c: x.c,
            llega:
              x.col === "antes"
                ? `${x.c.planificacion} (atrasada)`
                : tituloCol(x.col),
            atrasada: x.col === "antes",
          }))}
          prefijo={prefijo}
          vacio="No hay compras en esta selección."
        />
      </section>

      <section
        aria-labelledby="p-sin"
        className="min-w-0 rounded-[10px] border border-border bg-card"
      >
        <CabeceraTarjeta id="p-sin" titulo="Sin fecha de envío">
          <span className="text-xs text-muted-foreground">
            aún sin planificación · {sinFecha.length}
          </span>
        </CabeceraTarjeta>
        <TablaCompras
          filas={[...sinFecha]
            .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
            .map((c) => ({ c, llega: "—", atrasada: false }))}
          prefijo={prefijo}
          vacio="Todas las compras abiertas tienen fecha de envío."
          creada
        />
      </section>
    </div>
  );
}

/** La lista de compras de una selección, con enlace a la ficha de cada una. */
function TablaCompras({
  filas,
  prefijo,
  vacio,
  creada = false,
}: {
  filas: { c: FilaCompra; llega: string; atrasada: boolean }[];
  prefijo: string;
  vacio: string;
  creada?: boolean;
}) {
  if (filas.length === 0)
    return (
      <p className="m-0 px-4 py-3 text-sm text-muted-foreground">{vacio}</p>
    );
  const titulos = [
    creada ? "Creada" : "Llega",
    "Compra",
    "País",
    "Proveedor",
    "Vía",
    "Envío",
    "Etapa",
    "Unidades",
    "Monto",
  ];
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-[1]">
          <tr>
            {titulos.map((t) => (
              <th
                key={t}
                scope="col"
                className={`${claseTh} ${t === "Unidades" || t === "Monto" ? "text-right" : ""}`}
              >
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(({ c, llega, atrasada }) => (
            <tr key={c.id}>
              <td
                className={`${claseTd} ${atrasada ? "text-destructive" : ""}`}
              >
                {creada ? formatearFecha(c.creadoEn) : llega}
              </td>
              <td className={`${claseTd} max-w-[22rem] truncate`}>
                <Link
                  href={`${prefijo}${c.id}`}
                  className={`rounded hover:underline ${anilloFoco}`}
                >
                  <span className="text-muted-foreground tabular-nums">
                    {c.codigo ?? numeroOC(c.numero)}
                  </span>{" "}
                  {c.lineas.length
                    ? c.lineas.map((l) => l.nombre).join(", ")
                    : c.nombre}
                </Link>
              </td>
              <td className={claseTd}>{c.paisCodigo ?? "—"}</td>
              <td className={`${claseTd} max-w-[10rem] truncate`}>
                {c.proveedor ?? "—"}
              </td>
              <td className={claseTd}>
                {c.viaEnvio.length
                  ? c.viaEnvio.map(etiquetaVia).join(", ")
                  : "—"}
              </td>
              <td className={`${claseTd} tabular-nums`}>
                {c.fechaEnvio ? formatearFecha(c.fechaEnvio) : "—"}
              </td>
              <td className={claseTd}>{etiquetaEtapa(c.etapa)}</td>
              <td className={`${claseTd} text-right tabular-nums`}>
                {c.qtyTotal === null ? "—" : entero(c.qtyTotal)}
              </td>
              <td className={`${claseTd} text-right tabular-nums`}>
                {c.montoTotal === null ? "—" : usd(c.montoTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
