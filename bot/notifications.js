const {
  lerBancoCentral,
  obterServicosAtivos,
  formatarMensagemZap,
} = require("./store");
const { formatarMoeda } = require("./config");
const { userSessions } = require("./engine");

let currentSock = null;
const phoneToJidMap = new Map();

function setSocket(sock) {
  currentSock = sock;
}

function getSocket() {
  return currentSock;
}

async function enviarMensagemHumana(remoteJid, texto) {
  if (!currentSock) return;
  try {
    currentSock.sendPresenceUpdate("composing", remoteJid).catch(() => {});
    await currentSock.sendMessage(remoteJid, { text: texto });
    console.log(`>>> [WhatsApp] Resposta enviada com sucesso para ${remoteJid}`);
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
  }
}

async function resolverRemoteJid(telefone) {
  let telLimpo = String(telefone || "").replace(/\D/g, "");
  if (telLimpo.startsWith("0")) {
    telLimpo = telLimpo.replace(/^0+/, "");
  }
  if (!telLimpo) return null;

  let targetJid =
    phoneToJidMap.get(telLimpo) ||
    phoneToJidMap.get(`55${telLimpo}`) ||
    phoneToJidMap.get(telLimpo.startsWith("55") ? telLimpo.slice(2) : telLimpo);

  if (targetJid) {
    return targetJid;
  }

  if (currentSock) {
    try {
      const numCom55 = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
      const res = await currentSock.onWhatsApp(numCom55);
      if (res && res.length > 0 && res[0].exists) {
        targetJid = res[0].jid;
        phoneToJidMap.set(telLimpo, targetJid);
        phoneToJidMap.set(numCom55, targetJid);
        return targetJid;
      }

      if (numCom55.length === 13 && numCom55.startsWith("55")) {
        const ddd = numCom55.slice(2, 4);
        const semNono = `55${ddd}${numCom55.slice(5)}`;
        const resSemNono = await currentSock.onWhatsApp(semNono);
        if (resSemNono && resSemNono.length > 0 && resSemNono[0].exists) {
          targetJid = resSemNono[0].jid;
          phoneToJidMap.set(telLimpo, targetJid);
          phoneToJidMap.set(numCom55, targetJid);
          return targetJid;
        }
      }
    } catch (err) {
      console.error("Erro ao validar onWhatsApp:", err.message);
    }
  }

  const numFinal = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
  targetJid = `${numFinal}@s.whatsapp.net`;
  return targetJid;
}

