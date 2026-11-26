"use client";

// La hoja de Costos de producto (migración 0992): una fila por compra, agrupada por el código único del producto. Lo que
// viene de Compras se ve en gris y no se edita; los costos asociados se escriben en la celda (clic, Enter o salir guardan,
// Escape deja lo que había). El % por financiamiento y el costo total los calcula la base y se ven al momento.

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { claseCifra } from "@/components/af4/estilos-af4";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Campo } from "@/components/ui/campo-ficha";
import { Seccion } from "@/components/ui/seccion-ficha";
import { fieldClass, anilloFoco } from "@/components/ui/field";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { useToast } from "@/components/ui/toast";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, entero, SIN_DATO } from "@/lib/af4/formato";
import { usd4 } from "./formato";
import { numeroProducto } from "@/lib/wms/codigos-producto";
import { COSTOS_ASOCIADOS, VARIACION_AVISO, calcularFila, type CampoAsociado, type ResumenProducto } from "@/lib/finanzas/hoja-costos";
import type { FilaHojaVista, ProductoSinCosto } from "@/lib/finanzas/cargar-hoja-costos";
import { AlertaIcon, CalendarioIcon, ComprasIcon, GastoIcon, LapizIcon, PapeleraIcon, ProductoIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { crearCostoManual, eliminarCostoManual, guardarCostoAsociado, guardarNotaYCostoFinal } from "./hoja-actions";

const usd = (v: number) => dinero(v, "USD");
const usdU = usd4;

type Edicion = Partial<Record<CampoAsociado, number>> & { costoTotal?: number; nota?: string | null; costoFinalManual?: number | null };

interface Contexto {
  puedeEscribir: boolean;
  editar: (id: string, cambio: Edicion) => void;
  abrirNota: (f: FilaHojaVista) => void;
}

const estadoDe = (f: FilaHojaVista): "manual" | "porCompletar" | "completo" =>
  f.costoFinalManual ? "manual" : COSTOS_ASOCIADOS.some((c) => f.asociados[c.id] > 0) ? "completo" : "porCompletar";
const ETIQUETA_ESTADO = { manual: "Costo final manual", porCompletar: "Por completar", completo: "Con costos asociados" } as const;

const DEF: DefTabla<FilaHojaVista> = {
  clave: "costos-producto-hoja",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "seleccion", valores: (f) => [`${numeroProducto(f.numero)} · ${f.producto}`], agrupable: true },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [ETIQUETA_ESTADO[estadoDe(f)]], agrupable: true },
    { id: "origen", etiqueta: "Origen", tipo: "seleccion", valores: (f) => [f.origen === "manual" ? "A mano" : f.origen === "carga_inicial" ? "Carga inicial sin compra" : "Compras"], agrupable: true },
    { id: "texto", etiqueta: "Buscar", tipo: "texto", valor: (f) => `${numeroProducto(f.numero)} ${f.numero ?? ""} ${f.sku} ${f.producto} ${f.codigoCompra}` },
    { id: "llegada", etiqueta: "Llegada", tipo: "fecha", valor: (f) => f.llegada ?? "" },
    { id: "costoTotal", etiqueta: "Costo total unitario", tipo: "numero", valor: (f) => f.costoTotal },
  ],
  vistaInicial: { agrupar: "producto" },
  total: (f) => f.cantidad * f.costoTotal,
};
const NOMBRE: NombreFilas = { singular: "compra", plural: "compras" };
const ICONOS: Record<string, IconoComp> = { producto: ProductoIcon, estado: AlertaIcon, origen: ComprasIcon, texto: ProductoIcon, llegada: CalendarioIcon, costoTotal: GastoIcon };

