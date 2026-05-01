{
    let isDebugEnabled = false;

    chrome.storage.local.get(['debugMode'], (res) => {
        isDebugEnabled = !!res.debugMode;
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.debugMode) isDebugEnabled = changes.debugMode.newValue;
    });

    const KeepAliveAdapters = {
        "banesconline.com": {
            pages: [
                "Default.aspx",
                "consultamovimientoscuenta/movimientoscuenta.aspx"
            ]
        }
    };

    function maintainSession() {
        // SOLUCIÓN: Solo pedimos y validamos keepAliveActive
        chrome.storage.local.get(['keepAliveActive'], (res) => {

            if (!res.keepAliveActive) {
                if (isDebugEnabled) console.log("[KeepAlive] Pausado: Switch apagado.");
                return;
            }

            const currentUrl = window.location.href.toLowerCase();
            const hostname = window.location.hostname;

            for (const [key, config] of Object.entries(KeepAliveAdapters)) {
                if (hostname.includes(key)) {

                    const currentIndex = config.pages.findIndex(p =>
                        currentUrl.includes(p.toLowerCase())
                    );

                    if (currentIndex !== -1) {
                        const nextIndex = (currentIndex === 0) ? 1 : 0;
                        const baseUrl = window.location.origin + "/Mantis/WebSite/";
                        const nextUrl = baseUrl + config.pages[nextIndex];

                        console.log(`%c[KeepAlive] Independiente: Saltando a -> ${nextUrl}`, "color: #3498db; font-weight: bold;");
                        window.location.href = nextUrl;
                    } else {
                        if (isDebugEnabled) console.log("[KeepAlive] Fuera de zona segura.");
                    }
                    break;
                }
            }
        });
    }

    // Intervalo de 25 segundos
    setInterval(maintainSession, 25000);
}