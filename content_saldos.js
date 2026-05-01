{

    let isDebugEnabled = false;

    // Sincronización del modo debug
    chrome.storage.local.get(['debugMode'], (res) => {
        isDebugEnabled = !!res.debugMode;
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.debugMode) {
            isDebugEnabled = changes.debugMode.newValue;
            console.log(`[Saldos] Modo Debug: ${isDebugEnabled ? 'ENCENDIDO' : 'APAGADO'}`);
        }
    });

    const BankAdapters = {
        "banesconline.com": () => {
            // Solo imprime si el debug está ON
            if (isDebugEnabled) console.log("[DEBUG] Buscando tabla .GridViewHm...");

            const tableRow = document.querySelector(".GridViewHm tbody tr.GridViewHmRow");
            if (tableRow) {
                const cells = tableRow.getElementsByTagName("td");
                if (isDebugEnabled) console.log(`[DEBUG] Fila encontrada. Columnas: ${cells.length}`);
                if (cells.length >= 3) return cells[2].innerText.trim();
            }
            return null;
        },
        "bdvenlinea.banvenez.com": () => {
            if (isDebugEnabled) console.log("[DEBUG] Buscando saldo en BDV...");
            const saldo = document.querySelector(".v-label-undp-amount");
            return saldo ? saldo.innerText.trim() : null;
        }
    };



    function scanAndSave() {
        chrome.storage.local.get(['balanceMonitorActive'], (res) => {
            if (!res.balanceMonitorActive) return;

            const hostname = window.location.hostname;
            if (isDebugEnabled) console.log(`[Saldos] Ciclo de escaneo en: ${hostname}`);

            for (const [key, adapter] of Object.entries(BankAdapters)) {
                if (hostname.includes(key)) {
                    const saldo = adapter();

                    if (saldo) {
                        chrome.storage.local.get(['bankBalances'], (resStorage) => {
                            const balances = resStorage.bankBalances || {};
                            balances[key] = {
                                amount: saldo,
                                lastUpdate: new Date().toLocaleTimeString([], {
                                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                                })
                            };

                            chrome.storage.local.set({ bankBalances: balances }, () => {
                                // Éxito siempre se imprime
                                console.log(`%c[CAPTURA EXITOSA] ${key}: ${saldo}`, "color: #27ae60; font-weight: bold;");
                            });
                        });
                    } else {
                        // Mensaje de fallo solo en Debug
                        if (isDebugEnabled) {
                            console.warn(`[DEBUG] No se pudo obtener el saldo en ${key}. Posiblemente no estás en la pantalla correcta.`);
                        }
                    }
                    break;
                }
            }
        });
    }

    // Inicialización
    console.log("%c[Saldo Scraper] Script cargado y esperando idle...", "color: #f3ba2f;");

    if (document.readyState === 'complete') {
        scanAndSave();
    } else {
        window.addEventListener('load', scanAndSave);
    }

    // Intervalo cada 10 segundos
    setInterval(scanAndSave, 10000);

}