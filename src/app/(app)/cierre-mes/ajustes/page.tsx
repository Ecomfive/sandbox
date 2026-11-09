import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { SelectorEnlace } from "@/components/af4/selector-enlace";
import { TablaComparacionAF4, type FilaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora, leerPeriodo, mesEnCursoPanama, mesLargo, mesMedio, sumarMeses } from "@/lib/af4/fecha";
import { dinero, entero, porcentaje } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { ETIQUETA_CLASE_AJUSTE, ETIQUETA_ORIGEN_AJUSTE } from "@/lib/finanzas/ajustes-cierre";
import { nombresDePersonas } from "@/lib/finanzas/cargar-cierre";
import { cargarAjustesMes, cargarPrepagos } from "@/lib/finanzas/cargar-cierre-control";
import { lineasDevengoDelMes } from "@/lib/finanzas/devengos";
import { partidaXiii, proponerProvisiones } from "@/lib/finanzas/provisiones";
import { createServiceClient } from "@/lib/supabase/server";
import { EliminarAjuste, RegistrarPropuestas } from "./botones-ajustes";
import { CrearAjustePanel } from "./crear-ajuste-panel";

export const metadata = { title: "Asientos de ajuste" };

export const dynamic = "force-dynamic";

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });
const conSigno = (v: number) => dinero(v, "USD", { decimales: 2, conSigno: true });

