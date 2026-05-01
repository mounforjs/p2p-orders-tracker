let timer = null;
let monitorInterval = null;
let filtersCleaned = false;

/**
 * Función CRÍTICA para evitar el error "Extension context invalidated".
 * Verifica si el contexto de la extensión sigue siendo válido.
 */
const isContextValid = () => {
    return !!chrome.runtime?.id;
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const parseP2PPrice = (str) => {
    if (!str) return 0;
    console.log(`🔍 Intentando parsear texto original: "${str}"`);
    let clean = str.replace(/[^\d.,]/g, '');
    const dots = (clean.match(/\./g) || []).length;
    const commas = (clean.match(/,/g) || []).length;

    if (dots + commas > 1) {
        const lastIndex = Math.max(clean.lastIndexOf('.'), clean.lastIndexOf(','));
        const decimals = clean.substring(lastIndex + 1);
        const integer = clean.substring(0, lastIndex).replace(/[.,]/g, '');
        const final = parseFloat(`${integer}.${decimals}`);
        console.log(`🔢 Formato complejo detectado -> Resultado: ${final}`);
        return final;
    }
    const final = parseFloat(clean.replace(',', '.'));
    console.log(`🔢 Formato simple detectado -> Resultado: ${final}`);
    return final;
};

const clearVerifiedFilter = async () => {
    if (!isContextValid()) return; // Protección
    if (filtersCleaned) return;
    const filterBtn = Array.from(document.querySelectorAll('button[aria-label="more filter"]'))
        .find(btn => btn.querySelector('svg path[d*="M15.412"]'));

    if (!filterBtn) {
        console.warn("⚠️ No se halló botón de filtro.");
        return;
    }

    filterBtn.click();
    await wait(3000);

    const targetContainer = Array.from(document.querySelectorAll('.bn-flex.items-center.justify-between'))
        .find(el => el.innerText.includes("Verified Merchant Ads only") || el.innerText.includes("Solo anuncios de comerciantes verificados"));

    if (targetContainer) {
        const sw = targetContainer.querySelector('div[role="switch"]');
        if (sw && (sw.classList.contains('checked') || sw.getAttribute('aria-checked') === 'true')) {
            console.log("🧹 Desactivando switch...");
            const evs = ['mousedown', 'mouseup', 'click'];
            evs.forEach(t => sw.dispatchEvent(new MouseEvent(t, { bubbles: true, view: window, buttons: 1 })));
            await wait(1000);
        }
    }

    const applyBtn = Array.from(document.querySelectorAll('button.bn-button__primary'))
        .find(btn => btn.innerText.includes('Apply') || btn.innerText.includes('Aplicar'));

    if (applyBtn) {
        applyBtn.click();
        console.log("⏳ Filtro aplicado. Esperando refresco de tabla...");
        await wait(4000);
    } else {
        filterBtn.click();
    }
    filtersCleaned = true;
};

const setFilterAmount = async () => {
    return new Promise((resolve) => {
        if (!isContextValid()) return resolve(); // Protección

        chrome.storage.local.get(['filterAmount'], async (res) => {
            if (chrome.runtime.lastError || !isContextValid()) return resolve();

            const amount = res.filterAmount;
            if (!amount) {
                resolve();
                return;
            }

            const input = document.getElementById('C2Csearchamount_searchbox_amount');
            if (input) {
                console.log(`💰 Inyectando monto de filtro: ${amount}`);
                input.focus();
                input.value = amount;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));

                await wait(500);

                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                });
                input.dispatchEvent(enterEvent);
                console.log("⌨️ Enter enviado al filtro de monto.");
                await wait(2000);
            }
            resolve();
        });
    });
};

const runScraper = async () => {
    if (!isContextValid()) return; // Detener si la extensión se invalidó

    try {
        if (!filtersCleaned) {
            await setFilterAmount();
            await clearVerifiedFilter();
        }

        console.log("🚀 Iniciando extracción...");
        const allTabs = Array.from(document.querySelectorAll('.bn-tab, [role="tab"]'));
        const buyTab = allTabs.find(t => t.innerText.match(/Buy|Compra/i));
        const sellTab = allTabs.find(t => t.innerText.match(/Sell|Venta/i));

        if (!buyTab || !sellTab) {
            console.error("❌ ERROR: No se localizaron las pestañas Buy/Sell.");
            return;
        }

        const extract = () => {
            const rows = [];
            for (let i = 2; i <= 6; i++) {
                const tr = document.querySelector(`tr[aria-rowindex="${i}"]`);
                if (tr) {
                    const priceCell = tr.querySelector('td[aria-colindex="2"]');
                    if (priceCell) {
                        const textContent = priceCell.innerText;
                        const match = textContent.match(/[0-9]{1,3}([\.,][0-9]{3})*([\.,][0-9]+)?/);
                        const p = match ? match[0] : "0";
                        if (p !== "0") rows.push({ precio: p });
                    }
                }
            }
            return rows;
        };

        // BUY
        buyTab.click();
        buyTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await wait(5000);
        const buyData = extract();

        // SELL
        sellTab.click();
        sellTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await wait(5000);
        const sellData = extract();

        if (buyData.length > 0 && sellData.length > 0) {
            const vNum = parseP2PPrice(buyData[0].precio);
            const cNum = parseP2PPrice(sellData[0].precio);

            if (!isNaN(vNum) && !isNaN(cNum) && cNum > 0 && vNum > 0) {
                const spread = ((vNum - cNum) / cNum) * 100;
                const stats = {
                    buy_price: vNum.toFixed(3),
                    sell_price: cNum.toFixed(3),
                    spread_percent: spread.toFixed(3),
                    last_update: new Date().toLocaleString('es-ES')
                };

                if (isContextValid()) {
                    chrome.storage.local.set({ "p2p_stats": JSON.stringify(stats) }, () => {
                        console.log("🔥 STATS GUARDADAS:", stats);
                    });
                }
            }
        }
    } catch (e) {
        console.error("❌ FALLO CRÍTICO FINAL:", e);
    }
};

const checkStatus = () => {
    // Si el contexto se invalidó, limpiamos todo y salimos para que no arroje más errores
    if (!isContextValid()) {
        if (timer) clearInterval(timer);
        if (monitorInterval) clearInterval(monitorInterval);
        console.warn("🛑 Contexto de extensión invalidado. Limpiando procesos...");
        return;
    }

    chrome.storage.local.get(['autoRun'], (res) => {
        if (chrome.runtime.lastError) return; // Evitar error si se acaba de invalidar

        if (res.autoRun && !timer) {
            runScraper();
            timer = setInterval(runScraper, 60000);
        } else if (!res.autoRun && timer) {
            clearInterval(timer);
            timer = null;
        }
    });
};

// Guardamos la referencia del intervalo principal para poder limpiarlo
monitorInterval = setInterval(checkStatus, 5000);