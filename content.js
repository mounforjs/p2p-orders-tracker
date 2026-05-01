(function () {
    let intervalId = null;
    const POLLING_TIME = 3000;

    // --- 1. CONFIGURACIÓN DE ADAPTADORES POR BANCO ---
    // --- 1. CONFIGURACIÓN DE ADAPTADORES POR BANCO ---
    const BANK_ADAPTERS = {
        "BANESCO": {
            domain: "banesconline.com",
            fill: (data, utils) => {
                if (data.monto) utils.inyectar(['#monto'], data.monto);

                // LIMPIEZA FORZADA DE CÉDULA ANTES DE INYECTAR
                if (data.cedula) {
                    const cedulaSoloNumeros = data.cedula.toString().replace(/\D/g, '');
                    utils.inyectar(['#ced'], cedulaSoloNumeros);
                }

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
                    const selBanco = utils.buscar(['#banco', 'select[name="banco"]', 'select[id*="banco"]']);
                    if (selBanco && cod) {
                        selBanco.value = cod;
                        selBanco.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`%c🏦 Banco seleccionado: ${data.bankName} (${cod})`, "color: #00ff00");
                    } else {
                        console.warn("⚠️ No se encontró el select del banco o el código para:", data.bankName);
                    }
                }

                // 5. Concepto (Opcional)
                if (data.fullName) {
                    const nombreLimpio = data.fullName.trim().split(' ')[0];
                    utils.inyectar(['#concepto', 'input[name="concepto"]'], `Pago ${nombreLimpio}`);
                }
            }
        },
        "VENEZUELA": {
            domain: "bdvenlinea.banvenez.com",
            fill: (data, utils) => {
                if (data.monto) utils.inyectar(['#montoTransferencia'], data.monto);

                // LIMPIEZA FORZADA DE CÉDULA ANTES DE INYECTAR
                if (data.cedula) {
                    const cedulaSoloNumeros = data.cedula.toString().replace(/\D/g, '');
                    utils.inyectar(['#documentoIdentidad'], cedulaSoloNumeros);
                }
            }
        }
    };

    // --- 2. LÓGICA DE TOTALIZACIÓN ---
    const actualizarTotalizador = () => {
        chrome.storage.local.get(['savedOrders'], (result) => {
            const savedOrders = result.savedOrders || {};
            let total = 0;

            Object.values(savedOrders).forEach(order => {
                if (order.fiatAmount) {
                    // Convertimos "1.250,50" -> 1250.50 para sumar matemáticamente
                    let valorLimpio = order.fiatAmount.replace(/\./g, '').replace(',', '.');
                    let num = parseFloat(valorLimpio);
                    if (!isNaN(num)) total += num;
                }
            });

            chrome.storage.local.set({
                totalFiatAmount: total,
                totalFiatAmountFormated: total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            }, () => {
                console.log(`%c📊 Totalizador actualizado: ${total.toFixed(2)}`, "color: #00e5ff; font-weight: bold;");
            });
        });
    };

    // --- 3. LÓGICA DE CAPTURA (BINANCE) ---
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

    function ejecutarCapturaLista() {
        const rows = document.querySelectorAll('tr.bn-web-table-row');
        if (rows.length === 0) return;

        chrome.storage.local.get(['savedOrders'], (result) => {
            let savedOrders = result.savedOrders || {};
            let nuevas = 0;

            rows.forEach((row) => {
                const statusCell = row.querySelector('td[aria-colindex="6"]');
                const statusAnchor = statusCell ? statusCell.querySelector('a') : null;
                const statusText = statusAnchor ? statusAnchor.innerText.trim() : "";

                if (statusText === "Pending payment") {
                    const orderLink = row.querySelector('td[aria-colindex="2"] a');
                    const priceCell = row.querySelector('td[aria-colindex="3"] .text-PrimaryText');

                    if (orderLink && priceCell) {
                        const orderId = orderLink.innerText.trim();
                        if (!savedOrders[orderId]) {
                            savedOrders[orderId] = {
                                orden: orderId,
                                price: limpiarNumero(priceCell.innerText.trim()),
                                estado: statusText,
                                fecha: new Date().toLocaleString()
                            };
                            nuevas++;
                        }
                    }
                }
            });

            if (nuevas > 0) {
                chrome.storage.local.set({ savedOrders }, () => {
                    actualizarTotalizador();
                });
            }
        });
    }

    function ejecutarCapturaDetalle(orderNo) {
        if (!orderNo) return;
        const datos = extraerDatosDetalle();

        if (datos.fullName || datos.fiatAmount || datos.accountNumber) {
            chrome.storage.local.get(['savedOrders'], (result) => {
                let savedOrders = result.savedOrders || {};
                const orderData = savedOrders[orderNo] || {};

                const hayCambio = orderData.fullName !== datos.fullName ||
                    orderData.fiatAmount !== datos.fiatAmount ||
                    orderData.accountNumber !== datos.accountNumber;

                if (hayCambio) {
                    savedOrders[orderNo] = { ...orderData, ...datos, ultimaActualizacion: new Date().toLocaleString() };
                    chrome.storage.local.set({ savedOrders }, () => {
                        actualizarTotalizador();
                        console.table(savedOrders[orderNo]);
                    });
                }
            });
        }
    }

    // --- 4. UTILIDADES Y LISTENERS ---
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

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "FILL_ALL_DATA") {
            const urlActual = window.location.href;
            const keyAdaptador = Object.keys(BANK_ADAPTERS).find(key => urlActual.includes(BANK_ADAPTERS[key].domain));

            if (!keyAdaptador) return;

            const adaptador = BANK_ADAPTERS[keyAdaptador];
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
            adaptador.fill(request.data, utils);
        }
    });

    // Observer para recalcular total si se borran órdenes desde el popup u otra parte
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.savedOrders) {
            actualizarTotalizador();
        }
    });

    function gestionarRutaActual() {
        const url = window.location.href;
        const urlParams = new URLSearchParams(window.location.search);

        if (url.includes("fiatOrder") && urlParams.get('tab') === '1') {
            ejecutarCapturaLista();
        } else if (url.includes("fiatOrderDetail")) {
            ejecutarCapturaDetalle(urlParams.get('orderNo'));
        }
        // --- NUEVA CONDICIÓN ---
        else if (url.includes("advEdit")) {
            ejecutarLogicaAdvEdit();
        }
    }

    function extraerPrecioAdvEdit() {
        // 1. Buscamos todos los div que puedan contener la fórmula
        // Usamos el patrón que ya sabemos que funciona: el que tiene el '*' y el '%'
        const divs = Array.from(document.querySelectorAll('div'));
        const formulaNode = divs.find(el =>
            el.innerText.includes('*') &&
            el.innerText.includes('%') &&
            el.children.length === 0 // Nos aseguramos de que sea el nodo final de texto
        );

        if (formulaNode) {
            const texto = formulaNode.innerText.trim();
            // 2. Extraemos el primer grupo de números (incluyendo puntos)
            const match = texto.match(/^([\d.]+)/);

            if (match) {
                const valorExtraido = match[1];
                console.log(`%c🎯 Precio de Referencia: ${valorExtraido}`, "color: #f3ba2f; font-weight: bold;");
                return valorExtraido;
            }
        }
        console.warn("⚠️ No se encontró el nodo de la fórmula en esta vista.");
        return null;
    }

    function ejecutarLogicaAdvEdit() {
        console.log("%c🚀 Estás en la página de edición de anuncios (advEdit)", "color: #ff9800; font-weight: bold;");
        const precio = extraerPrecioAdvEdit();
        if (precio) {
            // Guardamos en storage para que otras partes de la extensión lo usen
            chrome.storage.local.set({ ultimoPrecioBCVReferencia: precio });
        }

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