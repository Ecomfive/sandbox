"use client";

import { useMemo, useState } from "react";
import { BotonBarra, BotonDescargar, MarcoTabla, Punto, claseConFicha, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { BuscarIcon } from "@/lib/nav-icons";
import { normalizar } from "@/lib/tabla/motor";
import { CrearCompraPanel } from "./crear-compra-panel";
import { colorEtapa, DEF_COMPRAS, diasDeCompra, ETAPAS_COMPRA, etiquetaEtapa, etiquetaVia, type FilaCompra } from "./def-compras";
import { FichaCompra } from "./ficha-compra";
import { FichaLateralCompra } from "./ficha-lateral-compra";
import { diasEntre, enGrupo, estaAtrasada, hoy, umbralesTransito, usd, type Grupo } from "./calculos-compras";
import { SelectorVista } from "./selector-vista";
import { TablaCompras } from "./tabla-compras";

const POR_PAGINA = 80;
const GRUPOS: { valor: Grupo; etiqueta: string }[] = [
  { valor: "abiertas", etiqueta: "Abiertas" },
  { valor: "cotizando", etiqueta: "Cotizando" },
  { valor: "produccion", etiqueta: "Producción" },
  { valor: "transito", etiqueta: "En tránsito" },
  { valor: "atrasadas", etiqueta: "Atrasadas" },
  { valor: "cerradas", etiqueta: "Cerradas" },
];
type Columna = "creada" | "dias" | "llega" | "pagado" | "qty";
const ORDEN: Record<Columna, (c: FilaCompra) => number | string | null> = {
  creada: (c) => c.creadoEn,
  dias: (c) => diasDeCompra(c),
  llega: (c) => c.fechaLlegada,
  pagado: (c) => c.pagadoAProveedor,
  qty: (c) => c.qtyTotal,
};
const claseSelect = `h-[34px] rounded-lg border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`;

/**
 * Las compras como en Productos Test: búsqueda (nombre, código, proveedor, track ID), filtros de un toque por grupo
 * (abiertas, cotizando, producción, en tránsito, atrasadas, cerradas), etapa y responsable, orden por columna y la ficha
 * del elegido fija a la derecha. «Tabla completa» cambia a la tabla con todas las columnas, vistas guardadas y descarga.
 */
export function ListaCompras({
  compras,
  vista,
  paises,
  puedeEscribir,
  puedeAgregarPais,
  grupoInicial,
  etapaInicial,
}: {
  compras: FilaCompra[];
  vista: string;
  paises: { id: string; codigo: string; nombre: string }[];
  puedeEscribir: boolean;
  puedeAgregarPais: boolean;
  grupoInicial: Grupo | null;
  etapaInicial: string;
}) {
  const [modo, setModo] = useState<"lista" | "tabla">("lista");
  const [busqueda, setBusqueda] = useState("");
  const [grupo, setGrupo] = useState<Grupo | null>(grupoInicial ?? (etapaInicial ? null : "abiertas"));
  const [etapa, setEtapa] = useState(etapaInicial);
  const [responsable, setResponsable] = useState("");
  const [orden, setOrden] = useState<{ columna: Columna; sentido: 1 | -1 }>({ columna: "creada", sentido: -1 });
  const [elegida, setElegida] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const umbral = useMemo(() => umbralesTransito(compras), [compras]);
  const dia = hoy();
  const responsables = useMemo(() => [...new Set(compras.map((c) => c.asignadoNombre).filter((x): x is string => !!x))].sort(), [compras]);
  const conteo = useMemo(() => Object.fromEntries(GRUPOS.map((g) => [g.valor, compras.filter((c) => enGrupo(c, g.valor, umbral)).length])), [compras, umbral]);

  const filas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const f = ORDEN[orden.columna];
    return compras
      .filter(
        (c) =>
          (!q || normalizar([c.nombre, c.codigo, c.proveedor, c.trackId, c.tienda, c.orden].filter(Boolean).join(" ")).includes(q)) &&
          (!grupo || enGrupo(c, grupo, umbral)) &&
          (!etapa || c.etapa === etapa) &&
          (!responsable || c.asignadoNombre === responsable),
      )
      .sort((a, b) => {
        const x = f(a);
        const y = f(b);
        if (x === null && y === null) return a.nombre.localeCompare(b.nombre);
        if (x === null) return 1;
        if (y === null) return -1;
        return x === y ? a.nombre.localeCompare(b.nombre) : (x < y ? -1 : 1) * orden.sentido;
      });
  }, [compras, busqueda, grupo, etapa, responsable, orden, umbral]);

  if (modo === "tabla") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <BotonBarra onClick={() => setModo("lista")}>← Vista de lista</BotonBarra>
        </div>
        <TablaCompras compras={compras} vista={vista} paises={paises} puedeEscribir={puedeEscribir} puedeAgregarPais={puedeAgregarPais} />
      </div>
    );
  }

  const visibles = filas.slice(0, POR_PAGINA);
  const ids = visibles.map((c) => c.id);
  const idFicha = elegida && filas.some((c) => c.id === elegida) ? elegida : (ids[0] ?? null);
  const compra = compras.find((c) => c.id === idFicha) ?? null;

  function ordenarPor(columna: Columna) {
    setOrden((o) => (o.columna === columna ? { columna, sentido: o.sentido === 1 ? -1 : 1 } : { columna, sentido: -1 }));
  }
  const cabecera = (col: Columna, texto: string, derecha = false) => (
    <th scope="col" aria-sort={orden.columna === col ? (orden.sentido === 1 ? "ascending" : "descending") : undefined} className={`${claseTh} ${derecha ? "text-right" : ""}`}>
      <button type="button" onClick={() => ordenarPor(col)} className={`rounded font-[inherit] tracking-[inherit] uppercase ${anilloFoco}`}>
        {texto} {orden.columna === col ? (orden.sentido === 1 ? "↑" : "↓") : "↕"}
      </button>
    </th>
  );

  return (
    <div className={claseConFicha}>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="flex h-[34px] max-w-xs min-w-[12.5rem] flex-[1_1_12.5rem] items-center gap-1.5 rounded-lg border border-border-control bg-card px-2.5 focus-within:ring-2 focus-within:ring-foreground">
            <BuscarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar compra, código, proveedor o track ID"
              aria-label="Buscar compra"
              className="w-full bg-transparent text-[13px] outline-none"
            />
          </label>
          <SelectorVista vista={vista} paises={paises} puedeAgregarPais={puedeAgregarPais} />
          <select aria-label="Etapa" value={etapa} onChange={(e) => setEtapa(e.target.value)} className={claseSelect}>
            <option value="">Todas las etapas</option>
            {ETAPAS_COMPRA.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.etiqueta}
              </option>
            ))}
          </select>
          <select aria-label="Responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)} className={claseSelect}>
            <option value="">Todos los responsables</option>
            {responsables.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <span className="flex-1" />
          <BotonDescargar def={DEF_COMPRAS} filas={filas} />
          <BotonBarra onClick={() => setModo("tabla")}>Tabla completa</BotonBarra>
          {puedeEscribir && <CrearCompraPanel vista={vista} paises={paises} />}
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {GRUPOS.map((g) => (
            <BotonBarra key={g.valor} activo={grupo === g.valor} onClick={() => setGrupo((v) => (v === g.valor ? null : g.valor))}>
              {g.valor === "atrasadas" && conteo.atrasadas > 0 && <Punto tono="peligro" />}
              {g.etiqueta} <span className="text-muted-foreground tabular-nums">{conteo[g.valor]}</span>
            </BotonBarra>
          ))}
        </div>

        <MarcoTabla ariaLabel="Compras">
          <table className="w-full min-w-[54rem] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={claseTh}>Compra</th>
                <th scope="col" className={claseTh}>👣 Etapa</th>
                <th scope="col" className={claseTh}>🏗️ Vía</th>
                {cabecera("creada", "Creada")}
                {cabecera("llega", "Llegada")}
                {cabecera("qty", "QTY", true)}
                {cabecera("pagado", "Pagado", true)}
                {cabecera("dias", "Días", true)}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {compras.length === 0 ? "Todavía no hay compras en esta vista." : "Ninguna compra coincide con lo que buscas."}
                  </td>
                </tr>
              ) : (
                visibles.map((c) => {
                  const atrasada = estaAtrasada(c, umbral, dia);
                  return (
                    <tr
                      key={c.id}
                      tabIndex={0}
                      aria-current={c.id === idFicha ? "true" : undefined}
                      onClick={() => setElegida(c.id)}
                      onDoubleClick={() => setAbierta(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (c.id === idFicha) setAbierta(c.id);
                          else setElegida(c.id);
                        } else if (e.key === " ") {
                          e.preventDefault();
                          setElegida(c.id);
                        }
                      }}
                      className={`cursor-pointer hover:bg-muted aria-[current=true]:bg-accent ${anilloFoco}`}
                    >
                      <td className={claseTd}>
                        <span className="flex items-center gap-1.5">
                          {atrasada && <Punto tono="peligro" />}
                          {atrasada && <span className="sr-only">Atrasada. </span>}
                          <span className="block max-w-[22rem] truncate font-medium" title={c.nombre}>
                            {c.codigo && <span className="mr-1.5 text-muted-foreground">{c.codigo}</span>}
                            {c.nombre}
                          </span>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {[c.paisCodigo ?? "Importadora", c.proveedor, c.asignadoNombre].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      <td className={claseTd}>
                        <Badge color={colorEtapa(c.etapa)}>{etiquetaEtapa(c.etapa)}</Badge>
                      </td>
                      <td className={`${claseTd} text-muted-foreground`}>{c.viaEnvio.length ? c.viaEnvio.map(etiquetaVia).join(", ") : "—"}</td>
                      <td className={claseTd}>{formatearFecha(c.creadoEn)}</td>
                      <td className={claseTd}>
                        {c.fechaLlegada ? (
                          formatearFecha(c.fechaLlegada)
                        ) : c.fechaEnvio ? (
                          <span className={atrasada ? "text-destructive" : "text-muted-foreground"}>en tránsito {diasEntre(c.fechaEnvio, dia)} d</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${claseTd} text-right tabular-nums`}>{c.qtyTotal ?? "—"}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>{c.pagadoAProveedor !== null ? usd(c.pagadoAProveedor) : "—"}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>{diasDeCompra(c)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </MarcoTabla>
        <p className="px-0.5 py-2 text-xs text-muted-foreground" role="status">
          Mostrando {visibles.length} de {filas.length}
          {filas.length > POR_PAGINA ? " · usa la búsqueda o los filtros para llegar al resto" : ""}
        </p>
      </div>

      <FichaLateralCompra compra={compra} orden={ids} alIr={setElegida} alAbrir={() => compra && setAbierta(compra.id)} />
      <FichaCompra
        compra={abierta ? compras.find((c) => c.id === abierta) : undefined}
        orden={ids}
        paises={paises}
        puedeEscribir={puedeEscribir}
        alIr={setAbierta}
        alCerrar={() => setAbierta(null)}
      />
    </div>
  );
}