/** Una celda de costo asociado: el total de esa compra en USD, editable con un clic. */
function CeldaAsociado({ fila, campo, ctx }: { fila: FilaHojaVista; campo: CampoAsociado; ctx: Contexto }) {
  const valor = fila.asociados[campo] ?? 0;
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [pendiente, start] = useTransition();
  const { mostrarToast } = useToast();
  const etiqueta = COSTOS_ASOCIADOS.find((c) => c.id === campo)!;
  const cancelado = useRef(false);

  if (!ctx.puedeEscribir) return <span className={`${claseCifra} ${valor > 0 ? "" : "text-muted-foreground"}`}>{valor > 0 ? usd(valor) : SIN_DATO}</span>;

  const guardar = () => {
    setEditando(false);
    if (cancelado.current) return void (cancelado.current = false);
    const previo = valor;
    start(async () => {
      const r = await guardarCostoAsociado(fila.id, campo, texto);
      if ("error" in r) {
        ctx.editar(fila.id, { [campo]: previo });
        mostrarToast(r.error, "destructive");
      } else ctx.editar(fila.id, { costoTotal: r.costoTotal });
    });
    const n = Number(texto.replace(/[^0-9.,-]/g, "").replace(",", "."));
    if (Number.isFinite(n) && n >= 0) ctx.editar(fila.id, { [campo]: texto.trim() === "" ? 0 : Math.round(n * 100) / 100 });
  };

  if (editando)
    return (
      <input
        autoFocus
        inputMode="decimal"
        aria-label={`${etiqueta.etiqueta} de ${fila.producto}, compra ${fila.codigoCompra} (total en USD)`}
        className={`w-24 rounded border border-border-control bg-background px-1.5 py-0.5 text-right text-sm ${claseCifra} ${anilloFoco}`}
        value={texto}
        placeholder="0.00"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            cancelado.current = true;
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={guardar}
      />
    );
  return (
    <button
      type="button"
      onClick={() => {
        setTexto(valor > 0 ? String(valor) : "");
        setEditando(true);
      }}
      aria-label={`${etiqueta.etiqueta} de ${fila.producto}, compra ${fila.codigoCompra}: ${valor > 0 ? usd(valor) : "sin cargar"}. Editar`}
      className={`w-full min-w-16 rounded px-1.5 py-0.5 text-right ${claseCifra} hover:bg-accent ${anilloFoco} ${valor > 0 ? "" : "text-muted-foreground"} ${pendiente ? "opacity-60" : ""}`}
    >
      {valor > 0 ? usd(valor) : "—"}
    </button>
  );
}

