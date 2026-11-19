const VAPID_PUBLIC_KEY = "BL_GYIpEZheWINVdd2ZtyAKyxG7Aqqjs_UqwSJ6juyNl-HQefBY2ZilTPb0MKDBRlTsqt66tuFCb4Jxv4A8xLug";

const PREFS_PADRAO = { lembreteBloco: true, antecedenciaMin: 10 };

function suportaPush() {
    return (
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window
    );
}

function ehIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function estaInstalado() {
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        navigator.standalone === true
    );
}

function urlBase64ParaUint8Array(base64) {
    const preenchimento = "=".repeat((4 - (base64.length % 4)) % 4);
    const texto = (base64 + preenchimento).replace(/-/g, "+").replace(/_/g, "/");
    const bruto = atob(texto);

    return Uint8Array.from([...bruto].map(c => c.charCodeAt(0)));
}

function mesmaChave(inscricao, chaveBytes) {
    const atual = inscricao.options && inscricao.options.applicationServerKey;

    if (!atual) return false;

    const a = new Uint8Array(atual);

    if (a.length !== chaveBytes.length) return false;

    return a.every((valor, i) => valor === chaveBytes[i]);
}

async function registrarServiceWorker() {
    if (!("serviceWorker" in navigator)) return null;

    try {
        return await navigator.serviceWorker.register("service-worker.js");
    } catch (erro) {
        console.error("Não foi possível registrar o service worker:", erro);
        return null;
    }
}

window.addEventListener("load", registrarServiceWorker);

async function obterInscricao() {
    if (!suportaPush()) return null;

    const registro = await navigator.serviceWorker.ready;
    return registro.pushManager.getSubscription();
}

// Retorna { ativo, permissao, prefs }
async function statusLembretes() {
    const permissao = suportaPush() ? Notification.permission : "unsupported";
    const inscricao = await obterInscricao().catch(() => null);

    if (!inscricao || permissao !== "granted") {
        return { ativo: false, permissao, prefs: { ...PREFS_PADRAO } };
    }

    let prefs = { ...PREFS_PADRAO };

    try {
        const { data } = await supabaseClient
            .from("push_subscriptions")
            .select("prefs")
            .eq("endpoint", inscricao.endpoint)
            .maybeSingle();

        if (data && data.prefs) prefs = { ...PREFS_PADRAO, ...data.prefs };
    } catch (erro) {
        console.error("Não foi possível ler as preferências:", erro);
    }

    return { ativo: true, permissao, prefs };
}

// Retorna { ok: true } ou { ok: false, motivo: "..." }
async function ativarLembretes(prefs = PREFS_PADRAO) {
    if (!suportaPush()) {
        if (ehIOS() && !estaInstalado()) {
            return {
                ok: false,
                motivo: "No iPhone, primeiro toque em Compartilhar e em “Adicionar à Tela de Início”. Depois abra o Carpe Diem pelo ícone e ative os lembretes."
            };
        }

        return { ok: false, motivo: "Este navegador não suporta notificações." };
    }

    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith("COLE_AQUI")) {
        return { ok: false, motivo: "A chave pública (VAPID) ainda não foi configurada no notificacoes.js." };
    }

    const permissao = await Notification.requestPermission();

    if (permissao !== "granted") {
        return {
            ok: false,
            motivo: "A permissão foi negada. Libere as notificações nas configurações do navegador e tente de novo."
        };
    }

    try {
        const registro = await navigator.serviceWorker.ready;
        const chave = urlBase64ParaUint8Array(VAPID_PUBLIC_KEY.trim());

        let inscricao = await registro.pushManager.getSubscription();

        // Inscrição antiga feita com outra chave: remove para criar uma nova
        if (inscricao && !mesmaChave(inscricao, chave)) {
            await inscricao.unsubscribe();
            inscricao = null;
        }

        if (!inscricao) {
            inscricao = await registro.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: chave
            });
        }

        const json = inscricao.toJSON();

        const { error } = await supabaseClient.from("push_subscriptions").upsert({
            endpoint: json.endpoint,
            user_id: obterUsuarioId(),
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Belem",
            prefs: { ...PREFS_PADRAO, ...prefs }
        });

        if (error) {
            console.error(error);
            return { ok: false, motivo: "Não foi possível salvar o aparelho: " + error.message };
        }

        return { ok: true };
        } catch (erro) {
        console.error(erro);

        if (erro && erro.name === "AbortError") {
            return {
                ok: false,
                motivo: "O navegador não conseguiu falar com o serviço de notificações do Google. Costuma ser a rede, um antivírus ou VPN, ou o Brave (ative “Usar o Google Services para mensagens push” em brave://settings/privacy). Tente em outra rede ou outro navegador."
            };
        }

        return { ok: false, motivo: "Não foi possível ativar: " + (erro.message || erro) };
    }
}

async function desativarLembretes() {
    try {
        const inscricao = await obterInscricao();

        if (!inscricao) return true;

        await supabaseClient
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", inscricao.endpoint);

        await inscricao.unsubscribe();

        return true;
    } catch (erro) {
        console.error("Erro ao desativar os lembretes:", erro);
        return false;
    }
}

async function salvarPreferencias(prefs) {
    try {
        const inscricao = await obterInscricao();

        if (!inscricao) return false;

        const { error } = await supabaseClient
            .from("push_subscriptions")
            .update({ prefs })
            .eq("endpoint", inscricao.endpoint);

        return !error;
    } catch (erro) {
        console.error("Erro ao salvar as preferências:", erro);
        return false;
    }
}

// Notificação local de teste (não passa pelo servidor)
async function testarNotificacaoLocal() {
    if (!suportaPush() || Notification.permission !== "granted") return false;

    const registro = await navigator.serviceWorker.ready;

    await registro.showNotification("💜 Carpe Diem", {
        body: "Tudo certo! É assim que seus lembretes vão aparecer.",
        icon: "img/icon-192.png",
        badge: "img/badge-96.png",
        tag: "teste",
        lang: "pt-BR",
        vibrate: [120, 60, 120],
        actions: [
            { action: "abrir", title: "Abrir cronograma" },
            { action: "dispensar", title: "Dispensar" }
        ],
        data: { url: "calendario.html" }
    });

    return true;
}