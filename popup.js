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

  function asignarEventosBotones() {
    // Botón Eliminar
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.onclick = (e) => {
        const id = e.target.dataset.id;
        chrome.storage.local.get(['savedOrders'], (result) => {
          let orders = result.savedOrders || {};
          delete orders[id];
          chrome.storage.local.set({ savedOrders: orders }, () => renderTable());
        });
      };
    });

    // Botón Copiar/Rellenar (Aquí puedes programar que rellene tu banco)
    document.querySelectorAll('.btn-fill').forEach(btn => {
      btn.onclick = (e) => {
        const id = e.target.dataset.id;
        alert("Datos de la orden " + id + " listos para procesar.");
        // Aquí podrías enviar un mensaje al content script para auto-rellenar
      };
    });
  }

  // --- Renderizado de la Tabla de Órdenes ---
  function renderTable() {

    const tableBody = document.getElementById('tableBody');
    const totalDisplay = document.getElementById('total-display');
    const noDataMsg = document.getElementById('noDataMsg');

    chrome.storage.local.get(['savedOrders'], (result) => {
      const orders = result.savedOrders || {};
      const orderKeys = Object.keys(orders);

      // 1. Resetear variables antes de empezar
      let acumuladoFiat = 0;
      tableBody.innerHTML = '';

      if (orderKeys.length === 0) {
        if (noDataMsg) noDataMsg.style.display = 'block';
        if (totalDisplay) totalDisplay.innerText = '0,00';
        return;
      }

      if (noDataMsg) noDataMsg.style.display = 'none';

      // 2. Ordenar las llaves por fecha
      const sortedKeys = orderKeys.sort((a, b) => {
        return new Date(orders[b].fecha || 0) - new Date(orders[a].fecha || 0);
      });

      // 3. Procesar cada orden
      sortedKeys.forEach(ordenId => {
        const order = orders[ordenId];

        // --- LIMPIEZA DE MONTO PARA EL TOTALIZADOR ---
        let montoLimpio = 0;
        if (order.fiatAmount) {
          // Convertimos a string por seguridad, quitamos puntos de miles y cambiamos coma por punto
          let strMonto = String(order.fiatAmount)
            .replace(/\./g, '')  // Quita puntos (1.500 -> 1500)
            .replace(',', '.');  // Cambia coma decimal por punto (1500,50 -> 1500.50)
          montoLimpio = parseFloat(strMonto) || 0;
        }

        // Sumar al total
        acumuladoFiat += montoLimpio;

        // --- RENDERIZADO DE LA FILA ---
        const isBuy = order.type === 'Buy' || order.type === 'Compra';
        const typeLabel = isBuy ? 'COMPRA' : 'VENTA';
        const typeColor = isBuy ? '#27ae60' : '#ea3943';
        const typeBg = isBuy ? '#eafff1' : '#fff1f0';

        const row = document.createElement('tr');
        row.innerHTML = `
                <td>
                    <span style="background:${typeBg}; color:${typeColor}; border:1px solid ${typeColor}; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:9px;">
                        ${typeLabel}
                    </span>
                </td>
                <td><span style="font-weight:bold">${order.orden || ordenId}</span></td>
                <td class="bold">${montoLimpio.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                <td>${order.fullName || '<span style="color:#999; font-style:italic">Esperando...</span>'}</td>
                <td>${order.idNumber || '-'}</td>
                <td>${order.phoneNumber || '-'}</td>
                <td style="font-size:10px">${order.bankName || '-'}</td>
                <td>
                    <button class="btn-action btn-delete" data-id="${ordenId}" style="background:#ff4d4f; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">✕</button>
                </td>
            `;
        tableBody.appendChild(row);
      });

      // 4. ACTUALIZAR TOTALIZADOR (FUERA DEL BUCLE)
      console.log("Suma final calculada:", acumuladoFiat); // Debug en consola
      if (totalDisplay) {
        totalDisplay.innerText = acumuladoFiat.toLocaleString('es-VE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }

      // 5. Re-vincular botones de eliminar
      document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.onclick = (e) => {
          const idParaBorrar = e.currentTarget.getAttribute('data-id');
          eliminarOrden(idParaBorrar);
        };
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

  document.getElementById('clearDataBtn').onclick = () => {
    if (confirm("¿Eliminar todas las órdenes capturadas?")) {
      chrome.storage.local.set({ savedOrders: {} }, () => renderTable());
    }
  };

  document.getElementById('testDataBtn')?.addEventListener('click', () => {
    chrome.storage.local.get(['savedOrders'], (res) => {
      let ordenesExistentes = res.savedOrders || {};

      for (let i = 0; i < 3; i++) {
        const tempId = "TEST_" + Math.floor(Math.random() * 1000);

        ordenesExistentes[tempId] = {
          orden: tempId,
          type: i % 2 === 0 ? "Buy" : "Sell",
          fiatAmount: "500.25", // Lo enviamos como String para simular captura real
          fullName: "Usuario de Prueba " + i,
          idNumber: "V12345678",
          phoneNumber: "04141234567",
          bankName: "MERCANTIL",
          fecha: new Date().toISOString()
        };
      }

      chrome.storage.local.set({ savedOrders: ordenesExistentes }, () => {
        renderTable(); // Forzamos actualización visual
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