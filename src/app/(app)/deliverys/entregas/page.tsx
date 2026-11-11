import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { hoyPanama } from "@/lib/af4/fecha";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarEntregas, semanasDisponibles } from "@/lib/deliverys/cargar";
import { inicioSemana } from "@/lib/deliverys/liquidacion";
import { createServiceClient } from "@/lib/supabase/server";
import { SelectorSemana, semanaElegida } from "../selector-semana";
import { CrearEntregaPanel } from "./crear-entrega-panel";
import { TablaEntregas } from "./tabla-entregas";

export const metadata = { title: "Entregas de deliverys" };

export const dynamic = "force-dynamic";

const MODULO = "deliverys";

export default async function EntregasDeliverysPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo(MODULO);
  const puedeEscribir = !usuario.modulosSoloLectura.includes(MODULO);
  const supabase = createServiceClient();
  const { semana: pedida } = await searchParams;
  const hoy = hoyPanama();

  const [disponibles, repartidores, tiendas] = await Promise.all([
    semanasDisponibles(supabase),
    supabase.from("del_repartidores").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("del_tiendas").select("unidad_id, fin_unidades(nombre)"),
  ]);
  if ("error" in disponibles || repartidores.error || tiendas.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Entregas de deliverys" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudieron leer las entregas">{"error" in disponibles ? disponibles.error : "No se pudieron leer los repartidores."}</EstadoVacioAF4>
      </Pagina>
    );
  }
  // La semana en curso siempre se puede elegir (para cargar entregas aunque todavía no haya ninguna).
  const semanas = [...new Set([...disponibles.semanas, inicioSemana(hoy)])].sort();
  const semana = semanaElegida(semanas, pedida)!;
  const entregas = await cargarEntregas(supabase, semana);
  const opcionesTienda = (tiendas.data ?? [])
    .map((t) => ({ id: t.unidad_id as string, nombre: ((Array.isArray(t.fin_unidades) ? t.fin_unidades[0] : t.fin_unidades) as { nombre: string } | null)?.nombre ?? "" }))
    .filter((t) => t.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Entregas de deliverys"
        imprimir={false}
        filtros={<SelectorSemana semanas={semanas} elegida={semana} ruta="/deliverys/entregas" />}
      />
      {"error" in entregas ? (
        <EstadoVacioAF4 titulo="No se pudieron leer las entregas">{entregas.error}</EstadoVacioAF4>
      ) : (
        <TablaEntregas
          filas={entregas.filas}
          agregar={puedeEscribir ? <CrearEntregaPanel repartidores={(repartidores.data ?? []) as { id: string; nombre: string }[]} tiendas={opcionesTienda} hoy={hoy} /> : undefined}
        />
      )}
    </Pagina>
  );
}
