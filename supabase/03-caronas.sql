-- ============================================================
-- ESSÊNCIA DO GUERREIRO — COMANDO 1C1613
-- Passo 03: caronas, protocolo e ficha pré-salva
-- Rode no SQL Editor depois do 01-estrutura.sql
-- ============================================================

alter table public.inscricoes
  add column if not exists status         text not null default 'confirmada',
  add column if not exists protocolo      text,
  add column if not exists motorista_id   uuid,
  add column if not exists vagas_ocupadas int  not null default 0;

comment on column public.inscricoes.status is
  'pre = ficha guardada esperando vaga de carona | confirmada = inscrição completa';

-- protocolo é único, mas só existe em ficha pré-salva
create unique index if not exists inscricoes_protocolo_idx
  on public.inscricoes (protocolo) where protocolo is not null;

-- quem pegou carona aponta para o dono do carro
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inscricoes_motorista_fk'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_motorista_fk
      foreign key (motorista_id) references public.inscricoes(id) on delete set null;
  end if;
end $$;

-- nunca ocupar mais lugares do que o carro tem
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inscricoes_vagas_ok'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_vagas_ok
      check (vagas_carro is null or vagas_ocupadas <= vagas_carro);
  end if;
end $$;

-- ============================================================
-- PAINEL DAS CARONAS — quem leva quem
-- ============================================================
create or replace view public.caronas as
select
  m.nome                                as motorista,
  m.whatsapp                            as motorista_whatsapp,
  m.saida                               as ponto_de_saida,
  m.vagas_carro                         as lugares,
  m.vagas_ocupadas                      as ocupados,
  (m.vagas_carro - m.vagas_ocupadas)    as livres,
  coalesce(
    string_agg(p.nome || ' (' || p.whatsapp || ')', ', ' order by p.criado_em),
    '— ninguém ainda —'
  )                                     as passageiros
from public.inscricoes m
left join public.inscricoes p
       on p.motorista_id = m.id and p.status = 'confirmada'
where m.transporte = 'carro-com-vaga' and m.status = 'confirmada'
group by m.id, m.nome, m.whatsapp, m.saida, m.vagas_carro, m.vagas_ocupadas;

-- ============================================================
-- CONSULTAS ÚTEIS
-- ============================================================

-- Mapa das caronas:
--   select * from public.caronas order by livres desc;

-- Quem está na fila esperando vaga (ficha pré-salva):
--   select protocolo, nome, whatsapp, saida, criado_em
--   from public.inscricoes where status = 'pre' order by criado_em;

-- Só as inscrições completas:
--   select nome, whatsapp, transporte from public.inscricoes
--   where status = 'confirmada' order by criado_em desc;

-- Total real de gente e de dinheiro (ignora as pré-salvas):
--   select count(*) as inscritos, count(*) * 95 as total_reais
--   from public.inscricoes where status = 'confirmada';
