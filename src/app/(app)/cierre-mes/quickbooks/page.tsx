import Link from "next/link";
import type { ReactNode } from "react";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { SelectorEnlace } from "@/components/af4/selector-enlace";
import { TablaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora, hoyPanama, leerPeriodo, mesCorto, mesLargo, sumarMeses } from "@/lib/af4/fecha";
import { dinero, entero, porcentaje } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { GUIAS } from "@/lib/ayuda/contenido";
import { CLAVE_GUIA_OPERACION, enlaceManual, SECCION_MANUAL } from "@/lib/finanzas/estado-sistema";
import { cargarConciliacionQbo } from "@/lib/quickbooks/cargar";
import { CONCEPTOS, cuentasMapeadas, diferencias, TOLERANCIA_PCT, type Comparacion, type Semaforo } from "@/lib/quickbooks/conciliacion";
import { variablesQboFaltantes } from "@/lib/quickbooks/oauth";
import { administraIntegraciones } from "@/lib/quickbooks/permiso";
import { createServiceClient } from "@/lib/supabase/server";
import { ControlesConexion, MapeoCuentas } from "./controles-quickbooks";

export const metadata = { title: "QuickBooks" };

export const dynamic = "force-dynamic";

const TITULO = "Conciliación con QuickBooks";
const MESES = 12;
const PUNTO: Record<Semaforo, string> = { verde: "bg-success", ambar: "bg-warning", rojo: "bg-destructive", sin_datos: "bg-muted-foreground" };
const TEXTO: Record<Semaforo, string> = { verde: "Cuadra", ambar: "Revisar", rojo: "No cuadra", sin_datos: "Sin datos" };

const AVISO_RETORNO: Record<string, { tono: "ok" | "error"; texto: string }> = {
  conectado: { tono: "ok", texto: "QuickBooks quedó conectado. La primera lectura corre con «Leer ahora» o en la tarea de la madrugada." },
  cancelado: { tono: "error", texto: "La autorización se canceló en Intuit." },
  "state-invalido": { tono: "error", texto: "La autorización no se pudo verificar (venció o se empezó en otro navegador). Vuelve a pulsar «Conectar QuickBooks»." },
  "sin-codigo": { tono: "error", texto: "Intuit no devolvió el código de autorización." },
  "sin-variables": { tono: "error", texto: "Faltan las variables QBO_* en el servidor." },
  error: { tono: "error", texto: "Intuit rechazó la conexión o no se pudo guardar. Revisa las variables y vuelve a intentar." },
};

function Desvio({ c }: { c: Pick<Comparacion, "desviacion" | "semaforo"> | undefined }) {
  if (!c) return <>—</>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[c.semaforo]}`} />
      <span className="sr-only">{TEXTO[c.semaforo]}: </span>
      {c.semaforo === "sin_datos" ? "—" : c.desviacion === null ? "Sin base" : porcentaje(c.desviacion, { decimales: 2, conSigno: true })}
    </span>
  );
}

function Aviso({ tono, children }: { tono: "ok" | "error" | "aviso"; children: ReactNode }) {
  const punto = tono === "ok" ? "bg-success" : tono === "error" ? "bg-destructive" : "bg-warning";
  return (
    <p role={tono === "error" ? "alert" : "status"} className="m-0 flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${punto}`} />
      <span>{children}</span>
    </p>
  );
}

