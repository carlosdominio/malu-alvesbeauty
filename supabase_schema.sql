-- ==============================================================================
-- 💈 BARBER-OS: SCHEMA COMPLETO DO BANCO DE DADOS (SUPABASE / POSTGRESQL)
-- ==============================================================================

-- 1. TABELA DE CONFIGURAÇÃO DA BARBEARIA (DONO ÚNICO)
CREATE TABLE IF NOT EXISTS barbearia_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_barbearia TEXT NOT NULL DEFAULT 'Barbearia do Chefe',
    telefone_whatsapp TEXT NOT NULL DEFAULT '11999999999',
    tempo_buffer_minutos INT NOT NULL DEFAULT 5,
    antecedencia_minima_cancelamento_horas INT NOT NULL DEFAULT 2,
    mensagem_boas_vindas TEXT DEFAULT 'Bem-vindo! Agende seu horário com facilidade.',
    chave_pix TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. TABELA DE HORÁRIOS DE EXPEDIENTE (DIAS DA SEMANA)
-- 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
CREATE TABLE IF NOT EXISTS expediente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dia_semana INT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora_inicio TIME NOT NULL DEFAULT '09:00:00',
    hora_fim TIME NOT NULL DEFAULT '19:00:00',
    intervalo_inicio TIME DEFAULT '12:00:00',
    intervalo_fim TIME DEFAULT '13:00:00',
    ativo BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(dia_semana)
);

-- 3. TABELA DE BLOQUEIOS MANUAIS (IMPREVISTOS / FOLGAS / FERIADOS)
CREATE TABLE IF NOT EXISTS bloqueios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    data_fim TIMESTAMP WITH TIME ZONE NOT NULL,
    motivo TEXT NOT NULL DEFAULT 'Pausa / Imprevisto',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. TABELA DE SERVIÇOS
CREATE TABLE IF NOT EXISTS servicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    preco DECIMAL(10,2) NOT NULL,
    duracao_minutos INT NOT NULL DEFAULT 30,
    ativo BOOLEAN NOT NULL DEFAULT true,
    icone TEXT DEFAULT 'scissors',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. TABELA DE CLIENTES (IDENTIFICAÇÃO ÚNICA POR TELEFONE / WHATSAPP)
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    telefone TEXT UNIQUE NOT NULL,
    ultimo_servico_id UUID REFERENCES servicos(id) ON DELETE SET NULL,
    ultimo_servico_nome TEXT,
    ultima_visita TIMESTAMP WITH TIME ZONE,
    total_visitas INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. TABELA DE AGENDAMENTOS
CREATE TABLE IF NOT EXISTS agendamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    cliente_nome TEXT NOT NULL,
    cliente_telefone TEXT NOT NULL,
    servico_id UUID REFERENCES servicos(id) ON DELETE RESTRICT NOT NULL,
    servico_titulo TEXT NOT NULL,
    horario_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
    horario_fim TIMESTAMP WITH TIME ZONE NOT NULL,
    duracao_minutos INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'CONFIRMADO' CHECK (status IN ('CONFIRMADO', 'CONCLUIDO', 'CANCELADO', 'FALTOU')),
    origem TEXT NOT NULL DEFAULT 'WEB' CHECK (origem IN ('WEB', 'WHATSAPP', 'MANUAL')),
    forma_pagamento TEXT CHECK (forma_pagamento IN ('PIX', 'DINHEIRO', 'CARTAO')),
    valor_cobrado DECIMAL(10,2) NOT NULL,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ÍNDICES DE ALTA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_agendamentos_horario ON agendamentos (horario_inicio, horario_fim);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos (status);
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes (telefone);

-- ==============================================================================
-- DADOS INICIAIS (SEED DATA) PARA VALIDAÇÃO IMEDIATA
-- ==============================================================================

-- Inserir Configuração Padrão se não existir
INSERT INTO barbearia_config (nome_barbearia, telefone_whatsapp, tempo_buffer_minutos, antecedencia_minima_cancelamento_horas, chave_pix)
VALUES ('Barbearia Imperial', '11999998888', 5, 2, 'pix@barbeariaimperial.com.br')
ON CONFLICT DO NOTHING;

-- Inserir Expediente Padrão (Seg a Sáb: 09h às 19h com 1h de almoço | Dom: Fechado)
INSERT INTO expediente (dia_semana, hora_inicio, hora_fim, intervalo_inicio, intervalo_fim, ativo) VALUES
(0, '09:00:00', '14:00:00', NULL, NULL, false), -- Domingo: Fechado
(1, '09:00:00', '19:00:00', '12:00:00', '13:00:00', true),  -- Segunda
(2, '09:00:00', '19:00:00', '12:00:00', '13:00:00', true),  -- Terça
(3, '09:00:00', '19:00:00', '12:00:00', '13:00:00', true),  -- Quarta
(4, '09:00:00', '19:00:00', '12:00:00', '13:00:00', true),  -- Quinta
(5, '09:00:00', '20:00:00', '12:00:00', '13:00:00', true),  -- Sexta (horário estendido)
(6, '08:30:00', '18:00:00', '12:00:00', '13:00:00', true)   -- Sábado
ON CONFLICT (dia_semana) DO NOTHING;

-- Inserir Serviços Principais
INSERT INTO servicos (titulo, descricao, preco, duracao_minutos, icone) VALUES
('Corte Degradê / Social', 'Corte moderno com máquina e tesoura, finalizado com navalha e pomada premium.', 35.00, 30, 'scissors'),
('Barba Terapia Completa', 'Alinhamento com toalha quente, massagem facial, navalha e óleo hidratante.', 25.00, 25, 'sparkles'),
('Combo Corte + Barba', 'O pacote completo: corte de cabelo alinhado com barba terapia e finalização.', 50.00, 50, 'flame'),
('Sobrancelha na Navalha', 'Alinhamento e acabamento perfeito da sobrancelha.', 15.00, 10, 'scissors'),
('Pigmentação de Barba / Cabelo', 'Disfarce de falhas e realce dos contornos.', 20.00, 20, 'sparkles')
ON CONFLICT DO NOTHING;
