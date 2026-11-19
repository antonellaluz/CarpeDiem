/*
  CARPE DIEM — CALENDÁRIO E AGENDA
  Interface da grade semanal e do calendário mensal. As regras (limites de
  horas, aulas, feriados e validação) e a lista `events` ficam em regras.js,
  que precisa ser carregado ANTES deste arquivo. Os avisos (avisar, confirmar,
  toast) vêm do ui.js e o plano contínuo (garantirPlano) vem do planos.js.
*/
let weekDaysData = [];

const ALTURA_HORA = 72;
const PX_POR_MIN = ALTURA_HORA / 60;

// Dia exibido no celular (começa no dia de hoje)
let currentMobileDayIndex = new Date().getDay();

// Semana exibida: 0 = esta semana, -1 = anterior, 1 = próxima...
let weekOffset = 0;

// Visão mensal
let modoMensal = false;
let mesExibido = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let diaSelecionado = formatarDataISO(new Date());

const nomesDias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const nomesMeses = [
    "Janeiro", "Fevereiro", "Março", "Abril",
    "Maio", "Junho", "Julho", "Agosto",
    "Setembro", "Outubro", "Novembro", "Dezembro"
];

const ROTULOS_CATEGORIA = {
    ESTUDO: "Estudo",
    QUESTOES: "Questões",
    ESCOLA: "Aula",
    TRABALHO: "Trabalho",
    COMPROMISSO: "Compromisso",
    EXERCICIO: "Exercício",
    DESCANSO: "Descanso",
    SONO: "Sono"
};

const CORES_NOMEADAS = {
    blue: "#60a5fa",
    purple: "#a78bfa",
    orange: "#fb923c",
    green: "#4ade80",
    red: "#f87171"
};

function corDoPonto(cor) {
    if (typeof cor === "string" && cor.startsWith("#")) return cor;
    return CORES_NOMEADAS[cor] || "#8170b8";
}

// =========================================================
// INICIALIZAÇÃO
// =========================================================

document.addEventListener("DOMContentLoaded", iniciarAgenda);

async function iniciarAgenda() {
    // 1. Carrega os eventos do Supabase ANTES de desenhar qualquer coisa
    await carregarEventosDoSupabase();

    // Renova o cronograma pronto (12 semanas à frente) quando estiver acabando
    if (typeof garantirPlano === "function") await garantirPlano();

    atualizarDatasSemana();
    generateWeeklyGridStructure();

    // 2. Remanejamento automático: estudos não feitos e tarefas em horário reservado
    const remanejados = manutencaoDeEventos(events, new Date());

    if (remanejados.length) await salvarEventosNoSupabase(events);

    // 3. Desenha tudo
    renderEvents();
    mostrarResumoRemanejamento(remanejados);
    renderTiraSemana();
    atualizarVisualizacaoMobile();
    atualizarMensal();
    updateCurrentTimeIndicator();

    setInterval(updateCurrentTimeIndicator, 60000);

    // Mantém o cronograma atualizado ao voltar para a página ou aba
    window.addEventListener("pageshow", async e => {
        if (e.persisted) await recarregarEventos();
    });

    document.addEventListener("visibilitychange", async () => {
        if (!document.hidden) await recarregarEventos();
    });
}

async function recarregarEventos() {
    await carregarEventosDoSupabase();

    if (typeof garantirPlano === "function") await garantirPlano();

    renderEvents();
    atualizarMensal();
}

// =========================================================
// DATAS DA SEMANA
// =========================================================

function atualizarDatasSemana() {
    const hoje = new Date();
    const domingo = inicioDaSemana(addDias(hoje, weekOffset * 7));

    weekDaysData = Array.from({ length: 7 }, (_, indice) => {
        const data = addDias(domingo, indice);

        return {
            date: data.getDate(),
            label: nomesDias[indice],
            active: data.toDateString() === hoje.toDateString(),
            month: data.getMonth(),
            year: data.getFullYear(),
            fullDate: new Date(data)
        };
    });

    const cabecalho = document.getElementById("calendar-header-days");

    if (cabecalho) {
        cabecalho.innerHTML = "<div></div>";

        weekDaysData.forEach((dia, indice) => {
            const celula = document.createElement("div");
            const rotulo = document.createElement("span");
            const resumo = document.createElement("small");

            rotulo.textContent = `${dia.date} - ${dia.label}`;

            resumo.dataset.resumo = String(indice);
            resumo.style.fontSize = "10px";
            resumo.style.fontWeight = "500";
            resumo.style.opacity = "0.8";

            celula.append(rotulo, resumo);

            celula.style.flexDirection = "column";
            celula.style.gap = "2px";
            celula.style.padding = "12px";
            celula.style.borderRight = "1px solid #f1f5f9";

            if (dia.active) {
                celula.style.backgroundColor = "#000000";
                celula.style.color = "#ffffff";
                celula.style.borderRadius = "4px 4px 0 0";
            }

            cabecalho.appendChild(celula);
        });
    }

    rotuloSemana();
}

