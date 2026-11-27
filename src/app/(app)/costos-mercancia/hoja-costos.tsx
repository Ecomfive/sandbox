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
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { useToast } from "@/components/ui/toast";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, entero, SIN_DATO } from "@/lib/af4/formato";
import { usd4 } from "./formato";
import { numeroProducto } from "@/lib/wms/codigos-producto";
import { COSTOS_ASOCIADOS, ETIQUETA_FINANCIAMIENTO, VARIACION_AVISO, calcularFila, codigoComparable, pendienteDesglosar, pesoDeFila, repartirPorPeso, sinFinanciamiento, type CampoAsociado, type ResumenProducto } from "@/lib/finanzas/hoja-costos";
import { KpiFiltro } from "@/components/ui/kpi-filtro";
import { KpiGrid } from "@/components/ui/kpi-card";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import type { FilaHojaVista, ProductoSinCosto } from "@/lib/finanzas/cargar-hoja-costos";
import { AlertaIcon, CalendarioIcon, CandadoIcon, ComprasIcon, GastoIcon, LapizIcon, PapeleraIcon, ProductoIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { buscarMovimientosCompra, crearCostoManual, eliminarCostoManual, guardarAsociadosCompra, guardarCostoAsociado, guardarNotaYCostoFinal, obtenerHistorialCostoFila, type MovimientoLibro } from "./hoja-actions";

const usd = (v: number) => dinero(v, "USD");
const usdU = usd4;

type Edicion = Partial<Record<CampoAsociado, number>> & { costoTotal?: number; nota?: string | null; costoFinalManual?: number | null; costoFinalExcel?: boolean };

interface Contexto {
  puedeEscribir: boolean;
  esAdmin: boolean;
  editar: (id: string, cambio: Edicion) => void;
  abrirNota: (f: FilaHojaVista) => void;
  abrirCompra: (f: FilaHojaVista) => void;
}

/** Se puede cambiar: con permiso, y si llegó en un mes ya cerrado, solo un administrador. */
const editable = (f: FilaHojaVista, ctx: Contexto) => ctx.puedeEscribir && (!f.cerrada || ctx.esAdmin);

const estadoDe = (f: FilaHojaVista): "desglosar" | "manual" | "porCompletar" | "completo" =>
  pendienteDesglosar(f) ? "desglosar" : f.costoFinalManual ? "manual" : COSTOS_ASOCIADOS.some((c) => f.asociados[c.id] > 0) ? "completo" : "porCompletar";
const ETIQUETA_ESTADO = { desglosar: "Pendiente de desglosar (Excel)", manual: "Costo final manual", porCompletar: "Por completar", completo: "Con costos asociados" } as const;
const financiamientoDe = (f: FilaHojaVista) => (f.financiamientoTipo ? ETIQUETA_FINANCIAMIENTO[f.financiamientoTipo] : "No aplica (a mano o carga inicial)");

const DEF: DefTabla<FilaHojaVista> = {
  clave: "costos-producto-hoja",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "seleccion", valores: (f) => [`${numeroProducto(f.numero)} · ${f.producto}`], agrupable: true },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [ETIQUETA_ESTADO[estadoDe(f)]], agrupable: true },
    { id: "financiamiento", etiqueta: "Financiamiento", tipo: "seleccion", valores: (f) => [financiamientoDe(f)], agrupable: true },
    { id: "cierre", etiqueta: "Mes", tipo: "seleccion", valores: (f) => [f.cerrada ? "Llegó en un mes cerrado" : "Mes abierto"], agrupable: true },
    { id: "origen", etiqueta: "Origen", tipo: "seleccion", valores: (f) => [f.origen === "manual" ? "A mano" : f.origen === "carga_inicial" ? "Carga inicial sin compra" : "Compras"], agrupable: true },
    { id: "texto", etiqueta: "Buscar", tipo: "texto", valor: (f) => `${numeroProducto(f.numero)} ${f.numero ?? ""} ${f.sku} ${f.producto} ${f.codigoCompra}` },
    { id: "llegada", etiqueta: "Llegada", tipo: "fecha", valor: (f) => f.llegada ?? "" },
    { id: "costoTotal", etiqueta: "Costo total unitario", tipo: "numero", valor: (f) => f.costoTotal },
  ],
  vistaInicial: { agrupar: "producto" },
  total: (f) => f.cantidad * f.costoTotal,
};
const NOMBRE: NombreFilas = { singular: "compra", plural: "compras" };
const ICONOS: Record<string, IconoComp> = { producto: ProductoIcon, estado: AlertaIcon, financiamiento: GastoIcon, cierre: CalendarioIcon, origen: ComprasIcon, texto: ProductoIcon, llegada: CalendarioIcon, costoTotal: GastoIcon };