export default async function QuickbooksPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("cierre-mes");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Cierre de mes" />;
  const params = await searchParams;
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;
  const meses = Array.from({ length: MESES }, (_, i) => sumarMeses(mesEnCurso, i - MESES + 1));
  const faltan = variablesQboFaltantes(process.env);
  const administra = administraIntegraciones(usuario);
  const puedeEditar = !usuario.modulosSoloLectura.includes("cierre-mes");
  const guia = GUIAS.find((g) => g.clave === CLAVE_GUIA_OPERACION);
  const manual = enlaceManual(guia?.secciones ?? [], SECCION_MANUAL.quickbooks);

  const [datos, cierres] = await Promise.all([cargarConciliacionQbo(supabase, meses), supabase.from("fin_cierres").select("periodo, estado").eq("estado", "cerrado")]);
  const retorno = typeof params.qbo === "string" ? AVISO_RETORNO[params.qbo] : undefined;

  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={TITULO} imprimir={false} />
        <EstadoVacioAF4 titulo="Falta la migración">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }

  const cerrados = new Set((cierres.data ?? []).map((c) => String(c.periodo).slice(0, 10)));
  const cerradosVentana = meses.filter((m) => cerrados.has(m));
  const ventas = (m: string) => datos.comparaciones.find((c) => c.periodo === m && c.concepto === "ventas");
  const ebitda = (m: string) => datos.comparaciones.find((c) => c.periodo === m && c.concepto === "ebitda");
  const cuadran = cerradosVentana.filter((m) => ventas(m)?.semaforo === "verde").length;
  const conQbo = cerradosVentana.filter((m) => datos.mesesConQbo.has(m));
  const ultimoCerrado = [...cerradosVentana].reverse().find((m) => datos.mesesConQbo.has(m)) ?? null;
  const difs = diferencias(datos.comparaciones, new Set(cerradosVentana));
  const pedido = leerPeriodo(params.mes);
  const mes = pedido && meses.includes(pedido) ? pedido : (ultimoCerrado ?? sumarMeses(mesEnCurso, -1));
  const cuentas = cuentasMapeadas(datos.filas, datos.mapeo);
  const conectado = Boolean(datos.conexion);
  const hayDatos = datos.filas.length > 0;
  const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={TITULO}
        filtros={
          <SelectorEnlace
            etiqueta="Elegir el mes del detalle"
            opciones={[...meses].reverse().map((m) => ({ valor: m, etiqueta: `${mesCorto(m)}${cerrados.has(m) ? "" : m === mesEnCurso ? " (en curso)" : " (abierto)"}`, href: `/cierre-mes/quickbooks?mes=${m.slice(0, 7)}` }))}
            elegido={mes}
          />
        }
        datosHasta={hayDatos ? [...datos.mesesConQbo].sort().at(-1) : null}
        actualizado={datos.conexion?.ultima_lectura ?? null}
        imprimir={false}
        acciones={administra ? <ControlesConexion conectado={conectado} configurado={faltan.length === 0} /> : undefined}
      />

      {retorno && <Aviso tono={retorno.tono}>{retorno.texto}</Aviso>}
      {faltan.length > 0 && (
        <Aviso tono="aviso">
          Conexión apagada: faltan {faltan.join(", ")} en el servidor.{" "}
          <Link href={manual} className={`font-medium underline underline-offset-2 ${anilloFoco}`}>
            Cómo encenderla
          </Link>
        </Aviso>
      )}
      {faltan.length === 0 && !conectado && !retorno && <Aviso tono="aviso">QuickBooks no está conectado{administra ? "." : ": lo conecta quien puede modificar Usuarios y roles."}</Aviso>}
      {datos.conexion?.ultimo_error && (
        <Aviso tono="error">
          Última lectura con error: {datos.conexion.ultimo_error}{" "}
          <Link href={manual} className={`font-medium underline underline-offset-2 ${anilloFoco}`}>
            Qué hacer
          </Link>
        </Aviso>
      )}
      {!datos.sinIntercompania && datos.portal && <Aviso tono="aviso">El portal se compara con el consolidado de siempre: sin la migración 0929 no se pueden quitar las partidas intercompañía.</Aviso>}

      <FilaKpiAF4>
        <KpiAF4 titulo="Meses cerrados que cuadran" tono={!conQbo.length ? "neutral" : cuadran === conQbo.length ? "success" : "destructive"} valor={conQbo.length ? `${entero(cuadran)} de ${entero(conQbo.length)}` : "—"} subtexto={`Ventas netas con desviación < ${TOLERANCIA_PCT} %`} />
        <KpiAF4
          titulo={ultimoCerrado ? `Ventas · ${mesCorto(ultimoCerrado)}` : "Ventas del último cierre"}
          tono={ultimoCerrado ? (ventas(ultimoCerrado)?.semaforo === "verde" ? "success" : "destructive") : "neutral"}
          valor={ultimoCerrado ? porcentaje(ventas(ultimoCerrado)?.desviacion ?? null, { decimales: 2, conSigno: true }) : "—"}
          subtexto={ultimoCerrado ? `Portal ${usd(ventas(ultimoCerrado)!.portal)} · QuickBooks ${usd(ventas(ultimoCerrado)!.qbo)}` : "Sin mes cerrado con QuickBooks leído"}
        />
        <KpiAF4 titulo="Diferencias por revisar" tono={difs.length ? "warning" : "success"} valor={entero(difs.length)} subtexto="En meses cerrados" />
        <KpiAF4 titulo="Cuentas sin confirmar" tono={cuentas.some((c) => c.sugerido) ? "warning" : "neutral"} valor={entero(cuentas.filter((c) => c.sugerido).length)} subtexto={`de ${entero(cuentas.length)} cuentas`} />
      </FilaKpiAF4>

      {!hayDatos ? (
        <EstadoVacioAF4 titulo="Todavía no hay nada leído de QuickBooks">{conectado ? "La tarea diaria «QuickBooks» o «Leer ahora» traen el plan de cuentas y los resultados." : null}</EstadoVacioAF4>
      ) : (
        <>
          <TablaComparacionAF4
            id="titulo-qbo-meses"
            titulo="Por mes"
            detalle="USD · portal contra QuickBooks"
            ariaLabel="Ventas netas y EBITDA del portal contra QuickBooks por mes, con la desviación"
            etiquetaConcepto="Mes"
            grupos={[
              { etiqueta: "Ventas netas", columnas: 3 },
              { etiqueta: "EBITDA", columnas: 3 },
              { etiqueta: "", columnas: 1 },
            ]}
            columnas={[
              { clave: "vp", etiqueta: "Portal" },
              { clave: "vq", etiqueta: "QuickBooks", atenuada: true },
              { clave: "vd", etiqueta: "Desviación" },
              { clave: "ep", etiqueta: "Portal" },
              { clave: "eq", etiqueta: "QuickBooks", atenuada: true },
              { clave: "ed", etiqueta: "Desviación" },
              { clave: "estado", etiqueta: "Cierre", numerica: false },
            ]}
            filas={[...meses].reverse().map((m) => {
              const v = ventas(m);
              const e = ebitda(m);
              const hay = datos.mesesConQbo.has(m);
              return {
                clave: m,
                etiqueta: (
                  <Link href={`/cierre-mes/quickbooks?mes=${m.slice(0, 7)}`} className={`${m === mes ? "font-semibold" : ""} underline-offset-2 hover:underline ${anilloFoco}`}>
                    {mesCorto(m)}
                  </Link>
                ),
                celdas: [
                  v ? usd(v.portal) : "—",
                  hay && v ? usd(v.qbo) : "—",
                  <Desvio key="vd" c={v} />,
                  e ? usd(e.portal) : "—",
                  hay && e ? usd(e.qbo) : "—",
                  <Desvio key="ed" c={e} />,
                  cerrados.has(m) ? "Cerrado" : m === mesEnCurso ? "En curso" : "Abierto",
                ],
              };
            })}
          />

          <TablaComparacionAF4
            id="titulo-qbo-detalle"
            titulo={`Detalle · ${mesLargo(mes)}`}
            detalle={cerrados.has(mes) ? "Mes cerrado" : "Mes abierto: puede cambiar"}
            ariaLabel={`Ventas, costos, gastos y EBITDA de ${mesLargo(mes)}, portal contra QuickBooks`}
            columnas={[
              { clave: "p", etiqueta: "Portal" },
              { clave: "q", etiqueta: "QuickBooks", atenuada: true },
              { clave: "d", etiqueta: "Diferencia" },
              { clave: "x", etiqueta: "Desviación" },
            ]}
            filas={CONCEPTOS.map((k) => {
              const c = datos.comparaciones.find((x) => x.periodo === mes && x.concepto === k.clave);
              const hay = datos.mesesConQbo.has(mes);
              return {
                clave: k.clave,
                etiqueta: k.etiqueta,
                peso: k.total ? "total" : undefined,
                celdas: [c ? usd(c.portal) : "—", hay && c ? usd(c.qbo) : "—", hay && c ? usd(c.diferencia) : "—", <Desvio key="x" c={c} />],
              };
            })}
          />

          <TablaComparacionAF4
            id="titulo-qbo-diferencias"
            titulo="Diferencias"
            detalle={`Meses cerrados · fuera del ${TOLERANCIA_PCT} %`}
            ariaLabel="Diferencias entre el portal y QuickBooks en los meses cerrados, de la mayor a la menor"
            columnas={[
              { clave: "mes", etiqueta: "Mes", numerica: false },
              { clave: "p", etiqueta: "Portal" },
              { clave: "q", etiqueta: "QuickBooks", atenuada: true },
              { clave: "d", etiqueta: "Diferencia" },
              { clave: "x", etiqueta: "Desviación" },
            ]}
            filas={
              difs.length
                ? difs.slice(0, 30).map((c) => ({
                    clave: `${c.periodo}-${c.concepto}`,
                    etiqueta: c.etiqueta,
                    celdas: [
                      <Link key="m" href={`/cierre-mes/quickbooks?mes=${c.periodo.slice(0, 7)}`} className={`underline-offset-2 hover:underline ${anilloFoco}`}>
                        {mesCorto(c.periodo)}
                      </Link>,
                      usd(c.portal),
                      usd(c.qbo),
                      usd(c.diferencia),
                      <Desvio key="x" c={c} />,
                    ],
                  }))
                : [{ clave: "nada", etiqueta: "Sin diferencias en los meses cerrados", celdas: ["", "", "", "", ""] }]
            }
          />

          <MarcoAF4
            id="titulo-qbo-mapeo"
            titulo="Mapeo de cuentas"
            detalle={`${entero(cuentas.length)} cuentas · ${mesCorto(meses[0])} – ${mesCorto(meses[meses.length - 1])}`}
            sinRelleno
          >
            <MapeoCuentas cuentas={cuentas} puedeEditar={puedeEditar} />
          </MarcoAF4>
        </>
      )}

      {datos.conexion && (
        <p className="m-0 text-xs text-muted-foreground">
          Compañía {datos.conexion.realm_id} · {datos.conexion.entorno === "production" ? "producción" : "sandbox"} · conectada el {fechaHora(datos.conexion.conectado_en)}
        </p>
      )}
    </Pagina>
  );
}
