import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { TablaComparacionAF4, type FilaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { anilloFoco } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, fechaHora, hoyPanama, mesEnCursoPanama, mesLargo, mesMedio } from "@/lib/af4/fecha";
import { dinero as formatoDinero, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarMesesCierre, nombresDePersonas, tomarFotografia } from "@/lib/finanzas/cargar-cierre";
import {
  cargarAjustesMes,
  cargarAsignaciones,
  cargarConfigCierre,
  cargarCuadres,
  cargarReaperturas,
  cargarVariaciones,
  comprasMercanciaMes,
  partesDropiAl,
  personasActivas,
  valorInventarioWms,
} from "@/lib/finanzas/cargar-cierre-control";
import { TAREAS_SIN_MARCA, avance, compararFotografia, finDeMes, leerFotografia, leerPeriodo, mesAnterior, puedeCerrar, type FilaComparacion } from "@/lib/finanzas/cierre";
import {
  atrasoTarea,
  explicarDiferenciaDropi,
  fechaObjetivo,
  pendienteDropi,
  puedeAprobar,
  resumenVariaciones,
  textoPlazo,
} from "@/lib/finanzas/cierre-control";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerActividadCierre } from "../actions";
import { InsigniaCierre } from "../estado";
import { AccionesCierre } from "./acciones-cierre";
import { ChecklistCierre, type TareaVista } from "./checklist-cierre";
import { CuadresCierre, NotasCierre, VariacionesCierre, type VistaCuadre } from "./control-cierre";

export const metadata = { title: "Cierre de mes" };

export const dynamic = "force-dynamic";

const mesEnCurso = () => mesEnCursoPanama();
const fecha = (iso: string) => fechaHora(iso);
const dinero = (v: number | null) => formatoDinero(v);
const usd2 = (v: number) => formatoDinero(v, "USD", { decimales: 2 });
const botonEnlace = `inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[13px] hover:bg-muted ${anilloFoco}`;

