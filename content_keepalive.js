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
                "https://www.banesconline.com/Mantis/WebSite/Default.aspx",
                "https://www.banesconline.com/Mantis/WebSite/consultamovimientoscuenta/movimientoscuenta.aspx"
            ]
        },
        "bdvenlinea.banvenez.com": {
            pages: [
                "https://bdvenlinea.banvenez.com/main/posicionconsolidada",
                "https://bdvenlinea.banvenez.com/main/referencias-bancarias"
            ]
        },
        "online.bancamiga.com": {
            refreshOnly: true, // <--- Nueva bandera para solo refrescar
            pages: [
                "https://online.bancamiga.com/?p=1"
            ]
        }
    };

    function maintainSession() {
        chrome.storage.local.get(['keepAliveActive'], (res) => {

            if (!res.keepAliveActive) {
                if (isDebugEnabled) console.log("[KeepAlive] Pausado: Switch apagado.");
                return;
            }

            const currentUrl = window.location.href.toLowerCase();
            const hostname = window.location.hostname;

            const adapterKey = Object.keys(KeepAliveAdapters).find(key => hostname.includes(key));

            if (adapterKey) {
                const config = KeepAliveAdapters[adapterKey];

                // 1. CASO BANCAMIGA (O cualquier adapter con refreshOnly)
                if (config.refreshOnly) {
                    // Verificamos que estemos en la página correcta para no refrescar el login por error
                    const isInAllowedPage = config.pages.some(p => currentUrl.includes(p.toLowerCase()));

                    if (isInAllowedPage) {
                        console.log("%c[KeepAlive] Refrescando página actual en Bancamiga...", "color: #27ae60; font-weight: bold;");
                        window.location.reload();
                    } else if (isDebugEnabled) {
                        console.log("[KeepAlive] Bancamiga: No se refresca porque no estamos en la página mapeada.");
                    }
                    return; // Salimos para que no intente la lógica de alternar
                }

                // 2. CASO BANESCO / BDV (Alternar entre páginas)
                const currentIndex = config.pages.findIndex(p =>
                    currentUrl.includes(p.toLowerCase().split('?')[0])
                );

                if (currentIndex !== -1) {
                    const nextIndex = (currentIndex === 0) ? 1 : 0;
                    const nextUrl = config.pages[nextIndex];

                    console.log(`%c[KeepAlive] Alternando a -> ${nextUrl}`, "color: #3498db; font-weight: bold;");
                    window.location.href = nextUrl;
                } else if (isDebugEnabled) {
                    console.log("[KeepAlive] Fuera de zona segura.");
                }
            }
        });
    }

    setInterval(maintainSession, 25000);
}