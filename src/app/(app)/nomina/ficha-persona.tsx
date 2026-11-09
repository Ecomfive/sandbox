"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { fechaCorta, mesCorto } from "@/lib/af4/fecha";
import { dinero2, numero } from "@/lib/af4/formato";
import { CerrarIcon, CheckIcon, FlechaAbajoIcon, FlechaArribaIcon, GastoIcon, HistorialIcon, LapizIcon, PersonaIcon } from "@/lib/nav-icons";
import { etiquetaNacionalidad } from "@/lib/nomina/documento";
import { actualizarLineaNomina, actualizarPersonaNomina, obtenerPersonaNomina, type LineaFicha, type PersonaFicha } from "./actions";
import { ETIQUETA_TIPO } from "./def-nomina";

type Tienda = { id: string; nombre: string };
type Datos = { persona: PersonaFicha; lineas: LineaFicha[] };

const claseBoton = `inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium disabled:opacity-50 ${anilloFoco}`;
const clasePrincipal = `${claseBoton} bg-foreground text-background hover:bg-foreground/85`;
const claseSecundario = `${claseBoton} border border-border-control bg-card hover:bg-muted`;

/**
 * Ficha de una persona de la nómina: el panel a la derecha que abre su fila. Trae el documento completo (solo aquí), sus
 * datos editables y el historial de todos sus pagos; una línea del historial se corrige debajo de la tabla y queda
 * marcada para que reimportar el Excel no la pise. Sin permiso de escritura solo se lee.
 */
export function FichaPersona({
  personaId,
  tiendas,
  puedeEscribir,
  anterior,
  siguiente,
  alCerrar,
}: {
  personaId: string;
  tiendas: Tienda[];
  puedeEscribir: boolean;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [editando, setEditando] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerPersonaNomina(personaId)
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) setError(r.error);
        else setDatos(r);
      })
      .catch(() => vigente && setError("No se pudo abrir la ficha."));
    return () => {
      vigente = false;
    };
  }, [personaId, version]);

  const p = datos?.persona;
  const nombreTienda = new Map(tiendas.map((t) => [t.id, t.nombre]));
  const linea = datos?.lineas.find((l) => l.id === editando) ?? null;
  const recargar = () => setVersion((v) => v + 1);

  return (
    <Ventana
      abierto
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      navegacion={
        <>
          <BotonNavegar texto="Persona anterior" icono={FlechaArribaIcon} alHacerClic={anterior} />
          <BotonNavegar texto="Persona siguiente" icono={FlechaAbajoIcon} alHacerClic={siguiente} />
        </>
      }
      titulo={
        <>
          <span className="text-lg font-semibold">{p?.nombre ?? "Persona"}</span>
          {p && <Badge tone="neutral">{ETIQUETA_TIPO[p.tipo]}</Badge>}
          {p && !p.activo && <Badge tone="warning">Inactiva</Badge>}
        </>
      }
    >
      <div className="flex flex-col divide-y divide-border p-5">
        {error && (
          <p role="alert" className="flex items-center gap-2 pb-4 text-sm">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
            {error}
          </p>
        )}
        {!datos && !error && <ProgresoCarga mensaje="Abriendo la ficha…" />}
        {datos && p && (
          <>
            <Seccion icono={PersonaIcon} titulo="Persona">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <Dato titulo={p.tipo === "formal" ? "Cédula o pasaporte" : "Documento"} valor={p.documento} />
                <Dato titulo={p.tipo === "formal" ? "Nacionalidad" : "País"} valor={p.tipo === "formal" ? etiquetaNacionalidad(p.nacionalidad) : p.pais} />
                <Dato titulo="N.º de empleado" valor={p.numero_empleado} />
                <Dato titulo="Inicio" valor={p.fecha_inicio ? fechaCorta(p.fecha_inicio) : null} />
                <Dato titulo="Frecuencia de pago" valor={p.frecuencia_pago?.toLowerCase() ?? null} />
                <Dato titulo={p.tipo === "formal" ? "Salario mensual" : "Sueldo mensual"} valor={p.salario_mensual === null ? null : dinero2(p.salario_mensual, p.tipo === "externa" ? "USDT" : "USD")} />
              </dl>
              <FormularioPersona key={JSON.stringify(p)} persona={p} tiendas={tiendas} puedeEscribir={puedeEscribir} alGuardar={recargar} />
            </Seccion>

            <Seccion icono={HistorialIcon} titulo="Historial de pagos">
              <HistorialPagos lineas={datos.lineas} nombreTienda={nombreTienda} persona={p} editando={editando} puedeEscribir={puedeEscribir} alEditar={setEditando} />
              {linea && (
                <FormularioLinea
                  key={`${linea.id}-${version}`}
                  linea={linea}
                  persona={p}
                  tiendas={tiendas}
                  puedeEscribir={puedeEscribir}
                  alCerrar={() => setEditando(null)}
                  alGuardar={recargar}
                />
              )}
            </Seccion>
          </>
        )}
      </div>
    </Ventana>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string | null | undefined }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className="truncate tabular-nums">{valor || "—"}</dd>
    </div>
  );
}

