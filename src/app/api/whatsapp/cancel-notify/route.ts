import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { telefone, nome, dataHora } = body;

    const whatsappUrl =
      process.env.WHATSAPP_SERVER_URL ||
      process.env.NEXT_PUBLIC_WHATSAPP_SERVER_URL ||
      "https://malu-alvesbeauty.onrender.com";
    const res = await fetch(`${whatsappUrl}/cancel-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telefone, nome, dataHora }),
      cache: "no-store",
    });

    if (res.ok) {
      return NextResponse.json({ success: true });
    }
  } catch (err) {
    console.error("Erro ao disparar cancelamento para o WhatsApp:", err);
  }
  return NextResponse.json({ success: false, message: "WhatsApp não disponível no momento" });
}
