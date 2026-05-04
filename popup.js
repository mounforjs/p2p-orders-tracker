document.addEventListener('DOMContentLoaded', () => {
  // --- 1. REFERENCIAS UI ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.content');

  // Tracker & Global Toggles
  const autoRunToggle = document.getElementById('autoRunToggle');
  const filterAmountInput = document.getElementById('filterAmount');
  const trackerDisplay = document.getElementById('data-display');
  const bcvToggle = document.getElementById('bcvCaptureToggle');
  const balanceToggle = document.getElementById('balanceMonitorToggle');
  const keepAliveToggle = document.getElementById('keepAliveToggle');
  const debugToggle = document.getElementById('debugToggle');

  // Bancos & Órdenes
  const tableBody = document.getElementById('tableBody');
  const totalDisplay = document.getElementById('total-display');
  const activeToggle = document.getElementById('activeToggle');
  const settingsContainer = document.getElementById('orderSettingsContainer');

  // --- 2. NAVEGACIÓN (TABS) ---
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      tabButtons.forEach(b => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
      if (target === 'data') renderTable();
    });
  });





  // --- 3. CARGA INICIAL INTEGRADA ---
  chrome.storage.local.get([
    'autoRun', 'p2p_stats', 'filterAmount', 'isActive',
    'totalFiatAmountFormated', 'savedOrders', 'bankBalances',
    'balanceMonitorActive', 'debugMode', 'keepAliveActive',
    'bcvCaptureActive', 'totalAmount', 'minLimit', 'maxLimit', 'centimosDebajo', 'minSpread', 'maxSpread',
  ], (res) => {
    // Toggles de estado
    if (autoRunToggle) autoRunToggle.checked = !!res.autoRun;
    if (activeToggle) activeToggle.checked = !!res.isActive;
    if (balanceToggle) balanceToggle.checked = !!res.balanceMonitorActive;
    if (keepAliveToggle) keepAliveToggle.checked = !!res.keepAliveActive;
    if (debugToggle) debugToggle.checked = !!res.debugMode;
    if (bcvToggle) {
      bcvToggle.checked = !!res.bcvCaptureActive;
      updateOrderUIStatus(res.bcvCaptureActive);
    }

    // Inputs de Texto/Número
    if (res.minSpread) document.getElementById('minSpread').value = res.minSpread;
    if (res.maxSpread) document.getElementById('maxSpread').value = res.maxSpread;
    if (res.filterAmount && filterAmountInput) filterAmountInput.value = res.filterAmount;
    if (res.totalAmount) document.getElementById('totalAmount').value = res.totalAmount;
    if (res.minLimit) document.getElementById('minLimit').value = res.minLimit;
    if (res.maxLimit) document.getElementById('maxLimit').value = res.maxLimit;
    if (res.centimosDebajo) document.getElementById('centimosDebajo').value = res.centimosDebajo;

    // UI Dinámica
    if (res.p2p_stats) updateTrackerUI(JSON.parse(res.p2p_stats));
    if (res.totalFiatAmountFormated) totalDisplay.innerText = res.totalFiatAmountFormated;
    if (res.bankBalances) updateBalancesUI(res.bankBalances);

    renderTable();


  });

  // --- 4. EVENTOS DE CONFIGURACIÓN (TRACKER & SISTEMA) ---
  autoRunToggle?.addEventListener('change', () => chrome.storage.local.set({ autoRun: autoRunToggle.checked }));
  activeToggle?.addEventListener('change', () => chrome.storage.local.set({ isActive: activeToggle.checked }));
  balanceToggle?.addEventListener('change', () => chrome.storage.local.set({ balanceMonitorActive: balanceToggle.checked }));
  keepAliveToggle?.addEventListener('change', () => chrome.storage.local.set({ keepAliveActive: keepAliveToggle.checked }));
  debugToggle?.addEventListener('change', () => chrome.storage.local.set({ debugMode: debugToggle.checked }));

  filterAmountInput?.addEventListener('input', (e) => chrome.storage.local.set({ filterAmount: e.target.value }));

  // --- 5. LÓGICA DE ÓRDENES (MONITOR) ---
  bcvToggle?.addEventListener('change', () => {
    const active = bcvToggle.checked;
    chrome.storage.local.set({ bcvCaptureActive: active });
    updateOrderUIStatus(active);
  });

  function updateOrderUIStatus(isActive) {
    if (!settingsContainer) return;
    settingsContainer.style.opacity = isActive ? "1" : "0.5";
    settingsContainer.style.pointerEvents = isActive ? "auto" : "none";
    settingsContainer.querySelectorAll('input, button').forEach(el => el.disabled = !isActive);
  }

  // --- DENTRO DE popup.js ---

  document.getElementById('saveOrderSettings').addEventListener('click', () => {
    // Capturamos todos los valores de los inputs
    const config = {
      minSpread: parseFloat(document.getElementById('minSpread').value),
      maxSpread: parseFloat(document.getElementById('maxSpread').value),
      maxOrdersCount: parseInt(document.getElementById('maxOrdersCount').value),
      maxFiatTotal: parseFloat(document.getElementById('maxFiatTotal').value),
      totalAmount: parseFloat(document.getElementById('totalAmount').value),
      minLimit: parseFloat(document.getElementById('minLimit').value),
      maxLimit: parseFloat(document.getElementById('maxLimit').value),
      centimosDebajo: parseFloat(document.getElementById('centimosDebajo').value)
    };

    // Guardamos todo el objeto en el storage
    chrome.storage.local.set(config, () => {
      // Feedback visual en el botón
      const btn = document.getElementById('saveOrderSettings');
      const originalText = btn.innerText;

      btn.innerText = "✅ ¡GUARDADO!";
      btn.style.background = "#218c53"; // Un verde más oscuro

      console.log("Configuración actualizada:", config);

      // Restauramos el botón tras 1.5 segundos
      setTimeout(() => {
        btn.innerText = originalText;
        btn.style.background = "#27ae60";
      }, 1500);
    });

  });

  // --- 6. FUNCIONES DE RENDERIZADO ---
  function updateTrackerUI(stats) {
    if (!trackerDisplay) return;
    trackerDisplay.innerHTML = `
            <p><span class="bold">Compra:</span> ${stats.sell_price}</p>
            <p><span class="bold">Venta:</span> ${stats.buy_price}</p>
            <p><span class="bold">Spread:</span> ${stats.spread_percent}%</p>
            <p style="color: #666; font-size: 9px;">Actualizado: ${stats.last_update}</p>
        `;
  }

  function updateBalancesUI(balances) {
    const container = document.getElementById('balances-container');
    if (!container) return;

    if (!balances || Object.keys(balances).length === 0) {
      container.innerHTML = `<div class="no-data">Esperando conexión...</div>`;
      return;
    }

    container.innerHTML = Object.entries(balances).map(([bankKey, data]) => {
      // Priorizamos el nombre que viene del storage, si no, usamos el fallback
      const name = data.bankName || bankKey.split('.')[1]?.toUpperCase() || bankKey;

      return `
            <div class="balance-item" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;">
                <span style="font-size:11px; font-weight:bold;">${name}</span>
                <div style="text-align:right;">
                    <span style="color:#27ae60; font-weight:bold;">${data.amount} VES</span>
                    <div style="font-size:9px; color:#999;">${data.lastUpdate}</div>
                </div>
            </div>`;
    }).join('');
  }

  function renderTable() {
    if (!tableBody) return;
    chrome.storage.local.get(['savedOrders'], (res) => {
      const orders = res.savedOrders || {};
      tableBody.innerHTML = '';
      const orderIds = Object.keys(orders).sort((a, b) => new Date(orders[b].ultimaActualizacion || orders[b].fecha) - new Date(orders[a].ultimaActualizacion || orders[a].fecha));

      document.getElementById('noDataMsg').style.display = orderIds.length === 0 ? 'block' : 'none';

      orderIds.forEach(id => {
        const o = orders[id];
        const cleanCedula = o.idNumber ? o.idNumber.toString().replace(/\D/g, '') : '---';
        const tr = document.createElement('tr');
        tr.innerHTML = `
                    <td class="col-order">...${id.slice(-6)}</td>
                    <td class="col-fiat">${o.fiatAmount}</td>
                    <td class="col-name">${o.fullName}</td>
                    <td class="col-info">${cleanCedula}</td>
                    <td class="col-phone">${o.phoneNumber || '---'}</td>
                    <td class="col-bank">${o.bankName}</td>
                    <td>
                        <button class="btn-action btn-fill">Fill</button>
                        <button class="btn-action btn-delete">X</button>
                    </td>`;
        tr.querySelector('.btn-fill').addEventListener('click', () => inyectarEnBanco(o));
        tr.querySelector('.btn-delete').addEventListener('click', () => eliminarRegistro(id));
        tableBody.appendChild(tr);
      });
    });
  }

  // --- 7. ACCIONES DE TABLA ---
  function inyectarEnBanco(order) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "FILL_ALL_DATA",
          data: { monto: order.fiatAmount, cedula: order.idNumber, telefono: order.phoneNumber, bankName: order.bankName, fullName: order.fullName }
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

  document.getElementById('clearDataBtn')?.addEventListener('click', () => {
    if (confirm("¿Borrar todos los registros?")) chrome.storage.local.remove(['savedOrders'], renderTable);
  });

  document.getElementById('testDataBtn')?.addEventListener('click', () => {
    const montoPrueba = 400.50; // Es mejor usar números reales para probar decimales

    chrome.storage.local.get(['savedOrders'], (res) => {
      let ordenesExistentes = res.savedOrders || {};

      for (let i = 0; i < 5; i++) {
        const id = "TEST_" + Date.now() + "_" + i;
        ordenesExistentes[id] = {
          id: id,
          fiatAmount: montoPrueba,
          monto: montoPrueba,
          bankName: "BANCO DE VENEZUELA", // Nombre que tu "obtenerCodigo" reconozca
          cedula: "25123456",            // Con letra para probar tu regex de limpieza
          telefono: "04121234567",        // Propiedad que faltaba
          fullName: `ORDEN PRUEBA ${i + 1}`,
          fecha: new Date().toLocaleString()
        };
      }

      chrome.storage.local.set({ savedOrders: ordenesExistentes }, () => {
        console.log("✅ Datos de prueba inyectados correctamente:", ordenesExistentes);
        alert("5 Órdenes de prueba inyectadas. Ahora puedes probar el auto-fill.");
      });
    });
  });

  // --- 8. ESCUCHA DE CAMBIOS REALTIME ---
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.p2p_stats) updateTrackerUI(JSON.parse(changes.p2p_stats.newValue));
    if (changes.bankBalances) updateBalancesUI(changes.bankBalances.newValue);
    if (changes.totalFiatAmountFormated) totalDisplay.innerText = changes.totalFiatAmountFormated.newValue;
    if (changes.savedOrders) renderTable();
  });

  chrome.storage.local.get(['minSpread', 'maxSpread'], (res) => {
    document.getElementById('minSpread').value = res.minSpread || 0.40;
    document.getElementById('maxSpread').value = res.maxSpread || 1.50;
  });





});