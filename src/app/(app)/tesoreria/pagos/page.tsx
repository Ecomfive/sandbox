import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { Pagina } from "@/components/ui/pagina";
import { diaMes, hoyPanama } from "@/lib/af4/fecha";
import { dinero, dineroKpi } from "@/lib/af4/formato";
import type { FilaAF4 } from "@/lib/af4/tabla-financiera";
import { requireModulo } from "@/lib/auth";
import { cargarCalendario } from "@/lib/finanzas/avisos-cierre";
import { filasCalendario, nombrePeriodoFiscal } from "@/lib/finanzas/calendario-fiscal";
import { cargarProyeccion } from "@/lib/finanzas/cargar-proyeccion";
import { cargarDeuda, cargarReglas, SIN_MIGRACION_TESORERIA } from "@/lib/finanzas/cargar-tesoreria";
import { pagosDeuda } from "@/lib/finanzas/deuda";
import { armarCalendario, esCategoriaPago, esPrioridad, pagosFiscales, priorizarPagos, SEMANAS_CALENDARIO, type CategoriaPago, type EstadoProgramado } from "@/lib/finanzas/pagos";
import { armarProyeccion, sumarDias, type Concepto } from "@/lib/finanzas/proyeccion-caja";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "../aviso";
import { CalendarioPagos, TablaProgramados, type FilaCalendario, type FilaProgramado } from "./vista-pagos";

export const metadata = { title: "Pagos" };

export const dynamic = "force-dynamic";

/** Las partidas de la proyección que son pagos del calendario (las demás salidas consumen caja aparte). */
const CATEGORIA_DE_CONCEPTO: Partial<Record<Concepto, CategoriaPago>> = { nomina: "nomina", impuestos: "impuesto", recurrentes: "recurrente", compras: "compra" };
/** Salidas de la proyección que no están en el calendario pero gastan caja (los dividendos y la deuda se miran aparte). */
const OTRAS_SALIDAS: Concepto[] = ["mercancia", "repartidores", "marketing", "otros_gastos", "ajustes_salida"];

