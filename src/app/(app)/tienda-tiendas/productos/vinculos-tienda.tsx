"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { claseThLista, claseTdLista, Indicador, MarcoTabla, Pastilla, TableroIndicadores } from "@/components/panel/piezas-panel";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { CampoSkuMaestro, useOpcionesSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import { AlertaIcon, CheckIcon, EnlaceIcon, InventarioIcon, TiendaIcon } from "@/lib/nav-icons";
import { marcarNoFisico, vincularVariante, vincularVariantesEnBloque } from "./actions";

export interface FilaVinculo {
  id: string;
  tienda: string;
  nombre: string;
  sku: string | null;
  foto: string | null;
  enShopify: boolean;
  noFisico: boolean;
  skuMaestroId: string | null;
  sugerencia: { id: string; codigo: string; nombre: string; exacta: boolean; metodo: string | null } | null;
}

type Filtro = "todas" | "vinculadas" | "sugeridas" | "sin" | "no_fisico";

const POR_QUE: Record<string, string> = { codigo: "SKU igual", nombre: "Nombre igual", foto: "Misma foto", parecido: "Nombre parecido" };
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Botones chicos de la fila (12 nov 2026: los de antes ocupaban media fila).
const BOTON_BASE = `inline-flex h-8 shrink-0 items-center rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`;
const BOTON_PRINCIPAL = `${BOTON_BASE} boton-neon text-white`;
const BOTON_SECUNDARIO = `${BOTON_BASE} border border-border bg-card hover:bg-muted`;
const BOTON_TEXTO = `${BOTON_BASE} text-muted-foreground hover:bg-muted hover:text-foreground`;

/** El producto nuestro en una celda: el nombre (hasta dos líneas), su código en gris y, si hay, por qué se sugiere. */
function ProductoNuestro({ nombre, codigo, pastilla }: { nombre: string; codigo: string | null; pastilla?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="line-clamp-2 leading-snug" title={nombre}>
        {nombre}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        {codigo && <span className="truncate font-mono text-[11px] text-muted-foreground">{codigo}</span>}
        {pastilla}
      </span>
    </span>
  );
}

const grupo = (f: FilaVinculo): Exclude<Filtro, "todas"> => (f.noFisico ? "no_fisico" : f.skuMaestroId ? "vinculadas" : f.sugerencia ? "sugeridas" : "sin");

/**
 * La lista de variantes de Shopify con su producto nuestro: el tablero de arriba cuenta y filtra (vinculadas, por confirmar con sugerencia, sin
 * vincular, no sale de bodega) y cada fila se confirma, se elige otro producto o se marca como algo que no sale de bodega.
 */
