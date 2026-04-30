(function () {
    let intervalId = null;
    const POLLING_TIME = 3000;

    // --- 1. CONFIGURACIÓN DE ADAPTADORES POR BANCO ---
    // Aquí es donde añadirás nuevos bancos fácilmente
    const BANK_ADAPTERS = {
        "BANESCO": {
            domain: "banesconline.com",
            fill: (data, utils) => {
                if (data.monto) utils.inyectar(['#monto'], data.monto);
                if (data.cedula) utils.inyectar(['#ced'], data.cedula);

                if (data.telefono) {
                    const { prefijo, numero7 } = utils.procesarTelefono(data.telefono);
                    const selPref = utils.buscar(['#pref', 'select[name="prefijo"]']);
                    if (selPref) {
                        selPref.value = prefijo;
                        selPref.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    utils.inyectar(['#tel', 'input[name*="telefono"]'], numero7);
                }

                if (data.bankName) {
                    const cod = utils.obtenerCodigo(data.bankName);
                    const selBanco = utils.buscar(['#banco', 'select[name="banco"]']);
                    if (selBanco && cod) {
                        selBanco.value = cod;
                        selBanco.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }

                if (data.fullName) {
                    const concepto = `Pago ${data.fullName.trim().split(' ')[0]}`;
                    utils.inyectar(['#concepto', 'input[name="concepto"]'], concepto);
                }
            }
        },
        "VENEZUELA": {
            domain: "bdvenlinea.banvenez.com",
            fill: (data, utils) => {
                // Ejemplo de cómo añadirías la lógica para el BDV
                if (data.monto) utils.inyectar(['#montoTransferencia'], data.monto);
                if (data.cedula) utils.inyectar(['#documentoIdentidad'], data.cedula);
                // ... lógica específica del BDV
            }
        }
    };

    // --- 2. LÓGICA DE CAPTURA (BINANCE) ---
    // (Mantenemos tus funciones originales de extracción de Binance)
    const limpiarNumero = (texto, esFiatAmount = false) => {
        if (!texto || texto === "No encontrado") return null;
        let numStr = texto.replace(/[^\d.]/g, '');
        if (esFiatAmount) {
            let valorNum = parseFloat(numStr);
            if (isNaN(valorNum)) return null;
            return valorNum.toFixed(2).replace('.', ',');
        }
        return numStr;
    };

    function extraerDatosDetalle() {
        const extraerPorLabel = (label) => {
            const etiquetas = Array.from(document.querySelectorAll('.body2.text-tertiaryText, .text-secondaryText, div'));
            const targetLabel = etiquetas.find(el => el.innerText.trim() === label && el.children.length === 0);
            if (targetLabel) {
                const contenedor = targetLabel.closest('.bn-flex.justify-between') ||
                    targetLabel.closest('.bn-flex.items-start.justify-between') ||
                    targetLabel.parentElement.parentElement;
                if (contenedor) {
                    const valorEl = contenedor.querySelector('.text-right') ||
                        contenedor.querySelector('.body2.w-full') ||
                        contenedor.lastElementChild;
                    return valorEl ? valorEl.innerText.trim() : null;
                }
            }
            return null;
        };

        return {
            fiatAmount: limpiarNumero(extraerPorLabel("Fiat amount"), true),
            price: limpiarNumero(extraerPorLabel("Price")),
            fullName: extraerPorLabel("Full name of receiver"),
            idNumber: extraerPorLabel("ID number"),
            phoneNumber: extraerPorLabel("Phone number"),
            bankName: extraerPorLabel("Bank name"),
            accountNumber: extraerPorLabel("Account number") || extraerPorLabel("Bank account number")
        };
    }

    // --- 3. UTILIDADES DE INYECCIÓN ---
    function buscarInputRecursivo(doc, selectores) {
        let el = null;
        for (let sel of selectores) {
            el = doc.querySelector(sel);
            if (el) break;
        }
        if (el) return el;
        const iframes = doc.querySelectorAll('iframe');
        for (let f of iframes) {
            try {
                const res = buscarInputRecursivo(f.contentDocument || f.contentWindow.document, selectores);
                if (res) return res;
            } catch (e) { }
        }
        return null;
    }

    function inyectarValor(input, valor) {
        if (input && valor) {
            input.focus();
            input.value = valor;
            ['input', 'change', 'blur', 'keyup'].forEach(e =>
                input.dispatchEvent(new Event(e, { bubbles: true }))
            );
        }
    }

    const bancosBinance = {
        "0134": "Banesco", "0102": "Banco de Venezuela", "0105": "Mercantil",
        "0108": "Provincial", "0172": "Bancamiga", "0114": "Bancaribe",
        "0191": "BNC", "0163": "Banco del Tesoro", "0138": "Banco Plaza"
    };

    function obtenerCodigoBanco(nombreBanco) {
        if (!nombreBanco) return null;
        const nombreBusqueda = nombreBanco.toUpperCase().trim();
        const entrada = Object.entries(bancosBinance).find(([codigo, nombre]) =>
            nombreBusqueda.includes(nombre.toUpperCase())
        );
        return entrada ? entrada[0] : null;
    }

    // --- 4. EL LISTENER MAESTRO ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "FILL_ALL_DATA") {
            const urlActual = window.location.href;

            // Buscamos qué adaptador coincide con la URL donde estamos parados
            const keyAdaptador = Object.keys(BANK_ADAPTERS).find(key =>
                urlActual.includes(BANK_ADAPTERS[key].domain)
            );

            if (!keyAdaptador) {
                console.warn("⚠️ No hay un adaptador configurado para este dominio bancario.");
                return;
            }

            const adaptador = BANK_ADAPTERS[keyAdaptador];

            // Objeto de herramientas para que el adaptador sea limpio
            const utils = {
                inyectar: (selectores, valor) => inyectarValor(buscarInputRecursivo(document, selectores), valor),
                buscar: (selectores) => buscarInputRecursivo(document, selectores),
                obtenerCodigo: (name) => obtenerCodigoBanco(name),
                procesarTelefono: (tel) => {
                    let limpio = tel.replace(/\D/g, '');
                    if (limpio.startsWith('58')) limpio = limpio.substring(2);
                    return { prefijo: limpio.substring(0, 4), numero7: limpio.slice(-7) };
                }
            };

            console.log(`🚀 Ejecutando Adaptador: ${keyAdaptador}`);
            adaptador.fill(request.data, utils);
        }
    });

    // --- 5. MONITOREO ---
    function gestionarRutaActual() {
        const url = window.location.href;
        const urlParams = new URLSearchParams(window.location.search);
        if (url.includes("fiatOrder") && urlParams.get('tab') === '1') ejecutarCapturaLista();
        else if (url.includes("fiatOrderDetail")) ejecutarCapturaDetalle(urlParams.get('orderNo'));
    }

    function iniciarMonitoreo() {
        if (intervalId) return;
        intervalId = setInterval(() => {
            chrome.storage.local.get(['isActive'], (result) => {
                if (result.isActive) gestionarRutaActual();
                else detenerMonitoreo();
            });
        }, POLLING_TIME);
    }

    function detenerMonitoreo() {
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
    }

    chrome.storage.local.get(['isActive'], (res) => { if (res.isActive) iniciarMonitoreo(); });
})();