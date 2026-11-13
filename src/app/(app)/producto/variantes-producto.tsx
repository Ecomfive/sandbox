"use client";

import { primeroLibre, sugerirSkuVariante } from "@/lib/wms/sugerir-sku";
import { ordenarVariantes } from "@/lib/wms/orden-variantes";
import { etiquetaTalla } from "@/lib/wms/talla";
import { BotonOrdenVariantes, useOrdenVariantes } from "@/components/ui/orden-variantes";
import { useEffect, useMemo, useState, useTransition } from "react";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { crearVariantes, quitarVariante, type OpcionVariante } from "./actions";
import { CodigoBarrasProducto } from "./codigo-barras-producto";
import type { FilaProducto } from "./def-producto";
import { FotoVariante, MiniaturaVariante } from "./foto-variante";
import { NombreProducto } from "./nombre-producto";
import { AvisoRepartoEnVariante, RepartoStock } from "./reparto-stock";
import { SkuProducto } from "./sku-producto";

const MAX_OPCIONES = 3;
const separar = (t: string) => [...new Set(t.split(",").map((v) => v.trim().replace(/\s+/g, " ")).filter(Boolean))];
const textoOpciones = (o: Record<string, string>) => etiquetaTalla(Object.values(o).join(" / "));

/** Todas las combinaciones de los valores de las opciones, en orden (Beige/S, Beige/M… Negro/S…). */
function combinaciones(opciones: OpcionVariante[]): Record<string, string>[] {
  return opciones.reduce<Record<string, string>[]>((acc, o) => acc.flatMap((c) => o.valores.map((v) => ({ ...c, [o.nombre]: v }))), [{}]);
}

/** Lo que arma el editor: las opciones con sus valores y las variantes nuevas (combinaciones que faltan) con SKU y nombre. */
export interface VariantesArmadas {
  opciones: OpcionVariante[];
  variantes: { opciones: Record<string, string>; codigo: string; nombre: string }[];
}

/**
 * Las opciones (Color, Talla…) con sus valores separados por comas y, debajo, las combinaciones que faltan con su SKU y su
 * nombre sugeridos (el SKU base con -01, -02…; el nombre base con los valores), que se pueden cambiar. Las combinaciones que
 * ya existen no se repiten. Lo usan la ficha (agregar variantes) y «Crear producto» (crearlas de una vez).
 */
