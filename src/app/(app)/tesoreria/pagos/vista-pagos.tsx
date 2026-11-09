"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge, type Tone } from "@/components/ui/badge";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { diaMes, fechaCorta, fechaHora } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import {
  CATEGORIAS_PAGO,
  ETIQUETA_DECISION,
  PRIORIDADES,
  etiquetaCategoria,
  etiquetaEstadoProgramado,
  etiquetaPrioridad,
  type CategoriaPago,
  type Decision,
  type EstadoProgramado,
  type PagoCalendario,
  type Prioridad,
} from "@/lib/finanzas/pagos";
import { CalendarioIcon, EstadoIcon, EtiquetaIcon, PersonaIcon, PrioridadIcon, WalletIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import { anularPago, aprobarPago, marcarPagado, rechazarPago, solicitarPago } from "../actions";

const d2 = (v: number) => dinero(v, "USD", { decimales: 2 });

export interface Opcion {
  id: string;
  nombre: string;
}

export interface Catalogos {
  tipos: Opcion[];
  unidades: Opcion[];
  cuentas: Opcion[];
}

export const TONO_PRIORIDAD: Record<Prioridad, Tone> = { critico: "destructive", negociable: "warning", postergable: "neutral" };
const TONO_DECISION: Record<Decision, Tone> = { pagar: "success", pagar_sin_caja: "destructive", postergar: "warning", sin_caja: "destructive" };
const TONO_ESTADO: Record<EstadoProgramado, Tone> = { solicitado: "info", aprobado: "azul", pagado: "success", rechazado: "destructive", anulado: "neutral" };

// ---------------------------------------------------------------------------------------------
// Formulario de un pago programado (Agregar o Programar desde el calendario)
// ---------------------------------------------------------------------------------------------

interface Prellenado {
  concepto?: string;
  contraparte?: string | null;
  categoria?: CategoriaPago;
  monto?: number;
  fecha?: string;
  prioridad?: Prioridad;
  origenRef?: string | null;
  carteraId?: string | null;
}

function CamposPago({ p, catalogos, faltante, invalido, sufijo }: { p: Prellenado; catalogos: Catalogos; faltante: string | null; invalido: (id: string) => true | undefined; sufijo: string }) {
  const id = (x: string) => `${x}-${sufijo}`;
  return (
    <>
      <Seccion icono={EtiquetaIcon} titulo="Pago">
        <Campo etiqueta="Concepto" id={id("concepto")} obligatorio faltante={faltante}>
          <input id={id("concepto")} name="concepto" required maxLength={160} defaultValue={p.concepto ?? ""} data-enfocar aria-invalid={invalido(id("concepto"))} placeholder="Ej: Factura de empaques" className={`${fieldClass} w-full`} />
        </Campo>
        <Campo etiqueta="Proveedor o beneficiario" id={id("contraparte")} faltante={faltante}>
          <input id={id("contraparte")} name="contraparte" maxLength={160} defaultValue={p.contraparte ?? ""} placeholder="Ej: Proveedor Ejemplo, S.A." className={`${fieldClass} w-full`} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Categoría" id={id("categoria")} obligatorio faltante={faltante}>
            <select id={id("categoria")} name="categoria" required defaultValue={p.categoria ?? "otro"} className={`${fieldClass} w-full`}>
              {CATEGORIAS_PAGO.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Prioridad" id={id("prioridad")} obligatorio faltante={faltante}>
            <select id={id("prioridad")} name="prioridad" required defaultValue={p.prioridad ?? "negociable"} className={`${fieldClass} w-full`}>
              {PRIORIDADES.map((x) => (
                <option key={x.clave} value={x.clave}>
                  {x.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Monto en USD" id={id("monto")} obligatorio faltante={faltante}>
            <input id={id("monto")} name="monto" required inputMode="decimal" pattern="[0-9.,$ ]+" defaultValue={p.monto ? String(p.monto) : ""} aria-invalid={invalido(id("monto"))} placeholder="Ej: 1250.00" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Fecha a pagar" id={id("fecha")} obligatorio faltante={faltante}>
            <input id={id("fecha")} name="fecha_programada" type="date" required defaultValue={p.fecha ?? ""} aria-invalid={invalido(id("fecha"))} className={`${fieldClass} w-full`} />
          </Campo>
        </div>
      </Seccion>
      <Seccion icono={WalletIcon} titulo="Al registrarlo en el libro">
        <Campo etiqueta="Tipo" id={id("tipo")} faltante={faltante}>
          <select id={id("tipo")} name="tipo_id" defaultValue="" className={`${fieldClass} w-full`}>
            <option value="">Sin elegir</option>
            {catalogos.tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Tienda" id={id("unidad")} faltante={faltante}>
            <select id={id("unidad")} name="unidad_id" defaultValue="" className={`${fieldClass} w-full`}>
              <option value="">Sin elegir</option>
              {catalogos.unidades.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Cuenta" id={id("cuenta")} faltante={faltante}>
            <select id={id("cuenta")} name="cuenta_id" defaultValue="" className={`${fieldClass} w-full`}>
              <option value="">Sin elegir</option>
              {catalogos.cuentas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo etiqueta="Nota" id={id("nota")} faltante={faltante}>
          <textarea id={id("nota")} name="nota" rows={2} maxLength={2000} placeholder="Ej: Pagar después del retiro de Dropi" className={`${fieldClass} w-full`} />
        </Campo>
      </Seccion>
    </>
  );
}

function ocultosDe(p: Prellenado): Record<string, string> {
  const o: Record<string, string> = {};
  if (p.origenRef) o.origen_ref = p.origenRef;
  if (p.carteraId) o.cartera_id = p.carteraId;
  return o;
}

export function NuevoPago({ catalogos, hoy }: { catalogos: Catalogos; hoy: string }) {
  return (
    <FichaCrear titulo="Solicitar pago" etiquetaCrear="Solicitar pago" action={solicitarPago} mensajeExito="Pago solicitado" abrirConNuevo>
      {({ faltante, invalido }) => <CamposPago p={{ fecha: hoy }} catalogos={catalogos} faltante={faltante} invalido={invalido} sufijo="nuevo" />}
    </FichaCrear>
  );
}

function ProgramarDesdeCalendario({ p, catalogos }: { p: PagoCalendario; catalogos: Catalogos }) {
  const pre: Prellenado = { concepto: p.concepto, contraparte: p.contraparte, categoria: p.categoria, monto: p.monto, fecha: p.fecha, prioridad: p.prioridad, origenRef: p.origenRef, carteraId: p.carteraId };
  return (
    <FichaCrear
      titulo="Programar pago"
      etiquetaCrear="Solicitar pago"
      action={solicitarPago}
      mensajeExito="Pago solicitado"
      ocultos={ocultosDe(pre)}
      boton={(abrir) => (
        <button type="button" onClick={abrir} aria-label={`Programar ${p.concepto}`} className={`rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted ${anilloFoco}`}>
          Programar
        </button>
      )}
    >
      {({ faltante, invalido }) => <CamposPago p={pre} catalogos={catalogos} faltante={faltante} invalido={invalido} sufijo={p.clave.replace(/[^a-z0-9]/gi, "")} />}
    </FichaCrear>
  );
}

// ---------------------------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------------------------

export interface FilaCalendario extends PagoCalendario {
  decision: Decision | null;
  semanaPago: number | null;
  etiquetaSemana: string;
}

const DEF_CAL: DefTabla<FilaCalendario> = {
  clave: "tesoreria-calendario",
  campos: [
    { id: "semana", etiqueta: "Semana", tipo: "seleccion", valores: (r) => [r.etiquetaSemana], agrupable: true },
    { id: "concepto", etiqueta: "Concepto", tipo: "texto", valor: (r) => r.concepto },
    { id: "categoria", etiqueta: "Categoría", tipo: "seleccion", valores: (r) => [etiquetaCategoria(r.categoria)], agrupable: true },
    { id: "prioridad", etiqueta: "Prioridad", tipo: "seleccion", valores: (r) => [etiquetaPrioridad(r.prioridad)], agrupable: true },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (r) => r.monto },
    { id: "propuesta", etiqueta: "Propuesta", tipo: "seleccion", valores: (r) => [r.decision ? ETIQUETA_DECISION[r.decision] : "—"], agrupable: true },
    { id: "estado", etiqueta: "Programado", tipo: "seleccion", valores: (r) => [r.programado ? etiquetaEstadoProgramado(r.programado.estado) : "Sin programar"], agrupable: true },
  ],
  vistaInicial: { agrupar: "semana" },
};

const ICONOS: Record<string, IconoComp> = {
  semana: CalendarioIcon,
  concepto: EtiquetaIcon,
  categoria: EtiquetaIcon,
  prioridad: PrioridadIcon,
  monto: WalletIcon,
  propuesta: EstadoIcon,
  estado: EstadoIcon,
  contraparte: PersonaIcon,
  fecha: CalendarioIcon,
};

const COL_CAL: ColumnaTabla<FilaCalendario, null>[] = [
  {
    id: "fecha",
    label: "Fecha",
    ocultable: false,
    render: (r) => (
      <span className="flex items-center gap-2 whitespace-nowrap">
        {r.vencido && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />}
        {diaMes(r.fecha)}
        {r.vencido && r.vence && <span className="text-xs text-muted-foreground">venció {diaMes(r.vence)}</span>}
      </span>
    ),
  },
  {
    id: "concepto",
    label: "Concepto",
    ocultable: false,
    render: (r) => (
      <span>
        {r.concepto}
        {r.estimado && <span className="ml-1.5 text-xs text-muted-foreground">estimado</span>}
      </span>
    ),
  },
  { id: "categoria", label: "Categoría", ocultable: true, render: (r) => etiquetaCategoria(r.categoria) },
  { id: "prioridad", label: "Prioridad", ocultable: false, render: (r) => <Badge tone={TONO_PRIORIDAD[r.prioridad]}>{etiquetaPrioridad(r.prioridad)}</Badge> },
  { id: "monto", label: "Monto", ocultable: false, clase: "text-right tabular-nums", render: (r) => (r.monto > 0 ? d2(r.monto) : "Sin monto"), total: (fs) => d2(fs.reduce((a, f) => a + f.monto, 0)) },
  {
    id: "propuesta",
    label: "Propuesta",
    ocultable: false,
    render: (r) =>
      r.decision ? (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <Badge tone={TONO_DECISION[r.decision]}>{ETIQUETA_DECISION[r.decision]}</Badge>
          {r.decision === "postergar" && r.semanaPago !== null && <span className="text-xs text-muted-foreground">a S{r.semanaPago + 1}</span>}
        </span>
      ) : (
        "—"
      ),
  },
  { id: "estado", label: "Programado", ocultable: true, render: (r) => (r.programado ? <Badge tone={TONO_ESTADO[r.programado.estado]}>{etiquetaEstadoProgramado(r.programado.estado)}</Badge> : <span className="text-muted-foreground">—</span>) },
];

export function CalendarioPagos({ filas, catalogos, puedeEscribir }: { filas: FilaCalendario[]; catalogos: Catalogos; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF_CAL}
      filas={filas}
      columnas={COL_CAL}
      contexto={null}
      iconos={ICONOS}
      nombre={{ singular: "pago", plural: "pagos" }}
      claveFila={(r) => r.clave}
      accion={puedeEscribir ? { etiqueta: "Programar", render: (r) => (r.programado || r.estimado ? null : <ProgramarDesdeCalendario p={r} catalogos={catalogos} />) } : undefined}
      ariaLabel="Calendario de pagos de las próximas 4 semanas"
      vacio="Sin pagos en las próximas 4 semanas."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Pagos programados
// ---------------------------------------------------------------------------------------------

export interface FilaProgramado {
  id: string;
  concepto: string;
  contraparte: string | null;
  categoria: CategoriaPago;
  monto: number;
  fecha: string;
  prioridad: Prioridad;
  estado: EstadoProgramado;
  carteraId: string | null;
  tipoId: string | null;
  unidadId: string | null;
  cuentaId: string | null;
  nota: string | null;
  solicitadoPor: string;
  solicitadoEn: string;
  aprobadoPor: string | null;
  aprobadoEn: string | null;
  pagadoPor: string | null;
  fechaPago: string | null;
  motivoRechazo: string | null;
  conMovimiento: boolean;
  /** La persona que mira lo pidió (no lo puede aprobar, salvo administración). */
  esMio: boolean;
}

const DEF_PROG: DefTabla<FilaProgramado> = {
  clave: "tesoreria-programados",
  campos: [
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (r) => [etiquetaEstadoProgramado(r.estado)], agrupable: true, ordenGrupos: ["Solicitado", "Aprobado", "Pagado", "Rechazado", "Anulado"] },
    { id: "concepto", etiqueta: "Concepto", tipo: "texto", valor: (r) => r.concepto },
    { id: "contraparte", etiqueta: "Proveedor", tipo: "texto", valor: (r) => r.contraparte ?? "" },
    { id: "prioridad", etiqueta: "Prioridad", tipo: "seleccion", valores: (r) => [etiquetaPrioridad(r.prioridad)], agrupable: true },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (r) => r.monto },
    { id: "fecha", etiqueta: "Fecha", tipo: "texto", valor: (r) => r.fecha },
  ],
  cerrados: {
    etiqueta: "Cerrados",
    esCerrado: (r) => r.estado === "pagado" || r.estado === "rechazado" || r.estado === "anulado",
    campoEstado: "estado",
    valoresCerrados: ["Pagado", "Rechazado", "Anulado"],
    ocultosPorDefecto: true,
  },
  vistaInicial: { agrupar: "estado" },
};

const COL_PROG: ColumnaTabla<FilaProgramado, null>[] = [
  { id: "concepto", label: "Concepto", ocultable: false, render: (r) => r.concepto },
  { id: "contraparte", label: "Proveedor", ocultable: true, render: (r) => r.contraparte ?? "—" },
  { id: "fecha", label: "Fecha", ocultable: false, render: (r) => fechaCorta(r.fechaPago ?? r.fecha) },
  { id: "prioridad", label: "Prioridad", ocultable: true, render: (r) => <Badge tone={TONO_PRIORIDAD[r.prioridad]}>{etiquetaPrioridad(r.prioridad)}</Badge> },
  { id: "monto", label: "Monto", ocultable: false, clase: "text-right tabular-nums", render: (r) => d2(r.monto), total: (fs) => d2(fs.reduce((a, f) => a + f.monto, 0)) },
  { id: "estado", label: "Estado", ocultable: false, render: (r) => <Badge tone={TONO_ESTADO[r.estado]}>{etiquetaEstadoProgramado(r.estado)}</Badge> },
];

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function FichaProgramado({ fila, catalogos, puedeEscribir, esAdmin, hoy, alCerrar }: { fila: FilaProgramado; catalogos: Catalogos; puedeEscribir: boolean; esAdmin: boolean; hoy: string; alCerrar: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const [modo, setModo] = useState<"nada" | "rechazar" | "pagar">("nada");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const correr = (fn: () => Promise<{ error?: string }>, ok: string) =>
    iniciar(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        mostrarToast(ok);
        setModo("nada");
        router.refresh();
      }
    });
  const vivo = fila.estado === "solicitado" || fila.estado === "aprobado";
  const nombre = (id: string | null, lista: Opcion[]) => lista.find((x) => x.id === id)?.nombre ?? "—";
  const boton = `inline-flex h-8 items-center rounded-md px-3 text-sm font-medium disabled:opacity-40 ${anilloFoco}`;
  return (
    <Ventana abierto alCerrar={alCerrar} lado="derecha" ancho="md" titulo={<span className="flex items-center gap-2">{fila.concepto} <Badge tone={TONO_ESTADO[fila.estado]}>{etiquetaEstadoProgramado(fila.estado)}</Badge></span>}>
      <div className="flex flex-col gap-4">
        {puedeEscribir && vivo && (
          <div className="flex flex-wrap gap-2">
            {fila.estado === "solicitado" && (
              <button type="button" disabled={pendiente || (fila.esMio && !esAdmin)} onClick={() => correr(() => aprobarPago(fila.id), "Pago aprobado")} className={`${boton} bg-foreground text-background`}>
                Aprobar
              </button>
            )}
            {fila.estado === "aprobado" && (
              <button type="button" disabled={pendiente} onClick={() => setModo("pagar")} className={`${boton} bg-foreground text-background`}>
                Marcar pagado
              </button>
            )}
            <button type="button" disabled={pendiente} onClick={() => setModo("rechazar")} className={`${boton} border border-border-control`}>
              Rechazar
            </button>
            <button type="button" disabled={pendiente} onClick={() => correr(() => anularPago(fila.id), "Pago anulado")} className={`${boton} border border-border-control`}>
              Anular
            </button>
          </div>
        )}
        {fila.estado === "solicitado" && fila.esMio && !esAdmin && <p className="text-xs text-muted-foreground">Lo aprueba otra persona.</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {modo === "rechazar" && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Motivo</span>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Ej: Se paga el mes que viene" className={`${fieldClass} w-full`} data-enfocar />
            </label>
            <button type="button" disabled={pendiente || !motivo.trim()} onClick={() => correr(() => rechazarPago(fila.id, motivo), "Pago rechazado")} className={`${boton} self-start border border-destructive/30 bg-destructive-soft text-destructive`}>
              Rechazar pago
            </button>
          </div>
        )}
        {modo === "pagar" && (
          <form
            className="flex flex-col gap-3 rounded-lg border border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const datos = new FormData(e.currentTarget);
              correr(() => marcarPagado(datos), "Pago registrado");
            }}
          >
            <input type="hidden" name="id" value={fila.id} />
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Fecha de pago</span>
                <input name="fecha_pago" type="date" required max={hoy} defaultValue={hoy} className={`${fieldClass} w-full`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Cuenta</span>
                <select name="cuenta_id" defaultValue={fila.cuentaId ?? ""} className={`${fieldClass} w-full`}>
                  <option value="">Sin elegir</option>
                  {catalogos.cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Referencia</span>
              <input name="referencia_pago" maxLength={120} placeholder="Ej: Transferencia 004512" className={`${fieldClass} w-full`} />
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="crear_movimiento" value="si" defaultChecked />
              Crear el movimiento en el libro
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Tipo</span>
                <select name="tipo_id" defaultValue={fila.tipoId ?? ""} className={`${fieldClass} w-full`}>
                  <option value="">Sin elegir</option>
                  {catalogos.tipos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Tienda</span>
                <select name="unidad_id" defaultValue={fila.unidadId ?? ""} className={`${fieldClass} w-full`}>
                  <option value="">Sin asignar</option>
                  {catalogos.unidades.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="en_eerr" value="si" defaultChecked={fila.categoria !== "prestamo" && fila.categoria !== "linea"} />
              Entra al estado de resultados
            </label>
            {fila.carteraId && (
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" name="registrar_abono" value="si" defaultChecked />
                Registrar el abono en la cuenta por pagar
              </label>
            )}
            <button type="submit" disabled={pendiente} className={`${boton} self-start bg-foreground text-background`}>
              {pendiente ? "Guardando…" : "Registrar pago"}
            </button>
          </form>
        )}
        <dl className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
          <Dato etiqueta="Monto">{d2(fila.monto)}</Dato>
          <Dato etiqueta="Fecha a pagar">{fechaCorta(fila.fecha)}</Dato>
          <Dato etiqueta="Proveedor">{fila.contraparte ?? "—"}</Dato>
          <Dato etiqueta="Categoría">{etiquetaCategoria(fila.categoria)}</Dato>
          <Dato etiqueta="Prioridad">{etiquetaPrioridad(fila.prioridad)}</Dato>
          <Dato etiqueta="Tipo del libro">{nombre(fila.tipoId, catalogos.tipos)}</Dato>
          {fila.nota && <Dato etiqueta="Nota">{fila.nota}</Dato>}
        </dl>
        <dl className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
          <Dato etiqueta="Solicitado">{`${fila.solicitadoPor} · ${fechaHora(fila.solicitadoEn)}`}</Dato>
          {fila.aprobadoEn && <Dato etiqueta="Aprobado">{`${fila.aprobadoPor ?? "—"} · ${fechaHora(fila.aprobadoEn)}`}</Dato>}
          {fila.fechaPago && <Dato etiqueta="Pagado">{`${fila.pagadoPor ?? "—"} · ${fechaCorta(fila.fechaPago)}${fila.conMovimiento ? " · en el libro" : ""}`}</Dato>}
          {fila.motivoRechazo && <Dato etiqueta="Motivo del rechazo">{fila.motivoRechazo}</Dato>}
        </dl>
      </div>
    </Ventana>
  );
}

export function TablaProgramados({ filas, catalogos, puedeEscribir, esAdmin, hoy }: { filas: FilaProgramado[]; catalogos: Catalogos; puedeEscribir: boolean; esAdmin: boolean; hoy: string }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const fila = filas.find((f) => f.id === abierta) ?? null;
  return (
    <>
      <TablaDatos
        def={DEF_PROG}
        filas={filas}
        columnas={COL_PROG}
        contexto={null}
        iconos={ICONOS}
        nombre={{ singular: "pago", plural: "pagos" }}
        claveFila={(r) => r.id}
        abrirFila={{ etiqueta: (r) => `Abrir ${r.concepto}`, alAbrir: (r) => setAbierta(r.id) }}
        accionPrincipal={puedeEscribir ? <NuevoPago catalogos={catalogos} hoy={hoy} /> : undefined}
        ariaLabel="Pagos programados"
        vacio="Sin pagos programados."
      />
      {fila && <FichaProgramado key={fila.id} fila={fila} catalogos={catalogos} puedeEscribir={puedeEscribir} esAdmin={esAdmin} hoy={hoy} alCerrar={() => setAbierta(null)} />}
    </>
  );
}