/** Una celda de costo asociado: el total de esa compra en USD, editable con un clic. */
function CeldaAsociado({ fila, campo, ctx }: { fila: FilaHojaVista; campo: CampoAsociado; ctx: Contexto }) {
  const valor = fila.asociados[campo] ?? 0;
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [pendiente, start] = useTransition();
  const { mostrarToast } = useToast();
  const etiqueta = COSTOS_ASOCIADOS.find((c) => c.id === campo)!;
  const cancelado = useRef(false);

  if (!editable(fila, ctx)) return <span className={`${claseCifra} ${valor > 0 ? "" : "text-muted-foreground"}`}>{valor > 0 ? usd(valor) : SIN_DATO}</span>;

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
  {
    id: "compra",
    label: "Código ECOM",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (f, ctx) => (
      <span className="inline-flex items-center gap-1.5">
        {f.codigoCompra ? (
          <Tooltip texto="Costos de toda la compra">
            <button type="button" onClick={() => ctx.abrirCompra(f)} aria-label={`Costos de toda la compra ${f.codigoCompra}`} className={`rounded px-1 underline decoration-dotted underline-offset-2 hover:bg-accent ${claseCifra} ${anilloFoco}`}>
              {f.codigoCompra}
            </button>
          </Tooltip>
        ) : (
          SIN_DATO
        )}
        {f.cerrada && (
          <Tooltip texto="Llegó en un mes cerrado: solo un administrador la cambia">
            <span tabIndex={0} role="img" aria-label="Llegó en un mes cerrado" className="text-muted-foreground">
              <CandadoIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </Tooltip>
        )}
      </span>
    ),
  },
  { id: "llegada", label: "Llegada", ocultable: true, clase: `whitespace-nowrap ${claseCifra}`, render: (f) => (f.llegada ? fechaCorta(f.llegada) : SIN_DATO) },
  { id: "cantidad", label: "Cantidad", ocultable: true, alinear: "derecha", clase: `text-right ${claseCifra}`, render: (f) =>
      f.cantidadPedida && f.cantidadPedida !== f.cantidad ? (
        <span className="flex flex-col items-end">
          <span>{entero(f.cantidad)}</span>
          <span className="text-xs text-warning">de {entero(f.cantidadPedida)} pedidas</span>
        </span>
      ) : (
        entero(f.cantidad)
      ),
  },
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
        <Tooltip texto={f.financiamientoTipo === "estimado" ? `Estimado con la tasa del financista, congelado al llegar${f.financiamientoFijadoEn ? ` (${fechaCorta(f.financiamientoFijadoEn)})` : ""}` : f.financiamientoTipo === "real" ? "Lo que cobró el financista" : "Financiamiento"}>
          <span tabIndex={0} className="flex flex-col items-end">
            <span>{f.pctFinanciamiento.toLocaleString("es-PA", { maximumFractionDigits: 2 })} %</span>
            <span className="text-xs text-muted-foreground">
              {usdU(f.financiamiento)} u. · {f.financiamientoTipo === "real" ? "cobrado" : "estimado"}
            </span>
          </span>
        </Tooltip>
      ) : sinFinanciamiento(f) ? (
        <Tooltip texto="Sin préstamo registrado en Préstamos del grupo con el código de esta compra">
          <span tabIndex={0} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />0 %<span className="sr-only">, sin préstamo registrado</span>
          </span>
        </Tooltip>
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
        <Tooltip texto={editable(f, ctx) ? "Detalle, nota y costo final" : "Ver detalle y actividad"}>
          <button type="button" onClick={() => ctx.abrirNota(f)} aria-label={`Detalle de ${f.producto}, compra ${f.codigoCompra}`} className={`rounded p-1 text-muted-foreground hover:bg-accent ${anilloFoco}`}>
            <LapizIcon className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
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
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${e === "porCompletar" || e === "desglosar" ? "bg-warning" : e === "manual" ? "bg-muted-foreground" : "bg-success"}`} />
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
function EditorNota({ fila, soloLectura, alCerrar, alGuardar }: { fila: FilaHojaVista; soloLectura: boolean; alCerrar: () => void; alGuardar: (e: Edicion) => void }) {
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
            const nuevoFinal = final.trim() ? Number(final) : null;
            alGuardar({ nota: nota.trim() || null, costoFinalManual: nuevoFinal, costoTotal: r.costoTotal, ...(nuevoFinal !== fila.costoFinalManual ? { costoFinalExcel: false } : {}) });
            mostrarToast("Guardado", "success");
            alCerrar();
          });
        }}
      >
        <p className="text-sm">{fila.producto}</p>
        {pendienteDesglosar(fila) && (
          <p className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-xs">
            <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warning" />
            Este costo final viene del Excel de la carga inicial. Cuando cargues los costos asociados de la compra, bórralo para que el costo se calcule (hoy daría {usdU(fila.costoCalculado)}).
          </p>
        )}
        {fila.cerrada && soloLectura && (
          <p className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-xs">
            <CandadoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Llegó en un mes ya cerrado: ya costeó pedidos de ese mes. Solo un administrador la cambia.
          </p>
        )}
        <fieldset disabled={soloLectura} className="flex flex-col gap-4">
        <Campo etiqueta="Costo final por unidad (opcional)" id="costo-final">
          <input id="costo-final" data-enfocar inputMode="decimal" className={fieldClass} value={final} placeholder={`Calculado: ${usdU(fila.costoCalculado)}`} onChange={(e) => setFinal(e.target.value)} />
        </Campo>
        <p className="text-xs text-muted-foreground">Si lo escribes, manda sobre el cálculo. Déjalo vacío para que el costo salga del costo de compra, los asociados y el financiamiento.</p>
        <Campo etiqueta="Nota" id="nota-costo">
          <textarea id="nota-costo" rows={3} maxLength={500} className={fieldClass} value={nota} placeholder="Ej: factura 1234 del agente de carga" onChange={(e) => setNota(e.target.value)} />
        </Campo>
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {fila.origen === "manual" && !soloLectura ? (
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
          {!soloLectura && (
            <button type="submit" disabled={pendiente} className={`rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 ${anilloFoco}`}>
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </form>
      <div className="mt-6 border-t border-border pt-4">
        <HistorialGenerico id={fila.id} codigoPais="PA" titulo="Actividad de esta fila" obtener={obtenerHistorialCostoFila} />
      </div>
    </Ventana>
  );
}

/** Los costos asociados de toda una compra: se escriben una vez y se reparten entre sus productos por su costo de compra. */
function VentanaCompra({ filas, soloLectura, alCerrar, alGuardar }: { filas: FilaHojaVista[]; soloLectura: boolean; alCerrar: () => void; alGuardar: (id: string, e: Edicion) => void }) {
  const codigo = filas[0]?.codigoCompra ?? "";
  const sumaDe = (c: CampoAsociado) => Math.round(filas.reduce((a, f) => a + (f.asociados[c] ?? 0), 0) * 100) / 100;
  const [textos, setTextos] = useState<Record<string, string>>(() => Object.fromEntries(COSTOS_ASOCIADOS.map((c) => [c.id, sumaDe(c.id) > 0 ? String(sumaDe(c.id)) : ""])));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const [movs, setMovs] = useState<MovimientoLibro[] | null | undefined>(undefined);
  const { mostrarToast } = useToast();
  const verLibro = usePuedeAbrir("libro-movimientos") && !soloLectura;
  const pesos = filas.map(pesoDeFila);
  const total = (c: CampoAsociado) => {
    const n = Number(String(textos[c] ?? "").replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const cargarLibro = () => {
    setMovs(null);
    void buscarMovimientosCompra(codigo).then((r) => setMovs("error" in r ? [] : r.movimientos));
  };
  const usar = (campo: CampoAsociado, monto: number) => setTextos((p) => ({ ...p, [campo]: String(Math.round((total(campo) + monto) * 100) / 100) }));

  return (
    <Ventana abierto alCerrar={alCerrar} titulo={`Costos de la compra ${codigo}`} ancho="lg">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await guardarAsociadosCompra(filas.map((f) => f.id), textos);
            if ("error" in r) return setError(r.error);
            for (const f of r.filas) alGuardar(f.id, { ...f.asociados, costoTotal: f.costoTotal });
            mostrarToast("Costos de la compra repartidos", "success");
            alCerrar();
          });
        }}
      >
        <p className="text-sm text-muted-foreground">
          Escribe el total de cada costo para toda la compra (USD). Se reparte entre {filas.length === 1 ? "su producto" : `sus ${filas.length} productos`} por su costo de compra.
        </p>
        <fieldset disabled={soloLectura} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COSTOS_ASOCIADOS.map((c) => (
            <Campo key={c.id} etiqueta={c.etiqueta} id={`compra-${c.id}`}>
              <input id={`compra-${c.id}`} inputMode="decimal" className={fieldClass} placeholder="0.00" value={textos[c.id] ?? ""} onChange={(e) => setTextos((p) => ({ ...p, [c.id]: e.target.value }))} />
            </Campo>
          ))}
        </fieldset>
        {filas.length > 1 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Cómo se reparte entre los productos</caption>
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Producto</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Peso</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Le toca</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filas.map((f, i) => {
                  const suma = pesos.reduce((a, b) => a + b, 0);
                  const leToca = COSTOS_ASOCIADOS.reduce((a, c) => a + (repartirPorPeso(total(c.id), pesos)[i] ?? 0), 0);
                  return (
                    <tr key={f.id}>
                      <td className="px-3 py-2">
                        {numeroProducto(f.numero)} · {f.producto}
                      </td>
                      <td className={`px-3 py-2 text-right ${claseCifra}`}>{suma > 0 ? `${((pesos[i] / suma) * 100).toFixed(1)} %` : SIN_DATO}</td>
                      <td className={`px-3 py-2 text-right ${claseCifra}`}>{usd(leToca)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {verLibro && (
        <section aria-labelledby="libro-compra" className="rounded-md border border-border">
          <h3 id="libro-compra" className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm font-semibold">
            En el Libro de movimientos con «{codigo}»
            {movs === undefined && (
              <button type="button" onClick={cargarLibro} className={`rounded-md border border-border-control px-2.5 py-1 text-xs font-normal hover:bg-accent ${anilloFoco}`}>
                Buscar
              </button>
            )}
          </h3>
          {movs === null && <p className="px-3 py-2 text-sm text-muted-foreground">Buscando…</p>}
          {movs && movs.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No hay movimientos con ese código en la descripción ni en la factura.</p>}
          {movs && movs.length > 0 && (
            <ul className="divide-y divide-border text-sm">
              {movs.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{m.descripcion || m.tipo}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.fecha ? fechaCorta(m.fecha) : SIN_DATO} · {m.tipo || "Sin tipo"}
                      {m.comision ? " · parece comisión" : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={claseCifra}>{usd(m.monto)}</span>
                    {!soloLectura && (
                      <select
                        aria-label={`Sumar ${usd(m.monto)} a un costo de la compra`}
                        className={`${fieldClass} w-auto py-1 text-xs`}
                        value=""
                        onChange={(e) => e.target.value && usar(e.target.value as CampoAsociado, m.monto)}
                      >
                        <option value="">Sumar a…</option>
                        {COSTOS_ASOCIADOS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.etiqueta}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!soloLectura && (
          <div className="flex justify-end">
            <button type="submit" disabled={pendiente} className={`rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 ${anilloFoco}`}>
              {pendiente ? "Repartiendo…" : "Guardar y repartir"}
            </button>
          </div>
        )}
      </form>
    </Ventana>
  );
}

/** Las tarjetas que filtran la hoja: lo que falta por hacer. */
function TarjetasHoja({ filas }: { filas: FilaHojaVista[] }) {
  const tarjeta = (id: string, campo: string, valor: string, titulo: string, n: number, tono: "warning" | "neutral") => (
    <KpiFiltro
      key={id}
      def={DEF}
      compacta
      atajo={{ id, etiqueta: titulo, ayuda: `Filtrar la hoja: ${titulo.toLowerCase()}`, filtro: { campo, valor: { tipo: "seleccion", valores: [valor] } } }}
      titulo={titulo}
      valor={entero(n)}
      tono={n ? tono : "neutral"}
    />
  );
  return (
    <KpiGrid compacta>
      {tarjeta("por-completar", "estado", ETIQUETA_ESTADO.porCompletar, "Por completar", filas.filter((f) => estadoDe(f) === "porCompletar").length, "warning")}
      {tarjeta("desglosar", "estado", ETIQUETA_ESTADO.desglosar, "Pendientes de desglosar", filas.filter((f) => estadoDe(f) === "desglosar").length, "warning")}
      {tarjeta("sin-fin", "financiamiento", ETIQUETA_FINANCIAMIENTO.ninguno, "Sin préstamo registrado", filas.filter(sinFinanciamiento).length, "warning")}
      {tarjeta("cerrado", "cierre", "Llegó en un mes cerrado", "En meses cerrados", filas.filter((f) => f.cerrada).length, "neutral")}
    </KpiGrid>
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
  esAdmin,
}: {
  filas: FilaHojaVista[];
  resumen: Record<string, ResumenProducto>;
  sinCosto: ProductoSinCosto[];
  opciones: OpcionSkuMaestro[];
  puedeEscribir: boolean;
  esAdmin: boolean;
}) {
  const [ediciones, setEdiciones] = useState<Record<string, Edicion>>({});
  const [nota, setNota] = useState<FilaHojaVista | null>(null);
  const [compra, setCompra] = useState<FilaHojaVista | null>(null);
  const [skuManual, setSkuManual] = useState<string | null>(null);
  const abrirManual = useRef<() => void>(() => undefined);

  const vistas = useMemo(
    () =>
      filas.map((f) => {
        const e = ediciones[f.id];
        if (!e) return f;
        const asociados = { ...f.asociados };
        for (const c of COSTOS_ASOCIADOS) if (e[c.id] !== undefined) asociados[c.id] = e[c.id]!;
        const base = {
          ...f,
          asociados,
          nota: e.nota !== undefined ? e.nota : f.nota,
          costoFinalManual: e.costoFinalManual !== undefined ? e.costoFinalManual : f.costoFinalManual,
          costoFinalExcel: e.costoFinalExcel !== undefined ? e.costoFinalExcel : f.costoFinalExcel,
        };
        const calc = calcularFila(base);
        return { ...base, ...calc, costoTotal: e.costoTotal ?? calc.costoTotal };
      }),
    [filas, ediciones],
  );
  const ctx: Contexto = {
    puedeEscribir,
    esAdmin,
    editar: (id, cambio) => setEdiciones((p) => ({ ...p, [id]: { ...p[id], ...cambio } })),
    abrirNota: setNota,
    abrirCompra: setCompra,
  };
  const filasDeCompra = compra ? vistas.filter((v) => codigoComparable(v.codigoCompra) === codigoComparable(compra.codigoCompra)) : [];

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
      <TarjetasHoja filas={vistas} />
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
      {nota && (() => {
        const f = vistas.find((v) => v.id === nota.id) ?? nota;
        return <EditorNota fila={f} soloLectura={!editable(f, ctx)} alCerrar={() => setNota(null)} alGuardar={(e) => ctx.editar(nota.id, e)} />;
      })()}
      {compra && filasDeCompra.length > 0 && (
        <VentanaCompra filas={filasDeCompra} soloLectura={!filasDeCompra.every((f) => editable(f, ctx))} alCerrar={() => setCompra(null)} alGuardar={(id, e) => ctx.editar(id, e)} />
      )}
    </ProveedorSkusMaestros>
  );
}
