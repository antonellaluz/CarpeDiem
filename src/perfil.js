/*
  CARPE DIEM — PERFIL, META UNIVERSITÁRIA E CALCULADORA DE NOTA
  Depende de: ui.js, regras.js, notificacoes.js (nessa ordem).
  As notas de corte vêm da tabela "notas_corte" do Supabase (somente leitura).
*/

document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);

  const CHAVE_PERFIL = "carpeDiemPerfil";
  const CHAVE_META = "carpeDiemMeta";

  const AREAS = [
    ["ling", "Linguagens"],
    ["hum", "Ciências Humanas"],
    ["nat", "Ciências da Natureza"],
    ["mat", "Matemática"],
    ["red", "Redação"]
  ];

  // =========================================================
  // ARMAZENAMENTO LOCAL
  // =========================================================

  function ler(chave, padrao) {
    try {
      const dados = JSON.parse(localStorage.getItem(chave));
      return dados && typeof dados === "object" ? { ...padrao, ...dados } : { ...padrao };
    } catch {
      return { ...padrao };
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (erro) {
      console.error("Não foi possível salvar:", erro);
    }
  }

  let perfil = ler(CHAVE_PERFIL, { nome: "", email: "", curso: "", universidade: "", ingresso: "" });

  function fmt(n) {
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  // =========================================================
  // PERFIL
  // =========================================================

  function nomeExibido() {
    return perfil.nome || localStorage.getItem("carpeDiem_nome") || "Estudante";
  }

  function mostrarPerfil() {
    $("display-name").textContent = nomeExibido();
    $("display-email").textContent = perfil.email || "E-mail não informado";
    $("display-course").textContent = perfil.curso || "Não informado";
    $("display-university").textContent = perfil.universidade || "Não informada";
    $("display-entry").textContent = perfil.ingresso || "Não informado";
  }

  const botaoEditar = $("edit-profile-btn");
  const formPerfil = $("profile-form");

  botaoEditar.addEventListener("click", () => {
    $("name").value = nomeExibido() === "Estudante" ? "" : nomeExibido();
    $("email").value = perfil.email;
    $("course").value = perfil.curso;
    $("university").value = perfil.universidade;
    $("entry").value = perfil.ingresso;

    formPerfil.classList.remove("hidden");
    botaoEditar.classList.add("hidden");
  });

  $("cancel-edit").addEventListener("click", () => {
    formPerfil.classList.add("hidden");
    botaoEditar.classList.remove("hidden");
  });

  formPerfil.addEventListener("submit", e => {
    e.preventDefault();

    perfil = {
      nome: $("name").value.trim(),
      email: $("email").value.trim(),
      curso: $("course").value.trim(),
      universidade: $("university").value.trim(),
      ingresso: $("entry").value
    };

    gravar(CHAVE_PERFIL, perfil);

    // O nome também alimenta a saudação da página inicial
    if (perfil.nome) localStorage.setItem("carpeDiem_nome", perfil.nome);

    mostrarPerfil();
    preencherMeta(true);

    formPerfil.classList.add("hidden");
    botaoEditar.classList.remove("hidden");

    toast("Perfil atualizado! 💜", "sucesso");
  });

  // =========================================================
  // META UNIVERSITÁRIA (formulário de busca + calculadora)
  // =========================================================
  // =========================================================
  // META UNIVERSITÁRIA GUIADA (3 passos)
  // =========================================================

  const estado = {
    rows: [],
    doAno: [],
    registro: null,
    manual: false,
    modo: "nao-fiz",
    ignorarSalvo: false
  };

  const chaveRegistro = r => `${r.curso}|${r.universidade}|${r.campus || ""}`;
  const rotuloOpcao = r => `${r.curso} · ${r.universidade}${r.campus ? " — " + r.campus : ""}`;
  const maiuscula = t => t.charAt(0).toUpperCase() + t.slice(1);

  function debounce(fn, ms = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // Sem acento, minúsculas e sem caracteres que atrapalham o filtro
  function normalizar(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[%_,]/g, " ")
      .trim();
  }

  function numero(id) {
    const v = parseFloat($(id).value);
    return Number.isNaN(v) ? null : v;
  }

  function metodoAtual() {
    if (estado.registro) return estado.registro.metodo;
    return perfil.ingresso === "Vestibular próprio" ? "vestibular" : "sisu";
  }

  function corteAtual() {
    if (estado.registro) return Number(estado.registro.nota);
    if (estado.manual) return numero("manual-corte");
    return null;
  }

  function salvarMeta() {
    const notas = {};
    const pesos = {};

    AREAS.forEach(([k]) => {
      notas[k] = $("n-" + k).value;
      pesos[k] = $("w-" + k).value || "1";
    });

    gravar(CHAVE_META, {
      curso: $("goal-course").value.trim(),
      opcao: $("goal-uni").value,
      modalidade: $("goal-mod").value,
      manualCorte: $("manual-corte").value,
      modo: estado.modo,
      media: $("g-media").value,
      notas,
      pesos
    });
  }

  function limparPassos() {
    estado.rows = [];
    estado.doAno = [];
    estado.registro = null;
    estado.manual = false;

    ["uni-box", "sem-dados", "manual-box", "passo-corte", "passo-nota", "calc-result"]
      .forEach(id => $(id).classList.add("hidden"));

    $("goal-status").textContent = "";
  }

  // ---------- Passo 1: curso ----------

  async function sugerirCursos() {
    const termo = normalizar($("goal-course").value);
    const lista = $("lista-cursos");

    if (termo.length < 2) {
      lista.replaceChildren();
      return;
    }

    const { data, error } = await supabaseClient
      .from("notas_corte")
      .select("curso")
      .ilike("curso_busca", `%${termo}%`)
      .limit(60);

    if (error || !data) return;

    const nomes = [...new Set(data.map(d => d.curso))].slice(0, 12);

    lista.replaceChildren(...nomes.map(n => {
      const o = document.createElement("option");
      o.value = n;
      return o;
    }));
  }

  async function carregarCurso() {
    const curso = $("goal-course").value.trim();
    const salvo = estado.ignorarSalvo ? {} : ler(CHAVE_META, {});

    estado.ignorarSalvo = false;
    limparPassos();

    if (curso.length < 2) return;

    $("goal-status").textContent = "Procurando...";

    const { data, error } = await supabaseClient
      .from("notas_corte")
      .select("*")
      .ilike("curso_busca", `%${normalizar(curso)}%`)
      .order("ano", { ascending: false })
      .limit(500);

    if (error) {
      console.error(error);
      $("goal-status").textContent = "Não foi possível consultar agora. Tente de novo em instantes.";
      return;
    }

    estado.rows = data || [];

    if (!estado.rows.length) {
      $("goal-status").textContent = "";
      $("sem-dados").classList.remove("hidden");
      return;
    }

    popularUniversidades(salvo);
  }

  function popularUniversidades(salvo) {
    const mapa = new Map();

    estado.rows.forEach(r => {
      const k = chaveRegistro(r);
      if (!mapa.has(k)) mapa.set(k, r);
    });

    const sel = $("goal-uni");

    sel.replaceChildren(new Option("Escolha a universidade", ""));

    [...mapa.entries()]
      .sort((a, b) => rotuloOpcao(a[1]).localeCompare(rotuloOpcao(b[1]), "pt-BR"))
      .forEach(([k, r]) => sel.appendChild(new Option(rotuloOpcao(r), k)));

    $("uni-box").classList.remove("hidden");

    let escolha = "";

    if (salvo.opcao && mapa.has(salvo.opcao)) {
      escolha = salvo.opcao;
    } else if (perfil.universidade) {
      const alvo = normalizar(perfil.universidade);
      const achou = [...mapa.entries()].find(([, r]) => normalizar(r.universidade).includes(alvo));
      if (achou) escolha = achou[0];
    }

    if (!escolha && mapa.size === 1) escolha = [...mapa.keys()][0];

    sel.value = escolha;

    if (escolha) {
      escolherOpcao(salvo.modalidade);
    } else {
      $("goal-status").textContent = "Escolha a universidade para ver a nota.";
    }
  }

  // ---------- Passo 2: meta ----------

  function escolherOpcao(modalidadeSalva) {
    const chave = $("goal-uni").value;

    $("passo-corte").classList.add("hidden");
    $("passo-nota").classList.add("hidden");
    $("calc-result").classList.add("hidden");
    estado.registro = null;

    if (!chave) return;

    const doCurso = estado.rows.filter(r => chaveRegistro(r) === chave);
    const ano = Math.max(...doCurso.map(r => r.ano));

    estado.doAno = doCurso.filter(r => r.ano === ano);

    const mods = [...new Set(estado.doAno.map(r => r.modalidade))].sort((a, b) =>
      a === "ampla concorrência" ? -1 :
      b === "ampla concorrência" ? 1 :
      a.localeCompare(b, "pt-BR")
    );

    const selMod = $("goal-mod");

    selMod.replaceChildren(...mods.map(m =>
      new Option(m === "ampla concorrência" ? "Ampla concorrência (sem cotas)" : maiuscula(m), m)
    ));

    selMod.value = mods.includes(modalidadeSalva) ? modalidadeSalva : mods[0];

    $("mod-box").classList.toggle("hidden", mods.length < 2);
    $("goal-status").textContent = "";

    mostrarMeta();
  }

  function mostrarMeta() {
    const mod = $("goal-mod").value;

    const r = estado.doAno
      .filter(x => x.modalidade === mod)
      .sort((a, b) => b.nota - a.nota)[0] || estado.doAno[0];

    estado.registro = r;

    const card = $("goal-card");
    card.replaceChildren();

    const topo = document.createElement("p");
    topo.className = "goal-top";
    topo.textContent = "Sua meta";

    const num = document.createElement("div");
    num.className = "goal-num";
    num.textContent = fmt(Number(r.nota));

    const desc = document.createElement("p");
    desc.className = "goal-desc";
    desc.textContent = `${r.curso} — ${r.universidade}${r.campus ? " (" + r.campus + ")" : ""}`;

    const meta = document.createElement("p");
    meta.className = "goal-meta";
    meta.textContent = `Nota de corte de ${r.ano} · ${maiuscula(r.modalidade)}`;

    card.append(topo, num, desc, meta);

    if (r.fonte_url && /^https?:\/\//i.test(r.fonte_url)) {
      const link = document.createElement("a");
      link.href = r.fonte_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Ver fonte ↗";
      card.appendChild(link);
    }

    $("passo-corte").classList.remove("hidden");
    $("passo-nota").classList.remove("hidden");

    atualizarPasso3();
    salvarMeta();
  }

  // ---------- Passo 3: como estou ----------

  function definirModo(modo) {
    estado.modo = modo;

    document.querySelectorAll("#modo-chips .chip").forEach(c =>
      c.classList.toggle("ativo", c.dataset.modo === modo)
    );

    $("entrada-media").classList.toggle("hidden", modo !== "media");
    $("entrada-areas").classList.toggle("hidden", modo !== "detalhar");
  }

  function atualizarPasso3() {
    const sisu = metodoAtual() === "sisu";

    $("chip-detalhar").classList.toggle("hidden", !sisu);

    if (!sisu && estado.modo === "detalhar") estado.modo = "media";

    $("media-label").textContent = sisu
      ? "Sua média no ENEM (de 0 a 1000)"
      : "Sua pontuação (na mesma escala da nota de corte)";

    definirModo(estado.modo);
  }

  function linha(texto, forte = false) {
    const p = document.createElement(forte ? "strong" : "p");
    p.textContent = texto;
    return p;
  }

  function botaoCronograma() {
    const a = document.createElement("a");
    a.className = "link-button";
    a.href = "calendario.html";
    a.style.marginTop = "12px";
    a.innerHTML = '<i class="fas fa-calendar-days"></i> ';
    a.append("Ver meu cronograma");
    return a;
  }

  function calcular() {
    const corte = corteAtual();

    if (corte === null || Number.isNaN(corte) || corte <= 0) {
      avisar("Digite a nota de corte para continuar.", { titulo: "Falta a nota de corte", tipo: "aviso" });
      return;
    }

    const sisu = metodoAtual() === "sisu";
    const caixa = $("calc-result");

    caixa.replaceChildren();

    // Quem ainda não fez a prova só vê a meta e vai para o cronograma
    if (estado.modo === "nao-fiz") {
      caixa.className = "calc-result falta";
      caixa.append(
        linha(`Sua meta é chegar perto de ${fmt(corte)} pontos.`, true),
        linha("Tudo bem não ter feito a prova ainda. Comece pelo seu cronograma de estudos e volte aqui depois de um simulado para ver onde você está."),
        botaoCronograma()
      );
      caixa.classList.remove("hidden");
      salvarMeta();
      return;
    }

    let minha;
    let somaPesos = 0;
    const areas = [];

    if (estado.modo === "detalhar" && sisu) {
      let soma = 0;

      for (const [k, nome] of AREAS) {
        const nota = numero("n-" + k);
        let peso = numero("w-" + k);

        if (peso === null || peso <= 0) peso = 1;

        if (nota === null || nota < 0 || nota > 1000) {
          avisar(`Informe uma nota entre 0 e 1000 em ${nome}.`, { tipo: "aviso" });
          return;
        }

        soma += nota * peso;
        somaPesos += peso;
        areas.push({ nome, nota, peso });
      }

      minha = soma / somaPesos;
    } else {
      minha = numero("g-media");

      if (minha === null || minha < 0 || (sisu && minha > 1000)) {
        avisar(sisu ? "Informe sua média entre 0 e 1000." : "Informe sua pontuação.", { tipo: "aviso" });
        return;
      }
    }

    const diferenca = minha - corte;

    caixa.className = "calc-result " + (diferenca >= 0 ? "ok" : "falta");
    caixa.appendChild(linha(`Sua nota: ${fmt(minha)} · Meta: ${fmt(corte)}`));

    if (diferenca >= 0) {
      caixa.append(
        linha(`Você já está ${fmt(diferenca)} ponto(s) acima da nota de corte de referência. 🎉`, true),
        linha("O corte muda a cada ano, então vale manter uma margem. E sem abrir mão do descanso!")
      );
    } else {
      const falta = -diferenca;
      const pouco = falta / corte <= 0.05;

      caixa.appendChild(linha(
        pouco
          ? `Falta pouco: só ${fmt(falta)} ponto(s) para a meta.`
          : `Faltam ${fmt(falta)} ponto(s) para a meta. É um caminho, não um muro.`,
        true
      ));

      if (estado.modo === "detalhar" && sisu) {
        const caminhos = areas
          .map(a => ({ ...a, subir: falta * somaPesos / a.peso }))
          .filter(a => a.nota + a.subir <= 1000)
          .sort((x, y) => x.subir - y.subir)
          .slice(0, 3);

        if (caminhos.length) {
          caixa.appendChild(linha("Subindo só uma área, por exemplo:"));

          const ul = document.createElement("ul");

          caminhos.forEach(a => {
            const li = document.createElement("li");
            li.textContent = `${a.nome}: +${fmt(a.subir)} pontos (de ${fmt(a.nota)} para ${fmt(a.nota + a.subir)})`;
            ul.appendChild(li);
          });

          caixa.appendChild(ul);
        }
      }

      caixa.appendChild(botaoCronograma());
    }

    caixa.appendChild(linha("Referência histórica: não garante aprovação. Confira o edital."));
    caixa.classList.remove("hidden");

    salvarMeta();
  }

  // ---------- Curso sem dados ----------

  $("pedir-nota").addEventListener("click", async () => {
    const botao = $("pedir-nota");
    botao.disabled = true;

    const { error } = await supabaseClient.from("pedidos_nota").insert({
      curso: $("goal-course").value.trim().slice(0, 100),
      universidade: (perfil.universidade || "").slice(0, 100) || null
    });

    if (error) {
      console.error(error);
      botao.disabled = false;
      avisar("Não foi possível enviar agora. Tente de novo mais tarde.", { tipo: "aviso" });
      return;
    }

    toast("Anotado! Vamos tentar incluir este curso em breve 💜", "sucesso");
  });

  $("digitar-nota").addEventListener("click", () => {
    estado.manual = true;

    $("manual-box").classList.remove("hidden");
    $("passo-nota").classList.remove("hidden");

    atualizarPasso3();
    $("manual-corte").focus();
  });

  // ---------- Ligações ----------

  $("goal-course").addEventListener("input", debounce(sugerirCursos));

  $("goal-course").addEventListener("change", () => {
    estado.ignorarSalvo = false;
    carregarCurso();
  });

  $("goal-uni").addEventListener("change", () => {
    escolherOpcao();
    salvarMeta();
  });

  $("goal-mod").addEventListener("change", mostrarMeta);

  $("modo-chips").addEventListener("click", e => {
    const botao = e.target.closest("[data-modo]");
    if (!botao) return;

    definirModo(botao.dataset.modo);
    salvarMeta();
  });

  $("calc-btn").addEventListener("click", calcular);

  ["g-media", "manual-corte"].forEach(id => $(id).addEventListener("change", salvarMeta));

  AREAS.forEach(([k]) => {
    $("n-" + k).addEventListener("change", salvarMeta);
    $("w-" + k).addEventListener("change", salvarMeta);
  });

  // Preenche a tela com o perfil e com a meta salva.
  // `sobrepor` = true: o perfil recém-editado vence a meta salva.
  function preencherMeta(sobrepor = false) {
    const m = ler(CHAVE_META, {});

    $("goal-course").value = (sobrepor ? (perfil.curso || m.curso) : (m.curso || perfil.curso)) || "";
    $("g-media").value = m.media ?? "";
    $("manual-corte").value = m.manualCorte ?? "";

    AREAS.forEach(([k]) => {
      if (m.notas && m.notas[k] !== undefined) $("n-" + k).value = m.notas[k];
      if (m.pesos && m.pesos[k]) $("w-" + k).value = m.pesos[k];
    });

    estado.modo = m.modo || "nao-fiz";
    definirModo(estado.modo);

    estado.ignorarSalvo = sobrepor;

    if ($("goal-course").value.trim().length >= 2) carregarCurso();
  }

  // =========================================================
  // LEMBRETES (notificações)
  // =========================================================

  const chaveNotif = $("notifications");
  const textoNotif = $("notif-status");

  async function iniciarNotificacoes() {
    if (typeof suportaPush !== "function") {
      chaveNotif.disabled = true;
      return;
    }

    if (!suportaPush()) {
      chaveNotif.disabled = true;
      textoNotif.textContent = ehIOS() && !estaInstalado()
        ? "No iPhone, toque em Compartilhar e em “Adicionar à Tela de Início”. Depois abra o Carpe Diem pelo ícone."
        : "Este navegador não suporta notificações.";
      return;
    }

    const estado = await statusLembretes();

    chaveNotif.checked = estado.ativo;

    if (estado.permissao === "denied") {
      textoNotif.textContent = "As notificações estão bloqueadas neste navegador. Libere nas configurações do site.";
    }
  }

  chaveNotif.addEventListener("change", async () => {
    chaveNotif.disabled = true;

    if (chaveNotif.checked) {
      textoNotif.textContent = "Ativando...";

      const resultado = await ativarLembretes();

      if (!resultado.ok) {
        chaveNotif.checked = false;
        textoNotif.textContent = resultado.motivo;
      } else {
        textoNotif.textContent = "";
        toast("Lembretes ativados neste aparelho 💜", "sucesso");
      }
    } else {
      await desativarLembretes();
      textoNotif.textContent = "";
      toast("Lembretes desativados.", "info", 2200);
    }

    chaveNotif.disabled = false;
  });

  // =========================================================
  // GERENCIAMENTO
  // =========================================================

  async function apagarTarefasDoUsuario() {
    const { error } = await supabaseClient
      .from("events")
      .delete()
      .eq("user_id", obterUsuarioId());

    if (error) throw error;

    events = [];
  }

  function limparDadosLocais() {
    localStorage.removeItem(CHAVE_PERFIL);
    localStorage.removeItem(CHAVE_META);
  }

  $("restore-btn").addEventListener("click", async () => {
    const ok = await confirmar(
      "As tarefas atuais serão apagadas e você escolherá um novo plano de estudos. Perfil e meta continuam salvos.",
      { titulo: "Refazer cronograma", confirmar: "Refazer", cancelar: "Cancelar", perigo: true }
    );

    if (!ok) return;

    try {
      await apagarTarefasDoUsuario();
      localStorage.removeItem("carpeDiem_plano");
      window.location.href = "escolher-vestibular.html";
    } catch (erro) {
      console.error(erro);
      avisar("Não foi possível apagar as tarefas: " + (erro.message || erro), { tipo: "erro" });
    }
  });

  $("delete-btn").addEventListener("click", async () => {
    const ok = await confirmar(
      "Isso apaga seu perfil, suas tarefas e suas configurações. Não dá para desfazer.",
      { titulo: "Apagar meus dados", confirmar: "Apagar tudo", cancelar: "Cancelar", perigo: true }
    );

    if (!ok) return;

    try {
      await apagarTarefasDoUsuario();
      await desativarLembretes();

      limparDadosLocais();
      iniciarNovoUsuario();

      window.location.href = "welcome.html";
    } catch (erro) {
      console.error(erro);
      avisar("Não foi possível apagar os dados: " + (erro.message || erro), { tipo: "erro" });
    }
  });

  $("logout-btn").addEventListener("click", async () => {
    const ok = await confirmar(
      "Este aparelho vai começar como uma pessoa nova. Os dados atuais deixam de aparecer aqui.",
      { titulo: "Sair", confirmar: "Sair", cancelar: "Ficar" }
    );

    if (!ok) return;

    await desativarLembretes();

    limparDadosLocais();
    iniciarNovoUsuario();

    window.location.href = "welcome.html";
  });
    // =========================================================
  // EXPORTAR PARA O CALENDÁRIO (.ics com alarme de 10 min)
  // =========================================================

  function escaparICS(texto) {
    return String(texto || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  $("export-ics").addEventListener("click", async () => {
    await carregarEventosDoSupabase();

    const hojeISO = formatarDataISO(new Date());
    const carimbo = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

    const futuras = events.filter(e =>
      e.date && e.date >= hojeISO && !e.completed &&
      horarioEmMinutos(e.startTime) !== null && horarioEmMinutos(e.endTime) !== null
    );

    if (!futuras.length) {
      avisar("Você ainda não tem tarefas futuras para exportar.", { tipo: "info" });
      return;
    }

    const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Carpe Diem//PT", "CALSCALE:GREGORIAN"];

    futuras.forEach(e => {
      const dia = e.date.replace(/-/g, "");

      linhas.push(
        "BEGIN:VEVENT",
        `UID:${e.id}@carpediem`,
        `DTSTAMP:${carimbo}`,
        `DTSTART:${dia}T${e.startTime.replace(":", "")}00`,
        `DTEND:${dia}T${e.endTime.replace(":", "")}00`,
        `SUMMARY:${escaparICS(e.title)}`,
        "BEGIN:VALARM",
        "TRIGGER:-PT10M",
        "ACTION:DISPLAY",
        "DESCRIPTION:Hora de estudar",
        "END:VALARM",
        "END:VEVENT"
      );
    });

    linhas.push("END:VCALENDAR");

    const arquivo = new Blob([linhas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(arquivo);

    const a = document.createElement("a");
    a.href = url;
    a.download = "carpe-diem.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    toast("Arquivo baixado. Abra no seu calendário para importar 💜", "sucesso", 3500);
  });

  // =========================================================
  // INÍCIO
  // =========================================================

  mostrarPerfil();
  preencherMeta();
  iniciarNotificacoes();
});