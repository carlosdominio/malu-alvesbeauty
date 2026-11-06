import { NextResponse } from "next/server";
import { ServerStore } from "@/lib/serverStore";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dataFiltro = searchParams.get("data") || undefined;

    if (isSupabaseConfigured && supabase) {
      let query = supabase.from("agendamentos").select("*").order("horario_inicio", { ascending: true });
      if (dataFiltro) {
        query = query.gte("horario_inicio", `${dataFiltro}T00:00:00`).lte("horario_inicio", `${dataFiltro}T23:59:59`);
      }
      const { data, error } = await query;
      if (!error && data) {
        if (data.length > 0 || dataFiltro) {
          return NextResponse.json(data);
        }
      }
    }

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
    const { cliente_nome, cliente_telefone, servico, horario_inicio, origem = "WHATSAPP", observacoes, forma_pagamento } = body;

    if (!cliente_nome || !cliente_telefone || !servico || !horario_inicio) {
      return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    const [dataPart, horaPart] = horario_inicio.split("T");
    let horarioFim = horario_inicio;
    if (horaPart) {
      const [h, m] = horaPart.slice(0, 5).split(":").map(Number);
      const dur = Number(servico.duracao_minutos) || 30;
      const totalMin = h * 60 + m + dur;
      horarioFim = `${dataPart}T${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}:00`;
    }

    const config = ServerStore.getConfig();
    const exigeSinal = config.exigir_sinal ?? true;
    let valorSinal = body.valor_sinal;
    if (valorSinal === undefined && exigeSinal) {
      if (config.tipo_sinal === "FIXO") {
        valorSinal = config.sinal_valor_fixo ?? 20;
      } else {
        const pct = config.sinal_porcentagem ?? 30;
        valorSinal = Math.round((servico.preco * pct) / 100);
      }
    }

    const statusInicial = body.status || (exigeSinal ? "AGUARDANDO_SINAL" : "CONFIRMADO");
    const tempoMinutos = config.tempo_limite_sinal_minutos || 30;
    const tempoExpiracao = new Date(Date.now() + tempoMinutos * 60 * 1000).toISOString();

    const telLimpo = cliente_telefone.replace(/\D/g, "");
    const agendamentoId = `ag-${Date.now()}`;
    const clienteId = `cli-${Date.now()}`;

    const novo = {
      id: agendamentoId,
      cliente_id: clienteId,
      cliente_nome,
      cliente_telefone: telLimpo,
      servico_id: servico.id,
      servico_titulo: servico.titulo,
      horario_inicio,
      horario_fim: horarioFim,
      duracao_minutos: servico.duracao_minutos || 30,
      status: statusInicial,
      origem,
      valor_cobrado: servico.preco,
      valor_sinal: valorSinal,
      tempo_expiracao_sinal: statusInicial === "AGUARDANDO_SINAL" ? tempoExpiracao : null,
      forma_pagamento: forma_pagamento || null,
      observacoes: observacoes || null,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from("clientes").upsert({
          id: clienteId,
          nome: cliente_nome,
          telefone: telLimpo,
          ultimo_servico_id: servico.id,
          ultimo_servico_nome: servico.titulo,
          ultima_visita: horario_inicio,
          total_visitas: 1,
        });

        await supabase.from("agendamentos").insert(novo);
      } catch (errDb) {
        console.error("Erro ao persistir no Supabase:", errDb);
      }
    }

    ServerStore.createAgendamento({
      cliente_nome,
      cliente_telefone,
      servico,
      horario_inicio,
      origem,
      observacoes,
      forma_pagamento,
      status: statusInicial,
      valor_sinal: valorSinal,
    });

    // Se o agendamento veio do App/PWA ou Manual, dispara confirmação instantânea no WhatsApp!
    if (origem === "WEB" || origem === "MANUAL") {
      const whatsappUrl =
        process.env.WHATSAPP_SERVER_URL ||
        process.env.NEXT_PUBLIC_WHATSAPP_SERVER_URL ||
        "https://malu-alvesbeauty.onrender.com";
      const tipoMensagem =
        statusInicial === "CONCLUIDO"
          ? "AGRADECIMENTO_FIDELIDADE"
          : statusInicial === "AGUARDANDO_SINAL"
          ? "SOLICITAR_SINAL_WEB"
          : "CONFIRMACAO_WEB";
      fetch(`${whatsappUrl}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: tipoMensagem,
          telefone: cliente_telefone,
          nome: cliente_nome,
          servicoTitulo: servico.titulo,
          dataHora: horario_inicio,
          valor: servico.preco,
          valorSinal,
          chavePix: config.chave_pix || "82981430673",
          titularPix: config.titular_pix || "Luisa Alves dos Santos",
          tempoLimiteMinutos: tempoMinutos,
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
    const { id, status, forma_pagamento, comprovante_recebido } = body;

    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (forma_pagamento) updateData.forma_pagamento = forma_pagamento;
    if (comprovante_recebido !== undefined) {
      updateData.comprovante_recebido = comprovante_recebido;
      if (comprovante_recebido) {
        updateData.comprovante_enviado_em = new Date().toISOString();
      }
    }

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("agendamentos").update(updateData).eq("id", id);
      if (error) {
        console.error("Erro ao atualizar agendamento no Supabase:", error);
      }
    }

    ServerStore.updateAgendamento(id, updateData);
    if (status) {
      ServerStore.updateStatusAgendamento(id, status, forma_pagamento);
    }

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

    if (isSupabaseConfigured && supabase) {
      if (modo === "CANCELADOS") {
        await supabase.from("agendamentos").delete().or("status.eq.CANCELADO,status.eq.FALTOU");
      } else {
        await supabase.from("agendamentos").delete().neq("id", "none");
      }
    }

    const removidos = ServerStore.limparAgendamentos(modo);
    return NextResponse.json({ success: true, removidos });
  } catch (error) {
    console.error("Erro ao limpar agendamentos:", error);
    return NextResponse.json({ error: "Erro interno ao limpar agendamentos" }, { status: 500 });
  }
}