/** La fotografía guardada al cerrar contra la de hoy, agrupada como la guardó el cierre. */
function filasFotografia(filas: FilaComparacion[]): FilaComparacionAF4[] {
  const grupos = [...new Set(filas.map((f) => f.grupo))];
  return grupos.flatMap((g) => [
    { clave: `g|${g}`, etiqueta: g, peso: "grupo" as const, celdas: ["", "", ""] },
    ...filas
      .filter((f) => f.grupo === g)
      .map((f) => ({
        clave: `${g}|${f.concepto}`,
        etiqueta: (
          <span className="inline-flex items-center gap-1.5 font-normal">
            {f.cambio && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
            {f.concepto}
            {f.cambio && <span className="sr-only"> (cambió después del cierre)</span>}
          </span>
        ),
        celdas: [dinero(f.alCerrar), dinero(f.hoy), f.cambio ? formatoDinero(f.diferencia, "USD", { conSigno: true }) : "—"],
      })),
  ]);
}

export default async function CierreDelMesPage({ params }: { params: Promise<{ periodo: string }> }) {
  const usuario = await requireModulo("cierre-mes");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Cierre de mes" />;
  const periodo = leerPeriodo((await params).periodo);
  if (!periodo || periodo > mesEnCurso()) notFound();
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const [datos, { config }] = await Promise.all([cargarMesesCierre(supabase, [periodo], periodo), cargarConfigCierre(supabase)]);
  const titulo = `Cierre de ${mesLargo(periodo)}`;
  if ("error" in datos) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EtiquetaMiga texto={mesMedio(periodo)} />
        <EncabezadoAF4 titulo={titulo} imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer el cierre">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const { cierre, estado, tareas } = datos[0];
  const guardada = cierre ? leerFotografia(cierre.fotografia) : null;
  const terminado = periodo < mesEnCurso();
  const abierto = estado !== "cerrado";
  const [actual, asignaciones, personas, variaciones, cuadres, ajustes, reaperturas, wms, dropi, compras, cuadresAnterior, fotoR] = await Promise.all([
    guardada ? tomarFotografia(supabase, periodo) : Promise.resolve(null),
    cierre ? cargarAsignaciones(supabase, [cierre.id]) : Promise.resolve(new Map()),
    personasActivas(supabase),
    cargarVariaciones(supabase, periodo, config),
    cargarCuadres(supabase, periodo),
    cargarAjustesMes(supabase, periodo),
    cargarReaperturas(supabase, 20, periodo),
    terminado && abierto ? valorInventarioWms(supabase) : Promise.resolve(null),
    terminado ? partesDropiAl(supabase, finDeMes(periodo), config.contraparteDropi) : Promise.resolve(null),
    comprasMercanciaMes(supabase, periodo),
    cargarCuadres(supabase, mesAnterior(periodo)),
    // La foto del inventario que guardó el Balance general para este mes (migración 0930): el valor en libros sugerido.
    supabase.from("fin_inventario_cortes").select("valor, tomado_en").eq("periodo", periodo).maybeSingle(),
  ]);
  const fotoInventario = fotoR.error || !fotoR.data ? null : { valor: Number(fotoR.data.valor), tomadoEn: (fotoR.data.tomado_en as string | null) ?? null };
  const reabs = "error" in reaperturas ? [] : reaperturas;
  const listaCuadres = "error" in cuadres ? [] : cuadres;
  const listaAjustes = "error" in ajustes ? null : ajustes;
  const nombres = await nombresDePersonas(supabase, [
    cierre?.cerrado_por,
    cierre?.enviado_revision_por,
    cierre?.reabierto_por,
    ...tareas.map((t) => t.marcadoPor),
    ...[...(asignaciones?.values() ?? [])].map((a) => a.responsableId),
    ...listaCuadres.map((c) => c.registradoPor),
    ...reabs.map((r) => r.reabiertoPor),
  ]);
  const comparacion = guardada && actual ? compararFotografia(guardada, actual) : [];
  const cambios = comparacion.filter((f) => f.cambio).length;

  const puedeEscribir = !usuario.modulosSoloLectura.includes("cierre-mes");
  const puedeReabrir = puedeEscribir && usuario.modulos.includes("usuarios") && !usuario.modulosSoloLectura.includes("usuarios");
  const cierreOk = puedeCerrar("en_revision", tareas);
  const aprueba = puedeAprobar(cierre?.enviado_revision_por, usuario.id);
  const bloqueoCierre = !aprueba.ok ? aprueba.motivo : cierreOk.ok ? null : cierreOk.motivo;
  const a = avance(tareas);
  const excepciones = tareas.filter((t) => t.aMano && t.resultado !== "ok").length;
  const quien = (id: string | null | undefined) => (id ? (nombres.get(id) ?? "—") : "—");
  const objetivo = fechaObjetivo(periodo, config.diaHabil);
  const plazoMes = atrasoTarea(estado === "cerrado", objetivo, hoy);

  const vista: TareaVista[] = tareas.map((t) => {
    const asig = cierre ? asignaciones?.get(`${cierre.id}|${t.clave}`) : undefined;
    const limite = asig?.fechaLimite ?? objetivo;
    const plazo = atrasoTarea(t.color === "verde" || estado === "cerrado", limite, hoy);
    return {
      clave: t.clave,
      titulo: t.titulo,
      href: t.href,
      resultado: t.resultado,
      detalle: t.detalle,
      estado: t.estado,
      aMano: t.aMano,
      comentario: t.comentario,
      color: t.color,
      marca: t.aMano && t.marcadoPor ? `${quien(t.marcadoPor)}${t.marcadoEn ? `, ${fecha(t.marcadoEn)}` : ""}` : null,
      atraso: plazo.atraso,
      plazo: textoPlazo(plazo),
      vence: fechaCorta(limite),
      fechaLimite: asig?.fechaLimite ?? null,
      responsableId: asig?.responsableId ?? null,
      responsable: asig?.responsableId ? quien(asig.responsableId) : null,
      sinMarca: TAREAS_SIN_MARCA.has(t.clave) && t.resultado !== "no_disponible",
    };
  });
  const atrasadas = vista.filter((t) => t.atraso === "vencida").length;

  // Cuadres
  const guardadoDe = (clase: "inventario" | "cartera_dropi") => {
    const c = listaCuadres.find((x) => x.clase === clase);
    return c
      ? { libros: c.libros, sistema: c.sistema, diferencia: c.diferencia, explicacion: c.explicacion, registrado: `${fecha(c.registradoEn)} por ${quien(c.registradoPor)}` }
      : null;
  };
  const invAnterior = "error" in cuadresAnterior ? null : (cuadresAnterior.find((c) => c.clase === "inventario") ?? null);
  const vistaCuadres: VistaCuadre[] = [
    {
      clase: "inventario",
      titulo: "Inventario contable contra el WMS",
      etiquetaLibros: "Valor en libros",
      etiquetaSistema: "Inventario del WMS",
      guardado: guardadoDe("inventario"),
      sistemaActual: wms?.valor ?? null,
      librosSugerido: fotoInventario?.valor ?? null,
      partes: [
        ...(fotoInventario
          ? [{ etiqueta: `Foto del inventario del balance${fotoInventario.tomadoEn ? ` (${fecha(fotoInventario.tomadoEn)})` : ""}`, valor: usd2(fotoInventario.valor) }]
          : []),
        ...(invAnterior ? [{ etiqueta: `En libros al cierre de ${mesMedio(mesAnterior(periodo))}`, valor: usd2(invAnterior.libros) }] : []),
        ...(compras !== null ? [{ etiqueta: "Compras de mercancía del mes (libro)", valor: usd2(compras) }] : []),
        ...(wms ? [{ etiqueta: "Productos con stock y sin costo", valor: entero(wms.sinCosto) }] : []),
      ],
      pistas: wms && wms.sinCosto > 0 ? [`${entero(wms.sinCosto)} productos con stock no tienen costo: el WMS los valoriza en cero.`] : [],
      tolerancia: config.toleranciaInventario,
    },
    {
      clase: "cartera_dropi",
      titulo: "Cartera por cobrar contra Dropi",
      etiquetaLibros: "Por cobrar a Dropi en libros",
      etiquetaSistema: "Pendiente en Dropi",
      guardado: guardadoDe("cartera_dropi"),
      sistemaActual: dropi ? pendienteDropi(dropi) : null,
      librosSugerido: dropi?.carteraLibros ?? null,
      partes: dropi
        ? [
            { etiqueta: `Wallet${dropi.walletFecha ? ` al ${fechaCorta(dropi.walletFecha)}` : ""}`, valor: usd2(dropi.wallet) },
            { etiqueta: `Retiros sin recibir (${entero(dropi.retirosAbiertos)})`, valor: usd2(dropi.retirosTransito) },
            { etiqueta: `Entregados sin acreditar (${entero(dropi.pedidosSinLiquidar)})`, valor: usd2(dropi.entregadosSinLiquidar) },
            { etiqueta: `Cartera de los libros (${entero(dropi.documentosLibros)} documentos)`, valor: usd2(dropi.carteraLibros) },
          ]
        : [],
      pistas: dropi ? explicarDiferenciaDropi(dropi) : [],
      tolerancia: config.toleranciaDropi,
    },
  ];

  const resumenVar = variaciones ? resumenVariaciones(variaciones) : null;
  const efectoAjustes = listaAjustes ? Math.round(listaAjustes.reduce((s, x) => s + x.efecto, 0) * 100) / 100 : 0;

  const linea: string[] = [];
  if (estado === "cerrado" && cierre?.cerrado_en) linea.push(`Aprobado y cerrado el ${fecha(cierre.cerrado_en)} por ${quien(cierre.cerrado_por)}`);
  if (cierre?.enviado_revision_en && (estado === "en_revision" || estado === "cerrado"))
    linea.push(`Preparado por ${quien(cierre.enviado_revision_por)} el ${fecha(cierre.enviado_revision_en)}${estado === "en_revision" ? " · falta la aprobación de otra persona" : ""}`);
  if (estado !== "cerrado") linea.push(`Fecha objetivo: ${fechaCorta(objetivo)} · ${textoPlazo(plazoMes)}`);
  if (cierre?.reabierto_en) linea.push(`Reabierto el ${fecha(cierre.reabierto_en)} por ${quien(cierre.reabierto_por)}: «${cierre.motivo_reapertura}»`);

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EtiquetaMiga texto={mesMedio(periodo)} />
      <EncabezadoAF4
        titulo={titulo}
        datosHasta={periodo}
        imprimir={false}
        acciones={
          <span className="flex flex-wrap gap-2">
            <Link href={`/cierre-mes/ajustes?periodo=${periodo.slice(0, 7)}`} className={botonEnlace}>
              Asientos de ajuste
            </Link>
            <Link href={`/cierre-mes/${periodo.slice(0, 7)}/paquete`} className={botonEnlace}>
              Paquete del cierre
            </Link>
          </span>
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="flex items-center gap-2">
            <InsigniaCierre estado={estado} />
            <span className="inline-block font-medium first-letter:uppercase">{mesLargo(periodo)}</span>
          </span>
          {linea.map((l) => (
            <span key={l} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {l.startsWith("Fecha objetivo") && plazoMes.atraso === "vencida" && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />}
              {l}
            </span>
          ))}
        </div>
        <AccionesCierre periodo={periodo} estado={estado} puedeEscribir={puedeEscribir} puedeReabrir={puedeReabrir} terminado={terminado} bloqueoCierre={bloqueoCierre} />
      </div>

      <KpiGroup titulo="Checklist">
        <KpiGrid compacta>
          <KpiCard compacta titulo="Listas" tono={a.listas === a.total ? "success" : "neutral"} valor={`${entero(a.listas)} de ${entero(a.total)}`} />
          <KpiCard compacta titulo="Por resolver" tono={a.total - a.listas > 0 ? "warning" : "neutral"} valor={entero(a.total - a.listas)} />
          <KpiCard compacta titulo="Atrasadas" tono={atrasadas ? "destructive" : "neutral"} valor={entero(atrasadas)} />
          <KpiCard compacta titulo="Excepciones justificadas" valor={entero(excepciones)} />
          {resumenVar && <KpiCard compacta titulo="Variaciones sin explicar" tono={resumenVar.sinExplicar ? "destructive" : "neutral"} valor={entero(resumenVar.sinExplicar)} href="#variaciones" />}
          {listaAjustes && <KpiCard compacta titulo="Ajustes del mes" valor={entero(listaAjustes.length)} subtexto={`Efecto ${formatoDinero(efectoAjustes, "USD", { conSigno: true })}`} href={`/cierre-mes/ajustes?periodo=${periodo.slice(0, 7)}`} />}
          {guardada && <KpiCard compacta titulo="Cambios desde el cierre" tono={cambios ? "warning" : "success"} valor={entero(cambios)} />}
        </KpiGrid>
      </KpiGroup>

      <MarcoAF4 id="titulo-checklist" titulo="Tareas del cierre" detalle={`${entero(a.listas)} de ${entero(a.total)} · vencen el ${fechaCorta(objetivo)}`} sinRelleno>
        <ChecklistCierre periodo={periodo} tareas={vista} editable={puedeEscribir && abierto} personas={personas} />
      </MarcoAF4>

      <div id="variaciones" className="scroll-mt-24">
        <MarcoAF4
          id="titulo-variaciones"
          titulo="Variaciones contra el mes anterior"
          detalle={`Más de ${entero(config.umbralPct)} % y ${formatoDinero(config.umbralMonto)} · contra ${mesMedio(mesAnterior(periodo))}`}
          sinRelleno
        >
          {variaciones ? (
            <VariacionesCierre periodo={periodo} lineas={variaciones} editable={puedeEscribir && abierto} />
          ) : (
            <EstadoVacioAF4 titulo="No se pudieron leer las variaciones" compacto>
              Falta correr la migración 0927 o el libro del mes.
            </EstadoVacioAF4>
          )}
        </MarcoAF4>
      </div>

      <section id="cuadres" aria-labelledby="titulo-cuadres" className="flex scroll-mt-24 flex-col gap-3">
        <h2 id="titulo-cuadres" className="m-0 text-base font-semibold">
          Cuadres
        </h2>
        {"error" in cuadres ? (
          <EstadoVacioAF4 titulo="Falta la migración" compacto>
            {cuadres.error}
          </EstadoVacioAF4>
        ) : (
          <CuadresCierre periodo={periodo} cuadres={vistaCuadres} editable={puedeEscribir && abierto && terminado} />
        )}
      </section>

      <MarcoAF4 id="titulo-notas" titulo="Notas del cierre" sinRelleno>
        <NotasCierre periodo={periodo} notas={cierre?.notas ?? null} editable={puedeEscribir && abierto} />
      </MarcoAF4>

      {reabs.length > 0 && (
        <TablaComparacionAF4
          id="titulo-reaperturas"
          titulo="Reaperturas"
          detalle={`${entero(reabs.length)} ${reabs.length === 1 ? "vez" : "veces"}`}
          ariaLabel="Reaperturas del mes"
          etiquetaConcepto="Cuándo"
          columnas={[
            { clave: "quien", etiqueta: "Quién", numerica: false },
            { clave: "motivo", etiqueta: "Motivo", numerica: false },
          ]}
          filas={reabs.map((r) => ({ clave: r.id, etiqueta: fecha(r.reabiertoEn), celdas: [quien(r.reabiertoPor), r.motivo] }))}
        />
      )}

      {guardada && (
        <TablaComparacionAF4
          id="titulo-fotografia"
          titulo={
            <span className="inline-flex items-center gap-1.5">
              {cambios > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
              Fotografía al cerrar
            </span>
          }
          detalle={`Tomada el ${fecha(guardada.tomadaEn)} · USD`}
          ariaLabel="Fotografía al cerrar contra hoy, en USD"
          columnas={[
            { clave: "cerrar", etiqueta: "Al cerrar", atenuada: true },
            { clave: "hoy", etiqueta: "Hoy" },
            { clave: "diferencia", etiqueta: "Diferencia" },
          ]}
          filas={filasFotografia(comparacion)}
        />
      )}

      {cierre && (
        <div className="rounded-xl border border-border bg-card">
          <HistorialGenerico id={cierre.id} codigoPais="PA" obtener={obtenerActividadCierre} />
        </div>
      )}
    </Pagina>
  );
}
