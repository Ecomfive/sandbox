import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { ControlPeriodo } from "@/components/af4/control-periodo";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { NotasMes } from "@/components/finanzas/notas-mes";
import { SelectorEntidad } from "@/components/finanzas/selector-entidad";
import { KpiCard, KpiGrid, KpiGroup, type Tono } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { mesCorto, mesEnCursoPanama } from "@/lib/af4/fecha";
import { dinero, dineroKpi, esCero } from "@/lib/af4/formato";
import { elegirPeriodoAF4, opcionesPeriodo, rangoPeriodo } from "@/lib/af4/periodo";
import { requireModulo } from "@/lib/auth";
import { armarBalance } from "@/lib/finanzas/balance";
import { cargarBalance, ENTIDAD_INVENTARIO } from "@/lib/finanzas/cargar-balance";
import { cargarNotaMes } from "@/lib/finanzas/cargar-notas";
import { contextoEntidad } from "@/lib/finanzas/contexto-entidad";
import { conParametros, parametrosVista } from "@/lib/finanzas/entidades";
import { rangoMeses } from "@/lib/finanzas/flujo";
import { createServiceClient } from "@/lib/supabase/server";
import { FotoInventario } from "./foto-inventario";

export const metadata = { title: "Balance general" };

export const dynamic = "force-dynamic";

const RUTA = "/balance-general";
const PREDETERMINADO = "u6";
const tono = (v: number): Tono => (v < 0 ? "destructive" : "neutral");

export default async function BalanceGeneralPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("balance-general");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Balance general" />;
  const puedeEscribir = !usuario.modulosSoloLectura.includes("balance-general");
  const puedeNotas = usuario.modulos.includes("estado-resultados") && !usuario.modulosSoloLectura.includes("estado-resultados");
  const params = await searchParams;
  const supabase = createServiceClient();
  const ctx = await contextoEntidad(supabase, params);
  // El balance va siempre en dólares (la cartera y los saldos se valoran al cierre en USD).
  const vista = { ...ctx.vista, moneda: "USD", local: false };
  const conservar = ctx.opciones.length ? parametrosVista(vista) : {};
  const mesEnCurso = mesEnCursoPanama();

  const primero = await supabase.from("fin_movimientos").select("periodo").order("periodo").limit(1);
  const inicio = primero.data?.[0]?.periodo ? String(primero.data[0].periodo).slice(0, 10) : null;
  if (primero.error || !inicio) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Balance general" imprimir={false} />
        <EstadoVacioAF4 titulo="Todavía no hay movimientos en el libro" accion={{ href: "/libro-movimientos", etiqueta: "Ir al libro de movimientos" }} />
      </Pagina>
    );
  }

  const disponibles = rangoMeses(inicio, mesEnCurso);
  const opcionesP = { predeterminado: PREDETERMINADO, ultimos: [3, 6, 12], incluirEnCurso: true };
  const periodo = elegirPeriodoAF4(params.periodo, disponibles, mesEnCurso, opcionesP);
  const cortes = periodo.meses;
  const periodoQuery = periodo.clave === PREDETERMINADO ? null : periodo.clave;
  const ultimo = cortes[cortes.length - 1];

  const [datos, nota, actualizado] = await Promise.all([
    cargarBalance(supabase, cortes, vista.entidad, mesEnCurso),
    cargarNotaMes(supabase, ultimo),
    ultimaActualizacionLibro(supabase),
  ]);

  const filtros = (
    <>
      <ControlPeriodo periodo={periodo} opciones={opcionesPeriodo(disponibles, mesEnCurso, opcionesP)} href={(c) => conParametros(RUTA, { ...conservar, periodo: c === PREDETERMINADO ? null : c })} />
      <SelectorEntidad ruta={RUTA} opciones={ctx.opciones} vista={vista} otros={{ periodo: periodoQuery }} conMoneda={false} />
    </>
  );

  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Balance general" filtros={filtros} imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo armar el balance">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }

  const b = armarBalance(cortes, datos.insumos);
  const k = cortes.length - 1;
  const diferencia = b.diferencia[k];
  const conInventario = !vista.entidad || vista.entidad.codigo === ENTIDAD_INVENTARIO;
  const contexto = [vista.entidad?.razon_social ?? (ctx.opciones.length ? "Consolidado" : null), "USD"].filter(Boolean).join(" · ");
  const columnas = cortes.map((m, i) => ({
    clave: m,
    etiqueta: mesCorto(m),
    detalle: m >= mesEnCurso ? "al día" : "cierre",
    ...(!esCero(b.diferencia[i])
      ? { marca: { tono: "destructive" as const, texto: "No cuadra" } }
      : datos.sinInventario.includes(m)
        ? { marca: { tono: "warning" as const, texto: "Sin foto del inventario" } }
        : {}),
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Balance general"
        filtros={filtros}
        datosHasta={ultimo}
        actualizado={actualizado}
        acciones={puedeEscribir && conInventario && cortes.includes(mesEnCurso) ? <FotoInventario mes={mesEnCurso} /> : undefined}
      />

      <FilaKpiAF4>
        <KpiAF4 titulo="Total activo" valor={dineroKpi(b.activo[k])} subtexto={`Al cierre de ${mesCorto(ultimo)}`} />
        <KpiAF4 titulo="Total pasivo" valor={dineroKpi(b.pasivo[k])} />
        <KpiAF4 titulo="Patrimonio" destacado tono={tono(b.patrimonio[k])} valor={dineroKpi(b.patrimonio[k])} />
        <KpiAF4 titulo="Diferencia por cuadrar" tono={esCero(diferencia) ? "success" : "warning"} valor={dinero(diferencia)} href="/balance-general/partidas" />
      </FilaKpiAF4>

      {(datos.avisos.length > 0 || datos.sinInventario.length > 0 || !datos.conSaldos) && (
        <KpiGroup titulo="Para revisar">
          <KpiGrid compacta>
            {!datos.conSaldos && <KpiCard compacta tono="warning" titulo="Caja sin saldos iniciales" valor="—" href="/flujo-caja/saldos" />}
            {datos.sinInventario.length > 0 && (
              <KpiCard compacta tono="warning" titulo="Meses sin foto del inventario" valor={String(datos.sinInventario.length)} href="/rentabilidad/inventario" />
            )}
            {datos.avisos.map((a) => (
              <KpiCard key={a} compacta tono="warning" titulo={a} valor="—" />
            ))}
          </KpiGrid>
        </KpiGroup>
      )}

      <TablaFinanciera
        id="tabla-balance"
        titulo="Balance general"
        detalle={`${contexto} · ${rangoPeriodo(periodo)}`}
        columnas={columnas}
        filas={b.filas}
        conTotal={false}
        desplegado="nada"
        ariaLabel="Balance general al cierre de cada mes"
        textoDesplegar="detalle"
      />

      <NotasMes id="notas-balance" periodo={ultimo} texto={nota.texto} faltaMigracion={nota.faltaMigracion} puedeEscribir={puedeNotas} />
    </Pagina>
  );
}
