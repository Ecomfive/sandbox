import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { TablaSaldos, type FilaSaldo } from "./tabla-saldos";

export const metadata = { title: "Saldos iniciales" };

export const dynamic = "force-dynamic";

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function SaldosInicialesPage() {
  const usuario = await requireModulo("flujo-caja");
  const supabase = createServiceClient();
  const [saldos, cuentas, primero] = await Promise.all([
    supabase.from("fin_saldos_iniciales").select("id, fecha, monto, nota, fin_cuentas(nombre, clase)").order("fecha", { ascending: false }),
    supabase.from("fin_cuentas").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("fin_movimientos").select("periodo").order("periodo").limit(1),
  ]);
  if (saldos.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Saldos iniciales" imprimir={false} />
        <EstadoVacioAF4 titulo="Falta el flujo de caja">Correr la migración 0904 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const filas: FilaSaldo[] = (saldos.data ?? []).map((s) => {
    const c = uno(s.fin_cuentas as Uno<{ nombre: string; clase: string }>);
    return {
      id: s.id as string,
      cuenta: c?.nombre ?? "—",
      clase: c?.clase ?? "otro",
      mes: String(s.fecha).slice(0, 10),
      monto: Number(s.monto),
      nota: (s.nota as string | null) ?? "",
    };
  });
  // El mes sugerido es el primero del libro: con el saldo de ese mes, todo el flujo queda con su saldo.
  const mesSugerido = primero.data?.[0]?.periodo ? String(primero.data[0].periodo).slice(0, 7) : "";
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Saldos iniciales" />
      <TablaSaldos
        filas={filas}
        cuentas={(cuentas.data ?? []) as { id: string; nombre: string }[]}
        mesSugerido={mesSugerido}
        puedeEscribir={!usuario.modulosSoloLectura.includes("flujo-caja")}
      />
    </Pagina>
  );
}
