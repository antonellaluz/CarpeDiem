/*
  CARPE DIEM — PLANOS DE ESTUDO (cronograma pronto por vestibular)
  Carregue DEPOIS do regras.js.

  O plano é contínuo: gera 12 semanas e renova sozinho quando faltarem
  menos de 4 semanas. Todo bloco passa pelas mesmas regras do site
  (aula, almoço, descanso, sono, lazer e limites de horas).
  Os planos são sugestões de distribuição de matérias, não calendários oficiais.
*/

const CHAVE_PLANO = "carpeDiem_plano";
const HORIZONTE_DIAS = 84;            // gera 12 semanas à frente
const RENOVAR_QUANDO_FALTAREM = 28;   // renova quando restarem menos de 4 semanas

const ASSUNTOS = {
    "Matemática": ["Funções", "Geometria Plana", "Probabilidade", "Matrizes", "Análise Combinatória", "Geometria Espacial"],
    "Física": ["Cinemática", "Dinâmica", "Termologia", "Óptica", "Eletricidade", "Ondulatória"],
    "Química": ["Estequiometria", "Termoquímica", "Eletroquímica", "Química Orgânica", "Soluções"],
    "Biologia": ["Citologia", "Genética", "Ecologia", "Fisiologia Humana", "Evolução"],
    "Português": ["Crase", "Análise Sintática", "Figuras de Linguagem", "Interpretação de Texto"],
    "Linguagens": ["Interpretação de Texto", "Gêneros Textuais", "Variação Linguística", "Artes e Cultura"],
    "Literatura": ["Romantismo", "Realismo", "Modernismo", "Leituras obrigatórias"],
    "História": ["Brasil República", "Idade Moderna", "Era Vargas", "Guerra Fria"],
    "Geografia": ["Geopolítica", "Climatologia", "Urbanização", "Meio Ambiente"],
    "Filosofia e Sociologia": ["Ética e Cidadania", "Cultura e Sociedade", "Pensadores clássicos"],
    "Redação": ["Estrutura dissertativa", "Repertório sociocultural", "Proposta de intervenção"],
    "Inglês": ["Interpretação de textos", "Vocabulário", "Gramática"],
    "Interdisciplinar": ["Questões integradas", "Interpretação de gráficos e textos"]
};

const COR_MATERIA = {
    "Matemática": "#60a5fa", "Física": "#a78bfa", "Química": "#4ade80", "Biologia": "#86efac",
    "Português": "#c795b5", "Linguagens": "#c795b5", "Literatura": "#d8a7cf", "História": "#fcd34d",
    "Geografia": "#fdba74", "Filosofia e Sociologia": "#fde047", "Redação": "#f87171",
    "Inglês": "#7dd3fc", "Interdisciplinar": "#a5b4fc"
};

const PLANOS = {
    enem: {
        nome: "ENEM",
        icone: "fa-pen-to-square",
        descricao: "4 áreas de conhecimento e redação. Foco em interpretação e questões.",
        ciclo: ["Matemática", "Redação", "Biologia", "Linguagens", "História", "Física", "Química", "Geografia", "Matemática", "Filosofia e Sociologia"],
        sabado: [
            { materia: "Redação", titulo: "Redação (prática)" },
            { materia: "Matemática", titulo: "Estudar Matemática" },
            { materia: "Interdisciplinar", titulo: "Questões de provas anteriores", categoria: "QUESTOES" }
        ]
    },
    fuvest: {
        nome: "Fuvest (USP)",
        icone: "fa-graduation-cap",
        descricao: "Prova com muito conteúdo e leituras obrigatórias. Foco em Exatas, Português e Literatura.",
        ciclo: ["Matemática", "Português", "Física", "Literatura", "Química", "História", "Biologia", "Geografia", "Matemática", "Inglês"],
        sabado: [
            { materia: "Literatura", titulo: "Leituras obrigatórias" },
            { materia: "Redação", titulo: "Redação (prática)" },
            { materia: "Interdisciplinar", titulo: "Questões de provas anteriores", categoria: "QUESTOES" }
        ]
    },
    unicamp: {
        nome: "Unicamp",
        icone: "fa-flask",
        descricao: "Questões contextualizadas e interdisciplinares, redação e leituras.",
        ciclo: ["Matemática", "Interdisciplinar", "Redação", "Biologia", "Física", "Literatura", "Química", "Geografia", "História", "Inglês"],
        sabado: [
            { materia: "Redação", titulo: "Redação (prática)" },
            { materia: "Literatura", titulo: "Leituras obrigatórias" },
            { materia: "Interdisciplinar", titulo: "Questões de provas anteriores", categoria: "QUESTOES" }
        ]
    },
    outro: {
        nome: "Outro vestibular",
        icone: "fa-book-open",
        descricao: "Plano equilibrado entre todas as matérias, para ajustar depois.",
        ciclo: ["Matemática", "Português", "Biologia", "História", "Física", "Redação", "Química", "Geografia", "Literatura", "Inglês"],
        sabado: [
            { materia: "Redação", titulo: "Redação (prática)" },
            { materia: "Matemática", titulo: "Estudar Matemática" },
            { materia: "Interdisciplinar", titulo: "Questões de provas anteriores", categoria: "QUESTOES" }
        ]
    }
};

