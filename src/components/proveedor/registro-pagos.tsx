"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CAMPOS_CALCULADOS, COLUMNA_HOJA, TIPO_CAMPO, totalesRegistro, type CampoRegistro, type FilaRegistro } from "@/lib/proveedor/registro-pagos";
import type { Textos } from "@/lib/proveedor/textos";
import { SinResultados, useFiltroPortal } from "./filtro-portal";
import { useIdioma } from "./idioma-contexto";
import { Vacio, dinero } from "./piezas-proveedor";

type Guardar = (fila: string, campo: CampoRegistro, valor: string) => Promise<{ error?: string }>;

/** Las columnas después del producto, en el orden de la hoja de Shen Zhen. */
const COLUMNAS: { campo: CampoRegistro; titulo: keyof Textos; derecha?: boolean }[] = [
  { campo: "unidades", titulo: "colCantidad", derecha: true },
  { campo: "monto", titulo: "colMonto", derecha: true },
  { campo: "fecha_envio", titulo: "colEntrega" },
  { campo: "anticipo", titulo: "colAnticipo", derecha: true },
  { campo: "pagado", titulo: "colPagado", derecha: true },
  { campo: "fecha_pago", titulo: "colFechaPago" },
  { campo: "sin_pagar", titulo: "colSinPagar", derecha: true },
  { campo: "vence", titulo: "colVencePago" },
  { campo: "saldo", titulo: "colSaldo", derecha: true },
  { campo: "llegada", titulo: "colLlegada" },
  { campo: "fecha_pago_saldo", titulo: "colPagoSaldo" },
];

/** Cuántas filas se ven de entrada (y cuántas más con «Ver más»). */
const POR_TANDA = 100;

const COLOR_TONO: Record<string, string> = { peligro: "text-destructive", aviso: "text-warning", info: "text-azul", exito: "text-success", neutro: "" };

/** Un cambio reciente del registro (quién cambió qué), para «Últimos cambios». */
export interface CambioRegistro {
  texto: string;
  creadoEn: string;
}

/**
 * «Registro de pagos» (23 oct 2026, como el artefacto que aprobó Hernán): el título, tres tarjetas (lo que falta de anticipos y de
 * saldos, y los últimos cambios) y la tabla con las columnas de la hoja «payment record» de Shen Zhen, antes el producto (foto, nombre,
 * código y país). Con `guardar`, cualquier celda se cambia tocándola (Shen Zhen en su portal, Ecomfive en el Tablero de Shen Zhen): las que se
 * editan van en morado y las calculadas en gris (se pueden fijar a mano y, vacías, vuelven a calcularse). Lo filtran el buscador y el país del
 * portal (`useFiltroPortal`) y la última fila suma lo que falta.
 */
