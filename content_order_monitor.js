// content_order_monitor.js
(function () {
    const POLLING_TIME = 5000;
    let mainInterval = null;

    console.log("%c[SISTEMA] 🚀 Monitor de Orden Activo.", "background: #222; color: #bada55; padding: 2px;");

    const isContextValid = () => !!chrome.runtime?.id;

    function secureInject(inputElement, value, fieldName) {
        if (!inputElement || !isContextValid() || value === undefined || value === null) return;
        if (inputElement.value == value) return;

        console.log(`%c[INYECTANDO] ${fieldName} -> ${value}`, "color: #f3ba2f; font-weight: bold;");

        inputElement.focus();
        // Usar execCommand para simular escritura humana y disparar los validadores de Binance
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, value);

        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));

        setTimeout(() => {
            if (inputElement) inputElement.blur();
        }, 100);
    }

    function verificarFrenosDeEmergencia(res) {
        chrome.storage.local.get(['savedOrders'], (data) => {
            const ordenesMap = data.savedOrders || {};
            const listaOrdenes = Object.values(ordenesMap);

            // DEBUG: Mira esto en la consola para saber qué hay dentro
            // console.log("Órdenes detectadas por el monitor:", listaOrdenes);

            const totalOrdenesActual = listaOrdenes.length;

            const totalFiatActual = listaOrdenes.reduce((sum, ord) => {
                // Intentamos obtener el monto de fiatAmount o fiat (por si acaso)
                let valor = ord.fiatAmount || ord.fiat || 0;

                // Si es un string con "VES", lo limpiamos
                if (typeof valor === 'string') {
                    valor = valor.replace(/[^\d.,]/g, '').replace(',', '.');
                }

                return sum + (parseFloat(valor) || 0);
            }, 0);

            const limiteOrdenes = parseInt(res.maxOrdersCount) || 0;
            const limiteFiat = parseFloat(res.maxFiatTotal) || 0;
            const fiatRestante = Math.max(0, limiteFiat - totalFiatActual);

            // LOG DASHBOARD
            console.log(
                `%c 📦 Órdenes: ${totalOrdenesActual}/${limiteOrdenes} %c 💰 Fiat: ${totalFiatActual.toLocaleString('es-VE')} VES %c 🏁 Resta: ${fiatRestante.toLocaleString('es-VE')} VES `,
                "background: #2b3139; color: #f3ba2f; border-radius: 3px 0 0 3px; padding: 2px 5px; border-left: 3px solid #f3ba2f;",
                "background: #474d57; color: #fff; padding: 2px 5px;",
                `background: ${fiatRestante <= 0 ? '#ea3943' : '#27ae60'}; color: #fff; border-radius: 0 3px 3px 0; padding: 2px 5px; font-weight: bold;`
            );

            // DISPARAR OFFLINE
            if ((limiteOrdenes > 0 && totalOrdenesActual >= limiteOrdenes) ||
                (limiteFiat > 0 && totalFiatActual >= limiteFiat)) {

                const btnOffline = document.querySelector('input[type="radio"][value="2"]') ||
                    Array.from(document.querySelectorAll('label')).find(l => l.innerText.includes('Offline'));

                if (btnOffline) {
                    btnOffline.click();
                    console.log("%c[🛑] LÍMITE ALCANZADO: CAMBIANDO A OFFLINE", "background: red; color: white; padding: 5px;");
                }
            }
        });
    }


    function ejecutarLogicaDinamica() {
        if (!isContextValid()) {
            console.error("🛑 Contexto perdido. Recargando...");
            setTimeout(() => window.location.reload(), 2000);
            return;
        }



        // Pedimos exactamente las llaves que guarda el popup.js
        chrome.storage.local.get([
            'bcvCaptureActive',
            'p2p_stats',
            'totalAmount',
            'minLimit',
            'maxLimit',
            'centimosDebajo',
            'maxOrdersCount', // <--- ¿Agregaste esto?
            'maxFiatTotal'
        ], (res) => {
            if (chrome.runtime.lastError || !isContextValid()) return;

            // Si el switch principal está apagado, no hacemos nada
            if (!res.bcvCaptureActive) {
                // console.log("Monitor en pausa (Switch OFF)");
                return;
            }

            // --- 1. LÓGICA DE PRECIO (RATE) ---


            // --- 1. LÓGICA DE PRECIO (RATE) ---

            if (res.p2p_stats) {
                try {
                    const stats = JSON.parse(res.p2p_stats);

                    const obtenerTipoAnuncio = () => {
                        const el = document.querySelector("#c2c_advDetail_price > div.css-lduul0 > div:first-child");
                        if (el) return el.innerText.trim();
                        console.warn("⚠️ No se pudo detectar el tipo de anuncio.");
                        return null;
                    };

                    const adType = obtenerTipoAnuncio();
                    if (!adType) return;

                    let valorMarketPrincipal = 0;
                    let valorMarketSecundario = 0;
                    let etiquetaPrincipal = "";
                    let etiquetaSecundaria = "";
                    let valorObjetivo = 0;

                    const resta = parseFloat(res.centimosDebajo) || 0;
                    const buyPriceMarket = parseFloat(stats.buy_price) || 0;
                    const sellPriceMarket = parseFloat(stats.sell_price) || 0;

                    // Configuración dinámica según el tipo de anuncio
                    if (adType === 'SELL') {
                        // Principal es BUY (donde compiten los que te compran a ti)
                        valorMarketPrincipal = buyPriceMarket;
                        etiquetaPrincipal = "Mkt Buy";

                        valorMarketSecundario = sellPriceMarket;
                        etiquetaSecundaria = "Mkt Sell";

                        valorObjetivo = valorMarketPrincipal - resta;
                    } else {
                        // Principal es SELL (donde compiten los que te venden a ti)
                        valorMarketPrincipal = sellPriceMarket;
                        etiquetaPrincipal = "Mkt Sell";

                        valorMarketSecundario = buyPriceMarket;
                        etiquetaSecundaria = "Mkt Buy";

                        valorObjetivo = valorMarketPrincipal + resta;
                    }

                    const formulaNode = Array.from(document.querySelectorAll('div')).find(el =>
                        el.innerText.includes('*') && el.innerText.includes('%') && el.children.length === 0
                    );

                    if (formulaNode && !isNaN(valorObjetivo)) {
                        const bcvMatch = formulaNode.innerText.match(/^([\d.]+)/);
                        if (bcvMatch) {
                            const precioBCV = parseFloat(bcvMatch[1]);
                            const porcentaje = ((valorObjetivo * 100) / precioBCV).toFixed(2);
                            const horaActual = new Date().toLocaleTimeString();

                            const colorTipo = adType === 'SELL' ? 'background: #ea3943;' : 'background: #27ae60;';

                            // LOG CON AMBOS PRECIOS (El principal va primero)
                            console.log(
                                `%c [${horaActual}] %c ${adType} %c ${etiquetaPrincipal}: ${valorMarketPrincipal.toFixed(2)} %c ${etiquetaSecundaria}: ${valorMarketSecundario.toFixed(2)} %c Obj: ${valorObjetivo.toFixed(2)} %c Rate: ${porcentaje}% `,
                                "background: #1e2329; color: #848e9c; padding: 2px 5px;",
                                `${colorTipo} color: #fff; font-weight: bold; padding: 2px 5px;`,
                                "background: #f3ba2f; color: #111010; font-weight: bold; padding: 2px 5px;", // Principal (Amarillo resaltado)
                                "background: #474d57; color: #fff; padding: 2px 5px;",                       // Secundario (Gris)
                                "background: #e40909; color: #ffffff; font-weight: bold; padding: 2px 5px;",
                                "background: #2b3139; color: #27ae60; border-radius: 0 3px 3px 0; padding: 2px 5px; font-weight: bold; border: 1px solid #27ae60;"
                            );

                            const inputRate = document.querySelector('input[name="rate"]');
                            if (inputRate) {
                                secureInject(inputRate, porcentaje, `RATE ${adType} (%)`);
                            }
                        }
                    }
                } catch (e) {
                    console.error("❌ Error en cálculos de monitor:", e);
                }
            }

            // --- 2. LÓGICA DE MONTOS (SELECCIÓN POR POSICIÓN) ---


            // A. TOTAL AMOUNT (El input de arriba, fuera de la caja de límites)
            // Buscamos el input que NO esté dentro del div de los límites (gap-xl)
            const allTradingInputs = document.querySelectorAll('input[aria-label="Enter trading amount"]');
            let inputTotal = null;

            if (allTradingInputs.length > 1) {
                // Si hay varios, el Total suele ser el primero de la página
                inputTotal = allTradingInputs[0];
            } else {
                inputTotal = document.querySelector('input[name="amount"]') || allTradingInputs[0];
            }

            if (inputTotal && res.totalAmount) {
                secureInject(inputTotal, res.totalAmount, "TOTAL AMOUNT");
            }

            // B. LÍMITES (MIN Y MAX)
            const contenedorLimites = document.querySelector('.w-full.gap-xl.css-4cffwv');

            if (contenedorLimites) {
                const inputsLimites = contenedorLimites.querySelectorAll('input');

                if (inputsLimites.length >= 2) {
                    // En el div que pasaste, el primer input es el MIN y el segundo el MAX
                    if (res.minLimit) {
                        secureInject(inputsLimites[0], res.minLimit, "MIN LIMIT");
                    }
                    if (res.maxLimit) {
                        secureInject(inputsLimites[1], res.maxLimit, "MAX LIMIT");
                    }
                }
            }

            verificarFrenosDeEmergencia(res);
        });
    }

    if (mainInterval) clearInterval(mainInterval);
    mainInterval = setInterval(ejecutarLogicaDinamica, POLLING_TIME);
})();