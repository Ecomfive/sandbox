import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { notFound } from "next/navigation";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { EstiloImpresionAF4, PortadaInformeAF4, SeccionInformeAF4 } from "@/components/af4/informe-af4";
import { TablaComparacionAF4, type FilaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, fechaHora, hoyPanama, mesEnCursoPanama, mesLargo, mesMedio } from "@/lib/af4/fecha";
import { dinero, entero, porcentaje } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { ETIQUETA_CLASE_AJUSTE, ETIQUETA_ORIGEN_AJUSTE } from "@/lib/finanzas/ajustes-cierre";
import { cargarCierres, nombresDePersonas } from "@/lib/finanzas/cargar-cierre";
import { cargarAjustesMes, cargarConfigCierre, cargarCuadres, cargarReaperturas, cargarVariaciones } from "@/lib/finanzas/cargar-cierre-control";
import { armarBalance } from "@/lib/finanzas/balance";
import { cargarBalance } from "@/lib/finanzas/cargar-balance";
import { cargarEerr } from "@/lib/finanzas/cargar-eerr";
import { cargarFlujo } from "@/lib/finanzas/cargar-flujo";
import { ETIQUETA_ESTADO_CIERRE, ETIQUETA_ESTADO_TAREA, TAREAS, finDeMes, leerPeriodo, mesAnterior } from "@/lib/finanzas/cierre";
import { ETIQUETA_CUADRE, cuadra, type ClaseCuadre } from "@/lib/finanzas/cierre-control";
import { armarEerr } from "@/lib/finanzas/eerr";
import { filasEstado } from "@/lib/finanzas/eerr-filas";
import { resumirFlujo } from "@/lib/finanzas/flujo";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Paquete del cierre" };

export const dynamic = "force-dynamic";

const SECCIONES = ["Estado de resultados", "Flujo de caja", "Balance general", "Cartera", "Asientos de ajuste", "Cuadres y variaciones", "Notas y aprobación"];
const usd = (v: number | null | undefined) => dinero(v);
const usd2 = (v: number) => dinero(v, "USD", { decimales: 2 });
const conSigno = (v: number) => dinero(v, "USD", { conSigno: true });

const fila = (clave: string, etiqueta: string, celdas: string[], peso?: FilaComparacionAF4["peso"]): FilaComparacionAF4 => ({ clave, etiqueta, celdas, peso });