export default async function PagosPage() {
  const usuario = await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const hoy = hoyPanama();
  const supabase = createServiceClient();
  const desdeLista = sumarDias(hoy, -60);
  const [proy, cxp, programados, reglas, deuda, tipos, unidades, cuentas, perfiles, fiscal] = await Promise.all([
    cargarProyeccion(supabase, hoy),
    traerTodasConError<Record<string, unknown>>((a, b) =>
      supabase.from("fin_cartera_saldos").select("id, contraparte, documento, saldo, vencimiento_efectivo").eq("clase", "pagar").in("estado", ["pendiente", "parcial"]).order("id").range(a, b),
    ),
    supabase
      .from("fin_pagos_programados")
      .select("id, concepto, contraparte, categoria, monto, fecha_programada, prioridad, estado, origen_ref, cartera_id, tipo_id, unidad_id, cuenta_id, nota, solicitado_por, solicitado_en, aprobado_por, aprobado_en, pagado_por, fecha_pago, motivo_rechazo, movimiento_id, actualizado_en")
      .or(`estado.in.(solicitado,aprobado),actualizado_en.gte.${desdeLista}`)
      .order("fecha_programada")
      .limit(1000),
    cargarReglas(supabase),
    cargarDeuda(supabase),
    supabase.from("fin_tipos").select("id, nombre, signo").order("nombre"),
    supabase.from("fin_unidades").select("id, nombre").order("nombre"),
    supabase.from("fin_cuentas").select("id, nombre, activo").order("nombre"),
    supabase.from("perfiles").select("id, nombre, email"),
    cargarCalendario(supabase),
  ]);

  if ("error" in proy) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Pagos" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo armar el calendario">{proy.error}</EstadoVacioAF4>
      </Pagina>
    );
  }

  const nombrePersona = new Map((perfiles.data ?? []).map((p) => [String(p.id), String(p.nombre ?? p.email ?? "—")]));
  const sinMigracion = !!programados.error || reglas === null;
  const filasProg = (programados.data ?? []).filter((p) => esCategoriaPago(p.categoria) && esPrioridad(p.prioridad));
  const semanas = proy.semanas.slice(0, SEMANAS_CALENDARIO);
  const finVentana = sumarDias(semanas[semanas.length - 1], 6);
  const lineasSinDividendos = proy.lineas.filter((l) => l.concepto !== "dividendos");
  const base = armarProyeccion(lineasSinDividendos, proy.semanas, proy.cajaHoy);
  const otrasSalidas = semanas.map((_, i) => lineasSinDividendos.filter((l) => OTRAS_SALIDAS.includes(l.concepto)).reduce((a, l) => a + (l.valores[i] ?? 0), 0));

  // Impuestos: las obligaciones del calendario fiscal (Cierre de mes, migración 0928) con su vencimiento; las líneas de
  // impuestos de la proyección que ya cubre una obligación no se repiten. Sin la migración, como antes: lo del libro.
  const fiscales =
    "error" in fiscal
      ? null
      : (() => {
          const ultimo = new Map<string, { periodo: string; monto: number }>();
          for (const p of fiscal.presentaciones) {
            if (p.monto === null) continue;
            const previo = ultimo.get(p.obligacionId);
            if (!previo || p.periodo > previo.periodo) ultimo.set(p.obligacionId, { periodo: p.periodo, monto: p.monto });
          }
          const filas = filasCalendario(fiscal.obligaciones, fiscal.presentaciones, hoy, 0, 40).map((f) => ({
            obligacionId: f.obligacion.id,
            clave: f.obligacion.clave,
            nombre: f.obligacion.nombre,
            periodicidad: f.obligacion.periodicidad,
            periodo: f.periodo,
            nombrePeriodo: nombrePeriodoFiscal(f.obligacion, f.periodo),
            vence: f.vence,
            presentada: f.estado === "presentada",
          }));
          return pagosFiscales(
            filas,
            new Map([...ultimo].map(([k, v]) => [k, v.monto])),
            proy.supuestos.impuestos.map((g) => ({ tipo: g.tipo, monto: g.monto })),
            finVentana,
            // Lo vencido del último mes; más atrás queda en el Calendario fiscal (sin marcar presentado no es caja segura).
            sumarDias(hoy, -35),
          );
        })();

  const calendario = armarCalendario(
    {
      hoy,
      semanas: proy.semanas,
      cxp: (cxp.data ?? []).map((d) => ({
        id: String(d.id),
        contraparte: String(d.contraparte ?? ""),
        documento: (d.documento as string | null) ?? null,
        saldo: Number(d.saldo),
        vencimiento: d.vencimiento_efectivo ? String(d.vencimiento_efectivo).slice(0, 10) : null,
      })),
      programados: filasProg
        .filter((p) => p.estado === "solicitado" || p.estado === "aprobado")
        .map((p) => ({
          id: String(p.id),
          concepto: String(p.concepto),
          contraparte: (p.contraparte as string | null) ?? null,
          categoria: p.categoria as CategoriaPago,
          monto: Number(p.monto),
          fecha: String(p.fecha_programada).slice(0, 10),
          estado: p.estado as EstadoProgramado,
          prioridad: p.prioridad,
          origenRef: (p.origen_ref as string | null) ?? null,
          carteraId: (p.cartera_id as string | null) ?? null,
        })),
      deuda: deuda ? pagosDeuda(deuda.prestamos, deuda.lineas, hoy, finVentana, deuda.ciclos) : [],
      proyeccion: proy.lineas
        .filter((l) => CATEGORIA_DE_CONCEPTO[l.concepto] && !(l.concepto === "impuestos" && fiscales?.tiposCubiertos.has(l.detalle)))
        .map((l) => ({ categoria: CATEGORIA_DE_CONCEPTO[l.concepto]!, detalle: l.detalle, valores: l.valores })),
      fiscal: fiscales?.pagos ?? [],
    },
    (reglas ?? []).map((r) => r.regla),
  );
  const prioridad = priorizarPagos(calendario, { inicial: proy.cajaHoy, entradas: base.totalEntradas, otrasSalidas, reserva: proy.config.cajaMinima });
  const etiquetaSemana = (i: number) => `S${i + 1} · ${diaMes(i === 0 ? hoy : semanas[i])} al ${diaMes(sumarDias(semanas[i], 6))}`;
  const filasCal: FilaCalendario[] = calendario.map((p) => {
    const d = prioridad.propuestas.get(p.clave);
    return { ...p, decision: d?.decision ?? null, semanaPago: d?.semanaPago ?? null, etiquetaSemana: etiquetaSemana(p.semana) };
  });

  const total = calendario.reduce((a, p) => a + p.monto, 0);
  const criticos = calendario.filter((p) => p.prioridad === "critico").reduce((a, p) => a + p.monto, 0);
  const vencido = calendario.filter((p) => p.vencido).reduce((a, p) => a + p.monto, 0);
  const porSemana = semanas.map((_, i) => calendario.filter((p) => p.semana === i).reduce((a, p) => a + p.monto, 0));
  const pagadoPorSemana = semanas.map((_, i) => calendario.filter((p) => prioridad.propuestas.get(p.clave)?.semanaPago === i).reduce((a, p) => a + p.monto, 0));
  const inicio = semanas.map((_, i) => (i === 0 ? proy.cajaHoy : prioridad.cajaFinal[i - 1]));
  const filasCaja: FilaAF4[] = [
    { clave: "inicio", etiqueta: "Caja al empezar", tipo: "saldo", valores: inicio, total: null },
    { clave: "entradas", etiqueta: "Entradas esperadas", tipo: "seccion", valores: semanas.map((_, i) => base.totalEntradas[i] ?? 0) },
    { clave: "otras", etiqueta: "Otras salidas de la proyección", tipo: "seccion", valores: otrasSalidas.map((v) => -v) },
    { clave: "vence", etiqueta: "Pagos que vencen", tipo: "detalle", valores: porSemana.map((v) => -v) },
    { clave: "propuesta", etiqueta: "Pagos propuestos", tipo: "seccion", valores: pagadoPorSemana.map((v) => -v) },
    { clave: "final", etiqueta: "Caja al cerrar", tipo: "total", valores: prioridad.cajaFinal, total: prioridad.cajaFinal.at(-1) ?? null },
  ];

  const filasLista: FilaProgramado[] = filasProg.map((p) => ({
    id: String(p.id),
    concepto: String(p.concepto),
    contraparte: (p.contraparte as string | null) ?? null,
    categoria: p.categoria as CategoriaPago,
    monto: Number(p.monto),
    fecha: String(p.fecha_programada).slice(0, 10),
    prioridad: p.prioridad,
    estado: p.estado as EstadoProgramado,
    carteraId: (p.cartera_id as string | null) ?? null,
    tipoId: (p.tipo_id as string | null) ?? null,
    unidadId: (p.unidad_id as string | null) ?? null,
    cuentaId: (p.cuenta_id as string | null) ?? null,
    nota: (p.nota as string | null) ?? null,
    solicitadoPor: nombrePersona.get(String(p.solicitado_por)) ?? "—",
    solicitadoEn: String(p.solicitado_en),
    aprobadoPor: p.aprobado_por ? (nombrePersona.get(String(p.aprobado_por)) ?? "—") : null,
    aprobadoEn: (p.aprobado_en as string | null) ?? null,
    pagadoPor: p.pagado_por ? (nombrePersona.get(String(p.pagado_por)) ?? "—") : null,
    fechaPago: p.fecha_pago ? String(p.fecha_pago).slice(0, 10) : null,
    motivoRechazo: (p.motivo_rechazo as string | null) ?? null,
    conMovimiento: !!p.movimiento_id,
    esMio: p.solicitado_por === usuario.id,
  }));
  const catalogos = {
    tipos: (tipos.data ?? []).filter((t) => Number(t.signo) === -1).map((t) => ({ id: String(t.id), nombre: String(t.nombre) })),
    unidades: (unidades.data ?? []).map((t) => ({ id: String(t.id), nombre: String(t.nombre) })),
    cuentas: (cuentas.data ?? []).filter((c) => c.activo !== false).map((t) => ({ id: String(t.id), nombre: String(t.nombre) })),
  };
  const puedeEscribir = !usuario.modulosSoloLectura.includes("tesoreria");
  const esAdmin = usuario.modulos.includes("usuarios") && !usuario.modulosSoloLectura.includes("usuarios");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Pagos" />
      {sinMigracion && <AvisoTesoreria>{SIN_MIGRACION_TESORERIA}</AvisoTesoreria>}
      <FilaKpiAF4>
        <KpiAF4 titulo="Pagos en 4 semanas" destacado valor={dineroKpi(total)} subtexto={`${calendario.length} pagos`} />
        <KpiAF4 titulo="Críticos" tono={criticos > 0 ? "warning" : "neutral"} valor={dineroKpi(criticos)} />
        <KpiAF4 titulo="Vencido" tono={vencido > 0 ? "destructive" : "success"} valor={dineroKpi(vencido)} />
        <KpiAF4
          titulo="Con la caja proyectada"
          tono={prioridad.alcanza ? "success" : "destructive"}
          valor={prioridad.alcanza ? "Alcanza" : prioridad.deficitCritico > 0 ? `Faltan ${dinero(prioridad.deficitCritico)}` : `Se corren ${dinero(prioridad.postergado)}`}
          subtexto={`Reserva ${dinero(proy.config.cajaMinima)} · sin dividendos`}
        />
        <KpiAF4 titulo="Por aprobar" tono={filasLista.some((f) => f.estado === "solicitado") ? "warning" : "neutral"} valor={String(filasLista.filter((f) => f.estado === "solicitado").length)} />
      </FilaKpiAF4>

      <TablaFinanciera
        id="tabla-caja-pagos"
        titulo="Caja y pagos propuestos"
        detalle={`${diaMes(hoy)} al ${diaMes(finVentana)} · USD`}
        columnas={semanas.map((s, i) => ({
          clave: s,
          etiqueta: `S${i + 1}`,
          detalle: diaMes(i === 0 ? hoy : s),
          marca: (prioridad.cajaFinal[i] ?? 0) < proy.config.cajaMinima ? { tono: "destructive" as const, texto: "Por debajo de la caja mínima" } : undefined,
        }))}
        filas={filasCaja}
        ariaLabel="Caja de las próximas 4 semanas con los pagos propuestos"
      />

      <section aria-labelledby="titulo-calendario" className="flex flex-col gap-2">
        <h2 id="titulo-calendario" className="text-sm font-semibold">
          Calendario de pagos
        </h2>
        <CalendarioPagos filas={filasCal} catalogos={catalogos} puedeEscribir={puedeEscribir && !sinMigracion} />
      </section>

      {!programados.error && (
        <section aria-labelledby="titulo-programados" className="flex flex-col gap-2">
          <h2 id="titulo-programados" className="text-sm font-semibold">
            Pagos programados
          </h2>
          <TablaProgramados filas={filasLista} catalogos={catalogos} puedeEscribir={puedeEscribir} esAdmin={esAdmin} hoy={hoy} />
        </section>
      )}
    </Pagina>
  );
}