async function notificarCancelamentoSinalExpirado(dados) {
  const { telefone, nome, dataHora, servicoTitulo, servicoId, valor, valorSinal } = dados;
  const targetJid = await resolverRemoteJid(telefone);
  if (!currentSock || !targetJid) return false;

  const horaStr = dataHora ? dataHora.split("T")[1]?.slice(0, 5) : "";
  const dataPart = dataHora ? dataHora.split("T")[0] : "";
  const dataFormatada = dataPart ? dataPart.split("-").reverse().slice(0, 2).join("/") : "hoje";

  const db = lerBancoCentral();
  const servicos = obterServicosAtivos();
  const srvObj = servicos.find((s) => s.id === servicoId || s.titulo === servicoTitulo) || {
    id: servicoId || "serv-1",
    titulo: servicoTitulo || "Design de Sobrancelhas",
    preco: Number(valor) || 30,
    duracao_minutos: 30,
  };

  const valorFinal = Number(valor) || srvObj.preco || 30;
  const sinalFinal = Number(valorSinal) || Math.round(valorFinal * 0.3);

  const mensagem = db.config?.mensagens_zap?.cancelamento_sinal_expirado
    ? formatarMensagemZap(db.config.mensagens_zap.cancelamento_sinal_expirado, {
        cliente: nome || "Cliente",
        servico: srvObj.titulo,
        data: dataFormatada,
        horario: horaStr,
        valor_sinal: formatarMoeda(sinalFinal),
      })
    : `⏳ *Aviso sobre sua pré-reserva no Studio Malu Alves Beauty* 🌸\n\n` +
      `Olá, *${nome || "Cliente"}*! O prazo para envio do sinal PIX referente ao procedimento *${srvObj.titulo}* (*${dataFormatada}* às *${horaStr}*) expirou e a vaga precisou ser liberada na agenda.\n\n` +
      `Mas você ainda pode garantir seu horário! O que prefere fazer?\n\n` +
      `*1* ➔ Verificar se o mesmo horário ainda está livre para reservar agora\n` +
      `*2* ➔ Ver outros dias e procedimentos disponíveis\n` +
      `*3* ➔ Falar com a Designer\n\n` +
      `_Digite o número da opção desejada:_`;

  userSessions.set(targetJid, {
    step: "SINAL_EXPIRADO_MENU",
    nomeCliente: nome || "Cliente",
    servico: srvObj,
    dataHoraOriginal: dataHora,
    valorSinal: sinalFinal,
    valorTotal: valorFinal,
    lastActivity: Date.now(),
  });

  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

async function notificarCancelamentoAdmin(telefone, nomeCliente, dataHora) {
  const targetJid = await resolverRemoteJid(telefone);
  if (!currentSock || !targetJid) return false;

  const horaStr = dataHora ? dataHora.split("T")[1]?.slice(0, 5) : "";
  const dataPart = dataHora ? dataHora.split("T")[0] : "";
  const dataFormatada = dataPart ? dataPart.split("-").reverse().slice(0, 2).join("/") : "hoje";

  const db = lerBancoCentral();
  const mensagem = db.config?.mensagens_zap?.cancelamento_studio
    ? formatarMensagemZap(db.config.mensagens_zap.cancelamento_studio, {
        cliente: nomeCliente,
        data: dataFormatada,
        horario: horaStr,
      })
    : `⚠️ *Aviso do Studio Malu Alves Beauty* ⚠️\n\n` +
      `Olá, *${nomeCliente}*! Infelizmente a designer precisou desmarcar o seu horário de *${dataFormatada}* às *${horaStr}* devido a um imprevisto.\n\n` +
      `Pedimos sinceras desculpas pelo transtorno! Gostaria de remarcar para outro dia ou horário?\n\n` +
      `*1* ➔ Sim, ver dias e horários disponíveis\n` +
      `*2* ➔ Falar com a Designer\n\n` +
      `_Digite o número da opção desejada para remarcar:_`;

  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

async function notificarConclusaoAdmin(telefone, nomeCliente, totalVisitas) {
  const targetJid = await resolverRemoteJid(telefone);
  if (!currentSock || !targetJid) return false;

  const visitas = totalVisitas || 1;
  const elegivelDesconto = visitas > 0 && visitas % 5 === 0;

  const db = lerBancoCentral();
  let mensagem = "";

  if (db.config?.mensagens_zap?.agradecimento_fidelidade) {
    mensagem = formatarMensagemZap(db.config.mensagens_zap.agradecimento_fidelidade, {
      cliente: nomeCliente,
      visitas,
    });
  } else {
    let mensagemFidelidade = `⭐ Você possui *${visitas} ${visitas === 1 ? "atendimento realizado" : "atendimentos realizados"}* no seu Cartão Fidelidade.`;
    if (elegivelDesconto) {
      mensagemFidelidade =
        `🎉 *PARABÉNS!* Você completou seu 5º atendimento no Cartão Fidelidade!\n` +
        `🎯 No seu próximo procedimento você tem direito a um *Super Desconto Especial!*`;
    }

    mensagem =
      `✨ *Obrigada pela preferência, ${nomeCliente}!* ✨\n\n` +
      `Foi um imenso prazer atendê-la no Studio Malu Alves Beauty! Esperamos que tenha amado o resultado das suas sobrancelhas.\n\n` +
      `${mensagemFidelidade}\n\n` +
      `Quando desejar realçar seu olhar novamente, basta me mandar um *Oi* por aqui! 💖\n` +
      `Tenha um dia maravilhoso!`;
  }

  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

async function notificarFaltaAdmin(telefone, nomeCliente, servicoTitulo, dataHora) {
  const targetJid = await resolverRemoteJid(telefone);
  if (!currentSock || !targetJid) return false;

  const horaStr = dataHora ? dataHora.split("T")[1]?.slice(0, 5) : "";
  const db = lerBancoCentral();

  const mensagem = db.config?.mensagens_zap?.falta_comparecimento
    ? formatarMensagemZap(db.config.mensagens_zap.falta_comparecimento, {
        cliente: nomeCliente,
        servico: servicoTitulo,
        horario: horaStr,
      })
    : `👋 *Olá, ${nomeCliente}! Tudo bem?*\n\n` +
      `Notamos que você não conseguiu comparecer ao seu horário de hoje às *${horaStr}* para o procedimento *${servicoTitulo || "Design de Sobrancelhas"}*.\n\n` +
      `Imprevistos acontecem! Se quiser escolher outro dia ou horário para fazer seu procedimento, é bem fácil:\n\n` +
      `*1* ➔ Remarcar meu horário agora\n` +
      `*2* ➔ Falar com a Equipe\n\n` +
      `_Digite o número desejado:_`;

  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

async function notificarConfirmacaoWeb(telefone, nomeCliente, servicoTitulo, dataHora, valor) {
  const targetJid = await resolverRemoteJid(telefone);
  if (!currentSock || !targetJid) return false;

  const horaStr = dataHora ? dataHora.split("T")[1]?.slice(0, 5) : "";
  const dataPart = dataHora ? dataHora.split("T")[0] : "";
  const dataFormatada = dataPart ? dataPart.split("-").reverse().slice(0, 2).join("/") : "hoje";

  const db = lerBancoCentral();
  const mensagem = db.config?.mensagens_zap?.confirmacao_agendamento
    ? formatarMensagemZap(db.config.mensagens_zap.confirmacao_agendamento, {
        cliente: nomeCliente,
        servico: servicoTitulo || "Design de Sobrancelhas",
        data: dataFormatada,
        horario: horaStr,
        valor_total: formatarMoeda(valor || 30),
      })
    : `🎉 *AGENDAMENTO CONFIRMADO VIA SITE!* ✨\n\n` +
      `Olá, *${nomeCliente}*! Seu horário foi reservado com sucesso pelo site.\n\n` +
      `• *Procedimento:* ${servicoTitulo || "Design de Sobrancelhas"}\n` +
      `• *Data:* ${dataFormatada} às *${horaStr}*\n` +
      `• *Valor:* ${formatarMoeda(valor || 30)}\n` +
      `📍 *Local:* Studio Malu Alves Beauty\n\n` +
      `✅ _Seu horário já está garantido na agenda da designer! Te mandaremos um lembrete 2h antes._\n\n` +
      `Esperamos por você! ✨`;

  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

async function notificarSolicitacaoSinalWeb(dados) {
  const {
    telefone,
    nome,
    servicoTitulo,
    dataHora,
    valor,
    valorSinal,
    chavePix,
    titularPix,
    tempoLimiteMinutos,
  } = dados;
  const targetJid = await resolverRemoteJid(telefone);
  if (!currentSock || !targetJid) return false;

  const horaStr = dataHora ? dataHora.split("T")[1]?.slice(0, 5) : "";
  const dataPart = dataHora ? dataHora.split("T")[0] : "";
  const dataFormatada = dataPart ? dataPart.split("-").reverse().slice(0, 2).join("/") : "hoje";

  const valorTotalNum = Number(valor) || 30;
  const valorSinalNum = Number(valorSinal) || Math.round(valorTotalNum * 0.3);
  const restanteNum = Math.max(valorTotalNum - valorSinalNum, 0);

  const db = lerBancoCentral();
  const mensagem = db.config?.mensagens_zap?.solicitacao_sinal
    ? formatarMensagemZap(db.config.mensagens_zap.solicitacao_sinal, {
        cliente: nome || "Cliente",
        servico: servicoTitulo || "Design de Sobrancelhas",
        data: dataFormatada,
        horario: horaStr,
        valor_total: formatarMoeda(valorTotalNum),
        valor_sinal: formatarMoeda(valorSinalNum),
        valor_restante: formatarMoeda(restanteNum),
        tipo_chave: "Celular",
        chave_pix: chavePix || "82981430673",
        titular_pix: titularPix || "Luisa Alves dos Santos",
        tempo_limite: tempoLimiteMinutos || 30,
      })
    : `✨ *PRÉ-RESERVA REALIZADA COM SUCESSO!* ✨\n\n` +
      `Olá, *${nome || "Cliente"}*! Recebemos sua solicitação de agendamento pelo site do Studio Malu Alves Beauty.\n\n` +
      `• *Procedimento:* ${servicoTitulo || "Design de Sobrancelhas"}\n` +
      `• *Data:* ${dataFormatada} às *${horaStr}*\n` +
      `• *Valor Total:* ${formatarMoeda(valorTotalNum)}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔒 *CONFIRMAÇÃO DO AGENDAMENTO (SINAL ANTECIPADO)*\n` +
      `Para garantir com exclusividade a sua vaga na agenda da designer e evitar cancelamentos, solicitamos um adiantamento de segurança:\n\n` +
      `💰 *Valor do Sinal:* *${formatarMoeda(valorSinalNum)}*\n` +
      `_(O restante de ${formatarMoeda(restanteNum)} será pago no dia do seu atendimento)_\n\n` +
      `🔑 *CHAVE PIX (Celular):*\n` +
      `\`${chavePix || "82981430673"}\`\n` +
      `*Titular:* ${titularPix || "Luisa Alves dos Santos"}\n\n` +
      `⏳ *Tempo limite:* Seu horário fica reservado por *${tempoLimiteMinutos || 30} minutos*.\n` +
      `Por favor, responda a esta mensagem enviando a *foto ou comprovante* do PIX para que o robô confirme seu horário automaticamente! ✨\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  userSessions.set(targetJid, {
    step: "AGUARDANDO_COMPROVANTE",
    servico: { titulo: servicoTitulo, preco: valorTotalNum },
    valorSinal: valorSinalNum,
    clienteNome: nome,
    horarioInicio: dataHora,
  });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

module.exports = {
  phoneToJidMap,
  setSocket,
  getSocket,
  enviarMensagemHumana,
  resolverRemoteJid,
  notificarCancelamentoSinalExpirado,
  notificarCancelamentoAdmin,
  notificarConclusaoAdmin,
  notificarFaltaAdmin,
  notificarConfirmacaoWeb,
  notificarSolicitacaoSinalWeb,
};
