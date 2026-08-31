// ============================================================
// ESSÊNCIA DO GUERREIRO — COMANDO 1C1613
// Edge Function: api
//
// GET  ?acao=vagas                  lista carros com lugar sobrando
// GET  ?acao=retomar&protocolo=XXX  devolve uma ficha pré-salva
// POST acao=presalvar               guarda a ficha e devolve um protocolo
// POST acao=inscrever               inscrição completa (com arquivos)
//
// Caminho no projeto: supabase/functions/api/index.ts
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BUCKET = "comprovantes";
const TABELA = "inscricoes";
const TAMANHO_MAX = 12 * 1024 * 1024;
const TIPOS_OK = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const responde = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const db = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function slug(t: string) {
  return (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "inscrito";
}

const limpa = (v: unknown, max = 160) =>
  typeof v === "string" ? (v.trim().slice(0, max) || null) : null;

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

// sem vogais nem caracteres que se confundem (0/O, 1/I)
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function geraProtocolo() {
  let s = "";
  const n = new Uint8Array(6);
  crypto.getRandomValues(n);
  for (const b of n) s += ALFABETO[b % ALFABETO.length];
  return "EG-" + s;
}

/** Valida os campos da ficha. Devolve o registro pronto ou a lista do que falta. */
function leFicha(ficha: Record<string, unknown>) {
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

  const anos = idade(nascimento);
  if (anos === null || anos < 8 || anos > 100) faltando.push("data de nascimento válida");

  const transporte = limpa(ficha.transporte, 20);
  if (!["carro-com-vaga", "carro-sem-vaga", "carona"].includes(transporte ?? "")) {
    faltando.push("transporte");
  }

  let vagas: number | null = null;
  if (transporte === "carro-com-vaga") {
    vagas = Number(ficha.vagas_carro);
    if (!Number.isInteger(vagas) || vagas < 1 || vagas > 8) faltando.push("lugares no carro");
  }

  return {
    faltando,
    menor: anos !== null && anos < 18,
    registro: {
      nome, nascimento, whatsapp, email,
      menor_de_idade: anos !== null && anos < 18,
      relacionamento: limpa(ficha.relacionamento, 30),
      parceiro: limpa(ficha.parceiro, 120),
      emergencia_nome: limpa(ficha.emergencia_nome, 120),
      emergencia_telefone: limpa(ficha.emergencia_telefone, 25),
      transporte,
      vagas_carro: vagas,
      saida: limpa(ficha.saida, 160),
      pix_valor: 95,
    },
  };
}

// ------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const sb = db();

  // ---------- GET: vagas disponíveis ----------
  if (req.method === "GET" && url.searchParams.get("acao") === "vagas") {
    const { data, error } = await sb
      .from(TABELA)
      .select("id, nome, saida, vagas_carro, vagas_ocupadas")
      .eq("transporte", "carro-com-vaga")
      .eq("status", "confirmada");
    if (error) return responde({ erro: "Não deu para consultar as vagas." }, 500);

    const carros = (data ?? [])
      .map((c) => ({
        id: c.id,
        // só o primeiro nome e o sobrenome, para não expor a lista inteira
        nome: String(c.nome).split(/\s+/).slice(0, 2).join(" "),
        saida: c.saida,
        livres: (c.vagas_carro ?? 0) - (c.vagas_ocupadas ?? 0),
      }))
      .filter((c) => c.livres > 0);

    return responde({ carros });
  }

  // ---------- GET: retomar ficha pelo protocolo ----------
  if (req.method === "GET" && url.searchParams.get("acao") === "retomar") {
    const protocolo = (url.searchParams.get("protocolo") ?? "").trim().toUpperCase();
    if (!/^EG-[A-Z0-9]{6}$/.test(protocolo)) return responde({ erro: "Protocolo inválido." }, 400);

    const { data, error } = await sb
      .from(TABELA)
      .select("nome, nascimento, whatsapp, email, relacionamento, parceiro, emergencia_nome, emergencia_telefone, transporte, vagas_carro, saida, status")
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (error) return responde({ erro: "Não deu para buscar o protocolo." }, 500);
    if (!data) return responde({ erro: "Protocolo não encontrado. Confira as letras." }, 404);
    if (data.status === "confirmada") return responde({ erro: "Essa inscrição já foi concluída." }, 409);
    return responde({ ficha: data });
  }

  if (req.method !== "POST") return responde({ erro: "Método não permitido." }, 405);

  let form: FormData;
  try { form = await req.formData(); }
  catch { return responde({ erro: "Envio inválido." }, 400); }

  if (limpa(form.get("site"))) return responde({ ok: true, ignorado: true }); // armadilha de robô

  let ficha: Record<string, unknown>;
  try { ficha = JSON.parse(String(form.get("ficha") ?? "{}")); }
  catch { return responde({ erro: "Ficha ilegível." }, 400); }

  const acao = String(form.get("acao") ?? "inscrever");
  const { faltando, menor, registro } = leFicha(ficha);
  if (faltando.length) return responde({ erro: "Faltou preencher: " + faltando.join(", ") + "." }, 400);

  // ---------- POST: guardar a ficha e devolver um protocolo ----------
  if (acao === "presalvar") {
    if (registro.transporte !== "carona") {
      return responde({ erro: "Só quem depende de carona precisa de protocolo." }, 400);
    }

    // se ainda existe vaga, não faz sentido guardar
    const { data: livres } = await sb.from(TABELA)
      .select("vagas_carro, vagas_ocupadas")
      .eq("transporte", "carro-com-vaga").eq("status", "confirmada");
    const total = (livres ?? []).reduce(
      (s, c) => s + ((c.vagas_carro ?? 0) - (c.vagas_ocupadas ?? 0)), 0);
    if (total > 0) return responde({ erro: "Apareceu vaga! Volte e escolha um carro." }, 409);

    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const protocolo = geraProtocolo();
      const { error } = await sb.from(TABELA).insert({ ...registro, status: "pre", protocolo });
      if (!error) return responde({ ok: true, protocolo });
      if (error.code !== "23505") {
        return responde({ erro: "Não deu para guardar sua ficha.", detalhe: error.message }, 500);
      }
    }
    return responde({ erro: "Não deu para gerar seu protocolo. Tente de novo." }, 500);
  }

  // ---------- POST: inscrição completa ----------
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

  // --- reserva do lugar na carona (só passa se ainda houver vaga) ---
  let motoristaId: string | null = null;
  if (registro.transporte === "carona") {
    motoristaId = limpa(ficha.motorista_id, 40);
    if (!motoristaId) return responde({ erro: "Escolha em qual carro você vai." }, 400);

    const { data: carro, error: erroCarro } = await sb.from(TABELA)
      .select("vagas_carro, vagas_ocupadas")
      .eq("id", motoristaId).eq("transporte", "carro-com-vaga").eq("status", "confirmada")
      .maybeSingle();
    if (erroCarro || !carro) return responde({ erro: "Esse carro não está mais disponível." }, 409);

    const ocupados = carro.vagas_ocupadas ?? 0;
    if (ocupados >= (carro.vagas_carro ?? 0)) {
      return responde({ erro: "Esse carro acabou de lotar. Escolha outro." }, 409);
    }

    const { data: reservado, error: erroReserva } = await sb.from(TABELA)
      .update({ vagas_ocupadas: ocupados + 1 })
      .eq("id", motoristaId)
      .eq("vagas_ocupadas", ocupados)   // trava contra dois cliques ao mesmo tempo
      .select("id")
      .maybeSingle();

    if (erroReserva || !reservado) {
      return responde({ erro: "Alguém pegou esse lugar agora. Escolha outro carro." }, 409);
    }
  }

  const devolveVaga = async () => {
    if (!motoristaId) return;
    const { data: c } = await sb.from(TABELA).select("vagas_ocupadas").eq("id", motoristaId).maybeSingle();
    if (c) {
      await sb.from(TABELA)
        .update({ vagas_ocupadas: Math.max(0, (c.vagas_ocupadas ?? 1) - 1) })
        .eq("id", motoristaId);
    }
  };

  // --- arquivos ---
  const pasta = `${slug(registro.nome ?? "")}-${Date.now()}`;
  const caminhos: Record<string, string> = {};
  for (const [campo, f] of Object.entries(arquivos)) {
    const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const caminho = `${pasta}/${campo}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(caminho, f, {
      contentType: f.type || "application/octet-stream", upsert: true,
    });
    if (error) {
      await devolveVaga();
      return responde({ erro: `Não deu para guardar o arquivo "${campo}".`, detalhe: error.message }, 500);
    }
    caminhos[campo] = caminho;
  }

  const completo = {
    ...registro,
    status: "confirmada",
    motorista_id: motoristaId,
    comprovante_pix_path: caminhos.pix ?? null,
    print_squad_path: caminhos.squad ?? null,
    autorizacao_path: caminhos.autorizacao ?? null,
  };

  // veio de uma ficha pré-salva? atualiza aquela linha em vez de criar outra
  const protocolo = (limpa(ficha.protocolo, 12) ?? "").toUpperCase();
  let erroFinal;
  if (protocolo) {
    const r = await sb.from(TABELA)
      .update({ ...completo, protocolo: null })
      .eq("protocolo", protocolo).eq("status", "pre").select("id").maybeSingle();
    erroFinal = r.error;
    if (!r.error && !r.data) {
      const novo = await sb.from(TABELA).insert(completo);
      erroFinal = novo.error;
    }
  } else {
    const r = await sb.from(TABELA).insert(completo);
    erroFinal = r.error;
  }

  if (erroFinal) {
    await devolveVaga();
    return responde({ erro: "Não deu para salvar a ficha.", detalhe: erroFinal.message }, 500);
  }

  return responde({ ok: true });
});