// Texto "15 - 21 de Novembro 2026" (só na visão semanal)
function rotuloSemana() {
    const intervalo = document.getElementById("date-range-label");

    if (!intervalo || modoMensal || !weekDaysData.length) return;

    const inicio = weekDaysData[0].fullDate;
    const fim = weekDaysData[6].fullDate;
    const mesmoMes = inicio.getMonth() === fim.getMonth();

    const texto = mesmoMes
        ? `${inicio.getDate()} - ${fim.getDate()} de ${nomesMeses[fim.getMonth()]}`
        : `${inicio.getDate()} de ${nomesMeses[inicio.getMonth()]} - ${fim.getDate()} de ${nomesMeses[fim.getMonth()]}`;

    intervalo.textContent = `${texto} ${fim.getFullYear()}`;
}

function mudarSemana(delta) {
    weekOffset += delta;
    atualizarSemanaExibida();
}

function irParaSemanaAtual() {
    weekOffset = 0;
    currentMobileDayIndex = new Date().getDay();
    atualizarSemanaExibida();
}

function atualizarSemanaExibida() {
    atualizarDatasSemana();
    renderEvents();
    renderTiraSemana();
    atualizarVisualizacaoMobile();
    updateCurrentTimeIndicator();
}

// Mostra no cabeçalho de cada dia: horas ocupadas / limite do dia
// (integral e misto: só o estudo extra; sábado: horas líquidas; domingo: descanso)
function atualizarResumoCarga() {
    weekDaysData.forEach((dia, indice) => {
        const el = document.querySelector(`[data-resumo="${indice}"]`);

        if (!el) return;

        const dataISO = formatarDataISO(dia.fullDate);
        const resumo = resumoDoDia(events, dataISO);

        let texto = resumo.texto;

        if (ehFeriado(dia.fullDate)) texto += " · feriado";

        el.textContent = texto;
        el.style.color = resumo.cheio && !dia.active ? "#d97706" : "";
    });
}

// =========================================================
// GRADE SEMANAL
// =========================================================

function generateWeeklyGridStructure() {
    const timeLabelsContainer = document.getElementById("timeLabels");
    const daysWrapper = document.getElementById("daysColumnsWrapper");

    if (!timeLabelsContainer || !daysWrapper) return;

    timeLabelsContainer.innerHTML = "";
    daysWrapper.innerHTML = "";

    for (let hour = HORA_INICIAL; hour < HORA_FINAL; hour++) {
        const timeLabel = document.createElement("div");

        timeLabel.className = "time-label";
        timeLabel.style.height = `${ALTURA_HORA}px`;
        timeLabel.style.display = "flex";
        timeLabel.style.alignItems = "center";
        timeLabel.style.justifyContent = "center";
        timeLabel.style.fontSize = "12px";
        timeLabel.style.color = "#64748b";
        timeLabel.style.borderBottom = "1px solid #f1f5f9";

        timeLabel.textContent = `${String(hour).padStart(2, "0")}:00`;

        timeLabelsContainer.appendChild(timeLabel);
    }

    weekDaysData.forEach((dayInfo, index) => {
        const dayColumn = document.createElement("div");

        dayColumn.className =
            `day-column ${index === currentMobileDayIndex ? "mobile-active" : ""}`;
        dayColumn.dataset.day = String(index);
        dayColumn.style.position = "relative";
        dayColumn.style.borderRight = "1px solid #f1f5f9";
        dayColumn.style.minHeight =
            `${(HORA_FINAL - HORA_INICIAL) * ALTURA_HORA}px`;

        for (let hour = HORA_INICIAL; hour < HORA_FINAL; hour++) {
            const slot = document.createElement("div");

            slot.className = "time-slot";
            slot.dataset.day = String(index);
            slot.dataset.time = `${String(hour).padStart(2, "0")}:00`;

            slot.style.height = `${ALTURA_HORA}px`;
            slot.style.borderBottom = "1px solid #f1f5f9";
            slot.style.cursor = index === 0 ? "not-allowed" : "pointer";
            slot.title = index === 0
                ? "Domingo é dia de descanso"
                : "Duplo clique para adicionar uma tarefa";

            // Duplo clique: abre a tela "Adicionar Tarefa" com data e hora preenchidas
            slot.addEventListener("dblclick", () => {
                abrirPaginaNovaTarefa(index, hour);
            });

            dayColumn.appendChild(slot);
        }

        daysWrapper.appendChild(dayColumn);
    });
}

// =========================================================
// CRIAÇÃO DE TAREFAS (duplo clique em um horário da grade)
// =========================================================

function abrirPaginaNovaTarefa(dayIndex, hour) {
    // Domingo é dia de descanso: não abre a tela de cadastro
    if (dayIndex === 0) {
        avisar("O domingo é dia de descanso e não recebe atividades.", {
            titulo: "Dia de descanso",
            tipo: "aviso"
        });
        return;
    }

    const data = formatarDataISO(weekDaysData[dayIndex].fullDate);
    const inicio = `${String(hour).padStart(2, "0")}:00`;
    const fim = `${String(hour + 1).padStart(2, "0")}:00`;

    const params = new URLSearchParams({ data, inicio, fim });

    window.location.href = `adicionar_tarefa.html?${params.toString()}`;
}

