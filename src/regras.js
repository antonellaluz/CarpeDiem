/*
  CARPE DIEM — REGRAS DE ROTINA (compartilhado entre as páginas)

  Limites RÍGIDOS (bloqueiam a tarefa):
    • Domingo é dia de descanso: NENHUMA atividade pode ser cadastrada
    • 9h30 por dia somando aulas + trabalho + estudo (8h30 em semana leve)
    • Integral e misto, em dia de aula: a aula NÃO entra na conta. Depois dela há uma
      pausa fixa de 1h (começa 30 min após o fim da aula) e o estudo extra tem
      teto de 2h por dia (1h30 em semana leve)
    • Sábado (todos os períodos): no máximo 6h líquidas de estudo, sem contar as
      pausas (5h em semana leve)
    • 50h por semana (40h em semana leve)
    • Sem choque de horários: com outras tarefas (inclusive as fixas) ou com a aula
    • Horários de sono, lazer, almoço e descanso pós-aula são reservados
      (exercício e descanso podem usar o horário de lazer)

  Horários de aula:
    • Manhã: 07:00 às 12:30, almoço de 1h (12:30 às 13:30)
    • Tarde: 13:15 às 18:00, almoço de 1h antes da aula (12:15 às 13:15)

  Categorias de tarefas fixas:
    • COMPROMISSO: não conta nas horas, ocupa o horário
    • EXERCICIO: não conta nas horas, pode usar o horário de lazer
    • TRABALHO: conta nas horas do dia e da semana

  Recomendações FLEXÍVEIS (só avisam; o estudante decide):
    • Blocos de estudo de até 90 min
    • Até 4h de estudo extra focado por dia
    • Integral e misto: estudo extra recomendado de até 1h30 por dia
    • Sábado: até 4h líquidas de estudo (3h em semana leve)
    • Até 45h por semana (36h em semana leve)
    • Feriado: estudar só de manhã (até 12:00) e deixar a tarde livre para descansar
      (feriados nacionais; não há aula nesses dias)
    • Atividade fixa que deixe menos de 2h livres no dia: aviso de dia apertado

  Pausa: todo bloco de estudo de 60 min ou mais tem uma pausa de 10 min DENTRO dele
  (a cada 90 min). A pausa faz parte do bloco, então não aumenta as horas.

  Remanejamento automático de estudos não realizados (veja o final do arquivo):
    • Nunca volta para o mesmo dia e nunca vai para o domingo
    • Nunca mexe em tarefas fixas e trata o horário delas como ocupado
    • Não usa a tarde de feriados (ninguém está lá para confirmar)
    • Os blocos variáveis podem ser reduzidos para encaixar a tarefa (mínimo 30 min)
    • Se não couber nesta semana, vai para a semana seguinte
    • Sempre respeitando os limites do dia e da semana
*/

// =========================================================
// CONEXÃO COM O SUPABASE
// =========================================================
const SUPABASE_URL = 'https://nwkhbfmfqitdfylwtctl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_F8fKOweuVfgiuCBih5vWcg_bEcQmOwL';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Lista única de eventos, compartilhada com as páginas (NÃO declare de novo nelas)
let events = [];

// Texto do último erro do Supabase (útil para mostrar na tela)
let ultimoErroSupabase = "";

// ---------------------------------------------------------
// USUÁRIO: cada pessoa tem um id próprio, guardado neste navegador.
// Só as tarefas desse id aparecem no cronograma.
// ---------------------------------------------------------
const CHAVE_USUARIO = "carpeDiem_usuario_id";

function obterUsuarioId() {
    let id = null;

    try {
        id = localStorage.getItem(CHAVE_USUARIO);

        if (!id) {
            id = crypto.randomUUID
                ? crypto.randomUUID()
                : String(Date.now()) + Math.random().toString(16).slice(2);

            localStorage.setItem(CHAVE_USUARIO, id);
        }
    } catch (erro) {
        console.error("Não foi possível ler o usuário:", erro);
    }

    return id || "anonimo";
}

// Chame quando um NOVO usuário começar: cria um id novo e limpa os dados locais
function iniciarNovoUsuario() {
    [
        "carpeDiem_nome",
        "carpeDiem_periodo",
        "carpeDiem_sono",
        "carpeDiem_lembretes",
        "carpeDiem_tarefas",
        "carpeDiemConfiguracao",
        "carpeDiemQuestionario",
        "carpeDiem_plano"
    ].forEach(chave => localStorage.removeItem(chave));

    const id = crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(16).slice(2);

    localStorage.setItem(CHAVE_USUARIO, id);
    events = [];
}

async function carregarEventosDoSupabase() {
    try {
        const { data, error } = await supabaseClient
            .from('events')
            .select('*')
            .eq('user_id', obterUsuarioId());

        if (error) {
            console.error("Erro ao buscar eventos do Supabase:", error);
            ultimoErroSupabase = error.message || String(error);
            return events;
        }

        const mapeados = data.map(item => ({
            id: item.id,
            title: item.title,
            startTime: item.start_time,
            endTime: item.end_time,
            date: item.date,
            day: item.date ? parseDataISO(item.date).getDay() : (item.day ?? 0),
            category: item.category,
            color: item.color,
            completed: item.completed,
            fixed: item.fixed,
            remanejada: item.remanejada,
            remanejadaDe: item.remanejada_de,
            duracaoOriginalMin: item.duracao_original_min,
            subject: item.subject,
            topic: item.topic,
            tentativaFalhaEm: item.tentativa_falha_em || null
        }));

        const { eventos, alterou } = normalizarEventos(mapeados);
        events = eventos;

        if (alterou) {
            await salvarEventosNoSupabase(events);
        }

        return events;
    } catch (erro) {
        console.error("Erro de conexão com o Supabase:", erro);
        ultimoErroSupabase = erro.message || String(erro);
        return events;
    }
}

