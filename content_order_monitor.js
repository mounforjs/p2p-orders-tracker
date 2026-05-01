// content_order_monitor.js
(function () {
    let bcvCaptureActive = false;
    const POLLING_TIME = 5000;

    // 1. CARGAR ESTADO INICIAL
    chrome.storage.local.get(['bcvCaptureActive'], (res) => {
        bcvCaptureActive = res.bcvCaptureActive || false;
        if (bcvCaptureActive) ejecutarLogicaDinamica();
    });

    // 2. ESCUCHAR CAMBIOS (Toggle o nuevos precios P2P)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.bcvCaptureActive) {
            bcvCaptureActive = changes.bcvCaptureActive.newValue;
        }
    });

    function ejecutarLogicaDinamica() {
        if (!bcvCaptureActive) return;

        // Recuperamos las estadísticas guardadas por el tracker
        chrome.storage.local.get(['p2p_stats'], (res) => {
            if (!res.p2p_stats) {
                console.warn("[Monitor] ⚠️ No hay datos de p2p_stats aún.");
                return;
            }

            try {
                const stats = JSON.parse(res.p2p_stats);
                const valorObjetivo = parseFloat(stats.sell_price); // Extraemos el sell_price

                if (isNaN(valorObjetivo) || valorObjetivo <= 0) {
                    console.error("[Monitor] ❌ sell_price no es válido:", stats.sell_price);
                    return;
                }

                procesarInyeccion(valorObjetivo);

            } catch (e) {
                console.error("[Monitor] ❌ Error parseando p2p_stats:", e);
            }
        });
    }

    function procesarInyeccion(valorObjetivo) {
        // Buscar el nodo de la fórmula BCV (ej: 45.50 * 100%)
        const formulaNode = Array.from(document.querySelectorAll('div')).find(el =>
            el.innerText.includes('*') && el.innerText.includes('%') && el.children.length === 0
        );

        if (!formulaNode) return;

        const match = formulaNode.innerText.trim().match(/^([\d.]+)/);
        if (match) {
            const precioBCV = parseFloat(match[1]);

            // FÓRMULA: (Valor de Tracker * 100) / BCV
            const porcentajeCalculado = ((valorObjetivo * 100) / precioBCV).toFixed(1);

            const inputRate = document.querySelector('input[name="rate"]');

            if (inputRate) {
                // Solo inyectar si el valor es diferente para evitar refrescos infinitos
                if (parseFloat(inputRate.value) !== parseFloat(porcentajeCalculado)) {

                    console.log(`%c[Monitor] 🎯 Objetivo P2P: ${valorObjetivo} | BCV: ${precioBCV}`, "color: #f3ba2f");

                    inputRate.focus();

                    // Inyección simulando teclado físico
                    document.execCommand('selectAll', false, null);
                    document.execCommand('insertText', false, porcentajeCalculado);

                    // Disparar eventos para Binance
                    inputRate.dispatchEvent(new Event('input', { bubbles: true }));
                    inputRate.dispatchEvent(new Event('change', { bubbles: true }));

                    setTimeout(() => inputRate.blur(), 200);

                    console.log(`%c[Monitor] ✅ Inyectado: ${porcentajeCalculado}%`, "color: #00ff00; font-weight: bold;");
                }
            }
        }
    }

    // Bucle de ejecución
    setInterval(ejecutarLogicaDinamica, POLLING_TIME);
})();