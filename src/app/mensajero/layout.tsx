import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Mis entregas", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function LayoutMensajero({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
