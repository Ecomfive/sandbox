import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { hoyPanama, leerPeriodo, mesCorto, mesMedio, sumarMeses, ultimosMeses } from "@/lib/af4/fecha";
import { dineroKpi, entero } from "@/lib/af4/formato";
import { calcularVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { SIN_TIENDA, filtrarUnidades } from "@/lib/finanzas/tiendas-permitidas";
import { UNIDAD_SIN_ASIGNAR } from "@/lib/finanzas/libro-excel";
import { leerMovimientosCalidad, leerProveedores, leerRevisados } from "@/lib/finanzas/cargar-calidad";
import { detectarAtipicos } from "@/lib/finanzas/duplicados";
import { proveedorDe } from "@/lib/finanzas/proveedores";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { ETIQUETA_SECCION, type FilaMovimiento } from "./def-movimientos";
import { TablaMovimientos } from "./tabla-movimientos";

export const metadata = { title: "Libro de movimientos" };

export const dynamic = "force-dynamic";

interface FilaBase {
  id: string;
  periodo: string;
  fecha_pago: string | null;
  fecha_registro: string | null;
  descripcion: string;
  monto: number | string;
  en_eerr: boolean;
  en_flujo: boolean;
  tipo_texto: string | null;
  origen: string;
  fecha_servicio: string | null;
  unidad_id: string;
  tipo_id: string | null;
  cuenta_id: string | null;
  editado_a_mano: boolean | null;
  factura_numero: string | null;
  ruc_proveedor: string | null;
  anulado_en?: string | null;
  anulado_motivo?: string | null;
  fin_unidades: Uno<{ nombre: string }>;
  fin_tipos: Uno<{ nombre: string; seccion: string }>;
  fin_cuentas: Uno<{ nombre: string }>;
}

/** PostgREST devuelve la fila relacionada como objeto o como arreglo según cómo infiera la relación. */
type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function LibroMovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireModulo("libro-movimientos");
  const supabase = createServiceClient();
  const { periodo, mes, mov } = await searchParams;
  const meses = ultimosMeses(hoyPanama(), 12);
  // `?periodo=AAAA-MM` (el patrón del Portal AF4); `?mes=AAAA-MM-01` se sigue aceptando.
  // `?mov=<id>` (desde el desglose del EERR): abre ese movimiento en su mes.
  const movPedido = typeof mov === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mov) ? mov : null;
  const delMovimiento = movPedido ? await supabase.from("fin_movimientos").select("periodo").eq("id", movPedido).maybeSingle() : null;
  const mesMovimiento = delMovimiento?.data?.periodo ? String(delMovimiento.data.periodo).slice(0, 10) : null;
  const pedido = mesMovimiento ?? leerPeriodo(periodo) ?? leerPeriodo(mes);

  // El mes que se ve: el pedido, o el último que tenga movimientos.
  const ultimo = await supabase.from("fin_movimientos").select("periodo").order("periodo", { ascending: false }).limit(1);
  if (ultimo.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Libro de movimientos" imprimir={false} />
        <EstadoVacioAF4 titulo="Falta el libro de movimientos">Correr la migración 0901 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const ultimoMes = ultimo.data?.[0]?.periodo ? String(ultimo.data[0].periodo).slice(0, 10) : meses[meses.length - 1];
  const elegido = pedido && meses.includes(pedido) ? pedido : meses.includes(ultimoMes) ? ultimoMes : meses[meses.length - 1];
  const anterior = sumarMeses(elegido, -1);
  // Permisos por tienda (mejora 99): solo los movimientos de las tiendas que la persona puede ver.
  const permitidas = await cargarTiendasPermitidas();
  const soloSuyas = <Q,>(q: Q): Q =>
    permitidas ? ((q as unknown as { in: (c: string, v: string[]) => unknown }).in("unidad_id", permitidas.length ? permitidas : [SIN_TIENDA]) as Q) : q;

  const columnas =
    "id, periodo, fecha_pago, fecha_registro, fecha_servicio, descripcion, monto, en_eerr, en_flujo, tipo_texto, origen, unidad_id, tipo_id, cuenta_id, editado_a_mano, factura_numero, ruc_proveedor, fin_unidades(nombre), fin_tipos(nombre, seccion), fin_cuentas(nombre)";
  const leerMes = (cols: string) =>
    traerTodasConError<FilaBase>((desde, hasta) =>
      soloSuyas(
        supabase
          .from("fin_movimientos")
          .select(cols)
          .eq("periodo", elegido)
          // Los asientos de ajuste del cierre (migración 0927) se ven aparte, en Cierre de mes › Asientos de ajuste.
          .neq("origen", "ajuste_cierre"),
      )
        .order("fecha_pago", { ascending: false, nullsFirst: false })
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<{ data: FilaBase[] | null; error: unknown }>,
    );
  const [movs, sinTipo, sinTienda, catalogoTiendas, catalogoTipos, catalogoCuentas, previos, actualizado, prov, revisados] = await Promise.all([
    // Con la migración 0925 trae si está anulado; sin ella, sin esas columnas.
    leerMes(`${columnas}, anulado_en, anulado_motivo`).then((r) => (r.error ? leerMes(columnas) : r)),
    soloSuyas(supabase.from("fin_movimientos").select("id", { count: "exact", head: true }).is("tipo_id", null)),
    supabase
      .from("fin_movimientos")
      .select("id, fin_unidades!inner(nombre)", { count: "exact", head: true })
      .eq("fin_unidades.nombre", UNIDAD_SIN_ASIGNAR),
    supabase.from("fin_unidades").select("id, nombre").eq("activo", true).neq("nombre", UNIDAD_SIN_ASIGNAR).order("orden"),
    supabase.from("fin_tipos").select("id, nombre").neq("seccion", "sin_clasificar").order("orden"),
    supabase.from("fin_cuentas").select("id, nombre").eq("activo", true).order("nombre"),
    soloSuyas(supabase.from("fin_movimientos").select("id", { count: "exact", head: true }).eq("periodo", anterior)),
    ultimaActualizacionLibro(supabase),
    leerProveedores(supabase),
    leerRevisados(supabase),
  ]);
  // Atípicos del mes: contra los 6 meses anteriores de cada tipo.
  const ventana = await leerMovimientosCalidad(supabase, sumarMeses(elegido, -6), prov.catalogo);
  const atipicos = "error" in ventana ? new Map() : detectarAtipicos(ventana.filter((x) => !x.anulado && x.periodo <= elegido));
  const nombreProveedor = new Map(prov.proveedores.map((p) => [p.id, p.nombre]));

  const filas: FilaMovimiento[] = (movs.data ?? []).map((m) => {
    const unidad = uno(m.fin_unidades);
    const tipo = uno(m.fin_tipos);
    const cuenta = uno(m.fin_cuentas);
    const tienda = unidad?.nombre ?? "—";
    const estado: FilaMovimiento["estado"] = m.anulado_en
      ? "Anulado"
      : tienda === UNIDAD_SIN_ASIGNAR
        ? "Sin tienda"
        : tipo
          ? "Clasificado"
          : "Sin tipo";
    const at = revisados.claves.has(`atip:${m.id}`) ? null : atipicos.get(m.id);
    const proveedorId = proveedorDe({ descripcion: m.descripcion ?? "", ruc: m.ruc_proveedor }, prov.catalogo);
    return {
      id: m.id,
      fecha: m.fecha_pago ?? m.fecha_registro,
      tienda,
      tipo: tipo?.nombre ?? m.tipo_texto ?? "—",
      seccion: ETIQUETA_SECCION[tipo?.seccion ?? "sin_clasificar"] ?? "—",
      descripcion: m.descripcion,
      cuenta: cuenta?.nombre ?? "—",
      eerr: m.en_eerr ? "Sí" : "No",
      flujo: m.en_flujo ? "Sí" : "No",
      monto: Number(m.monto),
      estado,
      origen: m.origen,
      periodo: String(m.periodo).slice(0, 10),
      fechaPago: m.fecha_pago,
      fechaServicio: m.fecha_servicio,
      unidadId: m.unidad_id,
      tipoId: m.tipo_id,
      cuentaId: m.cuenta_id,
      editado: m.editado_a_mano === true,
      proveedor: proveedorId ? (nombreProveedor.get(proveedorId) ?? "Sin proveedor") : "Sin proveedor",
      revision: at ? "Atípico" : "Normal",
      facturaNumero: m.factura_numero,
      ruc: m.ruc_proveedor,
      anulado: !!m.anulado_en,
      anuladoMotivo: m.anulado_motivo ?? null,
      atipico: at ? { veces: at.veces, mediana: at.mediana } : null,
    };
  });

  const alEerr = filas.filter((f) => f.eerr === "Sí");
  const pendientesMes = filas.filter((f) => f.estado === "Sin tienda" || f.estado === "Sin tipo").length;
  const atipicosMes = filas.filter((f) => f.atipico).length;
  const nSinTienda = sinTienda.count ?? 0;
  const nSinTipo = sinTipo.count ?? 0;
  const movimientosAntes = previos.error ? 0 : (previos.count ?? 0);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Libro de movimientos"
        filtros={
          <ControlSegmentado
            etiqueta="Elegir mes"
            opciones={meses.map((m) => ({ valor: m, etiqueta: mesCorto(m), href: `/libro-movimientos?periodo=${m.slice(0, 7)}` }))}
            elegido={elegido}
            maxBotones={12}
          />
        }
        datosHasta={ultimo.data?.length ? ultimoMes : null}
        actualizado={actualizado}
        descarga={{ href: `/api/exportar-libro-contador?periodo=${elegido.slice(0, 7)}`, etiqueta: "Libro para el contador" }}
        imprimir={false}
      />

      <div className="flex flex-col gap-3">
        <FilaKpiAF4>
          <KpiAF4
            titulo="Movimientos"
            valor={entero(filas.length)}
            comparaciones={movimientosAntes > 0 ? [{ v: calcularVariacion(filas.length, movimientosAntes, "neutro"), contra: mesCorto(anterior) }] : []}
            subtexto={mesMedio(elegido)}
          />
          <KpiAF4
            titulo="Al Estado de resultados"
            valor={dineroKpi(alEerr.reduce((a, f) => a + f.monto, 0))}
            subtexto={`${entero(alEerr.length)} movimientos · USD`}
            href="/estado-resultados"
          />
        </FilaKpiAF4>
        <KpiGroup titulo="Por clasificar">
          <KpiGrid compacta>
            <KpiCard compacta tono={pendientesMes ? "warning" : "success"} titulo="Este mes" valor={entero(pendientesMes)} href="/libro-movimientos/pendientes" />
            <KpiCard
              compacta
              tono={nSinTienda > 0 ? "warning" : "neutral"}
              titulo="Sin tienda (todo el libro)"
              valor={entero(nSinTienda)}
              href="/libro-movimientos/pendientes"
            />
            <KpiCard
              compacta
              tono={nSinTipo > 0 ? "warning" : "neutral"}
              titulo="Sin tipo (todo el libro)"
              valor={entero(nSinTipo)}
              href="/libro-movimientos/pendientes"
            />
            <KpiCard compacta tono={atipicosMes ? "warning" : "neutral"} titulo="Montos atípicos (este mes)" valor={entero(atipicosMes)} href="/libro-movimientos/revisar" />
          </KpiGrid>
        </KpiGroup>
      </div>

      <TablaMovimientos
        filas={filas}
        tiendas={filtrarUnidades(permitidas, (catalogoTiendas.data ?? []) as { id: string; nombre: string }[])}
        tipos={(catalogoTipos.data ?? []) as { id: string; nombre: string }[]}
        cuentas={(catalogoCuentas.data ?? []) as { id: string; nombre: string }[]}
        mes={elegido}
        abrirInicial={mesMovimiento === elegido ? movPedido : null}
        puedeEscribir={!usuario.modulosSoloLectura.includes("libro-movimientos")}
        iaDisponible={!!process.env.ANTHROPIC_API_KEY}
      />
    </Pagina>
  );
}
