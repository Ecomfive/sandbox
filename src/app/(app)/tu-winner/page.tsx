import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarGanadores, cargarLecturas, rangoDeVentas } from "./datos";
import { EncabezadoTuWinner } from "./encabezado";
import { VistaGanadores } from "./vista-ganadores";

export const metadata = { title: "Tu Winner" };

export const dynamic = "force-dynamic";

/**
 * Testing Lab › Tu Winner › Ganadores (pedido de Hernán, 2 nov 2026; boceto aprobado https://claude.ai/artifact/TwPE4fx17EiS39TJkLLkX2): los productos que
 * más se venden en Dropi según Tu Winner, de Panamá y México, cruzados con lo nuestro. Se leen con «Leer ahora» o solos la primera vez del día.
 */
export default async function TuWinnerPage() {
  const u = await requireModulo("tu-winner");
  const supabase = createServiceClient();
  const [ganadores, lecturas] = await Promise.all([cargarGanadores(supabase), cargarLecturas(supabase, 1)]);
  const escribe = !u.modulosSoloLectura.includes("tu-winner");
  return (
    <div className="tw-pagina">
      <EncabezadoTuWinner ultima={lecturas?.[0] ?? null} rango={rangoDeVentas(ganadores)} escribe={escribe && !!lecturas} />
      {!ganadores || !lecturas ? <p className="aviso mal">Falta correr en Supabase la migración 0223 (Tu Winner).</p> : <VistaGanadores ganadores={ganadores} />}
    </div>
  );
}