// Retorna true se gravou, false se deu erro
async function salvarEventosNoSupabase(eventos) {
    try {
        if (!Array.isArray(eventos) || eventos.length === 0) return true;

        const usuarioId = obterUsuarioId();

        const payload = eventos.map(e => ({
            id: e.id,
            user_id: usuarioId,
            title: e.title,
            start_time: e.startTime,
            end_time: e.endTime,
            date: e.date || null,
            day: e.day ?? null,
            category: e.category || 'ESTUDO',
            color: e.color || 'blue',
            completed: Boolean(e.completed),
            fixed: Boolean(e.fixed),
            remanejada: Boolean(e.remanejada),
            remanejada_de: e.remanejadaDe || null,
            duracao_original_min: e.duracaoOriginalMin || null,
            subject: e.subject || null,
            topic: e.topic || null,
            tentativa_falha_em: e.tentativaFalhaEm || null
        }));

        const { error } = await supabaseClient.from('events').upsert(payload);

        if (error) {
            console.error("Erro ao salvar no Supabase:", error);
            ultimoErroSupabase = error.message || String(error);
            return false;
        }

        ultimoErroSupabase = "";
        return true;
    } catch (erro) {
        console.error("Erro ao processar salvamento na nuvem:", erro);
        ultimoErroSupabase = erro.message || String(erro);
        return false;
    }
}

async function excluirEventoNoSupabase(id) {
    try {
        const { error } = await supabaseClient
            .from('events')
            .delete()
            .eq('id', id)
            .eq('user_id', obterUsuarioId());

        if (error) {
            console.error("Erro ao excluir evento no Supabase:", error);
            ultimoErroSupabase = error.message || String(error);
            return false;
        }

        return true;
    } catch (erro) {
        console.error("Erro ao conectar para excluir:", erro);
        ultimoErroSupabase = erro.message || String(erro);
        return false;
    }
}

// =========================================================
// CONSTANTES E CONFIGURAÇÃO DE ROTINA
// =========================================================

const CHAVE_EVENTOS = "carpeDiemEventos";

const HORA_INICIAL = 6;
const HORA_FINAL = 23;
const FIM_DA_MANHA = 12 * 60;

let configuracaoRotina = {
    diasEscola: [1, 2, 3, 4, 5],
    descansoObrigatorio: true,
    semanaLeve: false,
    feriasJulho: true,
    lazer: { inicio: "18:00", fim: "19:00" }   // horário de lazer reservado, todos os dias
};

// Horários de aula por período (fixos). Cada item é [início, fim].
//   manhã: 07:00 às 12:30 (almoço de 1h depois, até 13:30)
//   tarde: 13:15 às 18:00 (almoço de 1h antes, a partir de 12:15)
//   integral: 9h na escola (07:00 às 16:00, almoço incluso)
//   misto (tarde e noite): 13:15 às 22:00, com intervalo das 18:00 às 19:00
const HORARIOS_ESCOLA = {
    manha:    [["07:00", "12:30"]],
    tarde:    [["13:15", "18:00"]],
    noite:    [["19:00", "22:30"]],
    integral: [["07:00", "16:00"]],
    misto:    [["13:15", "18:00"], ["19:00", "22:00"]]
};

function carregarConfiguracao() {
    try {
        const salva = JSON.parse(localStorage.getItem("carpeDiemConfiguracao"));

        if (salva && typeof salva === "object") {
            Object.assign(configuracaoRotina, salva);
        }
    } catch (erro) {
        console.error("Não foi possível carregar a configuração:", erro);
    }
}

carregarConfiguracao();

function limitesAtuais() {
    const leve = Boolean(configuracaoRotina.semanaLeve);

    return {
        diario: leve ? 8.5 : 9.5,                   // horas por dia (aula + trabalho + estudo)
        semanal: leve ? 40 : 50,
        semanalRecomendado: leve ? 36 : 45,
        focoDiario: 4,
        blocoMaximoMin: 90,
        extraLongaMin: leve ? 90 : 120,             // integral/misto: teto de estudo extra por dia de aula
        extraLongaRecomendadoMin: leve ? 60 : 90,   // integral/misto: recomendado (só avisa)
        sabadoMaxMin: leve ? 300 : 360,             // sábado: estudo líquido máximo (6h)
        sabadoRecomendadoMin: leve ? 180 : 240      // sábado: estudo líquido recomendado (4h)
    };
}

// =========================================================
// ARMAZENAMENTO DAS TAREFAS (compartilhado: formulário, calendário e início)
// =========================================================

function novoId() {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random());
}

// Converte tarefas salvas no formato antigo (carpeDiem_tarefas) para o atual
function migrarTarefasAntigas() {
    try {
        const antigas = JSON.parse(localStorage.getItem("carpeDiem_tarefas"));

        if (!Array.isArray(antigas) || !antigas.length) return;

        antigas.forEach(t => {
            if (!t.data) return;

            events.push({
                id: novoId(),
                title: t.titulo,
                startTime: t.horaInicio,
                endTime: t.horaFim,
                color: t.cor,
                category: t.tipo === "variavel" ? "ESTUDO" : "COMPROMISSO",
                day: parseDataISO(t.data).getDay(),
                date: t.data,
                completed: false,
                fixed: t.tipo === "fixa",
                subject: t.materia || null,
                topic: t.assunto || null
            });
        });

        salvarEventosNoSupabase(events);
        localStorage.removeItem("carpeDiem_tarefas");
    } catch (erro) {
        console.error("Não foi possível migrar as tarefas antigas:", erro);
    }
}

// Limpa dados de versões anteriores
function normalizarEventos(lista) {
    let alterou = false;

    const limpa = lista.filter(e => {
        const antigo =
            !e.date &&
            e.fixed &&
            categoriaDe(e) === "DESCANSO" &&
            ["Pausa para descanso", "Momento de lazer"].includes(e.title);

        if (antigo) alterou = true;

        return !antigo;
    });

    const vistos = new Set();

    limpa.forEach(e => {
        if (!e.id || vistos.has(e.id)) {
            e.id = novoId();
            alterou = true;
        }

        vistos.add(e.id);
    });

    return { eventos: limpa, alterou };
}

