// --- VARIABLES DE CONTROL GLOBAL ---
if (window.scraperTimer) clearInterval(window.scraperTimer);
if (window.statusMonitor) clearInterval(window.statusMonitor);

window.scraperTimer = null;
window.statusMonitor = null;
let filtersCleaned = false;

const isContextValid = () => !!chrome.runtime?.id;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// --- UTILIDADES ---
const parseP2PPrice = (str) => {
    if (!str) return 0;
    let clean = str.replace(/[^\d.,]/g, '');
    const lastIndex = Math.max(clean.lastIndexOf('.'), clean.lastIndexOf(','));
    if (lastIndex !== -1 && (clean.match(/[.,]/g) || []).length > 1) {
        const decimals = clean.substring(lastIndex + 1);
        const integer = clean.substring(0, lastIndex).replace(/[.,]/g, '');
        return parseFloat(`${integer}.${decimals}`);
    }
    return parseFloat(clean.replace(',', '.'));
};

// --- LÓGICA DE FILTROS (RESTAURADA) ---
const clearVerifiedFilter = async () => {
    if (!isContextValid() || filtersCleaned) return;

    // 1. Localizar el botón de filtro por el path del icono
    const filterBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.querySelector('svg path[d*="M15.412"]'));

    if (!filterBtn) {
        console.warn("⚠️ No se halló el botón de filtro.");
        return;
    }

    filterBtn.click();
    await wait(3000); // Esperar a que el modal abra y cargue

    // 2. Buscar el contenedor que tiene el texto del switch
    const targetContainer = Array.from(document.querySelectorAll('.bn-flex.items-center.justify-between'))
        .find(el => el.innerText.includes("Verified Merchant Ads only") || el.innerText.includes("Solo anuncios de comerciantes verificados"));

    if (targetContainer) {
        const sw = targetContainer.querySelector('div[role="switch"]');

        // Verificamos si el switch existe y si está encendido (checked)
        if (sw && (sw.classList.contains('checked') || sw.getAttribute('aria-checked') === 'true')) {
            console.log("🧹 Desactivando switch detectado como encendido...");

            // LÓGICA DE PRESIÓN RESTAURADA: Enviamos la secuencia completa de eventos
            const evs = ['mousedown', 'mouseup', 'click'];
            evs.forEach(t => {
                sw.dispatchEvent(new MouseEvent(t, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    buttons: 1
                }));
            });

            await wait(1500); // Esperar un momento tras presionar
        } else {
            console.log("ℹ️ El switch ya estaba apagado o no se encontró.");
        }
    }

    // 3. Buscar y presionar el botón de aplicar
    const applyBtn = Array.from(document.querySelectorAll('button.bn-button__primary'))
        .find(btn => btn.innerText.includes('Apply') || btn.innerText.includes('Aplicar'));

    if (applyBtn) {
        applyBtn.click();
        console.log("⏳ Filtro aplicado. Esperando refresco...");
        await wait(4000);
    } else {
        // Si no aparece el botón de aplicar por algún error, cerramos el modal
        filterBtn.click();
    }

    filtersCleaned = true;
};

const setFilterAmount = async () => {
    return new Promise((resolve) => {
        chrome.storage.local.get(['filterAmount'], async (res) => {
            if (!isContextValid() || !res.filterAmount) return resolve();

            const input = document.getElementById('C2Csearchamount_searchbox_amount') ||
                document.querySelector('input[placeholder*="amount"]');

            if (input) {
                console.log(`💰 Seteando monto: ${res.filterAmount}`);
                input.focus();
                input.value = res.filterAmount;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await wait(500);
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                await wait(2000);
            }
            resolve();
        });
    });
};

// --- SCRAPER PRINCIPAL ---
const runScraper = async () => {
    if (!isContextValid()) return;

    try {
        if (!filtersCleaned) {
            await setFilterAmount();
            await clearVerifiedFilter();
        }

        const tabs = Array.from(document.querySelectorAll('.bn-tab, [role="tab"]'));
        const buyTab = tabs.find(t => t.innerText.match(/Buy|Compra/i));
        const sellTab = tabs.find(t => t.innerText.match(/Sell|Venta/i));



        if (!buyTab || !sellTab) return;

        const extract = () => {
            const firstRow = document.querySelector('tr[aria-rowindex="2"]');
            if (!firstRow) return null;
            const priceCell = firstRow.querySelector('td[aria-colindex="2"]');
            return priceCell ? priceCell.innerText : null;
        };

        // Click Compra
        buyTab.click();
        buyTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await wait(5000);
        const rawBuy = extract();

        // Click Venta
        sellTab.click();
        sellTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await wait(5000);
        const rawSell = extract();

        if (rawBuy && rawSell) {
            const vNum = parseP2PPrice(rawBuy);
            const cNum = parseP2PPrice(rawSell);

            if (vNum > 0 && cNum > 0) {
                const stats = {
                    buy_price: vNum.toFixed(3),
                    sell_price: cNum.toFixed(3),
                    spread_percent: (((vNum - cNum) / cNum) * 100).toFixed(3),
                    last_update: new Date().toLocaleTimeString()
                };

                // --- ESTA ES LA PARTE QUE DEBES MODIFICAR ---
                chrome.storage.local.set({
                    "p2p_stats": JSON.stringify(stats),
                    "currentSpread": parseFloat(stats.spread_percent) // <-- AÑADE ESTA LÍNEA
                }, () => {
                    // Log para confirmar que se envió al otro script
                    console.log(`%c📡 Spread enviado al sistema: ${stats.spread_percent}%`, "color: #00e5ff; font-size: 10px;");
                });

                console.log(`%c📊 [${stats.last_update}] B:${stats.buy_price} | S:${stats.sell_price} | %:${stats.spread_percent}`, "color: #f3ba2f; font-weight: bold;");
            }
        }
    } catch (e) {
        console.error("❌ Error en Scraper:", e);
    }
};

// --- MONITOR DE ESTADO ---
const startSystem = () => {
    window.statusMonitor = setInterval(() => {
        if (!isContextValid()) {
            window.location.reload();
            return;
        }

        chrome.storage.local.get(['autoRun'], (res) => {
            if (res.autoRun) {
                if (!window.scraperTimer) {
                    console.log("%c[SISTEMA] Scraper automático ON", "color: #bada55; font-weight: bold;");
                    runScraper();
                    window.scraperTimer = setInterval(runScraper, 22000); // 18s para evitar solapamientos
                }
            } else {
                if (window.scraperTimer) {
                    console.log("%c[SISTEMA] Scraper automático OFF", "color: #ff4444; font-weight: bold;");
                    clearInterval(window.scraperTimer);
                    window.scraperTimer = null;
                }
            }
        });
    }, 3000);
};

startSystem();