export function VinculosTienda({ filas, varias, puedeEscribir }: { filas: FilaVinculo[]; varias: boolean; puedeEscribir: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>(() => (filas.some((f) => grupo(f) === "sugeridas") ? "sugeridas" : "todas"));
  const [q, setQ] = useState("");
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const opciones = useOpcionesSkuMaestro();
  const porId = useMemo(() => new Map(opciones.map((o) => [o.id, o])), [opciones]);

  const cuenta = useMemo(() => {
    const c = { todas: filas.length, vinculadas: 0, sugeridas: 0, sin: 0, no_fisico: 0 };
    for (const f of filas) c[grupo(f)]++;
    return c;
  }, [filas]);
  const visibles = useMemo(() => {
    const t = normal(q.trim());
    return filas.filter((f) => (filtro === "todas" || grupo(f) === filtro) && (!t || normal(`${f.nombre} ${f.sku ?? ""}`).includes(t)));
  }, [filas, filtro, q]);

  const correr = (accion: () => Promise<{ error?: string }>, ok: string) =>
    empezar(async () => {
      const r = await accion();
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(ok, "success");
        setEligiendo(null);
      }
    });
  const alternar = (f: Filtro) => setFiltro((x) => (x === f ? "todas" : f));
  const sugeridasExactas = filas.filter((f) => grupo(f) === "sugeridas" && f.sugerencia?.exacta);

  return (
    <div className="flex flex-col gap-5">
      <TableroIndicadores etiqueta="Tablero de vinculación">
        <Indicador titulo="Variantes en Shopify" icono={TiendaIcon} color="violeta" valor={String(cuenta.todas)} detalle="de las tiendas que se miran" alPulsar={() => setFiltro("todas")} activo={filtro === "todas"} />
        <Indicador titulo="Vinculadas" icono={CheckIcon} color="verde" punto={cuenta.vinculadas ? "exito" : undefined} valor={String(cuenta.vinculadas)} detalle="ya saben su producto" alPulsar={() => alternar("vinculadas")} activo={filtro === "vinculadas"} />
        <Indicador titulo="Por confirmar" icono={EnlaceIcon} color="ambar" punto={cuenta.sugeridas ? "aviso" : undefined} valor={String(cuenta.sugeridas)} detalle="con sugerencia del sistema" alPulsar={() => alternar("sugeridas")} activo={filtro === "sugeridas"} />
        <Indicador titulo="Sin vincular" icono={AlertaIcon} color="rojo" punto={cuenta.sin ? "peligro" : undefined} valor={String(cuenta.sin)} detalle="sin sugerencia: elegir a mano" alPulsar={() => alternar("sin")} activo={filtro === "sin"} />
        <Indicador titulo="No sale de bodega" icono={InventarioIcon} color="azul" valor={String(cuenta.no_fisico)} detalle="garantías, envío prioritario…" alPulsar={() => alternar("no_fisico")} activo={filtro === "no_fisico"} />
      </TableroIndicadores>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-w-[16rem] flex-1 sm:max-w-md">
          <span className="sr-only">Buscar</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o SKU de Shopify" className={`${fieldClass} w-full`} />
        </label>
        {puedeEscribir && sugeridasExactas.length > 0 && (
          <Button
            type="button"
            disabled={pendiente}
            onClick={() =>
              // Todas juntas: los pedidos de la tienda se actualizan una sola vez.
              correr(() => vincularVariantesEnBloque(sugeridasExactas.map((f) => ({ varianteId: f.id, skuId: f.sugerencia!.id }))), `${sugeridasExactas.length} variantes vinculadas.`)
            }
          >
            Confirmar las {sugeridasExactas.length} con SKU o nombre igual
          </Button>
        )}
      </div>

      {!visibles.length ? (
        <div className="rounded-[10px] border border-border bg-card">
          <EstadoVacio mensaje={!filas.length ? "Las variantes de Shopify aparecen aquí al conectar la tienda." : "Ninguna variante cumple con lo que estás filtrando."} />
        </div>
      ) : (
        <MarcoTabla ariaLabel="Variantes de Shopify">
          {/* Anchos fijos (12 nov 2026): los nombres y los SKU largos de Shopify ya no se montan sobre la columna de al lado. */}
          <table className="w-full min-w-[56rem] table-fixed border-collapse">
            <colgroup>
              <col className="w-14" />
              <col />
              {varias && <col className="w-28" />}
              <col />
              <col className="w-[17rem]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={claseThLista}>
                  <span className="sr-only">Foto</span>
                </th>
                <th scope="col" className={claseThLista}>En Shopify</th>
                {varias && <th scope="col" className={claseThLista}>Tienda</th>}
                <th scope="col" className={claseThLista}>Producto nuestro</th>
                <th scope="col" className={claseThLista}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const g = grupo(f);
                const vinculado = f.skuMaestroId ? porId.get(f.skuMaestroId) : undefined;
                return (
                  <tr key={f.id} className="align-middle hover:bg-muted/40">
                    <td className={claseTdLista}>
                      {f.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.foto} alt="" loading="lazy" className="h-10 w-10 rounded-md border border-border object-cover" />
                      ) : (
                        <span aria-hidden="true" className="block h-10 w-10 rounded-md border border-dashed border-border" />
                      )}
                    </td>
                    <td className={`${claseTdLista} !whitespace-normal`}>
                      <span className="line-clamp-2 leading-snug font-medium" title={f.nombre}>
                        {f.nombre}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground" title={f.sku ?? undefined}>
                        {f.sku || "sin SKU"}
                        {!f.enShopify && <span className="font-sans"> · ya no está en Shopify</span>}
                      </span>
                    </td>
                    {varias && <td className={`${claseTdLista} truncate`}>{f.tienda}</td>}
                    <td className={`${claseTdLista} !whitespace-normal`}>
                      {eligiendo === f.id ? (
                        <CampoSkuMaestro
                          valor={f.skuMaestroId}
                          etiquetaAria={`Producto nuestro para ${f.nombre}`}
                          placeholder="SKU o nombre del producto"
                          claseContenedor="w-full"
                          deshabilitado={pendiente}
                          alCambiar={(s) => s && correr(() => vincularVariante(f.id, s.id), `Vinculada a ${s.codigo}.`)}
                        />
                      ) : g === "no_fisico" ? (
                        <Pastilla>No sale de bodega</Pastilla>
                      ) : vinculado || f.skuMaestroId ? (
                        <ProductoNuestro nombre={vinculado?.nombre ?? "Producto vinculado"} codigo={vinculado?.codigo ?? null} />
                      ) : f.sugerencia ? (
                        <ProductoNuestro
                          nombre={f.sugerencia.nombre}
                          codigo={f.sugerencia.codigo}
                          pastilla={<Pastilla tono={f.sugerencia.exacta ? "exito" : "aviso"}>{(f.sugerencia.metodo && POR_QUE[f.sugerencia.metodo]) || "Sugerido"}</Pastilla>}
                        />
                      ) : (
                        <Pastilla tono="peligro">Sin sugerencia</Pastilla>
                      )}
                    </td>
                    <td className={claseTdLista}>
                      {!puedeEscribir ? (
                        <span className="text-xs text-muted-foreground">Solo lectura</span>
                      ) : eligiendo === f.id ? (
                        <button type="button" className={BOTON_TEXTO} onClick={() => setEligiendo(null)}>
                          Cancelar
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {g === "sugeridas" && (
                            <button type="button" className={BOTON_PRINCIPAL} disabled={pendiente} onClick={() => correr(() => vincularVariante(f.id, f.sugerencia!.id), `Vinculada a ${f.sugerencia!.codigo}.`)}>
                              Confirmar
                            </button>
                          )}
                          {g !== "no_fisico" && (
                            <button type="button" className={BOTON_SECUNDARIO} disabled={pendiente} onClick={() => setEligiendo(f.id)}>
                              {g === "vinculadas" ? "Cambiar" : g === "sugeridas" ? "Elegir otro" : "Buscar producto"}
                            </button>
                          )}
                          {g === "vinculadas" && (
                            <button type="button" className={BOTON_TEXTO} disabled={pendiente} onClick={() => correr(() => vincularVariante(f.id, null), "Vínculo quitado.")}>
                              Quitar
                            </button>
                          )}
                          {(g === "sin" || g === "sugeridas") && (
                            <button
                              type="button"
                              className={BOTON_TEXTO}
                              title="No es un producto físico (garantía, envío prioritario…): no se vincula ni cuenta como vendido"
                              disabled={pendiente}
                              onClick={() => correr(() => marcarNoFisico(f.id, true), "Marcada: no sale de bodega.")}
                            >
                              No sale de bodega
                            </button>
                          )}
                          {g === "no_fisico" && (
                            <button type="button" className={BOTON_TEXTO} disabled={pendiente} onClick={() => correr(() => marcarNoFisico(f.id, false), "Vuelve a estar sin vincular.")}>
                              Deshacer
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </MarcoTabla>
      )}
      <p className="m-0 text-xs text-muted-foreground">
        Un pack o combo de Shopify se une a su producto compuesto: así la bodega sabe qué componentes salen. Lo que no es un producto físico (garantía extendida,
        envío prioritario) se marca «No sale de bodega» y no cuenta como vendido.
      </p>
    </div>
  );
}