// =========================================================
// EXIBIÇÃO NA GRADE
// =========================================================

function posicionarBloco(elemento, inicioMin, fimMin) {
    const topo = (inicioMin - HORA_INICIAL * 60) * PX_POR_MIN;
    const limiteFim = Math.min(fimMin, HORA_FINAL * 60);

    elemento.style.position = "absolute";
    elemento.style.left = "4px";
    elemento.style.right = "4px";
    elemento.style.top = `${topo}px`;
    elemento.style.height = `${Math.max(24, (limiteFim - inicioMin) * PX_POR_MIN)}px`;
    elemento.style.padding = "6px 8px";
    elemento.style.borderRadius = "6px";
    elemento.style.fontSize = "12px";
    elemento.style.fontWeight = "500";
    elemento.style.zIndex = "10";
    elemento.style.overflow = "hidden";
    elemento.style.boxSizing = "border-box";
}

// Pausa de 10 min dentro do bloco de estudo: uma "pílula" clara com ícone de xícara
function criarPausa(minutosDesdeInicio, duracaoMin) {
    const pausa = document.createElement("div");

    pausa.className = "pausa-bloco";
    pausa.title = "Pausa de 10 min dentro do bloco (não aumenta as horas)";
    pausa.innerHTML = '<i class="fa-solid fa-mug-hot"></i><span>pausa · 10 min</span>';

    pausa.style.cssText =
        "position:absolute;left:6px;right:6px;box-sizing:border-box;" +
        "display:flex;align-items:center;justify-content:center;gap:4px;" +
        "border-radius:6px;overflow:hidden;white-space:nowrap;" +
        "background:rgba(255,255,255,0.75);color:rgba(60,50,80,0.8);" +
        "box-shadow:0 1px 3px rgba(0,0,0,0.12);" +
        "font-size:9px;font-weight:600;letter-spacing:0.3px;line-height:1;" +
        "pointer-events:none;";

    pausa.style.top = `${minutosDesdeInicio * PX_POR_MIN}px`;
    pausa.style.height = `${duracaoMin * PX_POR_MIN}px`;

    return pausa;
}

// Aulas: bloco fixo, criado automaticamente a partir do período escolar
function desenharAulas(coluna, dataISO) {
    blocosEscolaDoDia(dataISO).forEach(bloco => {
        const el = document.createElement("div");

        el.className = "event-block event-aula";
        el.textContent = `Aula · ${bloco.startTime}–${bloco.endTime}`;
        el.title = "Horário de aula (fixo)";

        posicionarBloco(
            el,
            horarioEmMinutos(bloco.startTime),
            horarioEmMinutos(bloco.endTime)
        );

        el.style.backgroundColor = "#fcefe5";
        el.style.borderLeft = "3px solid #d99b68";
        el.style.color = "#98643d";
        el.style.cursor = "default";
        el.style.zIndex = "5";

        coluna.appendChild(el);
    });
}

// Sono, lazer, almoço e descanso pós-aula: horários reservados
function desenharReservados(coluna, dataISO) {
    const estilos = {
        sono:     { fundo: "#e9edf9", borda: "#8294c8", texto: "#52638e" },
        lazer:    { fundo: "#e8f4ed", borda: "#78ae8d", texto: "#47775b" },
        descanso: { fundo: "#f4eaf7", borda: "#b98ac4", texto: "#7d4f8a" },
        almoco:   { fundo: "#fff4dc", borda: "#e0b252", texto: "#8a6a1f" }
    };

    blocosReservadosDoDia(dataISO).forEach(bloco => {
        const el = document.createElement("div");
        const cor = estilos[bloco.tipo] || estilos.lazer;

        el.className = "event-block event-reservado";
        el.textContent = `${bloco.title} · ${bloco.startTime}–${bloco.endTime}`;
        el.title = bloco.tipo === "descanso"
            ? "Descanso fixo depois da aula: não pode ser usado por tarefas"
            : "Horário reservado: não pode ser usado por tarefas";

        posicionarBloco(
            el,
            horarioEmMinutos(bloco.startTime),
            horarioEmMinutos(bloco.endTime)
        );

        el.style.backgroundColor = cor.fundo;
        el.style.borderLeft = `3px solid ${cor.borda}`;
        el.style.color = cor.texto;
        el.style.cursor = "not-allowed";
        el.style.zIndex = "5";

        coluna.appendChild(el);
    });
}

