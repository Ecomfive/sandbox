"use client";

import { useMemo, useState } from "react";
import { BotonBarra, BotonDescargar, MarcoTabla, Pastilla, Punto, claseConFicha, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { BuscarIcon } from "@/lib/nav-icons";
import { normalizar } from "@/lib/tabla/motor";
import { CrearProductoTestPanel } from "./crear-producto-test-panel";
import { DEF_PRODUCTOS_TEST, ESTADOS, etiquetaEstado, etiquetaTestNumero, TEST_NUMEROS, type FilaProductoTest } from "./def-productos-test";
import { FichaLateralTest } from "./ficha-lateral-test";
import { FichaProductoTest } from "./ficha-producto-test";
import { CPA_OBJETIVO, limpiarCategoria, porcentaje, resultadoDe, usd, type Resultado } from "./informe";

type Columna = "fecha" | "gasto" | "compras" | "cpa" | "ctr" | "hook" | "cvr";
interface Orden {
  columna: Columna;
  sentido: 1 | -1;
}

const POR_PAGINA = 60;
const CHIPS: { resultado: Resultado; etiqueta: string }[] = [
  { resultado: "ganador", etiqueta: "Winners" },
  { resultado: "consulta", etiqueta: "En consulta" },
  { resultado: "fallido", etiqueta: "Fallidos" },
  { resultado: "otro", etiqueta: "Otros estados" },
];
const COLUMNAS: { id: Columna; etiqueta: string; valor: (f: FilaProductoTest) => number | string | null }[] = [
  { id: "fecha", etiqueta: "Fecha test", valor: (f) => f.fechaTest },
  { id: "gasto", etiqueta: "Gasto", valor: (f) => f.metricaGasto },
  { id: "compras", etiqueta: "Compras", valor: (f) => f.metricaCompras },
  { id: "cpa", etiqueta: "CPA", valor: (f) => f.metricaCpa },
  { id: "ctr", etiqueta: "CTR", valor: (f) => f.metricaCtr },
  { id: "hook", etiqueta: "Hook", valor: (f) => f.metricaHookRate },
  { id: "cvr", etiqueta: "CVR", valor: (f) => f.metricaCvr },
];

const tonoEstado = (estado: string) => {
  const r = resultadoDe(estado);
  return r === "ganador" ? "exito" : r === "consulta" ? "aviso" : "neutro";
};

const claseSelect = `h-[34px] rounded-lg border border-border bg-card px-2 text-[13px] ${anilloFoco}`;

/** Productos en test: búsqueda, filtros de un toque, orden por columna y la ficha del elegido a la derecha. */
export function ListaProductosTest({
  productos,
  paisId,
  puedeEscribir,
  buscarInicial = "",
}: {
  productos: FilaProductoTest[];
  paisId: string;
  puedeEscribir: boolean;
  /** Texto con el que abre el campo de búsqueda (lo manda el buscador global con `?buscar=`). */
  buscarInicial?: string;
}) {
  const [busqueda, setBusqueda] = useState(buscarInicial);
  const [chip, setChip] = useState<Resultado | null>(null);
  const [estado, setEstado] = useState("");
  const [categoria, setCategoria] = useState("");
  const [test, setTest] = useState("");
  const [orden, setOrden] = useState<Orden>({ columna: "fecha", sentido: -1 });
  const [elegido, setElegido] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  const categorias = useMemo(() => [...new Set(productos.map((p) => limpiarCategoria(p.categoria)))].sort((a, b) => a.localeCompare(b)), [productos]);
  const ganadores = useMemo(() => productos.filter((p) => resultadoDe(p.estado) === "ganador"), [productos]);

  const filas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const col = COLUMNAS.find((c) => c.id === orden.columna)!;
    return productos
      .filter(
        (p) =>
          (!q || normalizar(p.nombre).includes(q)) &&
          (!chip || resultadoDe(p.estado) === chip) &&
          (!estado || p.estado === estado) &&
          (!categoria || limpiarCategoria(p.categoria) === categoria) &&
          (!test || p.testNumero === test),
      )
      .sort((a, b) => {
        const x = col.valor(a);
        const y = col.valor(b);
        // Lo que no tiene dato va siempre al final, sin importar el sentido.
        if (x === null && y === null) return a.nombre.localeCompare(b.nombre);
        if (x === null) return 1;
        if (y === null) return -1;
        return x === y ? a.nombre.localeCompare(b.nombre) : (x < y ? -1 : 1) * orden.sentido;
      });
  }, [productos, busqueda, chip, estado, categoria, test, orden]);

  const visibles = filas.slice(0, POR_PAGINA);
  const idsVisibles = visibles.map((p) => p.id);
  const idFicha = elegido && filas.some((p) => p.id === elegido) ? elegido : (idsVisibles[0] ?? null);
  const producto = productos.find((p) => p.id === idFicha) ?? null;

  function ordenarPor(columna: Columna) {
    setOrden((o) => (o.columna === columna ? { columna, sentido: o.sentido === 1 ? -1 : 1 } : { columna, sentido: -1 }));
  }

  return (
    <div className={claseConFicha}>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex h-[34px] max-w-xs min-w-[12.5rem] flex-[1_1_12.5rem] items-center gap-1.5 rounded-lg border border-border-control bg-card px-2.5 focus-within:ring-2 focus-within:ring-foreground">
            <BuscarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto"
              aria-label="Buscar producto"
              className="w-full bg-transparent text-[13px] outline-none"
            />
          </label>
          {CHIPS.map((c) => (
            <BotonBarra key={c.resultado} activo={chip === c.resultado} onClick={() => setChip((v) => (v === c.resultado ? null : c.resultado))}>
              {c.etiqueta}
            </BotonBarra>
          ))}
          <select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} className={claseSelect}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
          <select aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${claseSelect} max-w-[12rem]`}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select aria-label="Número de test" value={test} onChange={(e) => setTest(e.target.value)} className={claseSelect}>
            <option value="">Todos los tests</option>
            {TEST_NUMEROS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
          <span className="flex-1" />
          <BotonDescargar def={DEF_PRODUCTOS_TEST} filas={filas} />
          {puedeEscribir && <CrearProductoTestPanel paisId={paisId} />}
        </div>

        <MarcoTabla ariaLabel="Productos en test">
          <table className="w-full min-w-[56rem] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={claseTh}>Producto</th>
                <th scope="col" className={claseTh}>Test</th>
                <th scope="col" className={claseTh}>Estado</th>
                {COLUMNAS.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={orden.columna === c.id ? (orden.sentido === 1 ? "ascending" : "descending") : undefined}
                    className={`${claseTh} ${c.id === "fecha" ? "" : "text-right"}`}
                  >
                    <button type="button" onClick={() => ordenarPor(c.id)} className={`rounded font-[inherit] tracking-[inherit] uppercase ${anilloFoco}`}>
                      {c.etiqueta} {orden.columna === c.id ? (orden.sentido === 1 ? "↑" : "↓") : "↕"}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {productos.length === 0 ? "Todavía no hay productos en test. Usa «Agregar» para registrar el primero." : "Ningún producto coincide con lo que buscas."}
                  </td>
                </tr>
              ) : (
                visibles.map((p) => (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    aria-current={p.id === idFicha ? "true" : undefined}
                    onClick={() => setElegido(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setElegido(p.id);
                      }
                    }}
                    className={`cursor-pointer hover:bg-muted aria-[current=true]:bg-accent ${anilloFoco}`}
                  >
                    <td className={claseTd}>
                      <span className="block max-w-[26rem] truncate font-medium" title={p.nombre}>{p.nombre}</span>
                      <span className="block text-xs text-muted-foreground">{limpiarCategoria(p.categoria)}</span>
                    </td>
                    <td className={claseTd}>{p.testNumero ? etiquetaTestNumero(p.testNumero) : "—"}</td>
                    <td className={claseTd}><Pastilla tono={tonoEstado(p.estado)}>{etiquetaEstado(p.estado)}</Pastilla></td>
                    <td className={claseTd}>{p.fechaTest ? formatearFecha(p.fechaTest) : "—"}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>{p.metricaGasto === null ? "—" : usd(p.metricaGasto)}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>{p.metricaCompras ?? "—"}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>
                      {p.metricaCpa === null ? (
                        "—"
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Punto tono={p.metricaCpa < CPA_OBJETIVO ? "exito" : "peligro"} />
                          {usd(p.metricaCpa)}
                          <span className="sr-only">{p.metricaCpa < CPA_OBJETIVO ? " dentro del objetivo" : " sobre el objetivo"}</span>
                        </span>
                      )}
                    </td>
                    <td className={`${claseTd} text-right tabular-nums`}>{p.metricaCtr === null ? "—" : porcentaje(p.metricaCtr)}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>{p.metricaHookRate === null ? "—" : porcentaje(p.metricaHookRate)}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>{p.metricaCvr === null ? "—" : porcentaje(p.metricaCvr)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </MarcoTabla>
        <p className="px-0.5 py-2 text-xs text-muted-foreground" role="status">
          Mostrando {visibles.length} de {filas.length}
          {filas.length > POR_PAGINA ? " · usa la búsqueda o los filtros para llegar al resto" : ""}
        </p>
      </div>

      <FichaLateralTest
        producto={producto}
        ganadores={ganadores}
        orden={idsVisibles}
        alIr={setElegido}
        alEditar={() => producto && setEditando(producto.id)}
        puedeEscribir={puedeEscribir}
      />
      <FichaProductoTest
        producto={editando ? productos.find((p) => p.id === editando) : undefined}
        orden={idsVisibles}
        paisId={paisId}
        puedeEscribir={puedeEscribir}
        alIr={setEditando}
        alCerrar={() => setEditando(null)}
      />
    </div>
  );
}
