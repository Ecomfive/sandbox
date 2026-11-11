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
import { hoyPanama, mesCorto, sumarMeses } from "@/lib/af4/fecha";
import { dinero, entero, porcentaje } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { GUIAS } from "@/lib/ayuda/contenido";
import { CLAVE_GUIA_OPERACION, enlaceManual, SECCION_MANUAL } from "@/lib/finanzas/estado-sistema";
import { META_CON_ESTADO, pesoCausas, porDimension, resumenPorMes, textosSinCausa, type FilaDimension } from "@/lib/monday/causas";
import { cargarCausas, cargarConfigMonday, cargarDespachos } from "@/lib/monday/cargar";
import { grupoDeEstado } from "@/lib/monday/columnas";
import { mondayConfigurado } from "@/lib/monday/sincronizar";
import { administraIntegraciones } from "@/lib/quickbooks/permiso";
import { createServiceClient } from "@/lib/supabase/server";
import { CatalogoCausas, ConfigTablero, EstadosTablero, LeerMondayAhora } from "./controles-monday";

export const metadata = { title: "Monday" };

export const dynamic = "force-dynamic";

const TITULO = "Despachos de Monday";
const VENTANAS = [3, 6, 12] as const;

function Aviso({ tono, children }: { tono: "error" | "aviso"; children: ReactNode }) {
  return (
    <p role={tono === "error" ? "alert" : "status"} className="m-0 flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tono === "error" ? "bg-destructive" : "bg-warning"}`} />
      <span>{children}</span>
    </p>
  );
}

