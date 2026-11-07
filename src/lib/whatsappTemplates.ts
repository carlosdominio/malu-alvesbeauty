import { BarbeariaConfig, MensagensWhatsAppConfig, RespostaAutomatica, Servico } from "@/types";
import { formatarMoeda } from "./utils";

export function obterCumprimentoHorario(data: Date = new Date()): string {
  const hora = data.getHours();
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

export const MENSAGENS_PADRAO: Required<Omit<MensagensWhatsAppConfig, "respostas_personalizadas">> = {
  boas_vindas:
    `✨ *{cumprimento}! Bem-vinda ao Studio Malu Alves Beauty!* ✨\n\n` +
    `Eu sou a assistente virtual. Como posso te ajudar hoje?\n\n` +
    `*1* ➔ Agendar um Horário\n` +
    `*2* ➔ Ver Nossos Procedimentos e Valores\n` +
    `*3* ➔ Falar com a Equipe\n` +
    `{opcoes_personalizadas}\n` +
    `_Digite o número da opção desejada:_`,

  solicitacao_sinal:
    `✨ *PRÉ-RESERVA REALIZADA COM SUCESSO!* ✨\n\n` +
    `👤 *Cliente:* {cliente}\n` +
    `✨ *Procedimento:* {servico}\n` +
    `📅 *Data:* {data} às *{horario}*\n` +
    `💵 *Valor Total:* {valor_total}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔒 *GARANTIA DO SEU HORÁRIO*\n` +
    `Para confirmar com exclusividade a sua vaga na agenda e evitar cancelamentos, solicitamos um sinal de:\n\n` +
    `💰 *Valor do Sinal:* *{valor_sinal}*\n` +
    `_(O restante de {valor_restante} será pago no dia do atendimento)_\n\n` +
    `🔑 *CHAVE PIX ({tipo_chave}):*\n` +
    `\`{chave_pix}\`\n` +
    `*Titular:* {titular_pix}\n\n` +
    `⏳ *Atenção:* Seu horário fica pré-reservado por *{tempo_limite} minutos*.\n` +
    `Por favor, envie o comprovante do PIX respondendo a esta mensagem para confirmarmos seu horário! ✨\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,

  confirmacao_agendamento:
    `🎉 *AGENDAMENTO CONFIRMADO COM SUCESSO!* 🎉\n\n` +
    `👤 *Cliente:* {cliente}\n` +
    `✨ *Procedimento:* {servico}\n` +
    `📅 *Data:* {data} às *{horario}*\n` +
    `💵 *Valor:* {valor_total}\n` +
    `📍 *Local:* Studio Malu Alves Beauty\n\n` +
    `✅ Já inseri seu horário na agenda da designer! Te mandaremos um lembrete antes do horário.\n\n` +
    `Aguardamos você com muito carinho! ✨`,

  lembrete_2h:
    `⏰ *Lembrete do seu horário hoje!* ✨\n\n` +
    `Olá, *{cliente}*! Lembramos que o seu horário para *{servico}* está marcado para hoje às *{horario}* no Studio Malu Alves Beauty.\n\n` +
    `📍 Local: Studio Malu Alves Beauty\n` +
    `Por favor, responda com *Sim* para confirmar sua presença! Te esperamos! 🌸`,

  agradecimento_fidelidade:
    `✨ *Obrigada pela preferência, {cliente}!* ✨\n\n` +
    `Foi um imenso prazer atendê-la no Studio Malu Alves Beauty! Esperamos que tenha amado o resultado do seu procedimento.\n\n` +
    `⭐ Você possui *{visitas} atendimento(s)* no seu Cartão Fidelidade.\n\n` +
    `Quando desejar realçar seu olhar novamente, basta me mandar um *Oi* por aqui! 💖\n` +
    `Tenha um dia maravilhoso!`,

  cancelamento_studio:
    `⚠️ *Aviso do Studio Malu Alves Beauty* ⚠️\n\n` +
    `Olá, *{cliente}*! Infelizmente a designer precisou desmarcar o seu horário de *{data}* às *{horario}* devido a um imprevisto.\n\n` +
    `Pedimos sinceras desculpas pelo transtorno! Gostaria de remarcar para outro dia ou horário?\n\n` +
    `*1* ➔ Sim, ver dias e horários disponíveis\n` +
    `*2* ➔ Falar com a Designer\n\n` +
    `_Digite o número desejado:_`,

  cancelamento_sinal_expirado:
    `⏳ *Aviso sobre sua pré-reserva no Studio Malu Alves Beauty* 🌸\n\n` +
    `Olá, *{cliente}*! O prazo para envio do comprovante do sinal PIX referente ao procedimento *{servico}* (*{data}* às *{horario}*) expirou e a vaga precisou ser liberada na agenda.\n\n` +
    `Mas você ainda pode garantir seu horário! O que prefere fazer?\n\n` +
    `*1* ➔ Verificar se o mesmo horário ainda está livre para reservar agora\n` +
    `*2* ➔ Ver outros dias e procedimentos disponíveis\n` +
    `*3* ➔ Falar com a Designer\n\n` +
    `_Digite o número da opção desejada:_`,

  falta_comparecimento:
    `👋 *Olá, {cliente}! Tudo bem?*\n\n` +
    `Notamos que você não conseguiu comparecer ao seu horário para o procedimento *{servico}*.\n\n` +
    `Imprevistos acontecem! Se quiser remarcar para outro dia ou horário, é bem fácil:\n\n` +
    `*1* ➔ Remarcar meu horário agora\n` +
    `*2* ➔ Falar com a Equipe\n\n` +
    `_Digite o número desejado:_`,

  inatividade_encerramento:
    `🌸 *Atendimento pausado por inatividade* ⏳\n\n` +
    `Olá, *{cliente}*! Notamos que você não respondeu há algum tempo, então encerramos este atendimento para liberar o sistema.\n\n` +
    `Quando desejar agendar ou tirar dúvidas no *Studio Malu Alves Beauty*, basta nos mandar um *Oi* por aqui! Teremos o maior prazer em atender você! ✨`,
};

export const RESPOSTAS_PADRAO_EXEMPLOS: RespostaAutomatica[] = [
  {
    id: "resp-1",
    opcao_numero: "4",
    titulo: "Localização / Endereço",
    palavras_chave: "endereço, endereco, onde fica, local, localizacao, localização, mapa, rua",
    resposta:
      `📍 *Studio Malu Alves Beauty*\n\n` +
      `Estamos localizados em atendimento exclusivo!\n` +
      `📌 Ponto de referência: Próximo à praça central.\n` +
      `🚗 Ambiente climatizado e confortável para seu atendimento.`,
    ativo: true,
  },
  {
    id: "resp-2",
    opcao_numero: "5",
    titulo: "Formas de Pagamento",
    palavras_chave: "pagamento, pagar, cartao, cartão, pix, dinheiro, debito, credito",
    resposta:
      `💳 *Formas de Pagamento Aceitas:*\n\n` +
      `• *PIX* (Instantâneo)\n` +
      `• *Cartão de Crédito e Débito*\n` +
      `• *Dinheiro*\n\n` +
      `Garantimos total facilidade para você! ✨`,
    ativo: true,
  },
];

/**
 * Substitui tags dinâmicas como {cliente}, {servico}, {horario}, etc.
 */
export function formatarMensagem(
  template: string,
  variaveis: Record<string, string | number | undefined>
): string {
  let resultado = template;
  const cumprimentoPadrao = obterCumprimentoHorario();
  const varsCompletas = {
    cumprimento: cumprimentoPadrao,
    ...variaveis,
  };

  for (const [chave, valor] of Object.entries(varsCompletas)) {
    const safeVal = valor !== undefined && valor !== null ? String(valor) : "";
    resultado = resultado.split(`{${chave}}`).join(safeVal);
  }
  return resultado;
}

/**
 * Gera o texto do menu de boas-vindas com opções padrão + opções customizadas ativas
 */
export function gerarTextoBoasVindas(
  config?: BarbeariaConfig,
  nomeCliente?: string
): string {
  const mensagensZap = config?.mensagens_zap;
  const customizadas = (mensagensZap?.respostas_personalizadas || RESPOSTAS_PADRAO_EXEMPLOS).filter(
    (r) => r.ativo
  );

  let blocoOpcoes = "";
  if (customizadas.length > 0) {
    blocoOpcoes = customizadas
      .map((r, i) => `*${r.opcao_numero || i + 4}* ➔ ${r.titulo}`)
      .join("\n");
  }

  const template = mensagensZap?.boas_vindas || MENSAGENS_PADRAO.boas_vindas;
  const cumprimento = obterCumprimentoHorario();
  const saudacaoCliente = nomeCliente ? `${cumprimento}, *${nomeCliente}*!` : `${cumprimento}!`;

  return formatarMensagem(template, {
    cliente: nomeCliente || "Cliente",
    cumprimento,
    saudacao: saudacaoCliente,
    opcoes_personalizadas: blocoOpcoes,
  }).replace(/\n{3,}/g, "\n\n");
}

/**
 * Formata a lista de serviços para o WhatsApp, destacando serviços em promoção
 */
export function formatarListaServicosZap(servicos: Servico[]): string {
  return servicos
    .map((s, idx) => {
      if (s.em_promocao && s.preco_promocional && s.preco_promocional < s.preco) {
        return `*${idx + 1}* - ${s.titulo} (~${formatarMoeda(s.preco)}~ 🔥 *${formatarMoeda(s.preco_promocional)}* PROMOÇÃO! - ${s.duracao_minutos}min)`;
      }
      return `*${idx + 1}* - ${s.titulo} (${formatarMoeda(s.preco)} - ${s.duracao_minutos}min)`;
    })
    .join("\n");
}

/**
 * Verifica se a mensagem do usuário corresponde a alguma opção customizada (número ou palavra-chave)
 */
export function encontrarRespostaCustomizada(
  texto: string,
  respostas?: RespostaAutomatica[]
): RespostaAutomatica | null {
  if (!respostas || respostas.length === 0) return null;

  const textoLimpo = texto.toLowerCase().trim();

  for (const resp of respostas) {
    if (!resp.ativo) continue;

    // 1. Checa correspondência exata do número da opção
    if (resp.opcao_numero && textoLimpo === resp.opcao_numero.trim().toLowerCase()) {
      return resp;
    }

    // 2. Checa palavras-chave
    if (resp.palavras_chave) {
      const palavras = resp.palavras_chave
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);

      const bateu = palavras.some((p) => textoLimpo.includes(p));
      if (bateu) {
        return resp;
      }
    }

    // 3. Checa título
    if (resp.titulo && textoLimpo.includes(resp.titulo.toLowerCase())) {
      return resp;
    }
  }

  return null;
}
