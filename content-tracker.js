let timer = null;
let monitorInterval = null;
let filtersCleaned = false;

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const parseP2PPrice = (str) => {
    if (!str) return 0;

    console.log(`🔍 Intentando parsear texto original: "${str}"`);

    // 1. Eliminar todo lo que NO sea número, coma o punto
    let clean = str.replace(/[^\d.,]/g, '');

    // 2. Si hay múltiples separadores (ej: 40.500,20)
    const dots = (clean.match(/\./g) || []).length;
    const commas = (clean.match(/,/g) || []).length;

    if (dots + commas > 1) {
        // Buscamos el último separador para los decimales
        const lastIndex = Math.max(clean.lastIndexOf('.'), clean.lastIndexOf(','));
        const decimals = clean.substring(lastIndex + 1);
        const integer = clean.substring(0, lastIndex).replace(/[.,]/g, '');
        const final = parseFloat(`${integer}.${decimals}`);
        console.log(`🔢 Formato complejo detectado -> Resultado: ${final}`);
        return final;
    }

    // 3. Si solo hay un separador o ninguno
    const final = parseFloat(clean.replace(',', '.'));
    console.log(`🔢 Formato simple detectado -> Resultado: ${final}`);
    return final;
};



const clearVerifiedFilter = async () => {
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

// --- NUEVA FUNCIÓN PARA INYECTAR MONTO ---
const setFilterAmount = async () => {
    return new Promise((resolve) => {
        chrome.storage.local.get(['filterAmount'], async (res) => {
            const amount = res.filterAmount;
            if (!amount) {
                resolve();
                return;
            }

            const input = document.getElementById('C2Csearchamount_searchbox_amount');
            if (input) {
                console.log(`💰 Inyectando monto de filtro: ${amount}`);

                // 1. Enfocar e inyectar valor
                input.focus();
                input.value = amount;

                // 2. Disparar eventos para que React detecte el cambio
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));

                await wait(500);

                // 3. Simular la tecla ENTER
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true
                });
                input.dispatchEvent(enterEvent);

                console.log("⌨️ Enter enviado al filtro de monto.");
                await wait(2000); // Esperar a que la tabla se refresque por el monto
            }
            resolve();
        });
    });
};

const runScraper = async () => {
    try {
        // Paso 0: Filtrar por monto si existe (solo la primera vez o siempre, según prefieras)
        // Si quieres que lo haga solo una vez, puedes usar la bandera 'filtersCleaned'
        if (!filtersCleaned) {
            await setFilterAmount();
            await clearVerifiedFilter();
        }

        console.log("🚀 Iniciando extracción...");


        // Buscamos las pestañas con un selector más amplio
        const allTabs = Array.from(document.querySelectorAll('.bn-tab, [role="tab"]'));
        console.log(`Encontradas ${allTabs.length} pestañas potenciales.`);

        const buyTab = allTabs.find(t => t.innerText.match(/Buy|Compra/i));
        const sellTab = allTabs.find(t => t.innerText.match(/Sell|Venta/i));

        if (!buyTab || !sellTab) {
            console.error("❌ ERROR: No se localizaron las pestañas Buy/Sell. Verifica el idioma.");
            return;
        }

        const extract = () => {
            const rows = [];
            // Buscamos en las primeras filas útiles
            for (let i = 2; i <= 6; i++) {
                const tr = document.querySelector(`tr[aria-rowindex="${i}"]`);
                if (tr) {
                    // Buscamos la celda del precio (colindex 2)
                    const priceCell = tr.querySelector('td[aria-colindex="2"]');
                    if (priceCell) {
                        // Seleccionamos solo el texto que parece un número (ignorando "VES", "USD", etc.)
                        // Buscamos dentro de elementos hijos por si Binance lo escondió en un div
                        const textContent = priceCell.innerText;
                        const match = textContent.match(/[0-9]{1,3}([\.,][0-9]{3})*([\.,][0-9]+)?/);
                        const p = match ? match[0] : "0";

                        if (p !== "0") {
                            rows.push({ precio: p });
                        }
                    }
                }
            }
            console.log("🔍 Filas detectadas con precios reales:", rows);
            return rows;
        };

        // --- PROCESO BUY ---
        console.log("🖱️ Clic en pestaña BUY...");
        buyTab.click();
        buyTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await wait(5000);
        const buyData = extract();
        console.log(`✅ Datos BUY extraídos: ${buyData.length} filas.`);

        // --- PROCESO SELL ---
        console.log("🖱️ Clic en pestaña SELL...");
        sellTab.click();
        sellTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await wait(5000);
        const sellData = extract();
        console.log(`✅ Datos SELL extraídos: ${sellData.length} filas.`);

        // --- PASO D: Calcular y Guardar ---
        if (buyData.length > 0 && sellData.length > 0) {
            console.log("🔢 Procesando precios para cálculo...");

            const vNum = parseP2PPrice(buyData[0].precio);
            const cNum = parseP2PPrice(sellData[0].precio);

            console.log(`💵 Precio Compra (Parsed): ${vNum}`);
            console.log(`💵 Precio Venta (Parsed): ${cNum}`);

            // Validamos que sean números válidos y mayores a cero
            if (!isNaN(vNum) && !isNaN(cNum) && cNum > 0 && vNum > 0) {
                const spread = ((vNum - cNum) / cNum) * 100;

                const stats = {
                    buy_price: vNum.toFixed(3),
                    sell_price: cNum.toFixed(3),
                    spread_percent: spread.toFixed(3),
                    last_update: new Date().toLocaleString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    })
                };

                chrome.storage.local.set({ "p2p_stats": JSON.stringify(stats) }, () => {
                    console.log("🔥 STATS GUARDADAS EXITOSAMENTE:", stats);


                });
            } else {
                console.error("❌ Error: Los precios parseados no son válidos para el cálculo.");
            }
        } else {
            console.warn("⚠️ No hay datos suficientes en buyData o sellData.");
        }

    } catch (e) {
        console.error("❌ FALLO CRÍTICO FINAL:", e);
    }
};

const checkStatus = () => {
    chrome.storage.local.get(['autoRun'], (res) => {
        if (res.autoRun && !timer) {
            runScraper();
            timer = setInterval(runScraper, 60000);
        } else if (!res.autoRun && timer) {
            clearInterval(timer);
            timer = null;
        }
    });
};

setInterval(checkStatus, 5000);