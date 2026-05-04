(function () {
    let consecutiveProfitable = 0;   // Contador para Online
    let consecutiveNonProfitable = 0; // Contador para Offline
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
                // 1. Activar el Checkbox de "Pago no registrado"
                // Usamos el formcontrolname que es lo más seguro en Angular
                const checkPagoNoRegistrado = utils.buscar([
                    'mat-checkbox[formcontrolname="payRegister"]',
                    '#mat-checkbox-1'
                ]);

                if (checkPagoNoRegistrado) {
                    // Verificamos si NO tiene la clase 'mat-checkbox-checked'
                    if (!checkPagoNoRegistrado.classList.contains('mat-checkbox-checked')) {
                        // Buscamos el label o el contenedor interno para el click
                        const clickable = checkPagoNoRegistrado.querySelector('.mat-checkbox-layout') || checkPagoNoRegistrado;
                        clickable.click();
                        console.log("%c✅ Checkbox 'Pago no registrado' activado", "color: #f1c40f");
                    }
                }

                // 2. Cédula (Documento)
                if (data.cedula) {
                    const cedulaSoloNumeros = data.cedula.toString().replace(/\D/g, '');
                    utils.inyectar(['input[formcontrolname="document"]'], cedulaSoloNumeros);
                }

                // 3. Teléfono (Phone)
                if (data.telefono) {
                    const telLimpio = data.telefono.toString().replace(/\D/g, '');
                    utils.inyectar(['input[formcontrolname="phone"]'], telLimpio);
                }

                // 4. Monto (Amount)
                if (data.monto) {
                    utils.inyectar(['input[formcontrolname="amount"]'], data.monto);
                }

                // 5. Concepto (Description)
                if (data.fullName || data.concepto) {
                    const nombreLimpio = data.fullName ? data.fullName.trim().split(' ')[0] : "";
                    const conceptoStr = data.concepto || `Pago ${nombreLimpio}`;
                    utils.inyectar([
                        'input[formcontrolname="description"]',
                        'input[formcontrolname="concept"]'
                    ], conceptoStr.substring(0, 40));
                }
            }
        },
        BANCAMIGA: {
            domain: 'bancamiga.com',
            fill: (data, utils) => {
                console.log("🚀 Iniciando adaptador Bancamiga (P2P)...");

                // 1. Selección de Cuenta Origen (Primera cuenta con saldo)
                const selectDesde = document.querySelector('select[name="desde"]');
                if (selectDesde && selectDesde.options.length > 1) {
                    selectDesde.selectedIndex = 1;
                    selectDesde.dispatchEvent(new Event('change', { bubbles: true }));
                }

                // 2. Lógica de Teléfono (Área + Número)
                const telfFull = (data.telefono || "").trim();
                if (telfFull.length >= 10) {
                    // Extraer 58412 / 58414 / etc.
                    const codigoAreaMatch = "58" + telfFull.substring(1, 4);
                    // Extraer los 7 dígitos finales
                    const numeroRestante = telfFull.substring(4);

                    // Seleccionar el código de área en el dropdown
                    const selectArea = document.querySelector('select[name="codigoArea"]');
                    if (selectArea) {
                        selectArea.value = codigoAreaMatch;
                        selectArea.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    // Inyectar los 7 dígitos en el campo específico numeroTelefono
                    utils.inyectarValor('input[name="numeroTelefono"]', numeroRestante);
                }

                // 3. Documento de Identidad (Cédula)
                utils.inyectarValor('input[name="docbeneficiario"]', data.cedula);

                // 4. Nombre del Beneficiario
                utils.inyectarValor('input[name="nombrebeneficiario"]', data.fullName);

                // 5. Monto (Conversión de punto a coma para el formato VES)
                const montoFormateado = data.monto.toString().replace('.', ',');
                utils.inyectarValor('input[name="monto"]', montoFormateado);

                // 6. Concepto / Motivo
                utils.inyectarValor('input[name="concepto"]', `Pago P2P ${data.fullName}`);

                // 7. Selección de Banco Destino
                const selectBanco = document.querySelector('select[name="banco"]');
                if (selectBanco && data.bankName) {
                    const opciones = Array.from(selectBanco.options);
                    const buscar = data.bankName.toUpperCase();
                    const encontrado = opciones.find(opt => opt.text.toUpperCase().includes(buscar));

                    if (encontrado) {
                        selectBanco.value = encontrado.value;
                        selectBanco.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`✅ Banco destino seleccionado: ${encontrado.text}`);
                    }
                }
            }
        }

    };


    /**
 * Obtiene el tipo de anuncio (BUY/SELL)
 * @returns {string|null} "BUY", "SELL" o null si no se encuentra
 */
    const obtenerTipoAnuncio = () => {
        // Usamos el selector que confirmaste que funciona
        const el = document.querySelector("#c2c_advDetail_price > div.css-lduul0 > div.css-13n52y");

        if (el) {
            const tipo = el.innerText.trim();
            // Log opcional para debug
            // console.log(`[DETECTOR] Tipo de anuncio: ${tipo}`);
            return tipo;
        }

        console.warn("⚠️ No se pudo detectar el tipo de anuncio. Verifica que estés en la página de edición.");
        return null;
    };


    // --- 2. LÓGICA DE TOTALIZACIÓN ---
    const actualizarTotalizador = () => {
        // 1. Detección de tipo con selector universal (clase-independiente)
        const obtenerTipoAnuncio = () => {
            const el = document.querySelector("#c2c_advDetail_price > div.css-lduul0 > div:first-child");
            return el ? el.innerText.trim() : null;
        };

        const adType = obtenerTipoAnuncio();
        if (!adType) return; // Si no hay tipo, no seguimos

        chrome.storage.local.get([
            'savedOrders', 'maxOrdersCount', 'maxFiatTotal', 'currentSpread',
            'isActive', 'minSpread', 'maxSpread'
        ], (result) => {
            if (!result.isActive) return;

            // --- 1. DATOS BASE ---
            const minConfig = parseFloat(result.minSpread) || 0.40;
            const maxConfig = parseFloat(result.maxSpread) || 1.50;
            const spreadActual = parseFloat(result.currentSpread) || 0;
            const limiteFiat = parseFloat(result.maxFiatTotal) || 0;
            const limiteOrdenes = parseInt(result.maxOrdersCount) || 0;
            const savedOrders = result.savedOrders || {};
            const listaOrdenes = Object.values(savedOrders);

            // --- 2. CÁLCULO DE FIAT ACUMULADO ---
            let totalFiat = 0;
            listaOrdenes.forEach(order => {
                let valor = order.fiatAmount;
                if (typeof valor === 'string') {
                    valor = valor.replace(/\./g, '').replace(',', '.');
                }
                let num = parseFloat(valor);
                if (!isNaN(num)) totalFiat += num;
            });

            // --- 3. EVALUACIÓN DE CONDICIONES ---
            const seguridadOk = (limiteFiat === 0 || totalFiat < limiteFiat) &&
                (limiteOrdenes === 0 || Object.keys(savedOrders).length < limiteOrdenes);

            const spreadEnRango = (spreadActual >= minConfig && spreadActual <= maxConfig);

            // --- 4. LÓGICA DE CONTADORES (HISTÉRESIS) ---
            if (spreadEnRango) {
                consecutiveProfitable++;
                consecutiveNonProfitable = 0;
            } else {
                consecutiveNonProfitable++;
                consecutiveProfitable = 0;
            }

            // --- 5. LOG COLORIDO DINÁMICO ---
            const colorSpread = spreadEnRango ? 'color: #27ae60;' : 'color: #ea3943;';
            const bgTipo = adType === 'SELL' ? 'background: #ea3943;' : 'background: #27ae60;';

            console.log(
                `%c[VIGILANTE]%c %c ${adType} %c Spread: %c${spreadActual}% %c(Rango: ${minConfig}-${maxConfig}) %c| %cON: ${consecutiveProfitable}/12 %c| %cOFF: ${consecutiveNonProfitable}/10`,
                // Estilos:
                "background: #1e2329; color: #f3ba2f; font-weight: bold; padding: 2px 5px; border-radius: 3px;", // [VIGILANTE]
                "color: transparent;", // Espaciador
                `${bgTipo} color: #fff; font-weight: bold; padding: 0 5px; border-radius: 2px;`, // BUY o SELL
                "color: #848e9c; margin-left: 5px;", // Spread:
                `${colorSpread} font-weight: bold; font-size: 12px;`, // Valor del spread
                "color: #5e6673; font-style: italic;", // (Rango)
                "color: #474d57;", // |
                "color: #27ae60; font-weight: bold;", // ON
                "color: #474d57;", // |
                "color: #ea3943; font-weight: bold;"  // OFF
            );

            // --- 6. TOMA DE DECISIÓN ---
            if (!seguridadOk) {
                ejecutarCambioEstadoVisual('Offline', "🛑 SEGURIDAD: Límite superado");
                consecutiveProfitable = 0;
                return;
            }

            if (consecutiveProfitable >= 3) {
                ejecutarCambioEstadoVisual('Online', `✅ ESTABLE: ${spreadActual}%`);
            }
            else if (consecutiveNonProfitable >= 4) {
                ejecutarCambioEstadoVisual('Offline', `❌ INESTABLE: ${spreadActual}%`);
            }
        });
    };

    /**
 * Interactúa con los selectores de Binance para cambiar entre Online y Offline.
 * @param {string} objetivo - 'Online' u 'Offline'
 * @param {string} motivo - Descripción para el log de la consola
 */
    function ejecutarCambioEstadoVisual(objetivo, motivo) {
        // 1. Localizamos todos los elementos con rol radio (los toggles de Binance)
        const opciones = Array.from(document.querySelectorAll('div[role="radio"]'));

        // 2. Buscamos el botón que contiene el texto deseado (Online u Offline)
        const boton = opciones.find(el =>
            el.innerText.trim().toLowerCase().includes(objetivo.toLowerCase())
        );

        if (boton) {
            // 3. Verificamos el estado actual usando el atributo aria-checked de Binance
            // Si el botón ya está seleccionado, no hacemos nada.
            const yaEstaActivo = boton.getAttribute('aria-checked') === 'true' ||
                boton.classList.contains('bn-radio-checked'); // Selector de respaldo

            if (!yaEstaActivo) {
                // 4. Ejecutamos el clic
                boton.click();

                // 5. Log con estilo para identificar fácilmente los cambios en consola
                const colorLog = objetivo === 'Online' ? '#00ff88' : '#ff5252';
                console.log(
                    `%c🔄 CAMBIO A ${objetivo.toUpperCase()}`,
                    `background: ${colorLog}; color: black; font-weight: bold; padding: 4px; border-radius: 4px;`,
                    `\nMotivo: ${motivo}`
                );

                // 6. Opcional: Disparar un evento de cambio para asegurar que React/Vue se enteren
                boton.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            // Log preventivo solo si estamos en la URL correcta y no aparece el botón
            if (window.location.href.includes("advEdit")) {
                console.warn(`⚠️ No se pudo encontrar el botón "${objetivo}". Verifica si la interfaz de Binance cambió.`);
            }
        }
    }

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
                inyectarValor: (selector, valor) => {
                    const el = document.querySelector(selector);
                    if (el) {
                        el.value = valor;
                        // Eventos necesarios para disparar validaciones de la web
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                        return true;
                    }
                    return false;
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
        //console.log("%c🚀 Estás en la página de edición de anuncios (advEdit)", "color: #ff9800; font-weight: bold;");
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
                if (result.isActive) {
                    // 1. Mantiene la lógica de rutas (si estás en /advEdit, etc.)
                    gestionarRutaActual();

                    // 2. NUEVO: Ejecuta la revisión de Spread y Seguridad siempre
                    // Solo si estamos en la página donde Binance permite los toggles
                    if (window.location.href.includes("advEdit")) {
                        actualizarTotalizador();
                    }
                } else {
                    detenerMonitoreo();
                }
            });
        }, POLLING_TIME);
    }

    function detenerMonitoreo() {
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
    }


    chrome.storage.local.get(['isActive'], (res) => { if (res.isActive) iniciarMonitoreo(); });
})();