/*
  CARPE DIEM — AVISOS, CONFIRMAÇÕES E MENSAGENS RÁPIDAS
  Carregue este arquivo ANTES dos outros scripts da página.

  Funções disponíveis:
    avisar(texto, { titulo, tipo, botao })      → Promise (fecha quando a pessoa clica)
    confirmar(texto, { titulo, confirmar, cancelar, perigo, tipo }) → Promise<boolean>
    toast(texto, tipo, milissegundos, urlOpcional)

  tipo: "sucesso" | "aviso" | "erro" | "info" | "pergunta" | "lembrete"
  O alert() nativo é substituído por avisar().
*/
(function () {
    "use strict";

    if (window.__cdUiCarregado) return;
    window.__cdUiCarregado = true;

    const FONTE = "'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif";

    const CSS = `
    .cd-fundo{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
      padding:20px;background:rgba(52,48,68,.45);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);
      opacity:0;transition:opacity .18s ease}
    .cd-fundo.cd-visivel{opacity:1}
    .cd-caixa{width:100%;max-width:360px;box-sizing:border-box;background:#fff;border-radius:22px;
      padding:26px 24px 20px;text-align:center;color:#343044;font-family:${FONTE};
      box-shadow:0 20px 60px rgba(81,67,111,.28);transform:translateY(12px) scale(.96);
      transition:transform .2s ease}
    .cd-fundo.cd-visivel .cd-caixa{transform:none}
    .cd-icone{width:52px;height:52px;border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;
      justify-content:center;font-size:24px;font-weight:700;color:#fff;
      background:linear-gradient(135deg,#c795b5,#8170b8)}
    .cd-sucesso .cd-icone{background:linear-gradient(135deg,#8ad7a8,#4ade80)}
    .cd-aviso .cd-icone{background:linear-gradient(135deg,#fcd34d,#f59e0b)}
    .cd-erro .cd-icone{background:linear-gradient(135deg,#fca5a5,#f87171)}
    .cd-titulo{margin:0 0 8px;font-size:17px;font-weight:700;line-height:1.3;color:#343044}
    .cd-texto{margin:0 0 20px;font-size:13.5px;line-height:1.55;color:#6b6780;white-space:pre-line}
    .cd-botoes{display:flex;gap:10px}
    .cd-btn{flex:1;border:none;border-radius:14px;padding:11px 14px;font:600 13.5px ${FONTE};cursor:pointer;
      transition:transform .1s ease,filter .15s ease}
    .cd-btn:hover{filter:brightness(1.05)}
    .cd-btn:active{transform:scale(.97)}
    .cd-btn:focus-visible{outline:3px solid rgba(199,149,181,.55);outline-offset:2px}
    .cd-primario{background:#c795b5;color:#fff}
    .cd-secundario{background:#f5f2fc;color:#8170a7}
    .cd-perigo{background:#f87171;color:#fff}

    #cd-toasts{position:fixed;top:calc(16px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);
      z-index:100000;display:flex;flex-direction:column;gap:8px;align-items:center;
      width:min(92vw,420px);pointer-events:none}
    .cd-toast{pointer-events:auto;display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;
      background:#fff;border-radius:16px;padding:12px 16px;border-left:5px solid #c795b5;color:#343044;
      font:500 13px/1.45 ${FONTE};box-shadow:0 10px 30px rgba(81,67,111,.2);
      opacity:0;transform:translateY(-10px);transition:opacity .2s ease,transform .2s ease;cursor:pointer}
    .cd-toast.cd-visivel{opacity:1;transform:none}
    .cd-toast-ic{flex:none;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;font-size:13px;font-weight:700;color:#fff;background:#c795b5}
    .cd-t-sucesso{border-left-color:#4ade80}.cd-t-sucesso .cd-toast-ic{background:#4ade80}
    .cd-t-aviso{border-left-color:#f59e0b}.cd-t-aviso .cd-toast-ic{background:#f59e0b}
    .cd-t-erro{border-left-color:#f87171}.cd-t-erro .cd-toast-ic{background:#f87171}
    .cd-t-lembrete{border-left-color:#8170b8}.cd-t-lembrete .cd-toast-ic{background:#8170b8}

    @media (prefers-reduced-motion: reduce){
      .cd-fundo,.cd-caixa,.cd-toast{transition:none}
    }
    `;

    const ICONES = {
        sucesso: "✓", aviso: "!", erro: "✕", info: "i", pergunta: "?", lembrete: "🔔"
    };

    const TITULOS = {
        sucesso: "Tudo certo!",
        aviso: "Atenção",
        erro: "Ops!",
        info: "Carpe Diem",
        pergunta: "Confirmar"
    };

    function injetarEstilos() {
        if (document.getElementById("cd-ui-estilos")) return;

        const estilo = document.createElement("style");
        estilo.id = "cd-ui-estilos";
        estilo.textContent = CSS;
        document.head.appendChild(estilo);
    }

    function el(tag, classe, texto) {
        const n = document.createElement(tag);
        if (classe) n.className = classe;
        if (texto !== undefined) n.textContent = texto;
        return n;
    }

    // Os avisos entram em fila, para nunca ficarem um por cima do outro
    let fila = Promise.resolve();

    function abrir(config) {
        const tarefa = fila.then(() => mostrar(config));
        fila = tarefa.catch(() => {});
        return tarefa;
    }

    function mostrar(cfg) {
        return new Promise(resolve => {
            injetarEstilos();

            const focoAnterior = document.activeElement;
            const fundo = el("div", "cd-fundo");
            const caixa = el("div", "cd-caixa cd-" + cfg.tipo);

            caixa.setAttribute("role", "dialog");
            caixa.setAttribute("aria-modal", "true");

            const area = el("div", "cd-botoes");

            caixa.append(
                el("div", "cd-icone", ICONES[cfg.tipo] || "i"),
                el("h3", "cd-titulo", cfg.titulo),
                el("p", "cd-texto", cfg.texto),
                area
            );

            fundo.appendChild(caixa);

            let fechado = false;

            function fechar(valor) {
                if (fechado) return;
                fechado = true;

                document.removeEventListener("keydown", aoTecla, true);
                fundo.classList.remove("cd-visivel");
                setTimeout(() => fundo.remove(), 180);

                try { if (focoAnterior && focoAnterior.focus) focoAnterior.focus(); } catch (e) { /* ok */ }

                resolve(valor);
            }

            function aoTecla(e) {
                if (e.key === "Escape" && cfg.cancelavel) {
                    e.preventDefault();
                    fechar(cfg.valorCancelar);
                } else if (e.key === "Tab") {
                    const botoes = [...area.querySelectorAll("button")];
                    const i = botoes.indexOf(document.activeElement);

                    e.preventDefault();

                    const proximo = e.shiftKey
                        ? (i <= 0 ? botoes.length - 1 : i - 1)
                        : (i + 1) % botoes.length;

                    botoes[proximo].focus();
                }
            }

            cfg.botoes.forEach(b => {
                const botao = el("button", "cd-btn cd-" + b.estilo, b.rotulo);
                botao.type = "button";
                botao.addEventListener("click", () => fechar(b.valor));
                area.appendChild(botao);
            });

            fundo.addEventListener("mousedown", e => {
                if (e.target === fundo && cfg.cancelavel) fechar(cfg.valorCancelar);
            });

            document.addEventListener("keydown", aoTecla, true);
            document.body.appendChild(fundo);

            requestAnimationFrame(() => {
                fundo.classList.add("cd-visivel");

                const botoes = area.querySelectorAll("button");
                const alvo = botoes[cfg.focoIndice] || botoes[botoes.length - 1];

                if (alvo) alvo.focus();
            });
        });
    }

    // ---------------------------------------------------------
    // API pública
    // ---------------------------------------------------------

    function avisar(texto, opc = {}) {
        const tipo = opc.tipo || "info";

        return abrir({
            tipo,
            titulo: opc.titulo || TITULOS[tipo],
            texto: String(texto ?? ""),
            botoes: [{ rotulo: opc.botao || "Entendi", estilo: "primario", valor: true }],
            focoIndice: 0,
            cancelavel: true,
            valorCancelar: true
        });
    }

    function confirmar(texto, opc = {}) {
        const tipo = opc.tipo || (opc.perigo ? "aviso" : "pergunta");

        return abrir({
            tipo,
            titulo: opc.titulo || TITULOS.pergunta,
            texto: String(texto ?? ""),
            botoes: [
                { rotulo: opc.cancelar || "Cancelar", estilo: "secundario", valor: false },
                { rotulo: opc.confirmar || "Confirmar", estilo: opc.perigo ? "perigo" : "primario", valor: true }
            ],
            // Em ação destrutiva, o foco começa em "Cancelar" (Enter não apaga sem querer)
            focoIndice: opc.perigo ? 0 : 1,
            cancelavel: true,
            valorCancelar: false
        });
    }

    function toast(texto, tipo = "sucesso", ms = 3200, url = null) {
        injetarEstilos();

        let pilha = document.getElementById("cd-toasts");

        if (!pilha) {
            pilha = el("div");
            pilha.id = "cd-toasts";
            document.body.appendChild(pilha);
        }

        // No máximo 3 ao mesmo tempo
        while (pilha.children.length >= 3) pilha.firstChild.remove();

        const t = el("div", "cd-toast cd-t-" + tipo);
        t.setAttribute("role", "status");
        t.append(el("span", "cd-toast-ic", ICONES[tipo] || "i"), el("span", "", String(texto)));

        let removido = false;

        function remover() {
            if (removido) return;
            removido = true;
            t.classList.remove("cd-visivel");
            setTimeout(() => t.remove(), 220);
        }

        t.addEventListener("click", () => {
            if (url) window.location.href = url;
            else remover();
        });

        pilha.appendChild(t);
        requestAnimationFrame(() => t.classList.add("cd-visivel"));
        setTimeout(remover, ms);

        return t;
    }

    // ---------------------------------------------------------
    // Substitui o alert() nativo
    // ---------------------------------------------------------

    function inferirTipo(texto) {
        if (/(^|\s)n[aã]o(\s|$)|erro|inv[aá]lid|domingo|preencha|limite|bloque|sem espa[cç]o/i.test(texto)) return "aviso";
        if (/sucesso|obrigad/i.test(texto)) return "sucesso";
        return "info";
    }

    window.alert = function (mensagem) {
        const texto = String(mensagem ?? "");
        avisar(texto, { tipo: inferirTipo(texto) });
    };

    window.avisar = avisar;
    window.confirmar = confirmar;
    window.toast = toast;

    // ---------------------------------------------------------
    // Lembrete recebido com o site aberto: aparece como mensagem rápida
    // ---------------------------------------------------------

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.addEventListener("message", e => {
            const d = e.data;

            if (d && d.tipo === "carpe-diem-push") {
                toast(d.body ? `${d.title} — ${d.body}` : d.title, "lembrete", 8000, d.url || null);
            }
        });
    }
})();