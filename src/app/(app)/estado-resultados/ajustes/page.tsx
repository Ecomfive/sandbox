import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { AJUSTES, NOMBRE_AJUSTE, cargarAjustes, efectosDepreciacion, efectosNomina, type ClaveAjuste } from "@/lib/finanzas/config";
import { createServiceClient } from "@/lib/supabase/server";
import { AjustesFinanzas, type AjusteVista } from "./ajustes-finanzas";
import { BaseRepartoAjuste, CanalesAjuste, IntercompaniaAjuste, type TipoIntercompania, type UnidadCanal } from "./ajustes-estados";
import { canalSugerido } from "@/lib/finanzas/canales";
import { leerBaseReparto } from "@/lib/finanzas/reparto";
import { FormularioDestinatarios } from "./destinatarios";
import { cargarDestinatarios } from "@/lib/finanzas/cargar-informe-envio";
import { fechaCorta, hoyPanama } from "@/lib/af4/fecha";

export const metadata = { title: "Ajustes del estado de resultados" };

export const dynamic = "force-dynamic";

const SECCIONES_EERR = ["ingresos", "costo_ventas", "administracion", "finanzas", "marketing", "otros", "impuesto_ganancias"];
const SECCIONES_EBITDA = ["ingresos", "costo_ventas", "administracion", "marketing"];


