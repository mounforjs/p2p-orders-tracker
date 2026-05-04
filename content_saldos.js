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
            if (isDebugEnabled) console.log("[DEBUG] Buscando tabla .GridViewHm...");
            const tableRow = document.querySelector(".GridViewHm tbody tr.GridViewHmRow");
            if (tableRow) {
                const cells = tableRow.getElementsByTagName("td");
                if (cells.length >= 3) return cells[2].innerText.trim();
            }
            return null;
        },
        "bdvenlinea.banvenez.com": () => {
            if (isDebugEnabled) console.log("[DEBUG] Buscando saldo en BDV...");
            const saldo = document.querySelector(".v-label-undp-amount");
            return saldo ? saldo.innerText.trim() : null;
        },
        "online.bancamiga.com": () => {
            if (isDebugEnabled) console.log("[DEBUG] Buscando saldo en Bancamiga...");

            // Buscamos la fila que no es el encabezado (la que tiene celdas td)
            // Seleccionamos la celda con clase 'text-right' que es donde vive el Saldo Disponible
            const saldoDisponibleCelda = document.querySelector(".table-responsive table tbody tr td.text-right");

            if (saldoDisponibleCelda) {
                // Dentro de esa celda, el valor real está en el span con el popover del Petro
                const spanSaldo = saldoDisponibleCelda.querySelector("span[data-toggle='popover']");

                if (spanSaldo) {
                    const valor = spanSaldo.innerText.trim();
                    if (isDebugEnabled) console.log(`[DEBUG] Saldo Bancamiga encontrado: ${valor}`);
                    return valor;
                }
            }
            return null;
        }
    };



    function scanAndSave() {
        chrome.storage.local.get(['balanceMonitorActive'], (res) => {
            if (!res.balanceMonitorActive) return;

            // --- LA CORRECCIÓN ESTÁ AQUÍ ---
            const hostname = window.location.hostname;
            // -------------------------------

            if (isDebugEnabled) console.log(`[Saldos] Ciclo de escaneo en: ${hostname}`);

            for (const [key, adapter] of Object.entries(BankAdapters)) {
                if (hostname.includes(key)) {
                    // Si cambiaste BankAdapters a objetos con getSaldo(), 
                    // usa: const saldo = adapter.getSaldo();
                    // Si lo dejaste como funciones, usa: const saldo = adapter();
                    const saldo = (typeof adapter === 'function') ? adapter() : adapter.getSaldo();

                    if (saldo) {
                        chrome.storage.local.get(['bankBalances'], (resStorage) => {
                            const balances = resStorage.bankBalances || {};

                            // Extraemos el nombre amigable si existe, sino usamos la key
                            const friendlyName = (typeof adapter === 'object') ? adapter.name : key;

                            balances[key] = {
                                bankName: friendlyName,
                                amount: saldo,
                                lastUpdate: new Date().toLocaleTimeString([], {
                                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                                })
                            };

                            chrome.storage.local.set({ bankBalances: balances }, () => {
                                console.log(`%c[CAPTURA EXITOSA] ${friendlyName}: ${saldo}`, "color: #27ae60; font-weight: bold;");
                            });
                        });
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