// Domingo: dia inteiro de descanso
function desenharDomingo(coluna, data) {
    if (data.getDay() !== 0) return;

    const el = document.createElement("div");

    el.className = "event-block domingo-descanso";
    el.textContent = "Domingo · dia de descanso";

    el.style.position = "absolute";
    el.style.left = "0";
    el.style.right = "0";
    el.style.top = "0";
    el.style.height = `${(HORA_FINAL - HORA_INICIAL) * ALTURA_HORA}px`;
    el.style.padding = "10px";
    el.style.background = "rgba(185, 138, 196, 0.10)";
    el.style.color = "#7d4f8a";
    el.style.fontSize = "11px";
    el.style.fontWeight = "600";
    el.style.pointerEvents = "none";
    el.style.zIndex = "1";
    el.style.boxSizing = "border-box";

    coluna.appendChild(el);
}

// Feriado: a tarde é sugerida como livre (aviso flexível ao cadastrar estudo)
function desenharFeriado(coluna, data) {
    if (!ehFeriado(data)) return;

    const inicio = (FIM_DA_MANHA - HORA_INICIAL * 60) * PX_POR_MIN;
    const altura = ((HORA_FINAL * 60) - FIM_DA_MANHA) * PX_POR_MIN;

    const el = document.createElement("div");

    el.className = "event-block feriado-livre";
    el.textContent = "Feriado · tarde livre (sugestão)";

    el.style.position = "absolute";
    el.style.left = "0";
    el.style.right = "0";
    el.style.top = `${inicio}px`;
    el.style.height = `${altura}px`;
    el.style.padding = "8px";
    el.style.background = "rgba(120, 174, 141, 0.12)";
    el.style.color = "#47775b";
    el.style.fontSize = "11px";
    el.style.fontWeight = "600";
    el.style.pointerEvents = "none";
    el.style.zIndex = "1";
    el.style.boxSizing = "border-box";

    coluna.appendChild(el);
}

function renderEvents() {
    document.querySelectorAll(".event-block").forEach(el => el.remove());

    const columns = document.querySelectorAll(".day-column");

    weekDaysData.forEach((dia, indice) => {
        const coluna = columns[indice];

        if (!coluna) return;

        const dataISO = formatarDataISO(dia.fullDate);

        desenharFeriado(coluna, dia.fullDate);
        desenharDomingo(coluna, dia.fullDate);
        desenharAulas(coluna, dataISO);
        desenharReservados(coluna, dataISO);
    });

    events.forEach(evento => {
        const coluna = columns[evento.day];

        if (!coluna) return;

        // Só mostra a tarefa se a data dela estiver na semana exibida
        if (evento.date) {
            const diaDaSemana = weekDaysData[evento.day];

            if (
                !diaDaSemana ||
                formatarDataISO(diaDaSemana.fullDate) !== evento.date
            ) return;
        }

        const inicioMinutos = horarioEmMinutos(evento.startTime);
        const fimMinutos = horarioEmMinutos(evento.endTime);

        if (
            inicioMinutos === null ||
            fimMinutos === null ||
            fimMinutos <= inicioMinutos ||
            inicioMinutos < HORA_INICIAL * 60 ||
            inicioMinutos >= HORA_FINAL * 60
        ) return;

        const elemento = document.createElement("div");

        const ehHex =
            typeof evento.color === "string" &&
            evento.color.startsWith("#");

        elemento.className = ehHex
            ? "event event-block"
            : `event event-${evento.color || "blue"} event-block`;

        if (ehHex) {
            elemento.style.backgroundColor = evento.color;
            elemento.style.color = "#1f1f1f";
        }

        posicionarBloco(elemento, inicioMinutos, fimMinutos);

        elemento.style.cursor = "pointer";

        // Concluída: cor mais suave e texto riscado
        if (evento.completed) {
            elemento.style.filter = "saturate(0.5) brightness(1.05)";
            elemento.style.textDecoration = "line-through";
        }

        let dica = "Clique: concluir · Duplo clique: excluir · Botão direito: remanejar";

        if (evento.remanejada) {
            dica += ` · Remanejada de ${formatarDataCurta(evento.remanejadaDe)}`;
        }

        if (
            evento.duracaoOriginalMin &&
            evento.duracaoOriginalMin !== duracaoMinutos(evento)
        ) {
            dica += ` · Duração original: ${evento.duracaoOriginalMin} min`;
        }

        elemento.title = dica;

        elemento.textContent =
            (evento.completed ? "✓ " : "") + (evento.remanejada ? "↻ " : "") + evento.title;

        // Pausa de 10 min dentro do bloco (não altera as horas do dia nem da semana)
        if (ehEstudo(evento)) {
            const pausas = pausasDoBloco(inicioMinutos, fimMinutos);

            pausas.forEach(([pa, pb]) =>
                elemento.appendChild(criarPausa(pa - inicioMinutos, pb - pa))
            );

            if (pausas.length) {
                elemento.title +=
                    " · Pausa de 10 min dentro do bloco (não aumenta as horas)";
            }
        }

        // Clique para concluir ou reabrir tarefa
        elemento.addEventListener("click", async e => {
            e.stopPropagation();

            const concluida = await alternarConclusao(evento.id);   // já salva no Supabase
            renderEvents();

            toast(
                concluida ? "Bloco concluído! Você está indo bem 💜" : "Tarefa reaberta.",
                concluida ? "sucesso" : "info",
                2200
            );
        });

        // Duplo clique para excluir
        elemento.addEventListener("dblclick", async e => {
            e.stopPropagation();

            const ok = await confirmar(`Deseja excluir "${evento.title}"?`, {
                titulo: "Excluir tarefa",
                confirmar: "Excluir",
                cancelar: "Manter",
                perigo: true
            });

            if (!ok) return;

            await excluirEventoNoSupabase(evento.id);
            events = events.filter(item => item.id !== evento.id);
            renderEvents();
            toast("Tarefa excluída.", "info", 2200);
        });

        // Botão direito para remanejar para o próximo horário livre
        elemento.addEventListener("contextmenu", async e => {
            e.preventDefault();

            if (evento.fixed) {
                avisar("Tarefas fixas não podem ser remanejadas.", {
                    titulo: "Tarefa fixa",
                    tipo: "aviso"
                });
                return;
            }

            const ok = await confirmar(
                `Mover "${evento.title}" para o próximo horário livre dentro dos limites?`,
                { titulo: "Remanejar tarefa", confirmar: "Mover" }
            );

            if (ok) await remanejarTarefa(evento.id);
        });

        coluna.appendChild(elemento);
    });

    atualizarResumoCarga();
}