function BotonNavegar({ texto, icono: Icono, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; alHacerClic?: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!alHacerClic}
        onClick={() => alHacerClic?.()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${alHacerClic ? "hover:bg-muted" : "cursor-default opacity-40"}`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------------------------

interface FormPersona {
  unidad_id: string;
  cargo: string;
  estatus: string;
  correo: string;
  medio_pago: string;
  fecha_fin: string;
  activo: boolean;
}

const desdePersona = (p: PersonaFicha): FormPersona => ({
  unidad_id: p.unidad_id ?? "",
  cargo: p.cargo ?? "",
  estatus: p.estatus ?? "",
  correo: p.correo ?? "",
  medio_pago: p.medio_pago ?? "",
  fecha_fin: p.fecha_fin ?? "",
  activo: p.activo,
});

function FormularioPersona({ persona, tiendas, puedeEscribir, alGuardar }: { persona: PersonaFicha; tiendas: Tienda[]; puedeEscribir: boolean; alGuardar: () => void }) {
  const { mostrarToast } = useToast();
  const router = useRouter();
  const id = useId();
  const [d, setD] = useState<FormPersona>(desdePersona(persona));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const cambiar = (c: Partial<FormPersona>) => setD((a) => ({ ...a, ...c }));
  const sinGuardar = JSON.stringify(d) !== JSON.stringify(desdePersona(persona));

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    empezar(async () => {
      const r = await actualizarPersonaNomina(persona.id, { ...d, unidad_id: d.unidad_id || null }).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Cambios guardados");
        alGuardar();
        router.refresh();
      }
    });
  }

  return (
    <form id={id} onSubmit={guardar} className="flex flex-col gap-3">
      <fieldset disabled={!puedeEscribir || pendiente} className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Tienda que paga su costo</span>
          <select value={d.unidad_id} onChange={(e) => cambiar({ unidad_id: e.target.value })} className={`${fieldClass} w-full`}>
            <option value="">Sin tienda</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>{persona.tipo === "formal" ? "Cargo" : "Rol"}</span>
          <input type="text" value={d.cargo} maxLength={120} onChange={(e) => cambiar({ cargo: e.target.value })} placeholder="Ej: Auxiliar de despacho" className={`${fieldClass} w-full`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Estatus</span>
          <input type="text" value={d.estatus} maxLength={60} onChange={(e) => cambiar({ estatus: e.target.value })} placeholder="Ej: Contrato" className={`${fieldClass} w-full`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Fin del contrato</span>
          <input type="date" value={d.fecha_fin} onChange={(e) => cambiar({ fecha_fin: e.target.value })} className={`${fieldClass} w-full`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Correo</span>
          <input type="email" value={d.correo} maxLength={160} onChange={(e) => cambiar({ correo: e.target.value })} placeholder="Ej: nombre@ejemplo.com" className={`${fieldClass} w-full`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Medio de pago</span>
          <input type="text" value={d.medio_pago} maxLength={80} onChange={(e) => cambiar({ medio_pago: e.target.value })} placeholder="Ej: Binance USDT" className={`${fieldClass} w-full`} />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={d.activo} onChange={(e) => cambiar({ activo: e.target.checked })} className="h-4 w-4" />
          Activa
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {puedeEscribir && sinGuardar && (
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pendiente} className={clasePrincipal}>
            <CheckIcon className="h-4 w-4" />
            {pendiente ? "Guardando…" : "Guardar cambios"}
          </button>
          <button type="button" disabled={pendiente} onClick={() => setD(desdePersona(persona))} className={claseSecundario}>
            <CerrarIcon className="h-4 w-4" />
            Cancelar
          </button>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------------------------

function HistorialPagos({
  lineas,
  nombreTienda,
  persona,
  editando,
  puedeEscribir,
  alEditar,
}: {
  lineas: LineaFicha[];
  nombreTienda: Map<string, string>;
  persona: PersonaFicha;
  editando: string | null;
  puedeEscribir: boolean;
  alEditar: (id: string) => void;
}) {
  if (!lineas.length) return <p className="text-sm text-muted-foreground">Sin pagos cargados.</p>;
  const tienda = (l: LineaFicha) => nombreTienda.get(l.unidad_id ?? persona.unidad_id ?? "") ?? "—";
  const total = (f: (l: LineaFicha) => number) => lineas.reduce((a, l) => a + f(l), 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Pagos de {persona.nombre}, del más nuevo al más viejo</caption>
        <thead>
          <tr className="bg-muted text-left text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">Mes</th>
            <th scope="col" className="px-3 py-2 font-medium">Pago</th>
            <th scope="col" className="px-3 py-2 font-medium">Tienda</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Costo</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Neto</th>
            <th scope="col" className="px-3 py-2 font-medium">Pagado</th>
            <th scope="col" className="px-1 py-2">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => (
            <tr key={l.id} className={`border-t border-border/60 ${editando === l.id ? "bg-accent" : ""}`}>
              <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal">
                <span className="flex items-center gap-1.5">
                  {l.diferencia_calculo !== 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
                  {mesCorto(l.periodo)}
                  {l.diferencia_calculo !== 0 && <span className="sr-only"> (no cuadra con la fórmula)</span>}
                </span>
              </th>
              <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{l.tramo || "—"}</td>
              <td className="whitespace-nowrap px-3 py-1.5">{tienda(l)}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{dinero2(l.total_bruto, l.moneda)}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{dinero2(l.neto, l.moneda)}</td>
              <td className="px-3 py-1.5 text-muted-foreground">{l.pagado === true ? "Sí" : l.pagado === false ? "No" : "—"}</td>
              <td className="px-1 py-1">
                <Tooltip texto={puedeEscribir ? "Editar el pago" : "Ver el detalle"}>
                  <button
                    type="button"
                    aria-label={`${puedeEscribir ? "Editar" : "Ver"} el pago de ${mesCorto(l.periodo)} ${l.tramo}`}
                    aria-pressed={editando === l.id}
                    onClick={() => alEditar(l.id)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
                  >
                    <LapizIcon className="h-4 w-4" />
                  </button>
                </Tooltip>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border-control border-b-[3px] border-b-border-control border-double font-semibold">
            <th scope="row" colSpan={3} className="px-3 py-2 text-left">
              Total
            </th>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{dinero2(total((l) => l.total_bruto))}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{dinero2(total((l) => l.neto))}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

interface FormLinea {
  unidad_id: string;
  pagado: "" | "si" | "no";
  fecha_pago: string;
  medio_pago: string;
  referencia: string;
  observacion: string;
}

const desdeLinea = (l: LineaFicha): FormLinea => ({
  unidad_id: l.unidad_id ?? "",
  pagado: l.pagado === true ? "si" : l.pagado === false ? "no" : "",
  fecha_pago: l.fecha_pago ?? "",
  medio_pago: l.medio_pago ?? "",
  referencia: l.referencia ?? "",
  observacion: l.observacion ?? "",
});

function FormularioLinea({
  linea,
  persona,
  tiendas,
  puedeEscribir,
  alCerrar,
  alGuardar,
}: {
  linea: LineaFicha;
  persona: PersonaFicha;
  tiendas: Tienda[];
  puedeEscribir: boolean;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const { mostrarToast } = useToast();
  const router = useRouter();
  const [d, setD] = useState<FormLinea>(desdeLinea(linea));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const cambiar = (c: Partial<FormLinea>) => setD((a) => ({ ...a, ...c }));
  const sinGuardar = JSON.stringify(d) !== JSON.stringify(desdeLinea(linea));
  const m = linea.moneda;
  const descuentos = linea.descuento_tardanza + linea.descuento_ausencia + linea.otros_descuentos;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    empezar(async () => {
      const r = await actualizarLineaNomina(linea.id, {
        ...d,
        unidad_id: d.unidad_id || null,
        pagado: d.pagado === "" ? null : d.pagado === "si",
      }).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Pago corregido");
        alGuardar();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={guardar} aria-label={`Pago de ${mesCorto(linea.periodo)} ${linea.tramo}`} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <GastoIcon className="h-4 w-4 text-muted-foreground" />
          {mesCorto(linea.periodo)} · {linea.tramo || "pago"}
          {linea.editado_a_mano && <Badge tone="info">Corregido a mano</Badge>}
        </h4>
        <Tooltip texto="Cerrar el pago">
          <button type="button" aria-label="Cerrar el pago" onClick={alCerrar} className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted ${anilloFoco}`}>
            <CerrarIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <Dato titulo={persona.tipo === "formal" ? "Devengado" : "Sueldo"} valor={dinero2(linea.devengado, m)} />
        <Dato titulo={`Horas extra (${numero(linea.horas_extra, linea.horas_extra % 1 ? 2 : 0)} h)`} valor={dinero2(linea.monto_horas_extra, m)} />
        {linea.monto_feriado !== 0 && <Dato titulo="Feriados" valor={dinero2(linea.monto_feriado, m)} />}
        <Dato titulo="Bono" valor={dinero2(linea.bono, m)} />
        {descuentos !== 0 && <Dato titulo="Tardanzas, ausencias y descuentos" valor={dinero2(-descuentos, m)} />}
        <Dato titulo="Costo" valor={dinero2(linea.total_bruto, m)} />
        {persona.tipo === "formal" && <Dato titulo="Seguro Social (9,75 %)" valor={dinero2(linea.seguro_social)} />}
        {persona.tipo === "formal" && <Dato titulo="Seguro Educativo (1,25 %)" valor={dinero2(linea.seguro_educativo)} />}
        <Dato titulo="Neto" valor={dinero2(linea.neto, m)} />
        {linea.origen_pago && <Dato titulo="Origen del pago" valor={linea.origen_pago} />}
      </dl>
      {linea.diferencia_calculo !== 0 && (
        <p className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
          Con las fórmulas de la planilla el neto da {dinero2(linea.neto + linea.diferencia_calculo, m)}: {dinero2(Math.abs(linea.diferencia_calculo), m)}{" "}
          {linea.diferencia_calculo > 0 ? "más" : "menos"} que en el Excel.
        </p>
      )}

      <fieldset disabled={!puedeEscribir || pendiente} className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Tienda de este pago</span>
          <select value={d.unidad_id} onChange={(e) => cambiar({ unidad_id: e.target.value })} className={`${fieldClass} w-full`}>
            <option value="">La de la persona</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Pagado</span>
          <select value={d.pagado} onChange={(e) => cambiar({ pagado: e.target.value as FormLinea["pagado"] })} className={`${fieldClass} w-full`}>
            <option value="">Sin dato</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Fecha de pago</span>
          <input type="date" value={d.fecha_pago} onChange={(e) => cambiar({ fecha_pago: e.target.value })} className={`${fieldClass} w-full`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Medio de pago</span>
          <input type="text" value={d.medio_pago} maxLength={80} onChange={(e) => cambiar({ medio_pago: e.target.value })} placeholder="Ej: Banca en línea" className={`${fieldClass} w-full`} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClassSm}>Referencia o ID de transacción</span>
          <input type="text" value={d.referencia} maxLength={120} onChange={(e) => cambiar({ referencia: e.target.value })} placeholder="Ej: 400000000000000000" className={`${fieldClass} w-full`} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelClassSm}>Observación</span>
          <textarea value={d.observacion} maxLength={500} rows={2} onChange={(e) => cambiar({ observacion: e.target.value })} className={`${fieldClass} w-full resize-y`} />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {puedeEscribir && sinGuardar && (
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pendiente} className={clasePrincipal}>
            <CheckIcon className="h-4 w-4" />
            {pendiente ? "Guardando…" : "Guardar el pago"}
          </button>
          <button type="button" disabled={pendiente} onClick={() => setD(desdeLinea(linea))} className={claseSecundario}>
            <CerrarIcon className="h-4 w-4" />
            Cancelar
          </button>
        </div>
      )}
    </form>
  );
}
