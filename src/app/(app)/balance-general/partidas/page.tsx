import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { mesEnCursoPanama } from "@/lib/af4/fecha";
import { esRubroPartida, etiquetaRubro } from "@/lib/finanzas/balance";
import { SIN_MIGRACION_BALANCE } from "@/lib/finanzas/cargar-balance";
import { cargarEntidades } from "@/lib/finanzas/cargar-entidades";
import { createServiceClient } from "@/lib/supabase/server";
import { TablaPartidas, type FilaPartida } from "./tabla-partidas";

export const metadata = { title: "Partidas del balance" };

export const dynamic = "force-dynamic";

export default async function PartidasBalancePage() {
  const usuario = await requireModulo("balance-general");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Balance general" />;
  const supabase = createServiceClient();
  const [partidas, entidades] = await Promise.all([
    supabase.from("fin_balance_partidas").select("id, entidad_id, rubro, concepto, periodo, monto, nota").order("periodo", { ascending: false }),
    cargarEntidades(supabase),
  ]);
  if (partidas.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Partidas del balance" imprimir={false} />
        <EstadoVacioAF4 titulo={SIN_MIGRACION_BALANCE} />
      </Pagina>
    );
  }
  const nombreEntidad = new Map(entidades.map((e) => [e.id, e.razon_social]));
  const base = entidades.find((e) => e.codigo === "PA")?.razon_social ?? "Panamá";
  const filas: FilaPartida[] = (partidas.data ?? [])
    .filter((p) => esRubroPartida(p.rubro))
    .map((p) => ({
      id: p.id as string,
      entidad: p.entidad_id ? (nombreEntidad.get(p.entidad_id as string) ?? "—") : base,
      rubro: etiquetaRubro(p.rubro as string),
      concepto: String(p.concepto),
      mes: String(p.periodo).slice(0, 10),
      monto: Number(p.monto),
      nota: (p.nota as string | null) ?? "",
    }));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Partidas del balance" imprimir={false} />
      <TablaPartidas
        filas={filas}
        entidades={entidades.map((e) => ({ id: e.id, nombre: e.razon_social }))}
        mesSugerido={mesEnCursoPanama().slice(0, 7)}
        puedeEscribir={!usuario.modulosSoloLectura.includes("balance-general")}
      />
    </Pagina>
  );
}
