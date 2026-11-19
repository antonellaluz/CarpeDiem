/*
  CARPE DIEM — SERVICE WORKER
  Recebe as notificações push e abre o app quando a pessoa toca nelas.
*/

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", evento => {
    evento.waitUntil(self.clients.claim());
});

self.addEventListener("push", evento => {
    let dados = {
        title: "💜 Carpe Diem",
        body: "",
        url: "calendario.html",
        tag: "carpe-diem"
    };

    try {
        if (evento.data) dados = { ...dados, ...evento.data.json() };
    } catch (erro) {
        // usa o padrão
    }

    evento.waitUntil((async () => {
        // Se o site já está aberto e à vista, mostra a mensagem dentro dele
        // (evita notificação duplicada por cima da tela)
        const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const emFoco = janelas.find(j => j.visibilityState === "visible" && j.focused);

        if (emFoco) {
            emFoco.postMessage({
                tipo: "carpe-diem-push",
                title: dados.title,
                body: dados.body,
                url: dados.url
            });
            return;
        }

        await self.registration.showNotification(dados.title, {
            body: dados.body,
            icon: "img/icon-192.png",
            badge: "img/badge-96.png",
            tag: dados.tag,
            lang: "pt-BR",
            vibrate: [120, 60, 120],
            timestamp: Date.now(),
            actions: [
                { action: "abrir", title: "Abrir cronograma" },
                { action: "dispensar", title: "Dispensar" }
            ],
            data: { url: dados.url }
        });
    })());
});

self.addEventListener("notificationclick", evento => {
    evento.notification.close();

    if (evento.action === "dispensar") return;

    const destino = new URL(
        (evento.notification.data && evento.notification.data.url) || "calendario.html",
        self.registration.scope
    ).href;

    evento.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(janelas => {
            for (const janela of janelas) {
                if (janela.url === destino && "focus" in janela) return janela.focus();
            }

            return self.clients.openWindow(destino);
        })
    );
});