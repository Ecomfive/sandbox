import Link from "next/link";

const modulos = [
  {
    href: "/extractos",
    titulo: "Extractos bancarios",
    descripcion: "Cargar extracto (CSV/Excel) y asignar movimientos a plataforma.",
  },
  {
    href: "/conciliaciones",
    titulo: "Conciliación",
    descripcion: "Comparar lo depositado en banco contra lo reportado por cada plataforma.",
  },
  {
    href: "/inventario",
    titulo: "Inventario (pistoleo)",
    descripcion: "Cargar entradas y salidas de mercancía desde el sistema de escaneo.",
  },
  {
    href: "/alertas",
    titulo: "Alertas de inventario",
    descripcion: "Inventario pendiente de retorno, listo para reclamo a la plataforma.",
  },
];

export default function Home() {
  return (
    <main className="p-8 max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Gestión de Proveeduría</h1>
      <p className="text-sm text-gray-600 mb-6">Beta — Costa Rica y Panamá</p>
      <div className="flex flex-col gap-3">
        {modulos.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="border rounded p-4 hover:bg-gray-50 transition-colors"
          >
            <p className="font-medium">{m.titulo}</p>
            <p className="text-sm text-gray-600">{m.descripcion}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