export function CamposVariantes({
  codigoBase,
  nombreBase,
  opcionesIniciales = [],
  existentes = [],
  alCambiar,
}: {
  codigoBase: string;
  nombreBase: string;
  opcionesIniciales?: OpcionVariante[];
  existentes?: { codigo: string; opciones: Record<string, string> }[];
  alCambiar: (armadas: VariantesArmadas) => void;
}) {
  const [filas, setFilas] = useState(
    opcionesIniciales.length ? opcionesIniciales.map((o) => ({ nombre: o.nombre, valores: o.valores.join(", ") })) : [{ nombre: "", valores: "" }],
  );
  const [cambios, setCambios] = useState<Record<string, { codigo?: string; nombre?: string }>>({});

  const opciones: OpcionVariante[] = useMemo(
    () => filas.map((f) => ({ nombre: f.nombre.trim(), valores: separar(f.valores) })).filter((o) => o.nombre && o.valores.length),
    [filas],
  );
  const yaHay = useMemo(() => new Set(existentes.map((v) => opciones.map((o) => v.opciones[o.nombre] ?? "").join("|"))), [existentes, opciones]);
  const usados = useMemo(() => new Set(existentes.map((v) => v.codigo.toLowerCase())), [existentes]);

  // Las combinaciones que faltan, con su SKU sugerido: el del producto más los valores («…/ROJO/M»), sin repetir.
  const nuevas = useMemo(() => {
    const tomados = new Set(usados);
    const codigoDe = (c: Record<string, string>) => {
      const libre = primeroLibre(sugerirSkuVariante(codigoBase, opciones.map((o) => c[o.nombre])), (x) => tomados.has(x.toLowerCase()));
      tomados.add(libre.toLowerCase());
      return libre;
    };
    return combinaciones(opciones)
      .filter((c) => !yaHay.has(opciones.map((o) => c[o.nombre]).join("|")))
      .map((c) => ({ clave: opciones.map((o) => c[o.nombre]).join("|"), opciones: c, codigo: codigoDe(c), nombre: `${nombreBase || "Producto"} · ${textoOpciones(c)}` }));
  }, [opciones, yaHay, usados, codigoBase, nombreBase]);

  // Avisa lo armado cada vez que cambia (con lo que se haya editado a mano).
  useEffect(() => {
    alCambiar({
      opciones,
      variantes: nuevas.map((v) => ({ opciones: v.opciones, codigo: cambios[v.clave]?.codigo ?? v.codigo, nombre: cambios[v.clave]?.nombre ?? v.nombre })),
    });
    // `alCambiar` puede cambiar en cada dibujo del padre: lo que importa es lo armado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opciones, nuevas, cambios]);

  return (
    <div className="flex flex-col gap-3">
      {filas.map((f, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Opción</span>
            <input
              value={f.nombre}
              maxLength={40}
              placeholder={i === 0 ? "Ej: Color" : "Ej: Talla"}
              onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
              className={`${fieldClassSm} w-32`}
            />
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Valores, separados por coma</span>
            <input
              value={f.valores}
              placeholder={i === 0 ? "Ej: Beige, Negro" : "Ej: S, M, L"}
              onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, valores: e.target.value } : x)))}
              className={`${fieldClassSm} w-full`}
            />
          </label>
          {filas.length > 1 && (
            <button type="button" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))} className={`pb-1 text-xs text-muted-foreground hover:text-destructive ${anilloFoco}`}>
              Quitar
            </button>
          )}
        </div>
      ))}
      {filas.length < MAX_OPCIONES && (
        <button type="button" onClick={() => setFilas((fs) => [...fs, { nombre: "", valores: "" }])} className={`w-fit text-xs font-medium underline-offset-2 hover:underline ${anilloFoco}`}>
          ＋ Otra opción
        </button>
      )}

      {nuevas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-xs text-muted-foreground">
            Se crearán {nuevas.length} variante{nuevas.length === 1 ? "" : "s"} (puedes cambiar el SKU y el nombre):
          </p>
          <ul className="m-0 flex max-h-72 list-none flex-col gap-1.5 overflow-y-auto p-0">
            {nuevas.map((v) => (
              <li key={v.clave} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-28 shrink-0 font-medium">{textoOpciones(v.opciones)}</span>
                <input
                  aria-label={`SKU de ${textoOpciones(v.opciones)}`}
                  value={cambios[v.clave]?.codigo ?? v.codigo}
                  onChange={(e) => setCambios((c) => ({ ...c, [v.clave]: { ...c[v.clave], codigo: e.target.value.replace(/\s/g, "") } }))}
                  className={`${fieldClassSm} w-32`}
                />
                <input
                  aria-label={`Nombre de ${textoOpciones(v.opciones)}`}
                  value={cambios[v.clave]?.nombre ?? v.nombre}
                  onChange={(e) => setCambios((c) => ({ ...c, [v.clave]: { ...c[v.clave], nombre: e.target.value } }))}
                  className={`${fieldClassSm} min-w-[12rem] flex-1`}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Agregar variantes a un producto que ya existe, desde su ficha. */
function EditorVariantes({ producto, alTerminar }: { producto: FilaProducto; alTerminar: () => void }) {
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();
  const [armadas, setArmadas] = useState<VariantesArmadas>({ opciones: [], variantes: [] });
  const n = armadas.variantes.length;

  function crear() {
    start(async () => {
      const r = await crearVariantes(producto.id, armadas.opciones, armadas.variantes);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(`${r.creadas} variante${r.creadas === 1 ? "" : "s"} creada${r.creadas === 1 ? "" : "s"}`);
      alTerminar();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
      <CamposVariantes
        codigoBase={producto.codigo}
        nombreBase={producto.nombre}
        opcionesIniciales={producto.opcionesVariantes}
        existentes={producto.variantes}
        alCambiar={setArmadas}
      />
      <div className="flex justify-end gap-2">
        <BotonBarra onClick={alTerminar} disabled={pendiente}>
          Cancelar
        </BotonBarra>
        <BotonBarra principal onClick={crear} disabled={pendiente || n === 0}>
          {pendiente ? "Creando…" : n ? `Crear ${n} variante${n === 1 ? "" : "s"}` : "Crear variantes"}
        </BotonBarra>
      </div>
    </div>
  );
}

/**
 * Las variantes de un producto, en su ficha: si es una variante, de qué producto es y sus valores; si es un producto simple,
 * la lista de sus variantes (cada una abre su ficha) y el editor para agregarlas. Un compuesto no tiene variantes.
 */
export function VariantesProducto({ producto, puedeEscribir, alAbrir }: { producto: FilaProducto; puedeEscribir: boolean; alAbrir: (id: string) => void }) {
  const { mostrarToast } = useToast();
  const [editando, setEditando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const { descendente } = useOrdenVariantes();

  if (producto.padre) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="m-0">
          Variante de{" "}
          <button type="button" onClick={() => alAbrir(producto.padre!.id)} className={`font-medium underline-offset-2 hover:underline ${anilloFoco}`}>
            {producto.padre.codigo} · {producto.padre.nombre}
          </button>
        </p>
        {producto.opciones && (
          <p className="m-0 text-xs text-muted-foreground">
            {Object.entries(producto.opciones)
              .map(([k, v]) => `${k}: ${etiquetaTalla(v)}`)
              .join(" · ")}
          </p>
        )}
        {producto.padre.repartoPendiente && (
          <div className="mt-2">
            <AvisoRepartoEnVariante padre={producto.padre} alAbrir={alAbrir} />
          </div>
        )}
      </div>
    );
  }

  function quitar(id: string, codigo: string) {
    if (!confirm(`¿Quitar la variante ${codigo}? Se puede si no tiene stock, compras, fichas enlazadas ni compuestos. Si tuvo movimientos de inventario que se anulan entre sí (sumó y restó lo mismo), se borran con ella.`)) return;
    start(async () => {
      const r = await quitarVariante(id);
      if (r.error) mostrarToast(r.error, "destructive");
      else mostrarToast(`Variante ${codigo} quitada`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {producto.variantes.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Sin variantes. Si se vende en colores, tallas u otras opciones, agrégalas: cada una lleva su propio stock.</p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="m-0 text-xs text-muted-foreground">
              {producto.opcionesVariantes.map((o) => `${o.nombre}: ${etiquetaTalla(o.valores.join(", "))}`).join(" · ")} — {producto.repartoPendiente ? "el stock está como general, todavía sin repartir." : "el stock se lleva en cada variante."}
            </p>
            <BotonOrdenVariantes />
          </div>
          <RepartoStock id={producto.id} codigo={producto.codigo} pendiente={!!producto.repartoPendiente} puedeEscribir={puedeEscribir} />
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {ordenarVariantes(producto.variantes, descendente).map((v) => {
              const esta = abierta === v.id;
              // Sin foto propia, la variante muestra la de su producto principal.
              const foto = v.foto ?? producto.foto;
              return (
                <li key={v.id} className="flex flex-col rounded-lg border border-border">
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <button
                      type="button"
                      aria-expanded={esta}
                      aria-label={`${esta ? "Cerrar" : "Abrir"} los datos de ${v.nombre}`}
                      onClick={() => setAbierta(esta ? null : v.id)}
                      className={`flex min-w-0 flex-1 items-center gap-2.5 text-left ${anilloFoco}`}
                    >
                      <MiniaturaVariante foto={foto} nombre={v.nombre} />
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1.5 truncate font-medium">
                          {textoOpciones(v.opciones) || v.nombre}
                          {producto.repartoPendiente && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                              Sin repartir
                            </span>
                          )}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{v.codigo}</span>
                      </span>
                    </button>
                    {puedeEscribir && (
                      <button type="button" disabled={pendiente} onClick={() => quitar(v.id, v.codigo)} className={`shrink-0 text-xs text-muted-foreground hover:text-destructive ${anilloFoco}`}>
                        Quitar
                      </button>
                    )}
                  </div>
                  {esta && (
                    <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
                      <FotoVariante id={v.id} nombre={v.nombre} foto={foto} fotoDelPrincipal={producto.foto} puedeEscribir={puedeEscribir} />
                      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-0.5 sm:col-span-2">
                          <dt className="text-xs text-muted-foreground">Nombre</dt>
                          <dd className="m-0">
                            <NombreProducto key={`${v.id}-${v.nombre}`} id={v.id} nombre={v.nombre} puedeEscribir={puedeEscribir} />
                          </dd>
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <dt className="text-xs text-muted-foreground">SKU</dt>
                          <dd className="m-0">
                            <SkuProducto key={`${v.id}-${v.codigo}`} id={v.id} codigo={v.codigo} puedeEscribir={puedeEscribir} />
                          </dd>
                        </div>
                      </dl>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Código de barras</span>
                        <CodigoBarrasProducto key={v.id} id={v.id} codigoBarras={v.barras ?? null} origen={v.barrasOrigen ?? null} nombre={v.nombre} sku={v.codigo} puedeEscribir={puedeEscribir} />
                      </div>
                      <button type="button" onClick={() => alAbrir(v.id)} className={`w-fit text-xs text-muted-foreground underline-offset-2 hover:underline ${anilloFoco}`}>
                        Ver su ficha completa (inventario, vencimiento, compras…)
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {puedeEscribir &&
        (editando ? (
          <EditorVariantes producto={producto} alTerminar={() => setEditando(false)} />
        ) : (
          <BotonBarra className="w-fit" onClick={() => setEditando(true)}>
            {producto.variantes.length ? "Agregar variantes" : "Crear variantes"}
          </BotonBarra>
        ))}
    </div>
  );
}