// =========================================================
// INDICADOR DO HORÁRIO ATUAL (só na semana atual)
// =========================================================

function updateCurrentTimeIndicator() {
    document.querySelectorAll(".current-time-indicator").forEach(el => el.remove());

    if (weekOffset !== 0) return;

    const agora = new Date();
    const dia = agora.getDay();
    const minutos = agora.getHours() * 60 + agora.getMinutes();

    if (
        minutos < HORA_INICIAL * 60 ||
        minutos >= HORA_FINAL * 60
    ) return;

    const coluna = document.querySelector(`.day-column[data-day="${dia}"]`);

    if (!coluna) return;

    const linha = document.createElement("div");

    linha.className = "current-time-indicator";
    linha.style.position = "absolute";
    linha.style.left = "0";
    linha.style.right = "0";
    linha.style.top = `${(minutos - HORA_INICIAL * 60) * PX_POR_MIN}px`;
    linha.style.height = "2px";
    linha.style.background = "#e53935";
    linha.style.zIndex = "20";
    linha.style.pointerEvents = "none";

    coluna.appendChild(linha);
}

// =========================================================
// ALTERNAR VISÃO SEMANAL E MENSAL
// =========================================================

function alternarModoCalendario() {
    mostrarVisao(!modoMensal);
}

function mostrarVisao(mensal) {
    const weekly = document.getElementById("weekly-card-view");
    const monthly = document.getElementById("monthly-card-view");
    const nav = document.getElementById("week-nav");

    const icon = document.getElementById("switch-icon");
    const botao = document.getElementById("view-switch-btn");

    if (!weekly || !monthly) return;

    modoMensal = mensal;

    weekly.style.display = mensal ? "none" : "block";
    monthly.style.display = mensal ? "block" : "none";

    if (nav) nav.style.display = mensal ? "none" : "flex";

    if (icon) {
        icon.className = mensal
            ? "fa-solid fa-calendar-week"
            : "fa-regular fa-calendar";
    }

    if (botao) {
        botao.title = mensal
            ? "Alternar para cronograma semanal"
            : "Alternar para calendário mensal";
    }

    if (mensal) {
        // Abre no mês do dia selecionado
        const d = parseDataISO(diaSelecionado);
        mesExibido = new Date(d.getFullYear(), d.getMonth(), 1);
        atualizarMensal();
    } else {
        rotuloSemana();
    }
}

// =========================================================
// CALENDÁRIO MENSAL
// =========================================================

function atualizarMensal() {
    renderMonthlyCalendar();
    renderPainelDia();
}

function mudarMes(delta) {
    mesExibido = new Date(mesExibido.getFullYear(), mesExibido.getMonth() + delta, 1);
    renderMonthlyCalendar();
}

function irParaHoje() {
    const hoje = new Date();

    diaSelecionado = formatarDataISO(hoje);
    mesExibido = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    atualizarMensal();
}

