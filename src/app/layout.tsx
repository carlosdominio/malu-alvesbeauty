import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Studio Malu Alves Beauty • Agendamento Online",
  description: "Agendamento online de design de sobrancelhas e procedimentos no Studio Malu Alves Beauty.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/logo.jpg", type: "image/jpeg" },
      { url: "/favicon.ico" },
    ],
    shortcut: ["/logo.jpg"],
    apple: [
      { url: "/logo.jpg", sizes: "180x180", type: "image/jpeg" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <link rel="icon" href="/logo.jpg" type="image/jpeg" />
        <link rel="shortcut icon" href="/logo.jpg" type="image/jpeg" />
        <link rel="apple-touch-icon" href="/logo.jpg" />
      </head>
      <body className="antialiased bg-zinc-950 text-zinc-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