// Horários de bloco (90 min) por período, de segunda a sexta. O que não couber nas regras é descartado.
const MODELOS_SEMANA = {
    manha:    [["14:00", "15:30"], ["16:00", "17:30"]],
    tarde:    [["08:00", "09:30"], ["10:00", "11:30"]],
    noite:    [["08:00", "09:30"], ["10:00", "11:30"], ["14:00", "15:30"]],
    integral: [["19:00", "20:30"]],
    misto:    [["08:00", "09:30"]]
};

const MODELO_SABADO = [["08:00", "09:30"], ["10:00", "11:30"], ["14:00", "15:30"]];

function lerPlano() {
    try {
        const p = JSON.parse(localStorage.getItem(CHAVE_PLANO));
        return p && PLANOS[p.chave] ? p : null;
    } catch (erro) {
        return null;
    }
}

function salvarPlano(plano) {
    try {
        localStorage.setItem(CHAVE_PLANO, JSON.stringify(plano));
    } catch (erro) {
        console.error("Não foi possível salvar o plano:", erro);
    }
}

function novoEstadoPlano(chave) {
    return { chave, geradoAte: null, passo: 0, cont: {} };
}

function proximoAssunto(plano, materia) {
    const lista = ASSUNTOS[materia] || [];
    if (!lista.length) return null;

    const n = plano.cont[materia] || 0;
    plano.cont[materia] = n + 1;

    return lista[n % lista.length];
}

// Gera os blocos entre duas datas (inclusive). Não altera `existentes`.
function gerarEventosDoPlano(plano, deISO, ateISO, existentes) {
    const modelo = PLANOS[plano.chave];
    const periodo = periodoEscolar() || "manha";
    const novos = [];

    for (let d = parseDataISO(deISO); formatarDataISO(d) <= ateISO; d = addDias(d, 1)) {
        const dia = d.getDay();

        if (dia === 0) continue;   // domingo é descanso

        const horarios = dia === 6 ? MODELO_SABADO : (MODELOS_SEMANA[periodo] || MODELOS_SEMANA.manha);

        horarios.forEach(([inicio, fim], k) => {
            // Em feriado, nada à tarde (o plano respeita o descanso)
            if (ehFeriado(d) && horarioEmMinutos(fim) > FIM_DA_MANHA) return;

            let materia, titulo, categoria = "ESTUDO";

            if (dia === 6) {
                const s = modelo.sabado[k % modelo.sabado.length];
                materia = s.materia;
                titulo = s.titulo;
                categoria = s.categoria || "ESTUDO";
            } else {
                materia = modelo.ciclo[plano.passo % modelo.ciclo.length];
                titulo = "Estudar " + materia;
            }

            const tarefa = {
                id: novoId(),
                title: titulo,
                startTime: inicio,
                endTime: fim,
                color: COR_MATERIA[materia] || "#c795b5",
                category: categoria,
                day: dia,
                date: formatarDataISO(d),
                completed: false,
                fixed: false,
                subject: materia,
                topic: proximoAssunto(plano, materia)
            };

            if (validarTarefa([...existentes, ...novos], tarefa).ok) {
                novos.push(tarefa);
                if (dia !== 6) plano.passo++;
            }
        });
    }

    return novos;
}

// Mantém o cronograma aparecendo sempre: gera mais semanas quando faltam menos de 4.
// Retorna quantos blocos novos foram criados.
async function garantirPlano() {
    const plano = lerPlano();

    if (!plano) return 0;

    const hoje = new Date();
    const hojeISO = formatarDataISO(hoje);

    const limiteRenovar = formatarDataISO(addDias(hoje, RENOVAR_QUANDO_FALTAREM));
    if (plano.geradoAte && plano.geradoAte >= limiteRenovar) return 0;

    const de = plano.geradoAte && plano.geradoAte >= hojeISO
        ? formatarDataISO(addDias(parseDataISO(plano.geradoAte), 1))
        : formatarDataISO(addDias(hoje, 1));

    const ate = formatarDataISO(addDias(hoje, HORIZONTE_DIAS));

    const novos = gerarEventosDoPlano(plano, de, ate, events);

    if (novos.length) {
        events.push(...novos);

        const salvou = await salvarEventosNoSupabase(events);

        if (!salvou) {
            events = events.filter(e => !novos.includes(e));
            return 0;
        }
    }

    plano.geradoAte = ate;
    salvarPlano(plano);

    return novos.length;
}

// Escolhe o vestibular e gera o primeiro período
async function escolherPlano(chave) {
    if (!PLANOS[chave]) return 0;

    salvarPlano(novoEstadoPlano(chave));

    await carregarEventosDoSupabase();
    return garantirPlano();
}