/** El paquete del cierre en una sola página imprimible (Imprimir → Guardar como PDF), como el Informe mensual. */
export default async function PaqueteCierrePage({ params }: { params: Promise<{ periodo: string }> }) {
  const usuario = await requireModulo("cierre-mes");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Cierre de mes" />;
  const periodo = leerPeriodo((await params).periodo);
  if (!periodo || periodo >= mesEnCursoPanama()) notFound();
  const anterior = mesAnterior(periodo);
  const supabase = createServiceClient();
  const verEerr = usuario.modulos.includes("estado-resultados");
  const verFlujo = usuario.modulos.includes("flujo-caja");
  const verNomina = usuario.modulos.includes("usuarios");
  const verBalance = usuario.modulos.includes("balance-general");
  const { config } = await cargarConfigCierre(supabase);
  const [cierres, eerr, flujo, balance, cartera, ajustes, cuadres, variaciones, reaperturas] = await Promise.all([
    cargarCierres(supabase, periodo),
    verEerr ? cargarEerr(supabase, null, [anterior, periodo]) : Promise.resolve(null),
    verFlujo ? cargarFlujo(supabase) : Promise.resolve(null),
    // El mismo cargador del Balance general (consolidado, USD), al cierre del mes y del anterior.
    verBalance ? cargarBalance(supabase, [anterior, periodo], null, mesEnCursoPanama()) : Promise.resolve(null),
    supabase.rpc("fin_cartera_al", { p_corte: finDeMes(periodo) }),
    cargarAjustesMes(supabase, periodo),
    cargarCuadres(supabase, periodo),
    verEerr ? cargarVariaciones(supabase, periodo, config) : Promise.resolve(null),
    cargarReaperturas(supabase, 20, periodo),
  ]);
  const cierre = "error" in cierres ? null : (cierres.cierres[0] ?? null);
  const marcas = "error" in cierres ? [] : cierres.tareas;
  const nombres = await nombresDePersonas(supabase, [cierre?.cerrado_por, cierre?.enviado_revision_por, ...("error" in reaperturas ? [] : reaperturas.map((r) => r.reabiertoPor))]);
  const quien = (id: string | null | undefined) => (id ? (nombres.get(id) ?? "—") : "—");
  const titulo = "Paquete del cierre";

  // 1. EERR
  const filasEerr: FilaComparacionAF4[] = [];
  if (eerr && !("error" in eerr)) {
    const e = armarEerr(eerr.filas, [anterior, periodo]);
    for (const f of filasEstado(e)) {
      const pct = f.tipo === "porcentaje";
      const v = (m: string) => (pct ? (f.base?.[m] ? porcentaje(((f.valores[m] ?? 0) / f.base[m]) * 100) : "—") : usd(f.valores[m] ?? 0));
      const dif = pct ? "" : conSigno((f.valores[periodo] ?? 0) - (f.valores[anterior] ?? 0));
      filasEerr.push({
        clave: f.clave,
        etiqueta: f.tipo === "detalle" ? <span className="pl-3 font-normal">{f.etiqueta}</span> : f.etiqueta,
        peso: f.tipo === "seccion" ? "subtotal" : f.tipo === "resultado" ? (f.clave === "resultado-neto" ? "total" : "subtotal") : f.tipo === "porcentaje" ? "porcentaje" : "detalle",
        celdas: [v(anterior), v(periodo), dif],
      });
    }
  }

  // 2. Flujo
  const filasFlujo: FilaComparacionAF4[] = [];
  if (flujo && !("error" in flujo)) {
    const r = resumirFlujo(flujo.filas, flujo.saldos, flujo.cuentas, [periodo]);
    filasFlujo.push(fila("inicial", "Caja al inicio", [usd(r.caja.inicial[periodo] ?? 0)]));
    for (const b of r.estado.bloques) filasFlujo.push(fila(b.bloque, `Flujo ${b.etiqueta.toLowerCase()}`, [conSigno(b.neto[periodo] ?? 0)], "subtotal"));
    filasFlujo.push(fila("entradas", "Entradas", [usd(r.estado.entradas[periodo] ?? 0)]));
    filasFlujo.push(fila("salidas", "Salidas", [usd(r.estado.salidas[periodo] ?? 0)]));
    filasFlujo.push(fila("neto", "Flujo neto", [conSigno(r.estado.neto[periodo] ?? 0)], "subtotal"));
    filasFlujo.push(fila("final", "Caja al cierre", [usd(r.caja.final[periodo] ?? 0)], "total"));
  }

  // 3. Balance
  const filasBalance: FilaComparacionAF4[] = [];
  if (balance && !("error" in balance)) {
    const b = armarBalance([anterior, periodo], balance.insumos);
    for (const f of b.filas) {
      if (f.tipo === "detalle" && f.valores.every((v) => !v)) continue;
      const [ant, act] = f.valores;
      filasBalance.push({
        clave: f.clave,
        etiqueta: f.tipo === "detalle" ? <span className="pl-3 font-normal">{f.etiqueta}</span> : f.etiqueta,
        peso: f.tipo === "grupo" || f.tipo === "seccion" || f.tipo === "subtotal" || f.tipo === "total" ? f.tipo : "detalle",
        celdas: f.tipo === "grupo" ? ["", "", ""] : [usd(ant), usd(act), ant === null || act === null ? "—" : conSigno((act ?? 0) - (ant ?? 0))],
      });
    }
  }

  // 4. Cartera
  type FilaCartera = { clase: string; saldo: number | string; vencido: number | string; tramo_0_30: number | string; tramo_31_60: number | string; tramo_61_90: number | string; tramo_90_mas: number | string };
  const filasCartera: FilaComparacionAF4[] = [];
  if (!cartera.error) {
    for (const clase of ["cobrar", "pagar"] as const) {
      const fs = ((cartera.data ?? []) as FilaCartera[]).filter((c) => c.clase === clase);
      const s = (k: keyof FilaCartera) => fs.reduce((a, c) => a + Number(c[k] ?? 0), 0);
      filasCartera.push({
        clave: clase,
        etiqueta: clase === "cobrar" ? "Por cobrar" : "Por pagar",
        celdas: [usd(s("saldo")), usd(s("vencido")), usd(s("tramo_0_30")), usd(s("tramo_31_60")), usd(s("tramo_61_90")), usd(s("tramo_90_mas"))],
      });
    }
  }

  const listaAjustes = "error" in ajustes ? [] : verNomina ? ajustes : ajustes.filter((a) => a.origen !== "provision_nomina");
  const efecto = Math.round(listaAjustes.reduce((s, a) => s + a.efecto, 0) * 100) / 100;
  const listaCuadres = "error" in cuadres ? [] : cuadres;
  const explicadas = (variaciones ?? []).filter((l) => l.supera);
  const excepciones = marcas.filter((t) => t.a_mano && t.automatico !== "ok" && t.estado !== "pendiente");
  const reabs = "error" in reaperturas ? [] : reaperturas;
  const estado = cierre?.estado ?? "abierto";

  return (
    <Pagina ancho="media" className="informe-af4 flex flex-col gap-8">
      <EstiloImpresionAF4 pie={`Ecomfive · Portal AF4 360° · Paquete del cierre de ${mesLargo(periodo)}`} />
      <EtiquetaMiga texto={`Paquete ${mesMedio(periodo)}`} />
      <PortadaInformeAF4
        titulo="Paquete del cierre de mes"
        periodo={mesLargo(periodo)}
        comparacion={`Comparado con ${mesLargo(anterior)} · USD`}
        indice={SECCIONES}
        preparado={fechaCorta(hoyPanama())}
        datos={[
          { etiqueta: "Estado", valor: ETIQUETA_ESTADO_CIERRE[estado] },
          { etiqueta: "Preparado por", valor: quien(cierre?.enviado_revision_por) },
          { etiqueta: "Aprobado por", valor: estado === "cerrado" ? quien(cierre?.cerrado_por) : "—" },
        ]}
      />
      <div className="print:hidden">
        <EncabezadoAF4 titulo={titulo} datosHasta={periodo} />
      </div>

      <SeccionInformeAF4 id="paquete-eerr" numero={1} titulo={SECCIONES[0]} detalle={`${mesMedio(periodo)} contra ${mesMedio(anterior)}`}>
        {filasEerr.length ? (
          <TablaComparacionAF4
            id="tabla-paquete-eerr"
            titulo="Consolidado"
            detalle="USD"
            ariaLabel="Estado de resultados consolidado del mes contra el anterior"
            columnas={[
              { clave: "ant", etiqueta: mesMedio(anterior), atenuada: true },
              { clave: "act", etiqueta: mesMedio(periodo) },
              { clave: "dif", etiqueta: "Diferencia" },
            ]}
            filas={filasEerr}
          />
        ) : (
          <EstadoVacioAF4 titulo={verEerr ? "Sin estado de resultados del mes" : "Hace falta el módulo Estado de resultados"} compacto />
        )}
      </SeccionInformeAF4>

      <SeccionInformeAF4 id="paquete-flujo" numero={2} titulo={SECCIONES[1]} detalle={mesMedio(periodo)}>
        {filasFlujo.length ? (
          <TablaComparacionAF4 id="tabla-paquete-flujo" titulo="Flujo del mes" detalle="USD" ariaLabel="Flujo de caja del mes" columnas={[{ clave: "v", etiqueta: mesMedio(periodo) }]} filas={filasFlujo} />
        ) : (
          <EstadoVacioAF4 titulo={verFlujo ? "Sin flujo de caja del mes" : "Hace falta el módulo Flujo de caja"} compacto />
        )}
      </SeccionInformeAF4>

      <SeccionInformeAF4 id="paquete-balance" numero={3} titulo={SECCIONES[2]} detalle={`Al ${fechaCorta(finDeMes(periodo))}`}>
        {filasBalance.length ? (
          <TablaComparacionAF4
            id="tabla-paquete-balance"
            titulo="Consolidado"
            detalle="USD"
            ariaLabel="Balance general al cierre del mes contra el anterior"
            columnas={[
              { clave: "ant", etiqueta: mesMedio(anterior), atenuada: true },
              { clave: "act", etiqueta: mesMedio(periodo) },
              { clave: "dif", etiqueta: "Diferencia" },
            ]}
            filas={filasBalance}
          />
        ) : (
          <EstadoVacioAF4
            titulo={!verBalance ? "Hace falta el módulo Balance general" : balance && "error" in balance ? balance.error : "Sin balance general del mes"}
            compacto
          />
        )}
      </SeccionInformeAF4>

      <SeccionInformeAF4 id="paquete-cartera" numero={4} titulo={SECCIONES[3]} detalle={`Al ${fechaCorta(finDeMes(periodo))}`}>
        {filasCartera.length ? (
          <TablaComparacionAF4
            id="tabla-paquete-cartera"
            titulo="Saldos y antigüedad"
            detalle="USD"
            ariaLabel="Cartera al cierre del mes"
            columnas={[
              { clave: "saldo", etiqueta: "Saldo" },
              { clave: "vencido", etiqueta: "Vencido" },
              { clave: "t1", etiqueta: "0–30 d" },
              { clave: "t2", etiqueta: "31–60 d" },
              { clave: "t3", etiqueta: "61–90 d" },
              { clave: "t4", etiqueta: "+90 d" },
            ]}
            filas={filasCartera}
          />
        ) : (
          <EstadoVacioAF4 titulo="Sin cartera" compacto />
        )}
      </SeccionInformeAF4>

      <SeccionInformeAF4 id="paquete-ajustes" numero={5} titulo={SECCIONES[4]} detalle={`${entero(listaAjustes.length)} · efecto ${conSigno(efecto)}`}>
        {listaAjustes.length ? (
          <TablaComparacionAF4
            id="tabla-paquete-ajustes"
            titulo="Ajustes del mes"
            detalle="EERR = SI · flujo = NO · USD"
            ariaLabel="Asientos de ajuste del mes"
            etiquetaConcepto="Ajuste"
            columnas={[
              { clave: "clase", etiqueta: "Clase", numerica: false },
              { clave: "origen", etiqueta: "Origen", numerica: false },
              { clave: "efecto", etiqueta: "Efecto" },
            ]}
            filas={[
              ...listaAjustes.map((a) => ({ clave: a.id, etiqueta: <span className="font-normal">{a.concepto}</span>, celdas: [ETIQUETA_CLASE_AJUSTE[a.clase], ETIQUETA_ORIGEN_AJUSTE[a.origen], usd2(a.efecto)] })),
              { clave: "total", etiqueta: "Total", peso: "total" as const, celdas: ["", "", usd2(efecto)] },
            ]}
          />
        ) : (
          <EstadoVacioAF4 titulo="Sin asientos de ajuste" compacto />
        )}
      </SeccionInformeAF4>

      <SeccionInformeAF4 id="paquete-cuadres" numero={6} titulo={SECCIONES[5]}>
        <TablaComparacionAF4
          id="tabla-paquete-cuadres"
          titulo="Cuadres"
          detalle="USD"
          ariaLabel="Cuadres del cierre"
          etiquetaConcepto="Cuadre"
          columnas={[
            { clave: "libros", etiqueta: "Libros" },
            { clave: "sistema", etiqueta: "Sistema" },
            { clave: "dif", etiqueta: "Diferencia" },
            { clave: "expl", etiqueta: "Explicación", numerica: false },
          ]}
          filas={(["inventario", "cartera_dropi"] as ClaseCuadre[]).map((clase) => {
            const c = listaCuadres.find((x) => x.clase === clase);
            const tol = clase === "inventario" ? config.toleranciaInventario : config.toleranciaDropi;
            return {
              clave: clase,
              etiqueta: ETIQUETA_CUADRE[clase],
              celdas: c ? [usd2(c.libros), usd2(c.sistema), dinero(c.diferencia, "USD", { decimales: 2, conSigno: true }), c.explicacion ?? (cuadra(c.diferencia, tol) ? "Cuadra" : "Sin explicar")] : ["—", "—", "—", "Sin registrar"],
            };
          })}
        />
        {explicadas.length > 0 && (
          <TablaComparacionAF4
            id="tabla-paquete-variaciones"
            titulo="Variaciones contra el mes anterior"
            detalle={`Más de ${entero(config.umbralPct)} % y ${usd(config.umbralMonto)}`}
            ariaLabel="Variaciones explicadas"
            etiquetaConcepto="Línea"
            columnas={[
              { clave: "dif", etiqueta: "Diferencia" },
              { clave: "expl", etiqueta: "Explicación", numerica: false },
            ]}
            filas={explicadas.map((l) => ({ clave: l.clave, etiqueta: l.etiqueta, celdas: [conSigno(l.diferencia), l.explicacion ?? "Sin explicar"] }))}
          />
        )}
      </SeccionInformeAF4>

      <SeccionInformeAF4 id="paquete-notas" numero={7} titulo={SECCIONES[6]}>
        <dl className="m-0 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Estado</dt>
            <dd className="m-0">{ETIQUETA_ESTADO_CIERRE[estado]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Preparado (enviado a revisión)</dt>
            <dd className="m-0">{cierre?.enviado_revision_en ? `${quien(cierre.enviado_revision_por)}, ${fechaHora(cierre.enviado_revision_en)}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Aprobado y cerrado</dt>
            <dd className="m-0">{estado === "cerrado" && cierre?.cerrado_en ? `${quien(cierre.cerrado_por)}, ${fechaHora(cierre.cerrado_en)}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Veces cerrado</dt>
            <dd className="m-0">{entero(cierre?.veces_cerrado ?? 0)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Notas</dt>
            <dd className="m-0 whitespace-pre-line">{cierre?.notas || "Sin notas."}</dd>
          </div>
          {excepciones.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Excepciones justificadas del checklist</dt>
              <dd className="m-0">
                <ul className="m-0 pl-4">
                  {excepciones.map((t) => (
                    <li key={t.clave}>
                      {TAREAS.find((x) => x.clave === t.clave)?.titulo ?? t.clave} ({ETIQUETA_ESTADO_TAREA[t.estado].toLowerCase()}): {t.comentario}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {reabs.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Reaperturas</dt>
              <dd className="m-0">
                <ul className="m-0 pl-4">
                  {reabs.map((r) => (
                    <li key={r.id}>
                      {fechaHora(r.reabiertoEn)} · {quien(r.reabiertoPor)}: «{r.motivo}»
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </SeccionInformeAF4>
    </Pagina>
  );
}