function lerEventosSalvos() {
    migrarTarefasAntigas();
    return events;
}

// Retorna true se gravou no banco, false se deu erro
async function salvarEventosSalvos(eventosLista) {
    events = eventosLista;
    return await salvarEventosNoSupabase(events);
}

// Concluir / reabrir uma tarefa. A troca é imediata; o salvamento é aguardado.
async function alternarConclusao(id) {
    const alvo = events.find(e => e.id === id);

    if (!alvo) return null;

    alvo.completed = !alvo.completed;
    await salvarEventosSalvos(events);

    return alvo.completed;
}

// =========================================================
// DATAS
// =========================================================

function inicioDaSemana(data = new Date()) {
    const domingo = new Date(data);

    domingo.setHours(0, 0, 0, 0);
    domingo.setDate(domingo.getDate() - domingo.getDay());

    return domingo;
}

function addDias(data, n) {
    const nova = new Date(data);
    nova.setDate(nova.getDate() + n);
    return nova;
}

function formatarDataISO(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");

    return `${ano}-${mes}-${dia}`;
}

function parseDataISO(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    return new Date(a, m - 1, d);
}

function datasDaSemana(dataISO) {
    const domingo = inicioDaSemana(parseDataISO(dataISO));

    return Array.from({ length: 7 }, (_, i) =>
        formatarDataISO(addDias(domingo, i))
    );
}

// =========================================================
// HORÁRIOS
// =========================================================

function horarioEmMinutos(horario) {
    if (
        typeof horario !== "string" ||
        !/^\d{2}:\d{2}$/.test(horario)
    ) return null;

    const [hora, minuto] = horario.split(":").map(Number);

    if (hora > 23 || minuto > 59) return null;

    return hora * 60 + minuto;
}

