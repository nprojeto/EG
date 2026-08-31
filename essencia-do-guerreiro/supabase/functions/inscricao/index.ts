// ============================================================
// ESSÊNCIA DO GUERREIRO — COMANDO 1C1613
// Edge Function: inscricao
//
// Recebe a ficha preenchida, valida, sobe os arquivos no Storage
// e grava a linha no banco usando a service_role key — que fica
// só aqui no servidor, nunca no HTML.
//
// Caminho no projeto: supabase/functions/inscricao/index.ts
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BUCKET = "comprovantes";
const TABELA = "inscricoes";
const TAMANHO_MAX = 12 * 1024 * 1024; // 12 MB por arquivo
const TIPOS_OK = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responde = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function slug(t: string) {
  return (t || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "inscrito";
}

function limpa(v: unknown, max = 160) {
  return typeof v === "string" ? v.trim().slice(0, max) : null;
}

function idade(iso: string | null) {
  if (!iso) return null;
  const n = new Date(iso + "T00:00:00");
  if (isNaN(n.getTime())) return null;
  const h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) a--;
  return a;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responde({ erro: "Método não permitido." }, 405);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return responde({ erro: "Envio inválido." }, 400);
  }

  // armadilha para robô: campo invisível que só um script preencheria
  if (limpa(form.get("site"))) return responde({ ok: true, ignorado: true });

  let ficha: Record<string, unknown>;
  try {
    ficha = JSON.parse(String(form.get("ficha") ?? "{}"));
  } catch {
    return responde({ erro: "Ficha ilegível." }, 400);
  }

  // ---------- validação ----------
  const nome = limpa(ficha.nome, 120);
  const whatsapp = limpa(ficha.whatsapp, 25);
  const email = limpa(ficha.email, 120);
  const nascimento = limpa(ficha.nascimento, 10);

  const faltando: string[] = [];
  if (!nome || nome.split(/\s+/).length < 2) faltando.push("nome completo");
  if (!whatsapp || whatsapp.replace(/\D/g, "").length < 10) faltando.push("whatsapp");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) faltando.push("e-mail");
  if (!nascimento || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) faltando.push("nascimento");
  if (!limpa(ficha.emergencia_nome)) faltando.push("contato de emergência");
  if (faltando.length) return responde({ erro: "Faltou preencher: " + faltando.join(", ") + "." }, 400);

  const anos = idade(nascimento);
  if (anos === null || anos < 8 || anos > 100) return responde({ erro: "Data de nascimento inválida." }, 400);
  const menor = anos < 18;

  const arquivos: Record<string, File> = {};
  for (const campo of ["pix", "squad", "autorizacao"]) {
    const f = form.get(campo);
    if (f instanceof File && f.size > 0) {
      if (f.size > TAMANHO_MAX) return responde({ erro: `O arquivo "${campo}" passa de 12 MB.` }, 400);
      if (f.type && !TIPOS_OK.includes(f.type)) return responde({ erro: `Formato não aceito em "${campo}".` }, 400);
      arquivos[campo] = f;
    }
  }
  if (!arquivos.pix) return responde({ erro: "O comprovante do Pix não chegou." }, 400);
  if (!arquivos.squad) return responde({ erro: "O print da solicitação não chegou." }, 400);
  if (menor && !arquivos.autorizacao) return responde({ erro: "Menor de idade precisa do termo assinado." }, 400);

  // ---------- gravação ----------
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const pasta = `${slug(nome)}-${Date.now()}`;
  const caminhos: Record<string, string> = {};

  for (const [campo, f] of Object.entries(arquivos)) {
    const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const caminho = `${pasta}/${campo}.${ext}`;
    const { error } = await db.storage.from(BUCKET).upload(caminho, f, {
      contentType: f.type || "application/octet-stream",
      upsert: true,
    });
    if (error) return responde({ erro: `Não deu para guardar o arquivo "${campo}".`, detalhe: error.message }, 500);
    caminhos[campo] = caminho;
  }

  const registro = {
    nome,
    nascimento,
    menor_de_idade: menor,
    whatsapp,
    email,
    relacionamento: limpa(ficha.relacionamento, 30),
    parceiro: limpa(ficha.parceiro, 120),
    emergencia_nome: limpa(ficha.emergencia_nome, 120),
    emergencia_telefone: limpa(ficha.emergencia_telefone, 25),
    transporte: limpa(ficha.transporte, 20),
    vagas_carro: Number.isFinite(Number(ficha.vagas_carro)) ? Number(ficha.vagas_carro) : null,
    saida: limpa(ficha.saida, 160),
    pix_valor: 95,
    comprovante_pix_path: caminhos.pix ?? null,
    print_squad_path: caminhos.squad ?? null,
    autorizacao_path: caminhos.autorizacao ?? null,
  };

  const { data, error } = await db.from(TABELA).insert(registro).select("id").single();
  if (error) return responde({ erro: "Não deu para salvar a ficha.", detalhe: error.message }, 500);

  return responde({ ok: true, id: data.id });
});
