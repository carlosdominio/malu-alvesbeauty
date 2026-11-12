const {
  lerBancoCentral,
  obterServicosAtivos,
  obterCumprimentoHorario,
  formatarMensagemZap,
  formatarListaServicosZap,
  verificarRespostaCustomizada,
  buscarClientePorTelefone,
  buscarAgendamentoAtivo,
  buscarAgendamentoAguardandoSinal,
  gerarDiasDisponiveis,
  calcularHorariosParaData,
  salvarAgendamentoNoPainel,
  cancelarAgendamentoNoPainel,
  aprovarComprovanteCliente,
  verificarSeHorarioLivre,
} = require('./store');
const { formatarMoeda, sleep } = require('./config');

const userSessions = new Map();

async function processarMensagemRobo(remoteJid, textoUsuario, pushNameRaw, realPhone, ehMidia = false) {
  const textoLimpo = (textoUsuario || "").trim().toLowerCase();
  let session = userSessions.get(remoteJid) || { step: "INICIAL" };
  let resposta = "";

  const agoraMs = Date.now();
  if (!remoteConfigCache) {
    await atualizarConfigRemoto().catch(() => {});
  }
  const db = lerBancoCentral();

  // Verifica se o Atendimento Automático está ativado nas Regras do Robô
  if (db.config?.mensagens_zap?.robo_ativo === false) {
    console.log(`ℹ️ [WhatsApp] Mensagem de ${remoteJid} ignorada: Atendimento Automático desativado nas Regras.`);
    return null;
  }

  const timeoutMin = db.config?.tempo_inatividade_bot_minutos || 15;
  const timeoutMs = timeoutMin * 60 * 1000;

  if (session.step && session.step !== "INICIAL" && session.lastActivity) {
    const tempoInativo = agoraMs - session.lastActivity;
    if (tempoInativo > timeoutMs && session.step !== "AGUARDANDO_COMPROVANTE") {
      session = { step: "INICIAL", lastActivity: agoraMs };
    }
  }
  session.lastActivity = agoraMs;

  const letras = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const telefoneFinal = realPhone || remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "").replace(/\D/g, "");

  const clienteCadastrado = buscarClientePorTelefone(telefoneFinal);
  const agendamentoAtivo = buscarAgendamentoAtivo(telefoneFinal);
  const servicosAtivos = obterServicosAtivos();

  const pushNameLimpo = (pushNameRaw || "").replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "").trim();
  const nomeDetectado = pushNameLimpo || "Cliente";

  const ehComprovante =
    ehMidia ||
    textoLimpo.includes("comprovante") ||
    textoLimpo.includes("segue o comprovante") ||
    textoLimpo.includes("foto do comprovante") ||
    ((textoLimpo.includes("enviei") || textoLimpo.includes("mandei") || textoLimpo.includes("transferi") || textoLimpo.includes("fiz o pix")) &&
      (textoLimpo.includes("pix") || textoLimpo.includes("sinal") || textoLimpo.includes("comprovante") || textoLimpo.includes("valor")));

  if (session.step === "AGUARDANDO_COMPROVANTE" || ehComprovante) {
    const agAprovado = await aprovarComprovanteCliente(telefoneFinal);
    const agendamentoAlvo = agAprovado || buscarAgendamentoAguardandoSinal(telefoneFinal);

    if (agendamentoAlvo) {
      session = { step: "INICIAL" };
      userSessions.set(remoteJid, session);
      return (
        `📸 *Comprovante do PIX recebido com sucesso!* ✨\n\n` +
        `Olá, *${nomeDetectado}*! Identificamos o seu comprovante do sinal e o seu agendamento para *${agendamentoAlvo.servico_titulo || "o procedimento"}* está *100% CONFIRMADO* na agenda do Studio Malu Alves Beauty! 🌸\n\n` +
        `📍 *Local:* Studio Malu Alves Beauty\n` +
        `Te enviaremos uma mensagem de lembrete antes do horário. Agradecemos a preferência e esperamos por você! ✨`
      );
    } else if (session.step === "AGUARDANDO_COMPROVANTE") {
      session = { step: "INICIAL" };
      userSessions.set(remoteJid, session);
      return (
        `📸 *Comprovante recebido com sucesso!* ✨\n\n` +
        `Nossa equipe já foi notificada no painel administrativo e seu horário está garantido! Qualquer dúvida, estamos à disposição. 💖`
      );
    }
  }

  // ETAPA 1: MENU PRINCIPAL
  if (session.step === "INICIAL") {
    if (agendamentoAtivo) {
      const horaStr = agendamentoAtivo.horario_inicio.split("T")[1]?.slice(0, 5) || "";
      const dataStr = agendamentoAtivo.horario_inicio.split("T")[0].split("-").reverse().slice(0, 2).join("/");

      if (textoLimpo === "1" || textoLimpo.includes("desmarcar") || textoLimpo.includes("cancelar") || textoLimpo.includes("remarcar")) {
        await cancelarAgendamentoNoPainel(agendamentoAtivo.id);

        const diasDisponiveis = gerarDiasDisponiveis();
        session = {
          step: "ESCOLHENDO_DIA",
          servico: { id: agendamentoAtivo.servico_id, titulo: agendamentoAtivo.servico_titulo, preco: agendamentoAtivo.valor_cobrado, duracao_minutos: agendamentoAtivo.duracao_minutos || 30 },
          diasDisponiveis,
          nomeCliente: nomeDetectado,
        };

        const listaDias = diasDisponiveis.map((d, i) => `*${i + 1}* - ${d.rotulo}`).join("\n");
        resposta =
          `✅ *Seu agendamento anterior de ${dataStr} às ${horaStr} foi cancelado.*\n\n` +
          `📅 *Escolha a nova data para seu ${agendamentoAtivo.servico_titulo}:*\n\n${listaDias}\n\n` +
          `_Digite o número da data desejada:_`;
      } else if (textoLimpo === "2" || textoLimpo.includes("novo") || textoLimpo.includes("outro")) {
        resposta =
          `✂️ *Escolha o serviço adicional desejado:*\n\n` +
          formatarListaServicosZap(servicosAtivos) +
          `\n\n_Digite o número do serviço desejado:_`;
        session = { step: "ESCOLHENDO_SERVICO", nomeCliente: nomeDetectado };
      } else if (textoLimpo === "3" || textoLimpo.includes("dono") || textoLimpo.includes("designer") || textoLimpo.includes("atendente")) {
        resposta = `👩‍💼 Um momento, ${nomeDetectado}! Já avisei a designer e ela irá falar com você em instantes.`;
      } else {
        const cumprimento = obterCumprimentoHorario();
        resposta =
          `✨ *${cumprimento}, ${nomeDetectado}!* ✨\n\n` +
          `📅 *Você já possui um agendamento confirmado:*\n` +
          `• *${agendamentoAtivo.servico_titulo}*\n` +
          `• *Data:* ${dataStr} às *${horaStr}*\n` +
          `• *Local:* Studio Malu Alves Beauty\n\n` +
          `Como posso te ajudar hoje?\n\n` +
          `*1* ➔ Cancelar / Remarcar este horário\n` +
          `*2* ➔ Fazer um novo agendamento adicional\n` +
          `*3* ➔ Falar com a Designer\n\n` +
          `_Digite o número da opção desejada:_`;
      }
    } else {
      if (
        textoLimpo === "1" ||
        textoLimpo.includes("agendar") ||
        textoLimpo.includes("marcar") ||
        textoLimpo.includes("sobrancelha") ||
        textoLimpo.includes("horario") ||
        textoLimpo.includes("horário")
      ) {
        if (clienteCadastrado?.ultimo_servico_nome) {
          const ultimoSrv = servicosAtivos.find((s) => s.id === clienteCadastrado.ultimo_servico_id) || servicosAtivos[0];
          const diasDisponiveis = gerarDiasDisponiveis();
          session = {
            step: "ESCOLHENDO_DIA",
            servico: ultimoSrv,
            diasDisponiveis,
            nomeCliente: nomeDetectado,
          };
          const listaDias = diasDisponiveis.map((d, i) => `*${i + 1}* - ${d.rotulo}`).join("\n");
          const cumprimento = obterCumprimentoHorario();

          resposta =
            `✨ *${cumprimento}, ${nomeDetectado}!* ✨\n` +
            `Vamos marcar seu *${ultimoSrv.titulo}* (${formatarMoeda(ultimoSrv.preco)})?\n\n` +
            `📅 *Escolha o dia:*\n\n${listaDias}\n\n` +
            `_Digite o número do dia (ou digite *Outro* para mudar o procedimento):_`;
        } else {
          resposta =
            `✨ *Escolha o procedimento desejado:*\n\n` +
            formatarListaServicosZap(servicosAtivos) +
            `\n\n_Digite o número do procedimento desejado (ex: 1, 2 ou 3):_`;
          session = { step: "ESCOLHENDO_SERVICO", nomeCliente: nomeDetectado };
        }
      } else if (textoLimpo === "2" || textoLimpo.includes("preço") || textoLimpo.includes("serviço") || textoLimpo.includes("procedimento")) {
        resposta =
          `📋 *Nossa Tabela de Procedimentos:*\n\n` +
          formatarListaServicosZap(servicosAtivos) +
          `\n\nDigite *1* para agendar seu horário!`;
      } else if (textoLimpo === "3" || textoLimpo.includes("dono") || textoLimpo.includes("humano") || textoLimpo.includes("designer")) {
        resposta = `👩‍💼 Um momento, ${nomeDetectado}! Já notifiquei a equipe e iremos te responder em instantes por aqui.`;
      } else {
        const respCustom = verificarRespostaCustomizada(textoLimpo, db.config);
        if (respCustom) {
          resposta = `${respCustom.resposta}\n\n_Digite *1* para agendar ou *Menu* para ver as opções._`;
        } else {
          const customizadas = (db.config?.mensagens_zap?.respostas_personalizadas || []).filter((r) => r.ativo);
          let linhasCustom = "";
          if (customizadas.length > 0) {
            linhasCustom = "\n" + customizadas.map((r, i) => `*${r.opcao_numero || i + 4}* ➔ ${r.titulo}`).join("\n");
          }

          const cumprimento = obterCumprimentoHorario();
          const saudacao = clienteCadastrado
            ? `${cumprimento}, ${nomeDetectado}! Que bom ter você de volta! ✨ (${clienteCadastrado.total_visitas || 1} atendimentos no Cartão Fidelidade ⭐)`
            : `${cumprimento}, ${nomeDetectado}! Bem-vinda ao Studio Malu Alves Beauty! ✨`;

          if (db.config?.mensagens_zap?.boas_vindas) {
            resposta = formatarMensagemZap(db.config.mensagens_zap.boas_vindas, {
              cliente: nomeDetectado,
              cumprimento,
              saudacao,
              opcoes_personalizadas: linhasCustom.trim(),
            });
          } else {
            resposta =
              `✨ *${saudacao}*\n\n` +
              `Como posso te ajudar hoje?\n\n` +
              `*1* ➔ Agendar um Horário\n` +
              `*2* ➔ Ver Procedimentos e Valores\n` +
              `*3* ➔ Falar com a Equipe` +
              linhasCustom +
              `\n\n_Digite o número da opção desejada:_`;
          }
        }
      }
    }
  }

  // ETAPA 2: ESCOLHENDO SERVIÇO
  else if (session.step === "ESCOLHENDO_SERVICO") {
    const num = parseInt(textoLimpo, 10);
    if (!isNaN(num) && num >= 1 && num <= servicosAtivos.length) {
      const srv = servicosAtivos[num - 1];
      const diasDisponiveis = gerarDiasDisponiveis();

      session = {
        step: "ESCOLHENDO_DIA",
        servico: srv,
        diasDisponiveis,
        nomeCliente: session.nomeCliente || nomeDetectado,
      };

      const listaDias = diasDisponiveis.map((d, i) => `*${i + 1}* - ${d.rotulo}`).join("\n");
      resposta =
        `✅ Procedimento selecionado: *${srv.titulo}* (${formatarMoeda(srv.preco)})\n\n` +
        `📅 *Escolha o dia para seu atendimento:*\n\n${listaDias}\n\n` +
        `_Digite o número correspondente ao dia desejado (ex: 1 ou 2):_`;
    } else {
      resposta = `Opção inválida. Digite o número de 1 a ${servicosAtivos.length} referente ao procedimento:`;
    }
  }

  // ETAPA 3: ESCOLHENDO DIA
  else if (session.step === "ESCOLHENDO_DIA") {
    if (textoLimpo === "outro" || textoLimpo.includes("mudar")) {
      resposta =
        `✨ *Escolha o procedimento desejado:*\n\n` +
        servicosAtivos.map((s, idx) => `*${idx + 1}* - ${s.titulo} (${formatarMoeda(s.preco)} - ${s.duracao_minutos}min)`).join("\n") +
        `\n\n_Digite o número do procedimento desejado:_`;
      session = { step: "ESCOLHENDO_SERVICO", nomeCliente: session.nomeCliente || nomeDetectado };
    } else {
      const numDia = parseInt(textoLimpo, 10);
      const dias = session.diasDisponiveis || gerarDiasDisponiveis();

      if (!isNaN(numDia) && numDia >= 1 && numDia <= dias.length) {
        const diaEscolhido = dias[numDia - 1];
        const horarios = calcularHorariosParaData(diaEscolhido.isoData);

        if (horarios.length === 0) {
          resposta =
            `⚠️ Todos os horários para *${diaEscolhido.rotulo}* já foram preenchidos ou o expediente encerrou!\n\n` +
            `Por favor, escolha outro dia:\n\n` +
            dias.map((d, i) => `*${i + 1}* - ${d.rotulo}`).join("\n");
        } else {
          session = {
            ...session,
            step: "ESCOLHENDO_HORARIO",
            diaEscolhido,
            horariosDisponiveis: horarios,
            nomeCliente: session.nomeCliente || nomeDetectado,
          };

          const listaSlots = horarios.map((h, i) => `*${letras[i].toUpperCase()}*) ${h}`).join("\n");
          resposta =
            `📅 Dia: *${diaEscolhido.rotulo}*\n\n` +
            `🕒 *Escolha o horário livre:*\n\n${listaSlots}\n\n` +
            `_Digite a letra do horário que você prefere (ex: A, B...):_`;
        }
      } else {
        resposta = `Opção de dia inválida. Digite o número de 1 a ${dias.length}:`;
      }
    }
  }

  // ETAPA 4: ESCOLHENDO HORÁRIO
  else if (session.step === "ESCOLHENDO_HORARIO") {
    const idx = letras.indexOf(textoLimpo);

    if (idx >= 0 && session.horariosDisponiveis && idx < session.horariosDisponiveis.length) {
      const horarioEscolhido = session.horariosDisponiveis[idx];
      const nomeFinal = session.nomeCliente || nomeDetectado || "Cliente";
      const srv = session.servico || servicosAtivos[0];
      const dia = session.diaEscolhido ? session.diaEscolhido.isoData : new Date().toISOString().split("T")[0];
      const dataHoraInicio = `${dia}T${horarioEscolhido}:00`;

      const db = lerBancoCentral();
      const cfg = db.config || {};
      const exigeSinal = cfg.exigir_sinal ?? true;
      const precoFinal = srv.em_promocao && srv.preco_promocional ? srv.preco_promocional : srv.preco;
      const srvComPreco = { ...srv, preco: precoFinal };

      let valorSinal = 0;
      if (exigeSinal) {
        if (cfg.tipo_sinal === "FIXO") {
          valorSinal = cfg.sinal_valor_fixo ?? 20;
        } else {
          const pct = cfg.sinal_porcentagem ?? 30;
          valorSinal = Math.round((precoFinal * pct) / 100);
        }
      }

      salvarAgendamentoNoPainel({
        cliente_nome: nomeFinal,
        cliente_telefone: telefoneFinal,
        servico: srvComPreco,
        horario_inicio: dataHoraInicio,
        origem: "WHATSAPP",
        status: exigeSinal ? "AGUARDANDO_SINAL" : "CONFIRMADO",
        valor_sinal: exigeSinal ? valorSinal : undefined,
      });

      const dataFormatada = dia.split("-").reverse().slice(0, 2).join("/");

      if (exigeSinal) {
        if (cfg.mensagens_zap?.solicitacao_sinal) {
          resposta = formatarMensagemZap(cfg.mensagens_zap.solicitacao_sinal, {
            cliente: nomeFinal,
            servico: srv.titulo,
            data: dataFormatada,
            horario: horarioEscolhido,
            valor_total: formatarMoeda(precoFinal),
            valor_sinal: formatarMoeda(valorSinal),
            valor_restante: formatarMoeda(precoFinal - valorSinal),
            tipo_chave: "Celular",
            chave_pix: cfg.chave_pix || "82981430673",
            titular_pix: cfg.titular_pix || "Luisa Alves dos Santos",
            tempo_limite: cfg.tempo_limite_sinal_minutos || 30,
          });
        } else {
          resposta =
            `✨ *PRÉ-RESERVA REALIZADA!* ✨\n\n` +
            `👤 *Cliente:* ${nomeFinal}\n` +
            `✨ *Procedimento:* ${srv.titulo}\n` +
            `📅 *Data:* ${dataFormatada} às *${horarioEscolhido}*\n` +
            `💵 *Valor Total:* ${formatarMoeda(precoFinal)}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔒 *CONFIRMAÇÃO DO HORÁRIO (SINAL ANTECIPADO)*\n` +
            `Para confirmar sua vaga exclusiva na agenda e evitar cancelamentos, solicitamos um adiantamento de segurança:\n\n` +
            `💰 *Valor do Sinal:* *${formatarMoeda(valorSinal)}*\n` +
            `_(O restante de ${formatarMoeda(precoFinal - valorSinal)} será pago no dia do atendimento)_\n\n` +
            `🔑 *CHAVE PIX (Celular):*\n` +
            `\`${cfg.chave_pix || "82981430673"}\`\n` +
            `*Titular:* ${cfg.titular_pix || "Luisa Alves dos Santos"}\n\n` +
            `⏳ *Tempo limite:* Seu horário fica pré-reservado por *${cfg.tempo_limite_sinal_minutos || 30} minutos*.\n` +
            `Por favor, responda a esta mensagem enviando a *foto ou comprovante* do PIX para confirmarmos seu horário! ✨\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        }
        session = {
          step: "AGUARDANDO_COMPROVANTE",
          servico: srvComPreco,
          valorSinal,
          nomeCliente: nomeFinal,
          horarioEscolhido,
        };
      } else {
        if (cfg.mensagens_zap?.confirmacao_agendamento) {
          resposta = formatarMensagemZap(cfg.mensagens_zap.confirmacao_agendamento, {
            cliente: nomeFinal,
            servico: srv.titulo,
            data: dataFormatada,
            horario: horarioEscolhido,
            valor_total: formatarMoeda(precoFinal),
          });
        } else {
          resposta =
            `🎉 *AGENDAMENTO CONFIRMADO!* 🎉\n\n` +
            `👤 *Cliente:* ${nomeFinal}\n` +
            `✨ *Procedimento:* ${srv.titulo}\n` +
            `📅 *Data:* ${dataFormatada} às *${horarioEscolhido}*\n` +
            `💵 *Valor:* ${formatarMoeda(precoFinal)}\n` +
            `📍 *Local:* Studio Malu Alves Beauty\n\n` +
            `✅ _Seu horário já foi reservado na agenda da designer! Enviaremos uma mensagem de lembrete 2h antes._\n\n` +
            `Aguardamos você com muito carinho! ✨`;
        }
        session = { step: "INICIAL" };
      }
    } else {
      resposta = `Letra inválida. Por favor, digite uma das letras listadas acima (ex: A, B, C...):`;
    }
  }

  // ETAPA: SINAL EXPIRADO - RECUPERAÇÃO INTERATIVA
  else if (session.step === "SINAL_EXPIRADO_MENU") {
    const nomeCli = session.nomeCliente || nomeDetectado;
    const srv = session.servico || servicosAtivos[0];
    const dataHoraOrig = session.dataHoraOriginal;
    const horaOrigStr = dataHoraOrig ? dataHoraOrig.split("T")[1]?.slice(0, 5) : "";
    const dataPart = dataHoraOrig ? dataHoraOrig.split("T")[0] : "";
    const dataFormatada = dataPart ? dataPart.split("-").reverse().slice(0, 2).join("/") : "hoje";

    if (
      textoLimpo === "1" ||
      textoLimpo.includes("mesmo") ||
      textoLimpo.includes("verificar") ||
      textoLimpo.includes("ainda") ||
      textoLimpo.includes("livre")
    ) {
      const livre = await verificarSeHorarioLivre(dataHoraOrig);
      const cfg = db.config || {};
      const chavePix = cfg.chave_pix || "82981430673";
      const titularPix = cfg.titular_pix || "Luisa Alves dos Santos";
      const valorSinal = session.valorSinal || Math.round((srv.preco || 30) * 0.3);
      const tempoLimite = cfg.tempo_limite_sinal_minutos || 30;

      if (livre) {
        await salvarAgendamentoNoPainel({
          cliente_nome: nomeCli,
          cliente_telefone: telefoneFinal,
          servico: srv,
          horario_inicio: dataHoraOrig,
          origem: "WHATSAPP",
          status: "AGUARDANDO_SINAL",
          valor_sinal: valorSinal,
        });

        session = {
          step: "AGUARDANDO_COMPROVANTE",
          servico: srv,
          valorSinal,
          nomeCliente: nomeCli,
          horarioEscolhido: horaOrigStr,
          dataHoraOriginal: dataHoraOrig,
          lastActivity: Date.now(),
        };

        resposta =
          `🎉 *Ótima notícia, ${nomeCli}!* ✨\n\n` +
          `O horário de *${dataFormatada} às ${horaOrigStr}* para *${srv.titulo}* ainda continua livre na agenda!\n\n` +
          `Reservamos novamente sua vaga! Para garantir com exclusividade:\n\n` +
          `💰 *Valor do Sinal:* *${formatarMoeda(valorSinal)}*\n` +
          `🔑 *CHAVE PIX (Celular):*\n` +
          `\`${chavePix}\`\n` +
          `*Titular:* ${titularPix}\n\n` +
          `⏳ *Tempo limite:* *${tempoLimite} minutos*.\n` +
          `Por favor, envie o comprovante do PIX por aqui para confirmarmos seu horário imediatamente! 🌸`;
      } else {
        const diasDisponiveis = gerarDiasDisponiveis();
        session = {
          step: "ESCOLHENDO_DIA",
          servico: srv,
          diasDisponiveis,
          nomeCliente: nomeCli,
          lastActivity: Date.now(),
        };

        const listaDias = diasDisponiveis.map((d, i) => `*${i + 1}* - ${d.rotulo}`).join("\n");
        resposta =
          `😔 *Puxa, ${nomeCli}!* O horário de *${dataFormatada} às ${horaOrigStr}* acabou de ser preenchido por outra cliente ou já encerrou.\n\n` +
          `Mas não se preocupe! Vamos escolher outra data para o seu *${srv.titulo}*:\n\n` +
          `📅 *Escolha o melhor dia:*\n\n${listaDias}\n\n` +
          `_Digite o número da data desejada (ou digite *Menu* para escolher outro procedimento):_`;
      }
    } else if (
      textoLimpo === "2" ||
      textoLimpo.includes("menu") ||
      textoLimpo.includes("procedimento") ||
      textoLimpo.includes("serviço") ||
      textoLimpo.includes("outro") ||
      textoLimpo.includes("dias")
    ) {
      resposta =
        `✨ *Escolha o procedimento desejado:*\n\n` +
        formatarListaServicosZap(servicosAtivos) +
        `\n\n_Digite o número do procedimento desejado (ex: 1, 2 ou 3):_`;
      session = {
        step: "ESCOLHENDO_SERVICO",
        nomeCliente: nomeCli,
        lastActivity: Date.now(),
      };
    } else if (
      textoLimpo === "3" ||
      textoLimpo.includes("dono") ||
      textoLimpo.includes("designer") ||
      textoLimpo.includes("humano") ||
      textoLimpo.includes("atendente")
    ) {
      resposta = `👩‍💼 Um momento, ${nomeCli}! Já notifiquei a designer Malu Alves e ela irá falar com você em instantes por aqui. 💖`;
      session = { step: "INICIAL", lastActivity: Date.now() };
    } else {
      resposta =
        `Como posso te ajudar com a sua reserva, ${nomeCli}?\n\n` +
        `*1* ➔ Verificar se o mesmo horário (${dataFormatada} às ${horaOrigStr}) ainda está livre\n` +
        `*2* ➔ Ver outros dias e procedimentos disponíveis\n` +
        `*3* ➔ Falar com a Designer\n\n` +
        `_Digite 1, 2 ou 3:_`;
    }
  }

  session.lastActivity = Date.now();
  userSessions.set(remoteJid, session);
  return resposta;
}


module.exports = {
  userSessions,
  processarMensagemRobo,
};
