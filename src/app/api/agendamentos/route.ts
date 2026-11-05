import { NextResponse } from "next/server";
import { ServerStore } from "@/lib/serverStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dataFiltro = searchParams.get("data") || undefined;
    const agendamentos = ServerStore.getAgendamentos(dataFiltro);
    return NextResponse.json(agendamentos);
  } catch (error) {
    console.error("Erro ao buscar agendamentos:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { cliente_nome, cliente_telefone, servico, horario_inicio, origem = "WHATSAPP", observacoes } = body;

    if (!cliente_nome || !cliente_telefone || !servico || !horario_inicio) {
      return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    const novo = ServerStore.createAgendamento({
      cliente_nome,
      cliente_telefone,
      servico,
      horario_inicio,
      origem,
      observacoes,
    });

    // Se o agendamento veio do App/PWA ou Manual, dispara confirmação instantânea no WhatsApp!
    if (origem === "WEB" || origem === "MANUAL") {
      const whatsappUrl =
        process.env.WHATSAPP_SERVER_URL ||
        process.env.NEXT_PUBLIC_WHATSAPP_SERVER_URL ||
        "https://malu-alvesbeauty.onrender.com";
      fetch(`${whatsappUrl}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "CONFIRMACAO_WEB",
          telefone: cliente_telefone,
          nome: cliente_nome,
          servicoTitulo: servico.titulo,
          dataHora: horario_inicio,
          valor: servico.preco,
        }),
      }).catch((e) => console.error("Erro ao disparar WhatsApp pós-agendamento PWA:", e));
    }

    return NextResponse.json({ success: true, agendamento: novo }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar agendamento via API:", error);
    return NextResponse.json({ error: "Erro interno ao salvar agendamento" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, status, forma_pagamento } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "ID e status são obrigatórios" }, { status: 400 });
    }

    ServerStore.updateStatusAgendamento(id, status, forma_pagamento);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const modo = (searchParams.get("modo") as "TODOS" | "CANCELADOS" | "TESTES") || "TODOS";
    const removidos = ServerStore.limparAgendamentos(modo);
    return NextResponse.json({ success: true, removidos });
  } catch (error) {
    console.error("Erro ao limpar agendamentos:", error);
    return NextResponse.json({ error: "Erro interno ao limpar agendamentos" }, { status: 500 });
  }
}
