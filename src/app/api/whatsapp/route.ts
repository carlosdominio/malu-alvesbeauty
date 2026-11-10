import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const WHATSAPP_SERVER_URL =
  process.env.WHATSAPP_SERVER_URL ||
  process.env.NEXT_PUBLIC_WHATSAPP_SERVER_URL ||
  "https://malu-alvesbeauty.onrender.com";

export async function GET() {
  try {
    const res = await fetch(`${WHATSAPP_SERVER_URL}/status`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    // Se o servidor ainda estiver iniciando
  }
  return NextResponse.json({ status: "DISCONNECTED", qrCodeBase64: null, connectedPhone: null });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "PAIRING_CODE") {
      const res = await fetch(`${WHATSAPP_SERVER_URL}/pairing-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: body.phone }),
        cache: "no-store",
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    const endpoint = body.action === "START" ? "start" : "disconnect";

    const res = await fetch(`${WHATSAPP_SERVER_URL}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err) {
    console.error("Erro ao conectar no servidor WhatsApp:", err);
  }
  return NextResponse.json({ error: "Erro de comunicação com o WhatsApp Server" }, { status: 500 });
}