function tarefasDoDia(dataISO) {
    return eventosDaData(events, dataISO)
        .filter(e => horarioEmMinutos(e.startTime) !== null)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function renderMonthlyCalendar() {
    const container = document.getElementById("monthly-grid-container");
    const titulo = document.getElementById("month-title");

    if (!container) return;

    container.innerHTML = "";

    const ano = mesExibido.getFullYear();
    const mes = mesExibido.getMonth();
    const tituloMes = `${nomesMeses[mes]} ${ano}`;

    if (titulo) titulo.textContent = tituloMes;

    const rotulo = document.getElementById("date-range-label");
    if (rotulo && modoMensal) rotulo.textContent = tituloMes;

    const hojeISO = formatarDataISO(new Date());
    const primeiro = new Date(ano, mes, 1);
    const totalDias = new Date(ano, mes + 1, 0).getDate();
    const semanas = Math.ceil((primeiro.getDay() + totalDias) / 7);
    const inicioGrade = addDias(primeiro, -primeiro.getDay());

    for (let i = 0; i < semanas * 7; i++) {
        const data = addDias(inicioGrade, i);
        const iso = formatarDataISO(data);

        const celula = document.createElement("div");
        celula.className = "monthly-day";
        celula.setAttribute("role", "button");
        celula.tabIndex = 0;

        if (data.getMonth() !== mes) celula.classList.add("other-month");
        if (iso === hojeISO) celula.classList.add("today");
        if (iso === diaSelecionado) celula.classList.add("selected");
        if (data.getDay() === 0) celula.classList.add("domingo");

        const numero = document.createElement("span");
        numero.className = "monthly-day-number";
        numero.textContent = String(data.getDate());
        celula.appendChild(numero);

        if (ehFeriado(data)) {
            celula.classList.add("feriado");
            celula.title = "Feriado nacional";

            const marca = document.createElement("span");
            marca.className = "m-feriado";
            marca.textContent = "feriado";
            celula.appendChild(marca);
        }

        const tarefas = tarefasDoDia(iso);

        if (tarefas.length) {
            const pontos = document.createElement("div");
            pontos.className = "monthly-dots";

            tarefas.slice(0, 3).forEach(t => {
                const ponto = document.createElement("i");
                ponto.className = "m-dot" + (t.fixed ? " fixa" : "");
                ponto.style.setProperty("--c", corDoPonto(t.color));
                pontos.appendChild(ponto);
            });

            if (tarefas.length > 3) {
                const mais = document.createElement("span");
                mais.className = "m-mais";
                mais.textContent = `+${tarefas.length - 3}`;
                pontos.appendChild(mais);
            }

            celula.appendChild(pontos);
        }

        celula.addEventListener("click", () => selecionarDia(iso));

        celula.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selecionarDia(iso);
            }
        });

        container.appendChild(celula);
    }
}

function selecionarDia(iso) {
    diaSelecionado = iso;

    const d = parseDataISO(iso);

    // Clicou em um dia de outro mês: vai para aquele mês
    if (d.getMonth() !== mesExibido.getMonth() || d.getFullYear() !== mesExibido.getFullYear()) {
        mesExibido = new Date(d.getFullYear(), d.getMonth(), 1);
    }

    atualizarMensal();
}

