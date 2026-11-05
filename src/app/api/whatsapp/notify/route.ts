import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tipo, telefone, nome, servicoTitulo, dataHora, totalVisitas } = body;

    const whatsappUrl = process.env.WHATSAPP_SERVER_URL || "http://127.0.0.1:3001";
    const res = await fetch(`${whatsappUrl}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, telefone, nome, servicoTitulo, dataHora, totalVisitas }),
      cache: "no-store",
    });

    if (res.ok) {
      return NextResponse.json({ success: true });
    }
  } catch (err) {
    console.error("Erro ao disparar notificação para o WhatsApp:", err);
  }
  return NextResponse.json({ success: false, message: "WhatsApp não disponível no momento" });
}