export function RegistroPagos({ filas, guardar, pista, cambios = [] }: { filas: FilaRegistro[]; guardar?: Guardar; pista: string; cambios?: CambioRegistro[] }) {
  const { t, tr } = useIdioma();
  // El buscador y el país son los del portal (arriba de las pestañas).
  const { filtro, pasa, activo } = useFiltroPortal();
  const [cuantas, setCuantas] = useState(POR_TANDA);
  const [filtroAntes, setFiltroAntes] = useState(filtro);
  if (filtroAntes !== filtro) {
    setFiltroAntes(filtro);
    setCuantas(POR_TANDA);
  }
  const visibles = filas.filter((f) => pasa(String(f.valores.producto ?? ""), f.referencia, f.paisCodigo));
  // Los totales son de todas las filas del país; a la vista van las más nuevas, de a 100 (cada celda es un botón).
  const totales = totalesRegistro(visibles);
  const aLaVista = visibles.slice(0, cuantas);
  const usd = (n: number) => dinero(n, n % 1 ? 2 : 0);
  const fondoTh = (campo: CampoRegistro) => (CAMPOS_CALCULADOS.includes(campo) ? "bg-muted" : guardar ? "bg-primario-suave" : "");

  return (
    <section aria-labelledby="registro-pagos" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="registro-pagos" className="m-0 text-xl font-bold">
          {t.registroTitulo}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">{pista}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[13rem] flex-col gap-1 rounded-2xl border border-border bg-card px-4 py-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t.colSinPagar} · {t.totalFila}
          </span>
          <span className="text-2xl font-bold text-destructive tabular-nums">{usd(totales.sinPagar)}</span>
        </div>
        <div className="flex min-w-[13rem] flex-col gap-1 rounded-2xl border border-border bg-card px-4 py-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t.colSaldo} · {t.totalFila}
          </span>
          <span className="text-2xl font-bold text-warning tabular-nums">{usd(totales.saldo)}</span>
        </div>
        <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1.5 rounded-2xl border border-border bg-card px-4 py-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.ultimosCambios}</span>
          {cambios.length === 0 ? (
            <span className="text-sm text-muted-foreground">{t.sinCambiosRegistro}</span>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {cambios.slice(0, 3).map((c, i) => (
                <li key={i} className="text-[13px] [overflow-wrap:anywhere]">
                  {tr(c.texto)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {guardar && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-b border-border px-4 py-3">
            <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-3 w-3 rounded-sm border border-primario/40 bg-primario-suave" />
                {t.leyEditable}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-3 w-3 rounded-sm border border-border bg-muted" />
                {t.leyCalculada}
              </span>
            </span>
          </div>
        )}

        {visibles.length === 0 ? (
          activo ? (
            <div className="p-3">
              <SinResultados />
            </div>
          ) : (
            <Vacio>{t.registroVacio}</Vacio>
          )
        ) : (
          <div className="max-h-[720px] overflow-auto">
            <table className="w-full min-w-[1320px] border-collapse text-[13px]">
              <thead className="sticky top-0 z-[1] bg-card">
                <tr>
                  <th scope="col" className="border-b border-border bg-card px-3 py-2.5 text-left align-bottom">
                    <span className="block font-semibold">{t.colProducto}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">{COLUMNA_HOJA.producto}</span>
                  </th>
                  {COLUMNAS.map((c) => (
                    <th key={c.campo} scope="col" className={`border-b border-border px-3 py-2.5 align-bottom whitespace-nowrap ${c.derecha ? "text-right" : "text-left"} ${fondoTh(c.campo)}`}>
                      <span className="block font-semibold">{t[c.titulo] as string}</span>
                      <span className="block text-[11px] font-normal text-muted-foreground">{COLUMNA_HOJA[c.campo]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aLaVista.map((f) => (
                  <tr key={f.fila} className="border-t border-border">
                    <td className="min-w-[17rem] px-3 py-2">
                      <span className="flex items-center gap-2.5">
                        {f.foto ? (
                          <img src={f.foto} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover" />
                        ) : (
                          <span aria-hidden="true" className="h-11 w-11 shrink-0 rounded-lg border border-dashed border-border-control" />
                        )}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <Celda f={f} campo="producto" guardar={guardar} claseTexto="font-semibold" />
                          <span className="px-1.5 font-mono text-xs text-muted-foreground">{[f.referencia, f.paisCodigo].filter(Boolean).join(" · ") || "—"}</span>
                        </span>
                      </span>
                    </td>
                    {COLUMNAS.map((c) => (
                      <td key={c.campo} className={`px-1 py-1 ${CAMPOS_CALCULADOS.includes(c.campo) ? "bg-muted/50" : guardar ? "bg-primario-suave/40" : ""}`}>
                        <Celda f={f} campo={c.campo} guardar={guardar} derecha={c.derecha} claseTexto={claseDe(f, c.campo)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-card">
                <tr className="border-t-2 border-border bg-muted/40">
                  <th scope="row" colSpan={7} className="px-3 py-3 text-right font-bold">
                    {t.totalFila}
                  </th>
                  <td className="bg-[#fef08a] px-3 py-3 text-right font-bold text-[#18181b] tabular-nums">{usd(totales.sinPagar)}</td>
                  <td />
                  <td className="bg-[#fef08a] px-3 py-3 text-right font-bold text-[#18181b] tabular-nums">{usd(totales.saldo)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
            {visibles.length > aLaVista.length && (
              <button type="button" onClick={() => setCuantas((n) => n + POR_TANDA)} className={`w-full border-t border-border px-4 py-2.5 text-left text-xs font-medium text-azul hover:bg-muted/50 ${anilloFoco}`}>
                {t.verMasFilas(visibles.length - aLaVista.length)}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** El color de lo calculado: lo que falta en rojo, el vencimiento según su estado, el saldo en ámbar. */
function claseDe(f: FilaRegistro, campo: CampoRegistro): string {
  if (campo === "sin_pagar") return Number(f.valores.sin_pagar ?? 0) > 0 ? "font-semibold text-destructive" : "";
  if (campo === "vence") return f.valores.vence && f.estadoAnticipo ? `font-semibold ${COLOR_TONO[f.estadoAnticipo.tono]}` : "";
  if (campo === "saldo") return "font-semibold text-warning";
  return "";
}

/** Una celda: lo que se ve y, con `guardar`, un botón que la vuelve un campo para escribir (Enter guarda, Esc cancela). */
function Celda({ f, campo, guardar, derecha = false, claseTexto = "" }: { f: FilaRegistro; campo: CampoRegistro; guardar?: Guardar; derecha?: boolean; claseTexto?: string }) {
  const { t, tr, fecha, numero, error } = useIdioma();
  const { mostrarToast } = useToast();
  const router = useRouter();
  const valor = f.valores[campo];
  const tipo = TIPO_CAMPO[campo];
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  // Esc cierra el campo sin guardar (al cerrarse, el campo pierde el foco y su onBlur no debe guardar).
  const cancelado = useRef(false);
  const editada = f.editadas.includes(campo) && CAMPOS_CALCULADOS.includes(campo);

  const mostrar = (v: string | number | null) => {
    if (v === null || v === undefined || v === "") return "";
    if (tipo === "fecha") return fecha(String(v));
    if (campo === "producto") return tr(String(v));
    if (campo === "unidades") return numero(Number(v));
    const n = Number(v);
    return dinero(n, n % 1 ? 2 : 0);
  };
  const texto = guardando !== null ? mostrar(guardando === "" ? null : guardando) : mostrar(valor);

  async function confirmar() {
    setEditando(false);
    if (cancelado.current) return;
    const nuevo = borrador.trim();
    if (nuevo === String(valor ?? "")) return;
    setGuardando(nuevo);
    const r = await guardar!(f.fila, campo, nuevo).catch(() => ({ error: "No se pudo guardar." }));
    if (r.error) {
      setGuardando(null);
      return mostrarToast(error(r.error), "destructive");
    }
    mostrarToast(t.celdaGuardada);
    router.refresh();
    setGuardando(null);
  }

  const alineado = derecha ? "text-right" : "text-left";
  if (!guardar)
    return <span className={`block px-1.5 py-1.5 tabular-nums ${alineado} ${claseTexto}`}>{texto || <span className="text-muted-foreground">—</span>}</span>;
  if (editando)
    return (
      <input
        autoFocus
        type={tipo === "fecha" ? "date" : "text"}
        inputMode={tipo === "numero" ? "decimal" : undefined}
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelado.current = true;
            setEditando(false);
          }
        }}
        aria-label={`${COLUMNA_HOJA[campo]} · ${tr(String(f.valores.producto ?? ""))}`}
        className={`w-full min-w-[6.5rem] rounded-md border-2 border-primario bg-card px-1.5 py-1 text-[13px] outline-none ${alineado}`}
      />
    );
  return (
    <button
      type="button"
      onClick={() => {
        cancelado.current = false;
        setBorrador(valor === null || valor === undefined ? "" : String(valor));
        setEditando(true);
      }}
      aria-label={`${COLUMNA_HOJA[campo]} · ${tr(String(f.valores.producto ?? ""))}: ${texto || "—"}`}
      className={`block min-h-8 w-full cursor-text rounded-md px-1.5 py-1.5 tabular-nums hover:bg-primario-suave hover:shadow-[inset_0_0_0_1px_var(--primario)] ${alineado} ${guardando !== null ? "opacity-60" : ""} ${claseTexto} ${anilloFoco}`}
    >
      {texto || <span className="text-muted-foreground">—</span>}
      {editada && (
        <span title={t.editadaAMano} className="ml-1 text-[11px] text-muted-foreground">
          ✎
        </span>
      )}
    </button>
  );
}