// Painel com as atividades do dia escolhido
function renderPainelDia() {
    const painel = document.getElementById("day-panel");

    if (!painel) return;

    painel.innerHTML = "";

    const data = parseDataISO(diaSelecionado);
    const domingo = data.getDay() === 0;

    let texto = data.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long"
    });
    texto = texto.charAt(0).toUpperCase() + texto.slice(1);

    const titulo = document.createElement("h3");
    titulo.className = "dp-titulo";
    titulo.textContent = texto;
    painel.appendChild(titulo);

    // Contexto do dia: descanso, feriado, aula
    const contexto = [];

    if (domingo) contexto.push("Dia de descanso");
    if (ehFeriado(data)) contexto.push("Feriado nacional");

    blocosEscolaDoDia(diaSelecionado).forEach(b => {
        contexto.push(`Aula ${b.startTime}–${b.endTime}`);
    });

    if (contexto.length) {
        const sub = document.createElement("p");
        sub.className = "dp-sub";
        sub.textContent = contexto.join(" · ");
        painel.appendChild(sub);
    }

    const tarefas = tarefasDoDia(diaSelecionado);

    if (!tarefas.length) {
        const vazio = document.createElement("p");
        vazio.className = "dp-vazio";
        vazio.textContent = domingo
            ? "Aproveite para descansar. Domingo não recebe atividades."
            : "Nenhuma atividade programada para este dia.";
        painel.appendChild(vazio);
    } else {
        const lista = document.createElement("ul");
        lista.className = "dp-lista";

        tarefas.forEach(t => {
            const item = document.createElement("li");
            item.className = "dp-item" + (t.completed ? " concluida" : "");
            item.style.setProperty("--c", corDoPonto(t.color));

            const hora = document.createElement("span");
            hora.className = "dp-hora";
            hora.textContent = `${t.startTime} – ${t.endTime}`;

            const info = document.createElement("div");
            info.className = "dp-info";

            const nome = document.createElement("div");
            nome.className = "dp-nome";
            nome.textContent = t.title;

            const tags = document.createElement("div");
            tags.className = "dp-tags";

            const tipo = document.createElement("span");
            tipo.className = "dp-tag";
            tipo.textContent = ROTULOS_CATEGORIA[categoriaDe(t)] || categoriaDe(t);
            tags.appendChild(tipo);

            if (t.fixed) {
                const fixa = document.createElement("span");
                fixa.className = "dp-tag fixa";
                fixa.textContent = "Fixa";
                tags.appendChild(fixa);
            }

            if (t.subject) {
                const materia = document.createElement("span");
                materia.className = "dp-tag";
                materia.textContent = t.subject;
                tags.appendChild(materia);
            }

            info.append(nome, tags);

            const concluir = document.createElement("button");
            concluir.type = "button";
            concluir.className = "dp-btn";
            concluir.title = t.completed ? "Reabrir" : "Concluir";
            concluir.innerHTML = t.completed
                ? '<i class="fa-solid fa-rotate-left"></i>'
                : '<i class="fa-solid fa-check"></i>';

            concluir.addEventListener("click", async () => {
                const feita = await alternarConclusao(t.id);

                renderEvents();
                atualizarMensal();

                toast(
                    feita ? "Bloco concluído! Você está indo bem 💜" : "Tarefa reaberta.",
                    feita ? "sucesso" : "info",
                    2200
                );
            });

            const excluir = document.createElement("button");
            excluir.type = "button";
            excluir.className = "dp-btn perigo";
            excluir.title = "Excluir";
            excluir.innerHTML = '<i class="fa-solid fa-trash"></i>';

            excluir.addEventListener("click", async () => {
                const ok = await confirmar(`Deseja excluir "${t.title}"?`, {
                    titulo: "Excluir tarefa",
                    confirmar: "Excluir",
                    cancelar: "Manter",
                    perigo: true
                });

                if (!ok) return;

                await excluirEventoNoSupabase(t.id);
                events = events.filter(item => item.id !== t.id);

                renderEvents();
                atualizarMensal();
                toast("Tarefa excluída.", "info", 2200);
            });

            item.append(hora, info, concluir, excluir);
            lista.appendChild(item);
        });

        painel.appendChild(lista);
    }

    // Ações
    const acoes = document.createElement("div");
    acoes.className = "dp-acoes";

    if (!domingo) {
        const adicionar = document.createElement("button");
        adicionar.type = "button";
        adicionar.className = "dp-primario";
        adicionar.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar tarefa neste dia';
        adicionar.addEventListener("click", () => {
            window.location.href = `adicionar_tarefa.html?data=${diaSelecionado}`;
        });
        acoes.appendChild(adicionar);
    }

    const verSemana = document.createElement("button");
    verSemana.type = "button";
    verSemana.className = "dp-secundario";
    verSemana.innerHTML = '<i class="fa-solid fa-calendar-week"></i> Ver na semana';
    verSemana.addEventListener("click", () => verNaSemana(diaSelecionado));
    acoes.appendChild(verSemana);

    painel.appendChild(acoes);
}

// Abre a visão semanal na semana do dia escolhido
function verNaSemana(iso) {
    const alvo = inicioDaSemana(parseDataISO(iso));
    const atual = inicioDaSemana(new Date());

    weekOffset = Math.round((alvo - atual) / (7 * 24 * 60 * 60 * 1000));
    currentMobileDayIndex = parseDataISO(iso).getDay();

    mostrarVisao(false);
    atualizarSemanaExibida();
}

// =========================================================
// SALVAMENTO
// =========================================================

// Salva os eventos no Supabase e a configuração no localStorage
async function salvarRotina() {
    localStorage.setItem(
        "carpeDiemConfiguracao",
        JSON.stringify(configuracaoRotina)
    );

    await salvarEventosSalvos(events);
}

async function configurarRotina(dados) {
    Object.assign(configuracaoRotina, dados);

    await salvarRotina();
    renderEvents();
}

// =========================================================
// REMANEJAMENTO DE TAREFAS
// =========================================================

function formatarDataCurta(iso) {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
}

async function remanejarTarefa(id) {
    const tarefa = events.find(evento => evento.id === id);

    if (!tarefa || tarefa.fixed) return false;

    if (!tarefa.date) {
        avisar("Esta tarefa não tem data definida e não pode ser remanejada.", { tipo: "aviso" });
        return false;
    }

    const resultado = remanejarTarefaPendente(events, tarefa, new Date());

    if (!resultado) {
        avisar(
            "Não encontrei espaço nas próximas duas semanas dentro dos limites de horas. A tarefa não foi movida.",
            { titulo: "Sem espaço", tipo: "aviso" }
        );
        return false;
    }

    await salvarRotina();
    renderEvents();
    mostrarResumoRemanejamento([{ ok: true, ...resultado }]);

    return true;
}

