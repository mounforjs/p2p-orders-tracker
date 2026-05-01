document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.getElementById('tableBody');
  const noDataMsg = document.getElementById('noDataMsg');
  const toggle = document.getElementById('activeToggle');
  const clearBtn = document.getElementById('clearDataBtn');
  const testDataBtn = document.getElementById('testDataBtn');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.content');
  const totalDisplay = document.getElementById('total-display'); // Referencia al total

  // --- 1. FUNCIÓN PARA REFRESCAR EL TOTAL ---
  const refreshTotalUI = () => {
    chrome.storage.local.get(['totalFiatAmountFormated'], (result) => {
      if (totalDisplay) {
        totalDisplay.innerText = result.totalFiatAmountFormated || "0,00";
      }
    });
  };

  // --- 2. NAVEGACIÓN DE PESTAÑAS ---
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

  // --- 3. CONFIGURACIÓN INICIAL ---
  chrome.storage.local.get(['isActive'], (res) => {
    toggle.checked = res.isActive || false;
  });

  toggle.addEventListener('change', () => {
    chrome.storage.local.set({ isActive: toggle.checked });
  });

  refreshTotalUI(); // Cargar total al abrir
  renderTable();    // Cargar tabla al abrir

  // --- 4. RENDERIZADO DE LA TABLA ---
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
        noDataMsg.style.display = 'block';
        return;
      }

      noDataMsg.style.display = 'none';

      orderIds.forEach(id => {
        const o = orders[id];
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="col-order">...${id.slice(-6)}</td>
          <td class="col-fiat">${o.fiatAmount || '-'}</td>
          <td class="col-name" title="${o.fullName || ''}">${o.fullName || '---'}</td>
          <td class="col-info">${o.idNumber || '---'}</td>
          <td class="col-info">${o.phoneNumber || '---'}</td>
          <td class="col-bank">${o.bankName || '---'}</td>
          <td>
            <button class="btn-action btn-fill">Fill in</button>
            <button class="btn-action btn-delete">X</button>
          </td>
        `;

        tr.querySelector('.btn-fill').addEventListener('click', () => inyectarTodo(o));
        tr.querySelector('.btn-delete').addEventListener('click', () => eliminarRegistro(id));
        tableBody.appendChild(tr);
      });
    });
  }

  // --- 5. ACCIONES ---
  function inyectarTodo(order) {
    if (!order.fiatAmount || order.fiatAmount === "0,00") return;
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
      chrome.storage.local.set({ savedOrders: orders }, () => {
        renderTable();
        // El total se actualizará solo gracias al listener de abajo
      });
    });
  }

  clearBtn.addEventListener('click', () => {
    if (confirm("¿Borrar todos los registros?")) {
      chrome.storage.local.remove(['savedOrders'], () => {
        renderTable();
      });
    }
  });

  // --- 6. DATOS DE PRUEBA ---
  if (testDataBtn) {
    testDataBtn.addEventListener('click', () => {
      const registrosPrueba = {
        "22883157140710199001": {
          orden: "22883157140710199001",
          fiatAmount: "1.500,50",
          fullName: "JUAN PEREZ",
          idNumber: "12345678",
          phoneNumber: "04121112233",
          bankName: "Banesco",
          estado: "Pending payment",
          fecha: new Date().toLocaleString()
        },
        "22883157140710199002": {
          orden: "22883157140710199002",
          fiatAmount: "420,00",
          fullName: "MARIA RODRIGUEZ",
          idNumber: "20999888",
          phoneNumber: "04245556677",
          bankName: "Banco de Venezuela",
          estado: "Pending payment",
          fecha: new Date().toLocaleString()
        }
      };

      chrome.storage.local.get(['savedOrders'], (res) => {
        const currentOrders = res.savedOrders || {};
        const updatedOrders = { ...currentOrders, ...registrosPrueba };
        chrome.storage.local.set({ savedOrders: updatedOrders }, renderTable);
      });
    });
  }

  // --- 7. ESCUCHAR CAMBIOS (IMPORTANTE) ---
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.totalFiatAmountFormated || changes.savedOrders) {
        refreshTotalUI();
      }
    }
  });

});