type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function AjustesEstadoResultadosPage() {
  const usuario = await requireModulo("estado-resultados");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("estado-resultados");
  const supabase = createServiceClient();
  const anio = Number(hoyPanama().slice(0, 4));
  const desde = `${anio}-01-01`;
  const hasta = `${anio}-12-01`;

  const [ajustes, primero, ultimo, alta, nomina, unidadesCanal, tiposIc, baseReparto, conOrdenes, destinatarios] = await Promise.all([
    cargarAjustes(supabase),
    supabase.from("fin_movimientos").select("periodo").gte("periodo", desde).lte("periodo", hasta).order("periodo").limit(1),
    supabase.from("fin_movimientos").select("periodo").gte("periodo", desde).lte("periodo", hasta).order("periodo", { ascending: false }).limit(1),
    supabase.from("fin_tipos").select("id").eq("nombre", "Alta Bien de Uso").maybeSingle(),
    supabase.from("fin_movimientos").select("periodo").eq("origen", "nomina").limit(1000),
    supabase.from("fin_unidades").select("id, nombre, clase, canal").eq("activo", true).eq("clase", "tienda").order("orden"),
    supabase.from("fin_tipos").select("id, nombre, seccion, intercompania").order("orden"),
    supabase.from("fin_config").select("valor").eq("clave", "base_reparto").maybeSingle(),
    supabase.from("ven_resumen_mensual").select("unidad_id").limit(1000),
    cargarDestinatarios(supabase),
  ]);

  if ("error" in ajustes) {
    return (
      <Pagina ancho="angosta" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Ajustes" oculto />
        <EstadoVacioAF4 titulo="No se pudieron leer los ajustes">{ajustes.error}</EstadoVacioAF4>
      </Pagina>
    );
  }

  // Lo que cambia al encender la depreciación, en los meses del año que cubre el libro.
  const inicio = String(primero.data?.[0]?.periodo ?? "").slice(0, 10);
  const fin = String(ultimo.data?.[0]?.periodo ?? "").slice(0, 10);
  const conLibro = Boolean(inicio && fin);
  const [dep, altas] = await Promise.all([
    conLibro ? supabase.from("fin_depreciacion_mensual").select("monto").gte("periodo", inicio).lte("periodo", fin) : Promise.resolve({ data: [] }),
    conLibro
      ? supabase
          .from("fin_movimientos")
          .select("monto, fin_tipos(seccion)")
          .eq("en_eerr", true)
          .gte("periodo", inicio)
          .lte("periodo", fin)
          .or(alta.data?.id ? `es_bien_de_uso.eq.true,tipo_id.eq.${alta.data.id}` : "es_bien_de_uso.eq.true")
          .limit(5000)
      : Promise.resolve({ data: [] }),
  ]);
  const filasAltas = ((altas.data ?? []) as { monto: number | string; fin_tipos: Uno<{ seccion: string }> }[]).filter((a) =>
    SECCIONES_EERR.includes(uno(a.fin_tipos)?.seccion ?? ""),
  );
  const meses = conLibro ? (Number(fin.slice(5, 7)) - Number(inicio.slice(5, 7)) + 1) : 0;
  const efectoDep = efectosDepreciacion({
    anio,
    meses,
    depreciacion: (dep.data ?? []).reduce((a: number, d: { monto: number | string }) => a + Number(d.monto), 0),
    altas: filasAltas.reduce((a, x) => a + Number(x.monto), 0),
    altasEbitda: filasAltas.filter((x) => SECCIONES_EBITDA.includes(uno(x.fin_tipos)?.seccion ?? "")).reduce((a, x) => a + Number(x.monto), 0),
    altasMovimientos: filasAltas.length,
  });
  const efectoNom = efectosNomina(new Set((nomina.data ?? []).map((n) => String(n.periodo).slice(0, 7))).size);

  const ids = [...new Set(AJUSTES.map((c) => ajustes[c].actualizadoPor).filter((x): x is string => Boolean(x)))];
  const personas = ids.length ? ((await supabase.from("perfiles").select("id, nombre").in("id", ids)).data ?? []) : [];
  const nombre = new Map(personas.map((p) => [p.id as string, (p.nombre as string | null) ?? null]));

  const efectos: Record<ClaveAjuste, { alEncender: string; alApagar: string }> = { depreciacion_en_eerr: efectoDep, nomina_al_libro: efectoNom };
  const vista: AjusteVista[] = AJUSTES.map((c) => {
    const a = ajustes[c];
    const quien = a.actualizadoPor ? nombre.get(a.actualizadoPor) : null;
    return {
      clave: c,
      nombre: NOMBRE_AJUSTE[c],
      activo: a.activo,
      ultimoCambio: a.actualizadoPor && a.actualizadoEn ? [fechaCorta(a.actualizadoEn.slice(0, 10)), quien].filter(Boolean).join(" · ") : null,
      efectoAlEncender: efectos[c].alEncender,
      efectoAlApagar: efectos[c].alApagar,
    };
  });

  // Estados financieros (migración 0929): base de reparto, canal de cada tienda y tipos intercompañía.
  const con0142 = !unidadesCanal.error && !tiposIc.error;
  const tiendasConOrdenes = new Set(((conOrdenes.error ? [] : conOrdenes.data) ?? []).map((o) => o.unidad_id as string));
  // Clientes de fulfillment (0965/0966): consulta aparte, sin las columnas no se muestra el control.
  const ff = await supabase.from("fin_unidades").select("id, cliente_fulfillment, tarifa_fulfillment").eq("clase", "tienda"); // consulta-acotada: pocas tiendas
  const ffPor = new Map(
    (ff.error ? [] : (ff.data ?? [])).map((u) => [
      u.id as string,
      { cliente: u.cliente_fulfillment === true, tarifa: u.tarifa_fulfillment === null ? null : Number(u.tarifa_fulfillment) },
    ]),
  );
  const canales: UnidadCanal[] = con0142
    ? (unidadesCanal.data ?? []).map((u) => ({
        id: u.id as string,
        nombre: u.nombre as string,
        canal: (u.canal as string | null) ?? null,
        sugerido: canalSugerido({ nombre: u.nombre as string, clase: u.clase as string, ordenesShopify: tiendasConOrdenes.has(u.id as string) ? 1 : 0 }),
        fulfillment: ffPor.get(u.id as string) ?? null,
      }))
    : [];
  const tipos: TipoIntercompania[] = con0142
    ? (tiposIc.data ?? [])
        .filter((t) => !["informacion", "sin_clasificar", "pago_tdc"].includes(t.seccion as string))
        .map((t) => ({ id: t.id as string, nombre: t.nombre as string, intercompania: t.intercompania === true }))
    : [];

  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Ajustes" imprimir={false} />
      <MarcoAF4 id="titulo-ajustes" titulo="Interruptores del Estado de resultados" sinRelleno>
        <AjustesFinanzas ajustes={vista} puedeEscribir={puedeEscribir} />
      </MarcoAF4>
      {con0142 ? (
        <>
          <BaseRepartoAjuste base={leerBaseReparto(baseReparto.data?.valor)} puedeEscribir={puedeEscribir} />
          <CanalesAjuste unidades={canales} puedeEscribir={puedeEscribir} />
          <IntercompaniaAjuste tipos={tipos} puedeEscribir={puedeEscribir} />
        </>
      ) : (
        <EstadoVacioAF4 compacto titulo="Falta correr la migración 0929 (estados financieros) en Supabase" />
      )}
      <MarcoAF4 id="destinatarios" titulo="Destinatarios de los informes">
        {"error" in destinatarios ? (
          <p role="alert" className="m-0 text-sm text-destructive">
            {destinatarios.error}
          </p>
        ) : (
          <FormularioDestinatarios correos={destinatarios.correos} telefonos={destinatarios.telefonos} puedeEscribir={puedeEscribir} />
        )}
      </MarcoAF4>
    </Pagina>
  );
}