// Aviso na tela com o que foi remanejado
function mostrarResumoRemanejamento(resultados) {
    document.getElementById("aviso-remanejamento")?.remove();

    if (!resultados || !resultados.length) return;

    const cabecalho = document.querySelector(".calendar-header-bar");

    if (!cabecalho) return;

    const caixa = document.createElement("div");
    caixa.id = "aviso-remanejamento";
    caixa.style.cssText =
        "background:#eeeafa;border:1px solid #cfc3e9;border-radius:12px;" +
        "padding:14px 16px;margin-bottom:20px;color:#51436f;font-size:13px;line-height:1.5;";

    const titulo = document.createElement("strong");
    titulo.textContent = "Tarefas remanejadas";
    caixa.appendChild(titulo);

    const lista = document.createElement("ul");
    lista.style.cssText = "margin:8px 0 10px 18px;";

    resultados.forEach(r => {
        const item = document.createElement("li");
        const t = r.tarefa;

        if (!r.ok) {
            item.textContent =
                `"${t.title}" (${formatarDataCurta(r.de)}): sem espaço nas próximas duas semanas dentro dos limites de horas.`;
        } else {
            const duracao = duracaoMinutos(t);
            const original = t.duracaoOriginalMin || duracao;

            let texto =
                `"${t.title}": ${formatarDataCurta(r.de)} → ${formatarDataCurta(r.para)}, ${t.startTime}–${t.endTime} (${duracao} min`;

            if (duracao < original) texto += `, reduzido de ${original} min`;

            texto += ")";

            r.reduzidos.forEach(x => {
                texto += ` · "${x.titulo}" reduzido de ${x.de} para ${x.para} min`;
            });

            item.textContent = texto;
        }

        lista.appendChild(item);
    });

    caixa.appendChild(lista);

    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = "Entendi";
    botao.style.cssText =
        "background:#8170b8;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;";
    botao.onclick = () => caixa.remove();
    caixa.appendChild(botao);

    cabecalho.insertAdjacentElement("afterend", caixa);
}

function obterTarefasPendentes() {
    return events.filter(evento =>
        !evento.completed &&
        !evento.fixed &&
        ehEstudo(evento)
    );
}

// =========================================================
// QUESTIONÁRIO SEMANAL
// =========================================================

async function realizarQuestionarioSemanal() {
    const cansaco = Number(prompt(
        "Como você se sentiu nesta semana?\n1 - Pouco cansado(a)\n2 - Moderadamente cansado(a)\n3 - Muito cansado(a)"
    ));

    if (![1, 2, 3].includes(cansaco)) {
        avisar("Resposta inválida.", { tipo: "aviso" });
        return;
    }

    const sono = Number(prompt(
        "Como foi a qualidade do seu sono?\n1 - Boa\n2 - Regular\n3 - Ruim"
    ));

    if (![1, 2, 3].includes(sono)) {
        avisar("Resposta inválida.", { tipo: "aviso" });
        return;
    }

    const estresse = Number(prompt(
        "Como esteve seu nível de estresse?\n1 - Baixo\n2 - Moderado\n3 - Alto"
    ));

    if (![1, 2, 3].includes(estresse)) {
        avisar("Resposta inválida.", { tipo: "aviso" });
        return;
    }

    localStorage.setItem("carpeDiemQuestionario", JSON.stringify({
        cansaco,
        sono,
        estresse,
        data: new Date().toISOString()
    }));

    configuracaoRotina.semanaLeve =
        cansaco === 3 || sono === 3 || estresse === 3;

    await salvarRotina();
    renderEvents();

    avisar(
        configuracaoRotina.semanaLeve
            ? "Sua próxima semana será planejada com uma carga mais leve: limites menores de estudo por dia, aos sábados e na semana. Cuide do seu descanso!"
            : "Obrigado pelas respostas! Continue buscando equilíbrio entre estudo e descanso.",
        { titulo: "Questionário semanal", tipo: "sucesso" }
    );
}

function verificarSemanaLeve() {
    return Boolean(configuracaoRotina.semanaLeve);
}

// =========================================================
// NAVEGAÇÃO NO CELULAR (um dia por vez)
// =========================================================

function renderTiraSemana() {
    const tira = document.getElementById("mobile-week-strip");

    if (!tira) return;

    tira.innerHTML = "";

    weekDaysData.forEach((dia, indice) => {
        const botao = document.createElement("button");
        const nome = document.createElement("span");
        const numero = document.createElement("small");

        botao.type = "button";
        botao.className = dia.active ? "hoje" : "";
        botao.title = `${dia.date} de ${nomesMeses[dia.month]}`;

        nome.textContent = dia.label;
        numero.textContent = String(dia.date);

        botao.append(nome, numero);

        botao.addEventListener("click", () => {
            currentMobileDayIndex = indice;
            atualizarVisualizacaoMobile();
        });

        tira.appendChild(botao);
    });
}

function mudarDiaMobile(direcao) {
    currentMobileDayIndex = (currentMobileDayIndex + direcao + 7) % 7;
    atualizarVisualizacaoMobile();
}

function atualizarVisualizacaoMobile() {
    document.querySelectorAll(".day-column").forEach((col, index) => {
        col.classList.toggle("mobile-active", index === currentMobileDayIndex);
    });

    document.querySelectorAll("#mobile-week-strip button").forEach((botao, index) => {
        botao.classList.toggle("ativo", index === currentMobileDayIndex);
    });
}