const COLUMNAS: ColumnaTabla<FilaHojaVista, Contexto>[] = [
  {
    id: "codigo",
    label: "Código único",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (f) => (
      <span className="flex flex-col">
        <span className={`font-medium ${claseCifra}`}>{numeroProducto(f.numero) || SIN_DATO}</span>
        <span className="text-xs text-muted-foreground">{f.sku}</span>
      </span>
    ),
  },
  { id: "producto", label: "Producto", ocultable: true, clase: "max-w-60", render: (f) => <span className="line-clamp-2">{f.producto}</span> },
  { id: "compra", label: "Código ECOM", ocultable: false, clase: "whitespace-nowrap", render: (f) => <span className={claseCifra}>{f.codigoCompra || SIN_DATO}</span> },
  { id: "llegada", label: "Llegada", ocultable: true, clase: `whitespace-nowrap ${claseCifra}`, render: (f) => (f.llegada ? fechaCorta(f.llegada) : SIN_DATO) },
  { id: "cantidad", label: "Cantidad", ocultable: true, alinear: "derecha", clase: `text-right ${claseCifra}`, render: (f) => entero(f.cantidad) },
  { id: "unitario", label: "Costo compra (u.)", ocultable: true, alinear: "derecha", clase: `text-right text-muted-foreground ${claseCifra}`, render: (f) => usdU(f.costoUnitario) },
  ...COSTOS_ASOCIADOS.map(
    (c): ColumnaTabla<FilaHojaVista, Contexto> => ({
      id: c.id,
      label: c.corta,
      ocultable: true,
      alinear: "derecha",
      clase: "text-right",
      render: (f, ctx) => (
        <Tooltip texto={`${c.etiqueta}: total de la compra (USD)`}>
          <span className="block">
            <CeldaAsociado fila={f} campo={c.id} ctx={ctx} />
          </span>
        </Tooltip>
      ),
    }),
  ),
  {
    id: "financiamiento",
    label: "% financ.",
    ocultable: true,
    alinear: "derecha",
    clase: `text-right ${claseCifra}`,
    render: (f) =>
      f.pctFinanciamiento && f.pctFinanciamiento > 0 ? (
        <span className="flex flex-col items-end">
          <span>{f.pctFinanciamiento.toLocaleString("es-PA", { maximumFractionDigits: 2 })} %</span>
          <span className="text-xs text-muted-foreground">{usdU(f.financiamiento)} u.</span>
        </span>
      ) : (
        <span className="text-muted-foreground">0 %</span>
      ),
  },
  {
    id: "total",
    label: "Costo total (u.)",
    ocultable: false,
    alinear: "derecha",
    clase: `text-right font-semibold ${claseCifra}`,
    render: (f, ctx) => (
      <span className="flex items-center justify-end gap-1.5">
        {f.costoFinalManual ? (
          <Tooltip texto={`Costo final manual. Calculado: ${usdU(f.costoCalculado)}`}>
            <span tabIndex={0} role="img" aria-label="Costo final escrito a mano" className="h-2 w-2 rounded-full bg-warning" />
          </Tooltip>
        ) : null}
        <span>{usdU(f.costoTotal)}</span>
        {ctx.puedeEscribir && (
          <Tooltip texto="Nota y costo final">
            <button type="button" onClick={() => ctx.abrirNota(f)} aria-label={`Nota y costo final de ${f.producto}, compra ${f.codigoCompra}`} className={`rounded p-1 text-muted-foreground hover:bg-accent ${anilloFoco}`}>
              <LapizIcon className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        )}
      </span>
    ),
  },
  {
    id: "estado",
    label: "Estado",
    ocultable: true,
    clase: "whitespace-nowrap text-xs",
    render: (f) => {
      const e = estadoDe(f);
      return (
        <span className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${e === "porCompletar" ? "bg-warning" : e === "manual" ? "bg-muted-foreground" : "bg-success"}`} />
            {ETIQUETA_ESTADO[e]}
          </span>
          {f.estatus?.startsWith("Revisar") && <span className="text-destructive">{f.estatus}</span>}
          {f.editadoPor && <span className="text-muted-foreground">{f.editadoPor}</span>}
        </span>
      );
    },
  },
];

/** Nota de la fila y costo final manual (vacío = se calcula con los costos asociados). */
function EditorNota({ fila, alCerrar, alGuardar }: { fila: FilaHojaVista; alCerrar: () => void; alGuardar: (e: Edicion) => void }) {
  const [nota, setNota] = useState(fila.nota ?? "");
  const [final, setFinal] = useState(fila.costoFinalManual ? String(fila.costoFinalManual) : "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const [borrando, setBorrando] = useState(false);
  const { mostrarToast } = useToast();
  return (
    <Ventana abierto alCerrar={alCerrar} titulo={`${numeroProducto(fila.numero)} · ${fila.codigoCompra}`} ancho="sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await guardarNotaYCostoFinal(fila.id, nota, final);
            if ("error" in r) return setError(r.error);
            alGuardar({ nota: nota.trim() || null, costoFinalManual: final.trim() ? Number(final) : null, costoTotal: r.costoTotal });
            mostrarToast("Guardado", "success");
            alCerrar();
          });
        }}
      >
        <p className="text-sm">{fila.producto}</p>
        <Campo etiqueta="Costo final por unidad (opcional)" id="costo-final">
          <input id="costo-final" data-enfocar inputMode="decimal" className={fieldClass} value={final} placeholder={`Calculado: ${usdU(fila.costoCalculado)}`} onChange={(e) => setFinal(e.target.value)} />
        </Campo>
        <p className="text-xs text-muted-foreground">Si lo escribes, manda sobre el cálculo. Déjalo vacío para que el costo salga del costo de compra, los asociados y el financiamiento.</p>
        <Campo etiqueta="Nota" id="nota-costo">
          <textarea id="nota-costo" rows={3} maxLength={500} className={fieldClass} value={nota} placeholder="Ej: factura 1234 del agente de carga" onChange={(e) => setNota(e.target.value)} />
        </Campo>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {fila.origen === "manual" ? (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => {
                if (!borrando) return setBorrando(true);
                start(async () => {
                  const r = await eliminarCostoManual(fila.id);
                  if (r.error) return setError(r.error);
                  mostrarToast("Fila quitada", "success");
                  alCerrar();
                });
              }}
              className={`inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-destructive hover:bg-accent ${anilloFoco}`}
            >
              <PapeleraIcon className="h-4 w-4" />
              {borrando ? "Confirmar: quitar la fila" : "Quitar esta fila"}
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={pendiente} className={`rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 ${anilloFoco}`}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Ventana>
  );
}

/** La ficha para una fila a mano: un imprevisto o un producto con stock sin compra vinculada. */
function FichaManual({ skuInicial, boton }: { skuInicial: string | null; boton: (abrir: () => void) => ReactNode }) {
  const [sku, setSku] = useState<string | null>(skuInicial);
  return (
    <FichaCrear
      titulo="Costo a mano"
      etiquetaCrear="Guardar costo"
      action={crearCostoManual}
      mensajeExito="Costo agregado a la hoja"
      alAbrir={() => setSku(skuInicial)}
      boton={boton}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={ProductoIcon} titulo="Producto">
            <Campo etiqueta="Producto" id="cm-producto" obligatorio faltante={faltante}>
              <CampoSkuMaestro valor={sku} alCambiar={(o) => setSku(o?.id ?? null)} etiquetaAria="Producto" placeholder="Código único, SKU o nombre" claseContenedor="w-full" />
              <input id="cm-producto" type="hidden" name="sku_maestro_id" value={sku ?? ""} required aria-invalid={invalido("cm-producto")} />
            </Campo>
          </Seccion>
          <Seccion icono={ComprasIcon} titulo="Compra">
            <Campo etiqueta="Referencia (código de compra, factura o motivo)" id="cm-ref" obligatorio faltante={faltante}>
              <input id="cm-ref" name="referencia" required maxLength={80} className={fieldClass} placeholder="Ej: ECOM01-0412 o Factura 889" aria-invalid={invalido("cm-ref")} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Fecha de llegada" id="cm-fecha" obligatorio faltante={faltante}>
                <input id="cm-fecha" name="fecha_llegada" type="date" required className={fieldClass} aria-invalid={invalido("cm-fecha")} />
              </Campo>
              <Campo etiqueta="Unidades" id="cm-cant" obligatorio faltante={faltante}>
                <input id="cm-cant" name="cantidad" type="number" min={1} step={1} required className={fieldClass} placeholder="Ej: 500" aria-invalid={invalido("cm-cant")} />
              </Campo>
            </div>
          </Seccion>
          <Seccion icono={GastoIcon} titulo="Costo">
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Costo de compra por unidad (USD)" id="cm-unit">
                <input id="cm-unit" name="costo_unitario" inputMode="decimal" className={fieldClass} placeholder="Ej: 1.10" />
              </Campo>
              <Campo etiqueta="Costo final por unidad (USD)" id="cm-final">
                <input id="cm-final" name="costo_final" inputMode="decimal" className={fieldClass} placeholder="Ej: 1.43" />
              </Campo>
            </div>
            <p className="text-xs text-muted-foreground">Escribe al menos uno. Los costos asociados se completan después en la hoja.</p>
            <Campo etiqueta="Nota" id="cm-nota">
              <textarea id="cm-nota" name="nota" rows={2} maxLength={500} className={fieldClass} placeholder="Ej: compra local de reposición" />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}

export function HojaCostos({
  filas,
  resumen,
  sinCosto,
  opciones,
  puedeEscribir,
}: {
  filas: FilaHojaVista[];
  resumen: Record<string, ResumenProducto>;
  sinCosto: ProductoSinCosto[];
  opciones: OpcionSkuMaestro[];
  puedeEscribir: boolean;
}) {
  const [ediciones, setEdiciones] = useState<Record<string, Edicion>>({});
  const [nota, setNota] = useState<FilaHojaVista | null>(null);
  const [skuManual, setSkuManual] = useState<string | null>(null);
  const abrirManual = useRef<() => void>(() => undefined);

  const vistas = useMemo(
    () =>
      filas.map((f) => {
        const e = ediciones[f.id];
        if (!e) return f;
        const asociados = { ...f.asociados };
        for (const c of COSTOS_ASOCIADOS) if (e[c.id] !== undefined) asociados[c.id] = e[c.id]!;
        const base = { ...f, asociados, nota: e.nota !== undefined ? e.nota : f.nota, costoFinalManual: e.costoFinalManual !== undefined ? e.costoFinalManual : f.costoFinalManual };
        const calc = calcularFila(base);
        return { ...base, ...calc, costoTotal: e.costoTotal ?? calc.costoTotal };
      }),
    [filas, ediciones],
  );
  const ctx: Contexto = {
    puedeEscribir,
    editar: (id, cambio) => setEdiciones((p) => ({ ...p, [id]: { ...p[id], ...cambio } })),
    abrirNota: setNota,
  };

  const manual = (sku: string | null) => {
    setSkuManual(sku);
    // La ficha toma el producto al abrirse (alAbrir), así que se abre en el siguiente pintado.
    requestAnimationFrame(() => abrirManual.current());
  };

  return (
    <ProveedorSkusMaestros opciones={opciones}>
      {sinCosto.length > 0 && (
        <section aria-labelledby="sin-costo-titulo" className="rounded-xl border border-border bg-card">
          <h2 id="sin-costo-titulo" className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-destructive" />
            Con stock y sin costo · {sinCosto.length}
          </h2>
          <ul className="divide-y divide-border">
            {sinCosto.map((p) => (
              <li key={p.skuId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{p.producto}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <CodigosProducto numero={p.numero} />
                    <span>{p.sku}</span>
                    {p.stock > 0 && <span>{entero(p.stock)} u. en bodega</span>}
                    {p.sinCompra && <span>Sin compra vinculada</span>}
                  </span>
                </span>
                {puedeEscribir && (
                  <button type="button" onClick={() => manual(p.skuId)} className={`rounded-md border border-border-control px-3 py-1.5 text-sm hover:bg-accent ${anilloFoco}`}>
                    Cargar costo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <TablaDatos
        def={DEF}
        filas={vistas}
        columnas={COLUMNAS}
        contexto={ctx}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        formatearTotal={(v) => usd(v)}
        ariaLabel="Hoja de costos de producto"
        anchoMinimo="80rem"
        fijarEncabezado
        etiquetaGrupo={(campo, grupo) => {
          if (campo !== "producto") return <span className="font-semibold">{grupo.etiqueta}</span>;
          const r = grupo.filas[0] ? resumen[grupo.filas[0].skuId] : undefined;
          return (
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-semibold">{grupo.etiqueta}</span>
              {r?.vigente != null && (
                <span className={`text-sm ${claseCifra}`}>
                  Vigente {usdU(r.vigente)}
                  {r.promedio != null && r.compras > 1 && <span className="text-muted-foreground"> · promedio {usdU(r.promedio)}</span>}
                </span>
              )}
              {r?.variacion != null && Math.abs(r.variacion) >= VARIACION_AVISO && r.compras > 1 && (
                <span className="inline-flex items-center gap-1 text-xs">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
                  La última compra está {Math.abs(r.variacion).toFixed(0)} % {r.variacion > 0 ? "más cara" : "más barata"} que el promedio
                </span>
              )}
            </span>
          );
        }}
        accionPrincipal={
          puedeEscribir ? (
            <FichaManual
              skuInicial={skuManual}
              boton={(abrir) => {
                abrirManual.current = abrir;
                return <BotonAgregar etiqueta="Agregar a mano" onClick={() => manual(null)} />;
              }}
            />
          ) : undefined
        }
        vacio="Todavía no hay compras en la hoja. Entran solas cuando una compra de Panamá pasa a En Bodega o Completado."
      />
      {nota && <EditorNota fila={vistas.find((v) => v.id === nota.id) ?? nota} alCerrar={() => setNota(null)} alGuardar={(e) => ctx.editar(nota.id, e)} />}
    </ProveedorSkusMaestros>
  );
}
