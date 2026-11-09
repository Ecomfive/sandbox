import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { TablaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { mesEnCursoPanama, mesMedio, sumarMeses } from "@/lib/af4/fecha";
import { dinero, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarPrepagos } from "@/lib/finanzas/cargar-cierre-control";
import { avancePrepago, cuotasPrepago, hastaPrepago } from "@/lib/finanzas/devengos";
import { createServiceClient } from "@/lib/supabase/server";
import { InterruptorPrepago } from "../ajustes/botones-ajustes";
import { CrearPrepagoPanel } from "../ajustes/crear-ajuste-panel";

export const metadata = { title: "Gastos prepagados" };

export const dynamic = "force-dynamic";

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

export default async function PrepagosPage() {
  const usuario = await requireModulo("cierre-mes");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Cierre de mes" />;
  const supabase = createServiceClient();
  const enCurso = mesEnCursoPanama();
  const [prepagos, unidades, tipos] = await Promise.all([
    cargarPrepagos(supabase),
    supabase.from("fin_unidades").select("id, nombre").eq("activo", true).neq("clase", "reparto").order("orden"),
    supabase.from("fin_tipos").select("id, nombre").in("seccion", ["costo_ventas", "administracion", "marketing", "finanzas", "otros"]).order("orden"),
  ]);
  const titulo = "Gastos prepagados";
  if ("error" in prepagos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={titulo} imprimir={false} />
        <EstadoVacioAF4 titulo="Falta la migración">{prepagos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const puedeEscribir = !usuario.modulosSoloLectura.includes("cierre-mes");
  const nombreUnidad = new Map((unidades.data ?? []).map((u) => [u.id as string, u.nombre as string]));
  const nombreTipo = new Map((tipos.data ?? []).map((t) => [t.id as string, t.nombre as string]));
  const meses = Array.from({ length: 30 }, (_, i) => sumarMeses(enCurso, 12 - i)).map((m) => ({ valor: m, etiqueta: mesMedio(m) }));
  const activos = prepagos.filter((p) => p.activo !== false);
  const avance = activos.map((p) => avancePrepago(p, enCurso));
  const porDevengar = avance.reduce((s, a) => s + a.porDevengar, 0);
  const cuotaMes = activos.reduce((s, p) => s + (cuotasPrepago(p).find((c) => c.periodo === enCurso)?.monto ?? 0), 0);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={titulo}
        imprimir={false}
        acciones={
          puedeEscribir ? (
            <CrearPrepagoPanel
              unidades={(unidades.data ?? []).map((u) => ({ id: u.id as string, nombre: u.nombre as string }))}
              tipos={(tipos.data ?? []).map((t) => ({ id: t.id as string, nombre: t.nombre as string }))}
              meses={meses}
            />
          ) : undefined
        }
      />
      <KpiGroup titulo="Prepagados">
        <KpiGrid compacta>
          <KpiCard compacta titulo="Activos" valor={entero(activos.length)} />
          <KpiCard compacta titulo={`Devengo de ${mesMedio(enCurso)}`} valor={usd(cuotaMes)} />
          <KpiCard compacta titulo="Por devengar" valor={usd(porDevengar)} />
        </KpiGrid>
      </KpiGroup>
      <TablaComparacionAF4
        id="titulo-prepagos"
        titulo="Gastos prepagados"
        detalle="USD"
        ariaLabel="Gastos prepagados"
        etiquetaConcepto="Concepto"
        columnas={[
          { clave: "donde", etiqueta: "Tienda · tipo", numerica: false },
          { clave: "cubre", etiqueta: "Cubre", numerica: false },
          { clave: "monto", etiqueta: "Pagado" },
          { clave: "cuota", etiqueta: "Cuota" },
          { clave: "devengado", etiqueta: "Devengado" },
          { clave: "pendiente", etiqueta: "Por devengar" },
          { clave: "estado", etiqueta: "Estado", numerica: false },
        ]}
        filas={
          prepagos.length
            ? prepagos.map((p) => {
                const a = avancePrepago(p, enCurso);
                return {
                  clave: p.id,
                  etiqueta: <span className="font-normal">{p.concepto}</span>,
                  celdas: [
                    `${nombreUnidad.get(p.unidadId) ?? "—"} · ${nombreTipo.get(p.tipoId) ?? "—"}`,
                    `${mesMedio(p.desde)} – ${mesMedio(hastaPrepago(p))} (${a.cuotas} de ${a.de})`,
                    usd(p.monto),
                    usd(cuotasPrepago(p)[0].monto),
                    usd(a.devengado),
                    usd(a.porDevengar),
                    puedeEscribir ? <InterruptorPrepago key="i" id={p.id} activo={p.activo !== false} concepto={p.concepto} /> : p.activo !== false ? "Activo" : "Inactivo",
                  ],
                };
              })
            : [{ clave: "vacio", etiqueta: <span className="font-normal text-muted-foreground">Sin gastos prepagados</span>, celdas: ["", "", "", "", "", "", ""] }]
        }
      />
    </Pagina>
  );
}
