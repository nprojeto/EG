-- ============================================================
-- ESSÊNCIA DO GUERREIRO — COMANDO 1C1613
-- Cole tudo isso no SQL Editor do Supabase e clique em RUN.
-- ============================================================

-- 1) TABELA DAS INSCRIÇÕES ------------------------------------
create table if not exists public.inscricoes (
  id                    uuid primary key default gen_random_uuid(),
  criado_em             timestamptz not null default now(),

  nome                  text not null,
  nascimento            date,
  menor_de_idade        boolean default false,
  whatsapp              text,
  email                 text,

  relacionamento        text,
  parceiro              text,

  emergencia_nome       text,
  emergencia_telefone   text,

  transporte            text,   -- carro-com-vaga | carro-sem-vaga | carona
  vagas_carro           int,
  saida                 text,

  pix_valor             numeric default 95,
  comprovante_pix_path  text,
  print_squad_path      text,
  autorizacao_path      text
);

-- 2) SEGURANÇA DA TABELA --------------------------------------
-- Liga o RLS: sem política explícita, ninguém acessa nada.
alter table public.inscricoes enable row level security;

-- O formulário só precisa INSERIR. Ninguém consegue ler,
-- editar ou apagar com a chave pública — nem quem preencheu.
drop policy if exists "form pode inserir" on public.inscricoes;
create policy "form pode inserir"
  on public.inscricoes
  for insert
  to anon
  with check (true);

-- 3) BUCKET DOS ARQUIVOS --------------------------------------
-- Privado: os comprovantes não ficam acessíveis por link público.
insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

-- Permite só o envio de arquivos, sem leitura pública.
drop policy if exists "form pode subir comprovantes" on storage.objects;
create policy "form pode subir comprovantes"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'comprovantes');

-- ============================================================
-- CONSULTAS ÚTEIS (rode no SQL Editor quando quiser)
-- ============================================================

-- Todo mundo que se inscreveu, mais recente primeiro:
--   select criado_em, nome, whatsapp, transporte, vagas_carro, saida
--   from public.inscricoes order by criado_em desc;

-- Quem precisa de carona e quem tem vaga sobrando:
--   select nome, whatsapp, transporte, vagas_carro, saida
--   from public.inscricoes
--   where transporte in ('carona','carro-com-vaga')
--   order by transporte;

-- Menores de idade e se o termo chegou:
--   select nome, nascimento, autorizacao_path
--   from public.inscricoes where menor_de_idade;

-- Total de gente e dinheiro esperado:
--   select count(*) as inscritos, count(*) * 95 as total_reais
--   from public.inscricoes;