function minutosEmHorario(min) {
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function duracaoEmHoras(inicio, fim) {
    const i = horarioEmMinutos(inicio);
    const f = horarioEmMinutos(fim);

    if (i === null || f === null || f <= i) return 0;

    return (f - i) / 60;
}

function formatarHoras(horas) {
    const total = Math.round(horas * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;

    return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function sobrepoe(a1, a2, b1, b2) {
    return a1 < b2 && a2 > b1;
}

// =========================================================
// FERIADOS NACIONAIS E FÉRIAS
// =========================================================

function calcularPascoa(ano) {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);

    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(ano, mes - 1, dia);
}

function obterFeriadosNacionais(ano) {
    const pascoa = calcularPascoa(ano);

    const sextaSanta = new Date(pascoa);
    sextaSanta.setDate(pascoa.getDate() - 2);

    return [
        `${ano}-01-01`,
        `${ano}-04-21`,
        `${ano}-05-01`,
        `${ano}-09-07`,
        `${ano}-10-12`,
        `${ano}-11-02`,
        `${ano}-11-15`,
        `${ano}-11-20`,
        `${ano}-12-25`,
        formatarDataISO(sextaSanta)
    ];
}

function ehFeriado(data) {
    return obterFeriadosNacionais(data.getFullYear())
        .includes(formatarDataISO(data));
}

function estaNasFeriasJulho(data) {
    return Boolean(configuracaoRotina.feriasJulho) && data.getMonth() === 6;
}

// =========================================================
// AULAS (HORÁRIO FIXO)
// =========================================================

function temAula(data) {
    return (
        configuracaoRotina.diasEscola.includes(data.getDay()) &&
        !ehFeriado(data) &&
        !estaNasFeriasJulho(data)
    );
}

function periodoEscolar() {
    try {
        return localStorage.getItem("carpeDiem_periodo");
    } catch (erro) {
        return null;
    }
}

// Blocos de aula do dia (vazio em feriado, férias, fim de semana ou sem período definido)
function blocosEscolaDoDia(dataISO) {
    const periodo = periodoEscolar();
    const horarios = configuracaoRotina.horariosEscola || HORARIOS_ESCOLA;

    if (!periodo || !horarios[periodo]) return [];
    if (!temAula(parseDataISO(dataISO))) return [];

    return horarios[periodo].map(([inicio, fim]) => ({
        startTime: inicio,
        endTime: fim,
        title: "Aula",
        category: "ESCOLA"
    }));
}

// =========================================================
// JORNADA LONGA (integral e misto) E DESCANSO PÓS-AULA
// =========================================================

const DESCANSO_ATRASO_MIN = 30;     // o descanso começa 30 min depois do fim da aula
const DESCANSO_DURACAO_MIN = 60;    // e dura 1h

// Dia de aula de um estudante integral ou misto
function ehJornadaLonga(dataISO) {
    const periodo = periodoEscolar();

    return (
        (periodo === "integral" || periodo === "misto") &&
        blocosEscolaDoDia(dataISO).length > 0
    );
}

// [início, fim] em minutos do descanso fixo depois da última aula, ou null
function descansoPosAula(dataISO) {
    if (!ehJornadaLonga(dataISO)) return null;

    const fimAula = Math.max(
        ...blocosEscolaDoDia(dataISO).map(b => horarioEmMinutos(b.endTime))
    );

    const inicio = fimAula + DESCANSO_ATRASO_MIN;

    return [inicio, inicio + DESCANSO_DURACAO_MIN];
}

// Limite de horas que contam no dia (para integral/misto, a aula fica de fora)
function limiteDoDiaHoras(dataISO) {
    const L = limitesAtuais();

    return ehJornadaLonga(dataISO) ? L.extraLongaMin / 60 : L.diario;
}

// =========================================================
// ALMOÇO (1h): depois da aula (manhã) ou antes dela (tarde e misto)
// =========================================================

const ALMOCO_MIN = 60;

function almocoDoDia(dataISO) {
    const periodo = periodoEscolar();

    if (!["manha", "tarde", "misto"].includes(periodo)) return null;

    const aulas = blocosEscolaDoDia(dataISO);

    if (!aulas.length) return null;

    if (periodo === "manha") {
        const fim = horarioEmMinutos(aulas[0].endTime);
        return [fim, fim + ALMOCO_MIN];
    }

    const inicio = horarioEmMinutos(aulas[0].startTime);
    return [inicio - ALMOCO_MIN, inicio];
}

// =========================================================
// SONO, LAZER, ALMOÇO E DESCANSO (HORÁRIOS RESERVADOS)
// =========================================================

function horasDeSono() {
    let horas = 7;

    try {
        const salvo = parseFloat(localStorage.getItem("carpeDiem_sono"));
        if (!isNaN(salvo)) horas = salvo;
    } catch (erro) {
        // usa o padrão
    }

    return Math.min(10, Math.max(7, horas));
}

// Passe a data para incluir almoço e descanso pós-aula
function blocosReservadosDoDia(dataISO = null) {
    const reservados = [];
    const fimDoDia = HORA_FINAL * 60;
    const dormir = Math.round((30 - horasDeSono()) * 60);

    let teto = fimDoDia;

    if (dormir < fimDoDia) {
        reservados.push({
            startTime: minutosEmHorario(dormir),
            endTime: minutosEmHorario(fimDoDia),
            title: "Sono",
            tipo: "sono"
        });

        teto = dormir;
    }

    // Almoço (dias de aula de manhã, tarde e misto)
    const almoco = dataISO ? almocoDoDia(dataISO) : null;

    if (almoco) {
        reservados.push({
            startTime: minutosEmHorario(almoco[0]),
            endTime: minutosEmHorario(almoco[1]),
            title: "Almoço",
            tipo: "almoco"
        });
    }

    // Descanso fixo depois da aula
    let descansoIni = null;
    let descansoFim = null;

    const descanso = dataISO ? descansoPosAula(dataISO) : null;

    if (descanso) {
        const ini = descanso[0];
        const fim = Math.min(descanso[1], teto);

        if (fim > ini) {
            descansoIni = ini;
            descansoFim = fim;

            reservados.push({
                startTime: minutosEmHorario(ini),
                endTime: minutosEmHorario(fim),
                title: "Descanso",
                tipo: "descanso"
            });
        }
    }

    // Lazer (se coincidir com o descanso, começa quando o descanso termina)
    const lazer = configuracaoRotina.lazer;

    if (
        lazer &&
        horarioEmMinutos(lazer.inicio) !== null &&
        horarioEmMinutos(lazer.fim) !== null &&
        horarioEmMinutos(lazer.fim) > horarioEmMinutos(lazer.inicio)
    ) {
        let ini = horarioEmMinutos(lazer.inicio);
        const fim = horarioEmMinutos(lazer.fim);

        if (descansoIni !== null && sobrepoe(ini, fim, descansoIni, descansoFim)) {
            ini = Math.max(ini, descansoFim);
        }

        if (fim > ini) {
            reservados.push({
                startTime: minutosEmHorario(ini),
                endTime: minutosEmHorario(fim),
                title: "Lazer",
                tipo: "lazer"
            });
        }
    }

    return reservados;
}

// =========================================================
// PAUSA DENTRO DO BLOCO
// =========================================================

const PAUSA_MIN = 10;
const BLOCO_MIN_PARA_PAUSA = 60;
const SEGMENTO_MAX = 90;

function pausasDoBloco(inicio, fim) {
    const pausas = [];

    for (let s = inicio; s < fim; s += SEGMENTO_MAX) {
        const tamanho = Math.min(s + SEGMENTO_MAX, fim) - s;

        if (tamanho >= BLOCO_MIN_PARA_PAUSA) {
            const comeco = s + Math.floor((tamanho - PAUSA_MIN) / 2 / 5) * 5;
            pausas.push([comeco, comeco + PAUSA_MIN]);
        }
    }

    return pausas;
}

// Minutos de estudo líquidos: o bloco menos as pausas de 10 min
function duracaoLiquidaMin(inicio, fim) {
    const i = horarioEmMinutos(inicio);
    const f = horarioEmMinutos(fim);

    if (i === null || f === null || f <= i) return 0;

    return (f - i) - pausasDoBloco(i, f).length * PAUSA_MIN;
}

// =========================================================
// CATEGORIAS E CARGA
// =========================================================

function categoriaDe(evento) {
    return String(
        evento.category || evento.categoria || "ESTUDO"
    ).toUpperCase();
}

function ehEstudo(evento) {
    const c = categoriaDe(evento);
    return c === "ESTUDO" || c === "QUESTOES";
}

// Só estudo, aula e trabalho entram nas horas do dia e da semana.
// Compromisso e exercício ocupam o horário, mas não contam na carga.
function contaNaCarga(evento) {
    const c = categoriaDe(evento);
    return ehEstudo(evento) || c === "ESCOLA" || c === "TRABALHO";
}

function eventosDaData(eventos, dataISO) {
    const diaSemana = parseDataISO(dataISO).getDay();

    return eventos.filter(e =>
        e.date ? e.date === dataISO : e.day === diaSemana
    );
}

function calcularCargaDia(eventos, dataISO, ignorarId = null) {
    const aulas = blocosEscolaDoDia(dataISO);
    const longa = ehJornadaLonga(dataISO);

    let escola = aulas.reduce(
        (soma, b) => soma + duracaoEmHoras(b.startTime, b.endTime),
        0
    );
    let estudo = 0;
    let trabalho = 0;
    let estudoLiquidoMin = 0;

    eventosDaData(eventos, dataISO).forEach(e => {
        if (ignorarId && e.id === ignorarId) return;

        const horas = duracaoEmHoras(e.startTime, e.endTime);
        const c = categoriaDe(e);

        if (ehEstudo(e)) {
            estudo += horas;
            estudoLiquidoMin += duracaoLiquidaMin(e.startTime, e.endTime);
        }
        else if (c === "TRABALHO") trabalho += horas;
        else if (c === "ESCOLA" && !aulas.length) escola += horas;
    });

    // Integral e misto: a aula não entra no limite do dia
    const total = estudo + trabalho + (longa ? 0 : escola);

    return { estudo, escola, trabalho, total, estudoLiquidoMin, aulaForaDoLimite: longa };
}

function calcularCargaSemana(eventos, dataISO, ignorarId = null) {
    return datasDaSemana(dataISO).reduce(
        (soma, d) => soma + calcularCargaDia(eventos, d, ignorarId).total,
        0
    );
}

// Texto do cabeçalho de cada dia no calendário (ex.: "4h/9h30" ou "3h20/6h líq.")
function resumoDoDia(eventos, dataISO) {
    const L = limitesAtuais();
    const carga = calcularCargaDia(eventos, dataISO);

    if (parseDataISO(dataISO).getDay() === 0) {
        return { texto: "descanso", cheio: false };
    }

    if (parseDataISO(dataISO).getDay() === 6) {
        return {
            texto: `${formatarHoras(carga.estudoLiquidoMin / 60)}/${formatarHoras(L.sabadoMaxMin / 60)} líq.`,
            cheio: carga.estudoLiquidoMin >= L.sabadoMaxMin
        };
    }

    const limite = limiteDoDiaHoras(dataISO);

    return {
        texto: `${formatarHoras(carga.total)}/${formatarHoras(limite)}`,
        cheio: carga.total >= limite - 1e-9
    };
}

// =========================================================
// SUGESTÃO DE BLOCOS E PAUSAS (flexível)
// =========================================================

function sugerirDivisao(minutos) {
    const blocos = Math.ceil(minutos / 90);
    const tamanho = Math.round(minutos / blocos);

    return `Sugestão: ${blocos} blocos de cerca de ${tamanho} min, com pausas de 10 a 15 min.`;
}

// =========================================================
// VALIDAÇÃO DE TAREFA
// =========================================================

function validarTarefa(eventos, tarefa, ignorarId = null) {
    const erros = [];
    const avisos = [];

    const ini = horarioEmMinutos(tarefa.startTime);
    const fim = horarioEmMinutos(tarefa.endTime);

    if (ini === null || fim === null || fim <= ini) {
        erros.push("O horário de término deve ser posterior ao início.");
        return { ok: false, erros, avisos };
    }

    if (ini < HORA_INICIAL * 60 || fim > HORA_FINAL * 60) {
        erros.push("A tarefa precisa estar entre 06:00 e 23:00.");
        return { ok: false, erros, avisos };
    }

    const dataISO = tarefa.date ||
        formatarDataISO(addDias(inicioDaSemana(), Number(tarefa.day) || 0));

    const data = parseDataISO(dataISO);

    // Domingo: dia de descanso, nenhuma atividade pode ser cadastrada
    if (data.getDay() === 0) {
        erros.push("O domingo é dia de descanso e não pode receber atividades. Escolha outro dia da semana.");
        return { ok: false, erros, avisos };
    }

    const duracaoMin = fim - ini;
    const duracaoH = duracaoMin / 60;
    const estudo = ehEstudo(tarefa);

    const outros = eventosDaData(eventos, dataISO)
        .filter(e => !ignorarId || e.id !== ignorarId);

    // Choque com outras tarefas
    const conflito = outros.find(e => {
        const i = horarioEmMinutos(e.startTime);
        const f = horarioEmMinutos(e.endTime);

        return i !== null && f !== null && sobrepoe(ini, fim, i, f);
    });

    if (conflito) {
        erros.push(
            `Esse horário já está ocupado por "${conflito.title}"${conflito.fixed ? " (atividade fixa)" : ""}. Não dá para fazer duas coisas ao mesmo tempo.`
        );
    }

    // Choque com o horário de aula (vale também para atividades fixas)
    if (categoriaDe(tarefa) !== "ESCOLA") {
        blocosEscolaDoDia(dataISO).forEach(b => {
            if (sobrepoe(ini, fim, horarioEmMinutos(b.startTime), horarioEmMinutos(b.endTime))) {
                erros.push(`Esse horário coincide com a aula (${b.startTime} às ${b.endTime}). Você não consegue estar em aula e fazer outra atividade ao mesmo tempo.`);
            }
        });
    }

    // Choque com sono, lazer, almoço e descanso pós-aula (reservados).
    // Exercício e descanso podem usar o horário de lazer.
    const livreNoLazer = ["EXERCICIO", "DESCANSO"].includes(categoriaDe(tarefa));

    blocosReservadosDoDia(dataISO).forEach(b => {
        if (b.tipo === "lazer" && livreNoLazer) return;

        if (sobrepoe(ini, fim, horarioEmMinutos(b.startTime), horarioEmMinutos(b.endTime))) {
            erros.push(`Esse horário é reservado para ${b.title.toLowerCase()} (${b.startTime} às ${b.endTime}) e não pode ser usado por tarefas.`);
        }
    });

    // Atividade fixa que deixa o dia apertado: só avisa
    if (tarefa.fixed && !estudo && !ehFeriado(data)) {
        const livreMin = janelasLivres([...outros, tarefa], dataISO)
            .reduce((soma, [a, b]) => soma + (b - a), 0);

        if (livreMin < 120) {
            avisos.push(`Com esta atividade fixa, sobram só ${formatarHoras(livreMin / 60)} livres neste dia para estudar e descansar. O dia pode ficar apertado.`);
        }
    }

    // Feriado: recomendação flexível (estudo de manhã, tarde livre para descansar)
    if (estudo && ehFeriado(data) && fim > FIM_DA_MANHA) {
        avisos.push("Hoje é feriado. O recomendado é estudar só de manhã (até 12:00) e deixar a tarde livre para descansar. Você decide se quer salvar mesmo assim.");
    }

    if (contaNaCarga(tarefa)) {
        const L = limitesAtuais();
        const dia = calcularCargaDia(eventos, dataISO, ignorarId);
        const semana = calcularCargaSemana(eventos, dataISO, ignorarId);
        const longa = ehJornadaLonga(dataISO);
        const limiteDia = limiteDoDiaHoras(dataISO);

        if (dia.total + duracaoH > limiteDia + 1e-9) {
            if (longa) {
                const nome = periodoEscolar() === "integral" ? "integral" : "mista";

                erros.push(
                    `Em dia de aula ${nome}, o estudo extra depois da aula é de no máximo ${formatarHoras(limiteDia)} por dia (a aula e o descanso não entram na conta). Você já tem ${formatarHoras(dia.total)} e esta tarefa soma ${formatarHoras(duracaoH)}.`
                );
            } else {
                erros.push(
                    `Limite diário: você já tem ${formatarHoras(dia.total)} no dia (aulas, trabalho e estudo) e esta tarefa soma ${formatarHoras(duracaoH)}. O máximo é ${formatarHoras(limiteDia)} por dia.`
                );
            }
        } else if (longa && dia.total + duracaoH > L.extraLongaRecomendadoMin / 60 + 1e-9) {
            avisos.push(
                `Depois de um dia longo de aula, o recomendado é no máximo ${formatarHoras(L.extraLongaRecomendadoMin / 60)} de estudo extra. Você teria ${formatarHoras(dia.total + duracaoH)}; o teto é ${formatarHoras(limiteDia)}.`
            );
        }

        if (semana + duracaoH > L.semanal + 1e-9) {
            erros.push(
                `Limite semanal: a semana já tem ${formatarHoras(semana)} e esta tarefa passaria de ${L.semanal}h.`
            );
        } else if (
            semana + duracaoH > L.semanalRecomendado + 1e-9 &&
            L.semanal > L.semanalRecomendado
        ) {
            avisos.push(
                `Sua semana passaria de ${L.semanalRecomendado}h entre aulas, trabalho e estudo. A OMS e a OIT associam jornadas de 55h ou mais por semana a maior risco para a saúde. O teto aqui é ${L.semanal}h.`
            );
        }

        if (estudo) {
            if (data.getDay() === 6) {
                // Sábado: limite em horas LÍQUIDAS (sem contar as pausas de 10 min)
                const liquido = dia.estudoLiquidoMin + duracaoLiquidaMin(tarefa.startTime, tarefa.endTime);

                if (liquido > L.sabadoMaxMin) {
                    erros.push(
                        `Limite de sábado: você teria ${formatarHoras(liquido / 60)} líquidas de estudo (sem contar as pausas). O máximo é ${formatarHoras(L.sabadoMaxMin / 60)} líquidas.`
                    );
                } else if (liquido > L.sabadoRecomendadoMin) {
                    avisos.push(
                        `Você teria ${formatarHoras(liquido / 60)} líquidas de estudo neste sábado. O recomendado é até ${formatarHoras(L.sabadoRecomendadoMin / 60)}; o máximo é ${formatarHoras(L.sabadoMaxMin / 60)}.`
                    );
                }
            } else if (dia.estudo + duracaoH > L.focoDiario + 1e-9) {
                avisos.push(
                    `Você teria ${formatarHoras(dia.estudo + duracaoH)} de estudo extra neste dia. Acima de ${L.focoDiario}h o foco costuma cair.`
                );
            }

            const estudos = outros
                .filter(ehEstudo)
                .map(e => [horarioEmMinutos(e.startTime), horarioEmMinutos(e.endTime)])
                .filter(([a, b]) => a !== null && b !== null);

            let inicioSeq = ini;
            let fimSeq = fim;
            let mudou = true;

            while (mudou) {
                mudou = false;

                estudos.forEach(([a, b]) => {
                    if (b <= inicioSeq && inicioSeq - b <= 5 && a < inicioSeq) {
                        inicioSeq = a;
                        mudou = true;
                    }
                    if (a >= fimSeq && a - fimSeq <= 5 && b > fimSeq) {
                        fimSeq = b;
                        mudou = true;
                    }
                });
            }

            const seguidos = fimSeq - inicioSeq;

            if (duracaoMin > L.blocoMaximoMin) {
                avisos.push(
                    `Este bloco tem ${duracaoMin} min. O ideal são blocos de até ${L.blocoMaximoMin} min. ${sugerirDivisao(duracaoMin)}`
                );
            } else if (seguidos > L.blocoMaximoMin) {
                avisos.push(
                    `Com as tarefas coladas, você estudaria ${seguidos} min seguidos. Considere uma pausa de 10 a 15 min.`
                );
            }
        }
    }

    return { ok: erros.length === 0, erros, avisos };
}

// =========================================================
// REMANEJAMENTO AUTOMÁTICO DE ESTUDOS NÃO REALIZADOS
// =========================================================

const DURACAO_MINIMA = 30;
const DIAS_RETROATIVOS = 7;

function duracaoMinutos(tarefa) {
    const i = horarioEmMinutos(tarefa.startTime);
    const f = horarioEmMinutos(tarefa.endTime);

    return i === null || f === null || f <= i ? 0 : f - i;
}

function arredondarAcima(min, passo) {
    return Math.ceil(min / passo) * passo;
}

function listarTarefasPerdidas(eventos, agora = new Date()) {
    const hojeISO = formatarDataISO(agora);
    const limiteISO = formatarDataISO(addDias(agora, -DIAS_RETROATIVOS));

    return eventos
        .filter(e =>
            e.date &&
            !e.fixed &&
            !e.completed &&
            ehEstudo(e) &&
            e.date < hojeISO &&
            e.date >= limiteISO &&
            duracaoMinutos(e) > 0
        )
        .sort((a, b) =>
            (a.date + a.startTime).localeCompare(b.date + b.startTime)
        );
}

function diasCandidatos(agora, origemISO) {
    const hoje = new Date(agora);
    hoje.setHours(0, 0, 0, 0);

    const fimSemana = addDias(inicioDaSemana(hoje), 6);
    const fimBusca = addDias(fimSemana, 7);

    const atual = [];
    const proxima = [];

    for (let d = new Date(hoje); d <= fimBusca; d = addDias(d, 1)) {
        const iso = formatarDataISO(d);

        if (iso === origemISO || d.getDay() === 0) continue;

        (d <= fimSemana ? atual : proxima).push(iso);
    }

    return [atual, proxima];
}

// O remanejamento automático nunca usa a tarde de feriados (fim = 12:00),
// porque não há ninguém para confirmar. Só o cadastro manual pode escolher isso.
// Qualquer tarefa do dia (inclusive as fixas) conta como horário ocupado.
function janelasLivres(eventos, dataISO, ignorarId = null, inicioMinimo = 0) {
    const inicio = Math.max(HORA_INICIAL * 60, inicioMinimo);
    const fim = ehFeriado(parseDataISO(dataISO)) ? FIM_DA_MANHA : HORA_FINAL * 60;

    const ocupados = [];

    blocosEscolaDoDia(dataISO).forEach(b => {
        ocupados.push([horarioEmMinutos(b.startTime), horarioEmMinutos(b.endTime)]);
    });

    blocosReservadosDoDia(dataISO).forEach(b => {
        ocupados.push([horarioEmMinutos(b.startTime), horarioEmMinutos(b.endTime)]);
    });

    eventosDaData(eventos, dataISO).forEach(e => {
        if (ignorarId && e.id === ignorarId) return;

        const i = horarioEmMinutos(e.startTime);
        const f = horarioEmMinutos(e.endTime);

        if (i !== null && f !== null && f > i) ocupados.push([i, f]);
    });

    ocupados.sort((a, b) => a[0] - b[0]);

    const livres = [];
    let cursor = inicio;

    ocupados.forEach(([i, f]) => {
        if (i > cursor) livres.push([cursor, Math.min(i, fim)]);
        cursor = Math.max(cursor, f);
    });

    if (cursor < fim) livres.push([cursor, fim]);

    return livres.filter(([a, b]) => b > a);
}

function capacidadeMin(eventos, dataISO, ignorarId = null) {
    const L = limitesAtuais();
    const dia = calcularCargaDia(eventos, dataISO, ignorarId);
    const semana = calcularCargaSemana(eventos, dataISO, ignorarId);

    let capacidade = Math.min(
        (limiteDoDiaHoras(dataISO) - dia.total) * 60,
        (L.semanal - semana) * 60
    );

    // Sábado: o que sobra do limite líquido (valor conservador, nunca estoura)
    if (parseDataISO(dataISO).getDay() === 6) {
        capacidade = Math.min(capacidade, L.sabadoMaxMin - dia.estudoLiquidoMin);
    }

    return Math.max(0, Math.round(capacidade));
}

function aplicarMovimento(tarefa, dataISO, inicio, duracao) {
    const origem = tarefa.date;

    if (!tarefa.duracaoOriginalMin) {
        tarefa.duracaoOriginalMin = duracaoMinutos(tarefa);
    }

    tarefa.remanejada = true;
    tarefa.remanejadaDe = origem;
    tarefa.date = dataISO;
    tarefa.day = parseDataISO(dataISO).getDay();
    tarefa.startTime = minutosEmHorario(inicio);
    tarefa.endTime = minutosEmHorario(inicio + duracao);
    tarefa.completed = false;
}

function tentarLivre(eventos, tarefa, dataISO, inicioMinimo, permitirReducao) {
    const original = duracaoMinutos(tarefa);
    const piso = Math.min(DURACAO_MINIMA, original);
    const capacidade = capacidadeMin(eventos, dataISO, tarefa.id);
    const preferido = horarioEmMinutos(tarefa.startTime);

    let melhor = null;

    janelasLivres(eventos, dataISO, tarefa.id, inicioMinimo).forEach(([a, b]) => {
        let d = Math.min(original, capacidade, b - a);

        if (d < original) d = Math.floor(d / 5) * 5;
        if (d < piso) return;
        if (d < original && !permitirReducao) return;

        const inicio = Math.min(Math.max(preferido, a), b - d);
        const distancia = Math.abs(inicio - preferido);

        if (
            !melhor ||
            d > melhor.d ||
            (d === melhor.d && distancia < melhor.distancia)
        ) {
            melhor = { d, inicio, distancia };
        }
    });

    if (!melhor) return null;

    const candidata = {
        ...tarefa,
        date: dataISO,
        day: parseDataISO(dataISO).getDay(),
        startTime: minutosEmHorario(melhor.inicio),
        endTime: minutosEmHorario(melhor.inicio + melhor.d)
    };

    if (!validarTarefa(eventos, candidata, tarefa.id).ok) return null;

    aplicarMovimento(tarefa, dataISO, melhor.inicio, melhor.d);

    return {
        modo: melhor.d < original ? "reduzida" : "livre",
        para: dataISO,
        reduzidos: []
    };
}

function tentarJanela(eventos, tarefa, dataISO, inicioMinimo) {
    const original = duracaoMinutos(tarefa);
    const piso = Math.min(DURACAO_MINIMA, original);
    const capacidade = capacidadeMin(eventos, dataISO, tarefa.id);

    const volateis = eventosDaData(eventos, dataISO)
        .filter(e =>
            e.date &&
            e.id &&
            e.id !== tarefa.id &&
            !e.fixed &&
            !e.completed &&
            ehEstudo(e)
        )
        .map(e => ({
            e,
            i: horarioEmMinutos(e.startTime),
            f: horarioEmMinutos(e.endTime)
        }))
        .filter(x => x.i !== null && x.f !== null && x.f > x.i && x.i >= inicioMinimo)
        .sort((a, b) => a.i - b.i);

    const janelas = [];

    volateis.forEach(x => {
        const atual = janelas[janelas.length - 1];
        const ultimo = atual && atual[atual.length - 1];

        if (ultimo && x.i >= ultimo.f && x.i - ultimo.f <= 5) atual.push(x);
        else janelas.push([x]);
    });

    let melhor = null;

    janelas.forEach(janela => {
        const k = janela.length;
        const n = k + 1;
        const inicioJanela = janela[0].i;
        const somaAntiga = janela.reduce((s, x) => s + (x.f - x.i), 0);

        const espaco = Math.min(janela[k - 1].f - inicioJanela, somaAntiga + capacidade);

        if (Math.floor(espaco / n) < DURACAO_MINIMA) return;

        const parte = Math.floor(espaco / n / 5) * 5;
        const duracaoTarefa = Math.min(original, parte);

        if (duracaoTarefa < piso) return;

        const resto = espaco - duracaoTarefa;
        const cada = Math.floor(resto / k / 5) * 5;
        const sobra = resto - cada * k;

        if (cada < DURACAO_MINIMA) return;

        if (!melhor || duracaoTarefa > melhor.duracaoTarefa) {
            melhor = { janela, inicioJanela, duracaoTarefa, cada, sobra };
        }
    });

    if (!melhor) return null;

    // Em feriado, a tarefa movida não pode terminar depois do meio-dia
    if (
        ehFeriado(parseDataISO(dataISO)) &&
        melhor.inicioJanela + (melhor.janela.length * melhor.cada) + melhor.sobra + melhor.duracaoTarefa > FIM_DA_MANHA
    ) {
        return null;
    }

    const simulados = eventos.map(e => ({ ...e }));
    const novos = [];
    let cursor = melhor.inicioJanela;

    for (let idx = 0; idx < melhor.janela.length; idx++) {
        const x = melhor.janela[idx];
        const duracao = melhor.cada + (idx === melhor.janela.length - 1 ? melhor.sobra : 0);
        const sim = simulados.find(s => s.id === x.e.id);

        if (!sim) return null;

        sim.startTime = minutosEmHorario(cursor);
        sim.endTime = minutosEmHorario(cursor + duracao);

        novos.push({ x, inicio: cursor, duracao });
        cursor += duracao;
    }

    const candidata = {
        ...tarefa,
        date: dataISO,
        day: parseDataISO(dataISO).getDay(),
        startTime: minutosEmHorario(cursor),
        endTime: minutosEmHorario(cursor + melhor.duracaoTarefa)
    };

    if (!validarTarefa(simulados, candidata, tarefa.id).ok) return null;

    const reduzidos = [];

    novos.forEach(({ x, inicio, duracao }) => {
        const antes = x.f - x.i;

        if (!x.e.duracaoOriginalMin) x.e.duracaoOriginalMin = antes;

        x.e.startTime = minutosEmHorario(inicio);
        x.e.endTime = minutosEmHorario(inicio + duracao);

        if (duracao !== antes) {
            reduzidos.push({ titulo: x.e.title, de: antes, para: duracao });
        }
    });

    aplicarMovimento(tarefa, dataISO, cursor, melhor.duracaoTarefa);

    return { modo: "janela", para: dataISO, reduzidos };
}

function remanejarTarefaPendente(eventos, tarefa, agora = new Date()) {
    if (!tarefa || tarefa.fixed || !tarefa.date) return null;

    const hojeISO = formatarDataISO(agora);
    const minutosAgora = arredondarAcima(
        agora.getHours() * 60 + agora.getMinutes(),
        15
    );

    const origem = tarefa.date;

    const metodos = [
        (dia, min) => tentarLivre(eventos, tarefa, dia, min, false),
        (dia, min) => tentarJanela(eventos, tarefa, dia, min),
        (dia, min) => tentarLivre(eventos, tarefa, dia, min, true)
    ];

    for (const dias of diasCandidatos(agora, origem)) {
        for (const dia of dias) {
            const minimo = dia === hojeISO ? minutosAgora : 0;

            for (const metodo of metodos) {
                const resultado = metodo(dia, minimo);

                if (resultado) return { ...resultado, de: origem, tarefa };
            }
        }
    }

    return null;
}

function remanejarPerdidas(eventos, agora = new Date()) {
    const hojeISO = formatarDataISO(agora);
    const resultados = [];

    listarTarefasPerdidas(eventos, agora).forEach(tarefa => {
        if (tarefa.tentativaFalhaEm === hojeISO) return;

        const origem = tarefa.date;
        const resultado = remanejarTarefaPendente(eventos, tarefa, agora);

        if (resultado) {
            delete tarefa.tentativaFalhaEm;
            resultados.push({ ok: true, ...resultado });
        } else {
            tarefa.tentativaFalhaEm = hojeISO;
            resultados.push({ ok: false, de: origem, tarefa });
        }
    });

    return resultados;
}

// =========================================================
// CORREÇÃO DE TAREFAS EM HORÁRIO RESERVADO
// =========================================================

function conflitaComBlocosFixos(evento) {
    const ini = horarioEmMinutos(evento.startTime);
    const fim = horarioEmMinutos(evento.endTime);

    if (ini === null || fim === null) return false;

    return [...blocosReservadosDoDia(evento.date), ...blocosEscolaDoDia(evento.date)].some(b =>
        sobrepoe(ini, fim, horarioEmMinutos(b.startTime), horarioEmMinutos(b.endTime))
    );
}

function corrigirConflitos(eventos, agora = new Date()) {
    const hojeISO = formatarDataISO(agora);
    const minutosAgora = arredondarAcima(agora.getHours() * 60 + agora.getMinutes(), 15);
    const resultados = [];

    eventos
        .filter(e =>
            e.date &&
            e.date >= hojeISO &&
            !e.fixed &&
            !e.completed &&
            ehEstudo(e) &&
            conflitaComBlocosFixos(e)
        )
        .forEach(tarefa => {
            const origem = tarefa.date;
            const minimo = origem === hojeISO ? minutosAgora : 0;

            const resultado =
                tentarLivre(eventos, tarefa, origem, minimo, true) ||
                remanejarTarefaPendente(eventos, tarefa, agora);

            if (resultado) {
                resultados.push({ ok: true, reduzidos: [], ...resultado, de: origem, tarefa });
            }
        });

    return resultados;
}

function manutencaoDeEventos(eventos, agora = new Date()) {
    return [
        ...corrigirConflitos(eventos, agora),
        ...remanejarPerdidas(eventos, agora)
    ];
}