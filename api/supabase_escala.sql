-- MOV IA - Escala de preventivas
-- Rodar uma vez no Supabase: SQL Editor > New query > colar tudo > Run.
create table if not exists escala_preventivas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  linha int,
  data date not null,
  data_original date,
  data_sugerida date,
  equipe text,
  empresa text,
  cidade text,
  pat text,
  equipamento text,
  lider text,
  executor text,
  tipo text,
  status text not null default 'Programada',
  data_realizada date,
  horimetro text,
  relatorio text,
  obs text,
  atualizado_por text,
  atualizado_em timestamptz default now(),
  criado_em timestamptz default now()
);
create index if not exists escala_preventivas_data_idx on escala_preventivas (data);
create index if not exists escala_preventivas_status_idx on escala_preventivas (status);
-- acesso só pelo servidor do app (chave service_role); ninguém acessa direto pelo navegador
alter table escala_preventivas enable row level security;
-- se a tabela já existia de uma versão anterior
alter table escala_preventivas add column if not exists linha int;
alter table escala_preventivas add column if not exists data_sugerida date;
