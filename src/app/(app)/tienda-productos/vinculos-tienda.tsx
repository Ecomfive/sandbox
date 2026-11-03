"use client";

import { useMemo, useState, useTransition } from "react";
import { claseThLista, claseTdLista, Indicador, MarcoTabla, Pastilla, TableroIndicadores } from "@/components/panel/piezas-panel";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { fieldClass } from "@/components/ui/field";
import { CampoSkuMaestro, useOpcionesSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import { AlertaIcon, CheckIcon, EnlaceIcon, InventarioIcon, TiendaIcon } from "@/lib/nav-icons";
import { marcarNoFisico, vincularVariante } from "./actions";

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
              correr(async () => {
                for (const f of sugeridasExactas) {
                  const r = await vincularVariante(f.id, f.sugerencia!.id);
                  if (r.error) return r;
                }
                return {};
              }, `${sugeridasExactas.length} variantes vinculadas.`)
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
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={claseThLista}>
                  <span className="sr-only">Foto</span>
                </th>
                <th scope="col" className={claseThLista}>En Shopify</th>
                {varias && <th scope="col" className={claseThLista}>Tienda</th>}
                <th scope="col" className={claseThLista}>SKU de Shopify</th>
                <th scope="col" className={claseThLista}>Producto nuestro</th>
                <th scope="col" className={claseThLista}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const g = grupo(f);
                const vinculado = f.skuMaestroId ? porId.get(f.skuMaestroId) : undefined;
                return (
                  <tr key={f.id} className="align-middle">
                    <td className={claseTdLista}>
                      {f.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.foto} alt="" loading="lazy" className="h-10 w-10 rounded-md border border-border object-cover" />
                      ) : (
                        <span aria-hidden="true" className="block h-10 w-10 rounded-md border border-dashed border-border" />
                      )}
                    </td>
                    <td className={`${claseTdLista} max-w-[22rem] whitespace-normal`}>
                      <span className="font-medium">{f.nombre}</span>
                      {!f.enShopify && <span className="block text-xs text-muted-foreground">Ya no está en Shopify</span>}
                    </td>
                    {varias && <td className={claseTdLista}>{f.tienda}</td>}
                    <td className={`${claseTdLista} font-mono text-xs`}>{f.sku || "(sin SKU)"}</td>
                    <td className={`${claseTdLista} max-w-[22rem] whitespace-normal`}>
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
                        <span>
                          {vinculado?.nombre ?? "Producto vinculado"} <span className="font-mono text-xs text-muted-foreground">{vinculado?.codigo}</span>
                        </span>
                      ) : f.sugerencia ? (
                        <span className="flex flex-col gap-1">
                          <span>
                            {f.sugerencia.nombre} <span className="font-mono text-xs text-muted-foreground">{f.sugerencia.codigo}</span>
                          </span>
                          <span>
                            <Pastilla tono={f.sugerencia.exacta ? "exito" : "aviso"}>{(f.sugerencia.metodo && POR_QUE[f.sugerencia.metodo]) || "Sugerido"}</Pastilla>
                          </span>
                        </span>
                      ) : (
                        <Pastilla tono="peligro">Sin sugerencia</Pastilla>
                      )}
                    </td>
                    <td className={claseTdLista}>
                      {!puedeEscribir ? (
                        <span className="text-xs text-muted-foreground">Solo lectura</span>
                      ) : eligiendo === f.id ? (
                        <Button type="button" variant="ghost" onClick={() => setEligiendo(null)}>
                          Cancelar
                        </Button>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {g === "sugeridas" && (
                            <Button type="button" disabled={pendiente} onClick={() => correr(() => vincularVariante(f.id, f.sugerencia!.id), `Vinculada a ${f.sugerencia!.codigo}.`)}>
                              Confirmar
                            </Button>
                          )}
                          {g !== "no_fisico" && (
                            <Button type="button" variant="secondary" disabled={pendiente} onClick={() => setEligiendo(f.id)}>
                              {g === "vinculadas" ? "Cambiar" : g === "sugeridas" ? "Elegir otro" : "Buscar producto"}
                            </Button>
                          )}
                          {g === "vinculadas" && (
                            <Button type="button" variant="ghost" disabled={pendiente} onClick={() => correr(() => vincularVariante(f.id, null), "Vínculo quitado.")}>
                              Quitar
                            </Button>
                          )}
                          {(g === "sin" || g === "sugeridas") && (
                            <Button type="button" variant="ghost" disabled={pendiente} onClick={() => correr(() => marcarNoFisico(f.id, true), "Marcada: no sale de bodega.")}>
                              No sale de bodega
                            </Button>
                          )}
                          {g === "no_fisico" && (
                            <Button type="button" variant="ghost" disabled={pendiente} onClick={() => correr(() => marcarNoFisico(f.id, false), "Vuelve a estar sin vincular.")}>
                              Deshacer
                            </Button>
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