function Registrado({ si }: { si: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${si ? "bg-success" : "bg-warning"}`} />
      {si ? "Registrado" : "Por registrar"}
    </span>
  );
}

export default async function AjustesCierrePage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("cierre-mes");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Cierre de mes" />;
  const sp = await searchParams;
  const enCurso = mesEnCursoPanama();
  const pedido = leerPeriodo(typeof sp.periodo === "string" ? sp.periodo : undefined);
  const periodo = pedido && pedido <= enCurso ? pedido : sumarMeses(enCurso, -1);
  const verNomina = usuario.modulos.includes("usuarios");
  const puedeNomina = verNomina && !usuario.modulosSoloLectura.includes("usuarios");
  const supabase = createServiceClient();

  const [ajustes, prepagos, cierre, unidades, tipos, nomina, corp] = await Promise.all([
    cargarAjustesMes(supabase, periodo),
    cargarPrepagos(supabase, true),
    supabase.from("fin_cierres").select("estado").eq("periodo", periodo).maybeSingle(),
    supabase.from("fin_unidades").select("id, nombre").eq("activo", true).neq("clase", "reparto").order("orden"),
    supabase.from("fin_tipos").select("id, nombre, seccion").in("seccion", ["ingresos", "costo_ventas", "administracion", "marketing", "finanzas", "otros", "impuesto_ganancias"]).order("orden"),
    verNomina ? supabase.from("nom_costo_mensual").select("unidad_id, bruto").eq("periodo", periodo).eq("tipo", "formal") : Promise.resolve(null),
    supabase.from("fin_unidades").select("id").eq("nombre", "CORPORATIVO").maybeSingle(),
  ]);
  const titulo = "Asientos de ajuste";
  const meses = Array.from({ length: 13 }, (_, i) => sumarMeses(enCurso, -i));
  const selector = (
    <SelectorEnlace
      etiqueta="Elegir mes"
      elegido={periodo}
      opciones={meses.map((m) => ({ valor: m, etiqueta: mesMedio(m), href: `/cierre-mes/ajustes?periodo=${m.slice(0, 7)}` }))}
    />
  );
  if ("error" in ajustes || "error" in prepagos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={titulo} filtros={selector} imprimir={false} />
        <EstadoVacioAF4 titulo="Falta la migración">{"error" in ajustes ? ajustes.error : (prepagos as { error: string }).error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const cerrado = cierre.data?.estado === "cerrado";
  const puedeEscribir = !usuario.modulosSoloLectura.includes("cierre-mes") && !cerrado;
  const nombreUnidad = new Map((unidades.data ?? []).map((u) => [u.id as string, u.nombre as string]));
  const nombreTipo = new Map((tipos.data ?? []).map((t) => [t.id as string, t.nombre as string]));
  const personas = await nombresDePersonas(supabase, ajustes.map((a) => a.creadoPor));

  // Devengos que tocan al mes
  const registradosDevengo = new Set(ajustes.filter((a) => a.origen === "devengo").map((a) => a.origenRef));
  const devengos = prepagos.flatMap((p) => lineasDevengoDelMes(p, periodo).map((l) => ({ p, l, hecho: registradosDevengo.has(`${p.id}:${l.ref}`) })));
  // Provisiones de la nómina (solo con Usuarios y roles)
  const provisiones =
    verNomina && nomina && !nomina.error && corp.data
      ? proponerProvisiones(
          (nomina.data ?? []).map((n) => ({ unidadId: (n.unidad_id as string | null) ?? null, bruto: Number(n.bruto) })),
          corp.data.id as string,
        )
      : [];
  const registradasProv = new Set(ajustes.filter((a) => a.origen === "provision_nomina").map((a) => a.origenRef));
  const visibles = verNomina ? ajustes : ajustes.filter((a) => a.origen !== "provision_nomina");
  const efecto = Math.round(ajustes.reduce((s, a) => s + a.efecto, 0) * 100) / 100;
  const xiii = partidaXiii(periodo);

  const filasAjustes: FilaComparacionAF4[] = visibles.map((a) => ({
    clave: a.id,
    etiqueta: (
      <span className="flex flex-col gap-0.5 font-normal">
        <span className="font-medium">{a.concepto}</span>
        <span className="text-xs text-muted-foreground">
          {ETIQUETA_CLASE_AJUSTE[a.clase]} · {ETIQUETA_ORIGEN_AJUSTE[a.origen]} · {personas.get(a.creadoPor ?? "") ?? "—"}, {fechaHora(a.creadoEn)}
        </span>
      </span>
    ),
    celdas: [
      <span key="l" className="flex flex-col gap-0.5 text-left text-xs">
        {a.lineas.map((l, i) => (
          <span key={i}>
            {l.unidad} · {l.tipo} · <span className="tabular-nums">{usd(l.monto)}</span>
          </span>
        ))}
      </span>,
      conSigno(a.efecto),
      puedeEscribir && (a.origen !== "provision_nomina" || puedeNomina) ? <EliminarAjuste key="e" id={a.id} concepto={a.concepto} /> : "",
    ],
  }));
  if (visibles.length > 1) {
    filasAjustes.push({ clave: "total", etiqueta: "Total", peso: "total", celdas: ["", conSigno(efecto), ""] });
  }

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={titulo}
        filtros={selector}
        imprimir={false}
        acciones={
          puedeEscribir ? (
            <CrearAjustePanel
              periodo={periodo}
              mes={mesMedio(periodo)}
              unidades={(unidades.data ?? []).map((u) => ({ id: u.id as string, nombre: u.nombre as string }))}
              tipos={(tipos.data ?? []).map((t) => ({ id: t.id as string, nombre: t.nombre as string }))}
            />
          ) : undefined
        }
      />

      <KpiGroup titulo={`Ajustes de ${mesLargo(periodo)}`}>
        <KpiGrid compacta>
          <KpiCard compacta titulo="Ajustes" valor={entero(ajustes.length)} />
          <KpiCard compacta titulo="Efecto en el resultado" tono={efecto < 0 ? "warning" : "neutral"} valor={conSigno(efecto)} />
          <KpiCard compacta titulo="Devengos por registrar" tono={devengos.some((d) => !d.hecho) ? "warning" : "neutral"} valor={entero(devengos.filter((d) => !d.hecho).length)} />
          {verNomina && (
            <KpiCard compacta titulo="Provisiones por registrar" tono={provisiones.some((p) => !registradasProv.has(p.clave)) ? "warning" : "neutral"} valor={entero(provisiones.filter((p) => !registradasProv.has(p.clave)).length)} />
          )}
          {cerrado && <KpiCard compacta titulo="Mes" tono="success" valor="Cerrado" />}
        </KpiGrid>
      </KpiGroup>

      <TablaComparacionAF4
        id="titulo-ajustes"
        titulo="Registrados"
        detalle="EERR = SI · flujo = NO · USD"
        ariaLabel={`Asientos de ajuste de ${mesLargo(periodo)}`}
        etiquetaConcepto="Ajuste"
        columnas={[
          { clave: "lineas", etiqueta: "Líneas en el libro", numerica: false },
          { clave: "efecto", etiqueta: "Efecto" },
          { clave: "acciones", etiqueta: <span className="sr-only">Acciones</span>, numerica: false },
        ]}
        filas={filasAjustes.length ? filasAjustes : [{ clave: "vacio", etiqueta: <span className="font-normal text-muted-foreground">Sin ajustes en el mes</span>, celdas: ["", "", ""] }]}
      />

      <TablaComparacionAF4
        id="titulo-devengos"
        titulo="Devengos de gastos prepagados"
        detalle={`${entero(devengos.length)} del mes`}
        accion={puedeEscribir ? <RegistrarPropuestas periodo={periodo} que="devengos" pendientes={devengos.filter((d) => !d.hecho).length} /> : undefined}
        ariaLabel="Devengos del mes"
        etiquetaConcepto="Concepto"
        columnas={[
          { clave: "donde", etiqueta: "Tienda · tipo", numerica: false },
          { clave: "monto", etiqueta: "Monto" },
          { clave: "estado", etiqueta: "Estado", numerica: false },
        ]}
        filas={
          devengos.length
            ? devengos.map(({ p, l, hecho }) => ({
                clave: `${p.id}:${l.ref}`,
                etiqueta: <span className="font-normal">{l.concepto}</span>,
                celdas: [`${nombreUnidad.get(p.unidadId) ?? "—"} · ${nombreTipo.get(p.tipoId) ?? "—"}`, usd(l.monto), <Registrado key="r" si={hecho} />],
              }))
            : [{ clave: "vacio", etiqueta: <span className="font-normal text-muted-foreground">Ningún gasto prepagado toca este mes</span>, celdas: ["", "", ""] }]
        }
      />

      {verNomina && (
        <TablaComparacionAF4
          id="titulo-provisiones"
          titulo="Provisiones de la planilla"
          detalle={`Planilla formal · XIII: partida ${xiii.partida}, se paga el ${xiii.pago.split("-").reverse().join("/")}`}
          accion={puedeEscribir && puedeNomina ? <RegistrarPropuestas periodo={periodo} que="provisiones" pendientes={provisiones.filter((p) => !registradasProv.has(p.clave)).length} /> : undefined}
          ariaLabel="Provisiones de la planilla del mes"
          etiquetaConcepto="Provisión"
          columnas={[
            { clave: "base", etiqueta: "Salario devengado" },
            { clave: "tasa", etiqueta: "Tasa" },
            { clave: "monto", etiqueta: "Provisión" },
            { clave: "estado", etiqueta: "Estado", numerica: false },
          ]}
          filas={
            provisiones.length
              ? provisiones.flatMap((p) => [
                  {
                    clave: p.clave,
                    etiqueta: p.nombre,
                    peso: "subtotal" as const,
                    celdas: [usd(p.base), porcentaje(p.tasa * 100, { decimales: 3 }), usd(p.monto), <Registrado key="r" si={registradasProv.has(p.clave)} />],
                  },
                  ...p.lineas.map((l) => ({
                    clave: `${p.clave}:${l.unidadId}`,
                    etiqueta: <span className="pl-3 font-normal">{nombreUnidad.get(l.unidadId) ?? "—"}</span>,
                    celdas: [usd(l.base), "", usd(l.monto), ""],
                  })),
                ])
              : [{ clave: "vacio", etiqueta: <span className="font-normal text-muted-foreground">Sin planilla formal en el mes</span>, celdas: ["", "", "", ""] }]
          }
        />
      )}
    </Pagina>
  );
}