function Punto({ ok, texto }: { ok: boolean | null; texto: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok === null ? "bg-muted-foreground" : ok ? "bg-success" : "bg-destructive"}`} />
      {texto}
    </span>
  );
}

export default async function MondayPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("deliverys");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Deliverys" />;
  const params = await searchParams;
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;
  const n = VENTANAS.find((v) => `u${v}` === params.periodo) ?? 3;
  const desde = sumarMeses(mesEnCurso, -(n - 1));
  const administra = administraIntegraciones(usuario);
  const puedeEditar = !usuario.modulosSoloLectura.includes("deliverys");
  const guia = GUIAS.find((g) => g.clave === CLAVE_GUIA_OPERACION);
  const manual = enlaceManual(guia?.secciones ?? [], SECCION_MANUAL.monday);
  const token = mondayConfigurado();

  const [config, causas] = await Promise.all([cargarConfigMonday(supabase), cargarCausas(supabase)]);
  if ("error" in config || "error" in causas) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={TITULO} imprimir={false} />
        <EstadoVacioAF4 titulo="Falta la migración">{"error" in config ? config.error : "error" in causas ? causas.error : null}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const despachos = await cargarDespachos(supabase, desde, mesEnCurso, causas);
  const lista = "error" in despachos ? [] : despachos;
  const meses = Array.from({ length: n }, (_, i) => sumarMeses(desde, i));
  const resumen = resumenPorMes(lista, hoy);
  const filasMes = meses.map((m) => resumen.get(m) ?? null);
  const tot = filasMes.reduce(
    (a, r) => (r ? { despachados: a.despachados + r.despachados, entregados: a.entregados + r.entregados, rechazados: a.rechazados + r.rechazados, elegibles: a.elegibles + r.elegibles, conEstado: a.conEstado + r.conEstado } : a),
    { despachados: 0, entregados: 0, rechazados: 0, elegibles: 0, conEstado: 0 },
  );
  const tasa = tot.despachados ? (tot.entregados / tot.despachados) * 100 : null;
  const conEstado = tot.elegibles ? (tot.conEstado / tot.elegibles) * 100 : null;
  const pesos = pesoCausas(lista);
  const perdido = pesos.reduce((a, p) => a + p.dinero, 0);
  const nombreCausa = new Map(causas.catalogo.map((c) => [c.codigo, c.nombre]));
  nombreCausa.set("sin_causa", "Sin causa escrita");
  const porTienda = porDimension(lista, "tienda");
  const porCourier = porDimension(lista, "courier");
  const sinCausa = textosSinCausa(lista.filter((d) => d.estadoGrupo === "rechazado").map((d) => ({ texto: d.causaTexto, codigo: d.causa })));
  const estadosVistos = new Map<string, number>();
  for (const d of lista) if (d.estado) estadosVistos.set(d.estado, (estadosVistos.get(d.estado) ?? 0) + 1);
  const estados = [...estadosVistos].map(([etiqueta, pedidos]) => ({ etiqueta, pedidos, grupo: grupoDeEstado(etiqueta, config.reglas) })).sort((a, b) => b.pedidos - a.pedidos);
  const usd = (v: number) => dinero(v, "USD", { decimales: 0 });
  const principal = (f: FilaDimension) => {
    const top = Object.entries(f.causas).sort((a, b) => b[1] - a[1])[0];
    return top ? `${nombreCausa.get(top[0]) ?? top[0]} (${top[1]})` : "—";
  };
  const tablaDimension = (id: string, titulo: string, filas: FilaDimension[], concepto: string) => (
    <TablaComparacionAF4
      id={id}
      titulo={titulo}
      detalle={`${mesCorto(desde)} – ${mesCorto(mesEnCurso)}`}
      ariaLabel={`Despachos, entregas, rechazos y venta perdida por ${concepto.toLowerCase()}`}
      etiquetaConcepto={concepto}
      columnas={[
        { clave: "d", etiqueta: "Despachados" },
        { clave: "e", etiqueta: "Entregados" },
        { clave: "r", etiqueta: "Rechazados" },
        { clave: "t", etiqueta: "Tasa de entrega" },
        { clave: "p", etiqueta: "Venta perdida" },
        { clave: "c", etiqueta: "Causa principal", numerica: false },
      ]}
      filas={
        filas.length
          ? filas.slice(0, 25).map((f) => ({
              clave: f.clave,
              etiqueta: f.clave,
              celdas: [entero(f.despachados), entero(f.entregados), entero(f.rechazados), porcentaje(f.tasaEntrega), usd(f.dineroPerdido), principal(f)],
            }))
          : [{ clave: "nada", etiqueta: "Sin despachos", celdas: ["", "", "", "", "", ""] }]
      }
    />
  );

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={TITULO}
        filtros={
          <SelectorEnlace
            etiqueta="Elegir el período"
            opciones={VENTANAS.map((v) => ({ valor: `u${v}`, etiqueta: `Últimos ${v} meses`, href: `/deliverys/monday?periodo=u${v}` }))}
            elegido={`u${n}`}
          />
        }
        datosHasta={lista.length ? mesEnCurso : null}
        actualizado={config.ultimaLectura}
        imprimir={false}
        acciones={administra && token && config.tableroId ? <LeerMondayAhora /> : undefined}
      />

      {!token && (
        <Aviso tono="aviso">
          Conexión apagada: falta MONDAY_API_TOKEN en el servidor.{" "}
          <Link href={manual} className={`font-medium underline underline-offset-2 ${anilloFoco}`}>
            Cómo encenderla
          </Link>
        </Aviso>
      )}
      {token && !config.tableroId && <Aviso tono="aviso">Falta elegir el tablero de despachos{administra ? " (abajo, en Tablero)." : ": lo elige quien puede modificar Usuarios y roles."}</Aviso>}
      {config.ultimoError && (
        <Aviso tono="error">
          Última lectura con error: {config.ultimoError}{" "}
          <Link href={manual} className={`font-medium underline underline-offset-2 ${anilloFoco}`}>
            Qué hacer
          </Link>
        </Aviso>
      )}
      {"error" in despachos && <Aviso tono="error">{despachos.error}</Aviso>}

      <FilaKpiAF4>
        <KpiAF4 titulo="Despachados" valor={entero(tot.despachados)} subtexto={`${entero(config.items)} ítems en el tablero`} />
        <KpiAF4 titulo="Tasa de entrega" tono={tasa === null ? "neutral" : "info"} valor={porcentaje(tasa)} subtexto={`${entero(tot.entregados)} entregados`} />
        <KpiAF4
          titulo="Con estado a los 10 días"
          tono={conEstado === null ? "neutral" : conEstado >= META_CON_ESTADO ? "success" : "destructive"}
          valor={porcentaje(conEstado)}
          subtexto={`Meta ≥ ${META_CON_ESTADO} % · ${entero(tot.elegibles - tot.conEstado)} sin estado`}
        />
        <KpiAF4 titulo="Venta perdida en rechazos" tono={perdido > 0 ? "warning" : "neutral"} valor={usd(perdido)} subtexto={`${entero(tot.rechazados)} rechazados`} />
      </FilaKpiAF4>

      {!lista.length ? (
        <EstadoVacioAF4 titulo="Todavía no hay despachos de Monday en este período">{config.tableroId && token ? "La tarea «Monday: despachos y entregas» o «Leer ahora» los traen." : null}</EstadoVacioAF4>
      ) : (
        <>
          <TablaComparacionAF4
            id="titulo-monday-meses"
            titulo="Por mes"
            detalle="Mes de la orden"
            ariaLabel="Despachos, entregas, rechazos y pedidos con estado a los 10 días por mes"
            etiquetaConcepto="Mes"
            columnas={[
              { clave: "d", etiqueta: "Despachados" },
              { clave: "e", etiqueta: "Entregados" },
              { clave: "r", etiqueta: "Rechazados" },
              { clave: "t", etiqueta: "Tasa de entrega" },
              { clave: "x", etiqueta: "Hace más de 10 días" },
              { clave: "c", etiqueta: `Con estado (≥ ${META_CON_ESTADO} %)` },
            ]}
            filas={[...meses].reverse().map((m) => {
              const r = resumen.get(m);
              return {
                clave: m,
                etiqueta: mesCorto(m),
                celdas: r
                  ? [entero(r.despachados), entero(r.entregados), entero(r.rechazados), porcentaje(r.tasaEntrega), entero(r.elegibles), <Punto key="c" ok={r.pctConEstado === null ? null : r.pctConEstado >= META_CON_ESTADO} texto={porcentaje(r.pctConEstado)} />]
                  : ["—", "—", "—", "—", "—", "—"],
              };
            })}
          />

          <TablaComparacionAF4
            id="titulo-monday-causas"
            titulo="Causas de rechazo"
            detalle={`${entero(tot.rechazados)} rechazados · USD`}
            ariaLabel="Peso de cada causa de rechazo en pedidos y en dinero"
            etiquetaConcepto="Causa"
            columnas={[
              { clave: "p", etiqueta: "Pedidos" },
              { clave: "pp", etiqueta: "% pedidos" },
              { clave: "d", etiqueta: "Venta perdida" },
              { clave: "pd", etiqueta: "% dinero" },
              { clave: "e", etiqueta: "Costo de envío" },
            ]}
            filas={
              pesos.length
                ? pesos.map((p) => ({ clave: p.codigo, etiqueta: nombreCausa.get(p.codigo) ?? p.codigo, celdas: [entero(p.pedidos), porcentaje(p.pctPedidos), usd(p.dinero), porcentaje(p.pctDinero), usd(p.costoEnvio)] }))
                : [{ clave: "nada", etiqueta: "Sin rechazos", celdas: ["", "", "", "", ""] }]
            }
          />

          <div className="grid gap-6 2xl:grid-cols-2">
            {tablaDimension("titulo-monday-tiendas", "Por tienda", porTienda, "Tienda")}
            {tablaDimension("titulo-monday-courier", "Por courier", porCourier, "Courier")}
          </div>
        </>
      )}

      <MarcoAF4 id="titulo-monday-catalogo" titulo="Catálogo de causas" detalle={`${entero(causas.catalogo.length)} causas`} sinRelleno>
        <CatalogoCausas causas={causas.catalogo} sinCausa={sinCausa} puedeEditar={puedeEditar} />
      </MarcoAF4>

      {estados.length > 0 && (
        <MarcoAF4 id="titulo-monday-estados" titulo="Estados del tablero" detalle={`${entero(estados.length)} etiquetas`}>
          <EstadosTablero estados={estados} puedeEditar={puedeEditar} />
        </MarcoAF4>
      )}

      {administra && token && (
        <MarcoAF4 id="titulo-monday-tablero" titulo="Tablero" detalle={config.tableroNombre ?? undefined}>
          <ConfigTablero tableroId={config.tableroId} mapeo={config.mapeo} />
        </MarcoAF4>
      )}
    </Pagina>
  );
}
