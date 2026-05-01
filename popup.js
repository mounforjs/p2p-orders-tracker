document.addEventListener('DOMContentLoaded', () => {
  // --- REFERENCIAS UI: NAVEGACIÓN ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.content');

  // --- REFERENCIAS UI: TRACKER ---
  const trackerDisplay = document.getElementById('data-display');
  const autoRunToggle = document.getElementById('autoRunToggle');
  const filterAmountInput = document.getElementById('filterAmount');

  // --- REFERENCIAS UI: BANCOS/ÓRDENES ---
  const tableBody = document.getElementById('tableBody');
  const noDataMsg = document.getElementById('noDataMsg');
  const activeToggle = document.getElementById('activeToggle');
  const totalDisplay = document.getElementById('total-display');
  const clearDataBtn = document.getElementById('clearDataBtn');
  const testDataBtn = document.getElementById('testDataBtn');

  // --- 1. LÓGICA DE PESTAÑAS ---
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      tabButtons.forEach(b => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
      if (target === 'data') renderTable(); // Renderizar tabla al entrar en la pestaña
    });
  });

  // --- 2. CARGA INICIAL Y ESTADOS ---
  chrome.storage.local.get([
    'autoRun',
    'p2p_stats',
    'filterAmount',
    'isActive',
    'totalFiatAmountFormated',
    'savedOrders'
  ], (res) => {
    // Estado Toggles
    if (autoRunToggle) autoRunToggle.checked = !!res.autoRun;
    if (activeToggle) activeToggle.checked = !!res.isActive;

    // Datos Tracker
    if (res.p2p_stats) updateTrackerUI(JSON.parse(res.p2p_stats));
    if (res.filterAmount && filterAmountInput) filterAmountInput.value = res.filterAmount;

    // Datos Bancos
    if (totalDisplay) totalDisplay.innerText = res.totalFiatAmountFormated || "0,00";
    renderTable();
  });

  // --- 3. EVENTOS DEL TRACKER ---
  if (autoRunToggle) {
    autoRunToggle.addEventListener('change', () => {
      chrome.storage.local.set({ autoRun: autoRunToggle.checked });
    });
  }

  if (filterAmountInput) {
    filterAmountInput.addEventListener('input', (e) => {
      chrome.storage.local.set({ filterAmount: e.target.value });
    });
  }

  function updateTrackerUI(stats) {
    if (!trackerDisplay) return;
    trackerDisplay.innerHTML = `
      <p><span class="bold">Compra:</span> ${stats.sell_price}</p>
      <p><span class="bold">Venta:</span> ${stats.buy_price}</p>
      <p><span class="bold">Spread:</span> ${stats.spread_percent}%</p>
      <p style="color: #666; font-size: 9px;">Actualizado: ${stats.last_update}</p>
    `;
  }

  // --- 4. EVENTOS DE BANCOS/ÓRDENES ---
  if (activeToggle) {
    activeToggle.addEventListener('change', () => {
      chrome.storage.local.set({ isActive: activeToggle.checked });
    });
  }

  // --- MODIFICACIÓN EN renderTable ---
  function renderTable() {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    chrome.storage.local.get(['savedOrders'], (res) => {
      const orders = res.savedOrders || {};
      const orderIds = Object.keys(orders).sort((a, b) => {
        const dateA = new Date(orders[a].ultimaActualizacion || orders[a].fecha);
        const dateB = new Date(orders[b].ultimaActualizacion || orders[b].fecha);
        return dateB - dateA;
      });

      if (orderIds.length === 0) {
        if (noDataMsg) noDataMsg.style.display = 'block';
        return;
      }

      if (noDataMsg) noDataMsg.style.display = 'none';

      orderIds.forEach(id => {
        const o = orders[id];

        // LIMPIEZA DE CÉDULA: Solo números
        const cleanCedula = o.idNumber ? o.idNumber.toString().replace(/\D/g, '') : '---';

        const tr = document.createElement('tr');
        tr.innerHTML = `
                <td class="col-order">...${id.slice(-6)}</td>
                <td class="col-fiat">${o.fiatAmount || '-'}</td>
                <td class="col-name" title="${o.fullName || ''}">${o.fullName || '---'}</td>
                <td class="col-info">${cleanCedula}</td> <!-- Cédula Limpia -->
                <td class="col-phone">${o.phoneNumber || '---'}</td> <!-- TELÉFONO AÑADIDO -->
                <td class="col-bank">${o.bankName || '---'}</td>
                <td>
                    <button class="btn-action btn-fill">Fill</button>
                    <button class="btn-action btn-delete">X</button>
                </td>
            `;

        tr.querySelector('.btn-fill').addEventListener('click', () => inyectarEnBanco(o));
        tr.querySelector('.btn-delete').addEventListener('click', () => eliminarRegistro(id));
        tableBody.appendChild(tr);
      });
    });
  }

  function inyectarEnBanco(order) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "FILL_ALL_DATA",
          data: {
            monto: order.fiatAmount,
            cedula: order.idNumber,
            telefono: order.phoneNumber,
            bankName: order.bankName,
            fullName: order.fullName
          }
        });
      }
    });
  }

  function eliminarRegistro(id) {
    chrome.storage.local.get(['savedOrders'], (res) => {
      const orders = res.savedOrders || {};
      delete orders[id];
      chrome.storage.local.set({ savedOrders: orders }, renderTable);
    });
  }

  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', () => {
      if (confirm("¿Borrar todos los registros?")) {
        chrome.storage.local.remove(['savedOrders'], renderTable);
      }
    });
  }

  // --- 5. ESCUCHA DE CAMBIOS EN TIEMPO REAL ---
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    // Si cambian los precios del Tracker
    if (changes.p2p_stats) {
      updateTrackerUI(JSON.parse(changes.p2p_stats.newValue));
    }

    // Si cambia el total de órdenes o la lista
    if (changes.totalFiatAmountFormated) {
      if (totalDisplay) totalDisplay.innerText = changes.totalFiatAmountFormated.newValue;
    }

    if (changes.savedOrders) {
      renderTable();
    }
  });

  // --- MODIFICACIÓN EN BOTÓN DE TEST (Con teléfono y cédula sucia para probar limpieza) ---
  if (testDataBtn) {
    testDataBtn.addEventListener('click', () => {
      const mockId = "TEST_" + Math.floor(Math.random() * 1000);
      const mock = {
        [mockId]: {
          fiatAmount: "1.500,00",
          fullName: "JOSE PEREZ",
          idNumber: "V-26.123.456", // Se limpiará al renderizar
          phoneNumber: "04121234567", // Teléfono incluido
          bankName: "Banesco",
          fecha: new Date().toLocaleString()
        }
      };
      chrome.storage.local.get(['savedOrders'], (res) => {
        const updated = { ...(res.savedOrders || {}), ...mock };
        chrome.storage.local.set({ savedOrders: updated });
      });
    });
  }

  // --- 1. FUNCIÓN PARA DIBUJAR LOS SALDOS ---
  function updateBalancesUI(balances) {
    const container = document.getElementById('balances-container');
    if (!container) return;

    // Si no hay datos, mostrar mensaje de espera
    if (!balances || Object.keys(balances).length === 0) {
      container.innerHTML = `<div class="no-data" style="padding:10px; font-size:12px;">Esperando conexión con el banco...</div>`;
      return;
    }

    // Generar el HTML para cada banco registrado
    container.innerHTML = Object.entries(balances).map(([bankKey, data]) => {
      // Limpiamos el nombre (ej: banesconline.com -> BANESCO)
      const name = bankKey.split('.')[0].toUpperCase().replace('ONLINE', '');

      return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                <span style="font-size: 11px; color: #848e9c; font-weight: bold;">${name}</span>
                <div style="text-align: right;">
                    <span style="color: #27ae60; font-weight: bold; font-size: 14px;">${data.amount}</span>
                    <span style="font-size: 10px; color: #27ae60; font-weight: bold;"> VES</span>
                    <div style="font-size: 9px; color: #999;">Ref: ${data.lastUpdate}</div>
                </div>
            </div>
        `;
    }).join('');
  }

  // --- 2. CARGA INICIAL (Dentro de tu chrome.storage.local.get existente) ---
  // Asegúrate de añadir 'bankBalances' a la lista de llaves que pides al inicio
  chrome.storage.local.get(['bankBalances', 'p2p_stats', 'savedOrders'], (res) => {
    if (res.bankBalances) {
      updateBalancesUI(res.bankBalances);
    }
    // ... resto de tus cargas iniciales
  });

  // --- 3. ESCUCHAR CAMBIOS EN TIEMPO REAL ---
  // Añade esto dentro de tu chrome.storage.onChanged.addListener
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.bankBalances) {
        console.log("Refrescando UI de saldos...");
        updateBalancesUI(changes.bankBalances.newValue);
      }
      // ... otros cambios (p2p_stats, savedOrders)
    }
  });


  // Dentro de DOMContentLoaded...

  const balanceToggle = document.getElementById('balanceMonitorToggle');
  const debugToggle = document.getElementById('debugToggle');

  // 1. Cargar estados iniciales
  chrome.storage.local.get(['balanceMonitorActive', 'debugMode'], (res) => {
    balanceToggle.checked = !!res.balanceMonitorActive;
    debugToggle.checked = !!res.debugMode;
  });

  // 2. Escuchar cambios
  balanceToggle.addEventListener('change', () => {
    chrome.storage.local.set({ balanceMonitorActive: balanceToggle.checked });
  });

  debugToggle.addEventListener('change', () => {
    chrome.storage.local.set({ debugMode: debugToggle.checked });
  });


  const keepAliveToggle = document.getElementById('keepAliveToggle');

  // Cargar estado inicial
  chrome.storage.local.get(['keepAliveActive'], (res) => {
    keepAliveToggle.checked = !!res.keepAliveActive;
  });

  // Guardar cambios
  keepAliveToggle.addEventListener('change', () => {
    chrome.storage.local.set({ keepAliveActive: keepAliveToggle.checked });
  });


  //TOGGLE ORDERS
  const bcvCaptureToggle = document.getElementById('bcvCaptureToggle');

  // 1. Cargar estado inicial desde el storage
  chrome.storage.local.get(['bcvCaptureActive'], (result) => {
    bcvCaptureToggle.checked = result.bcvCaptureActive || false;
  });

  // 2. Guardar cuando el usuario cambie el switch
  bcvCaptureToggle.addEventListener('change', () => {
    const estado = bcvCaptureToggle.checked;
    chrome.storage.local.set({ bcvCaptureActive: estado }, () => {
      console.log("Captura BCV establecida en:", estado);
    });
  });

});