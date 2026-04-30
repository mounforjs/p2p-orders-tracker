document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.getElementById('tableBody');
  const noDataMsg = document.getElementById('noDataMsg');
  const toggle = document.getElementById('activeToggle');
  const clearBtn = document.getElementById('clearDataBtn');
  const testDataBtn = document.getElementById('testDataBtn'); // Asegúrate de tener este ID en tu HTML
  const tabButtons = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.content');

  // Navegación de pestañas
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

  // Toggle de activación del monitor
  chrome.storage.local.get(['isActive'], (res) => { toggle.checked = res.isActive || false; });
  toggle.addEventListener('change', () => { chrome.storage.local.set({ isActive: toggle.checked }); });

  // Borrar todo el historial
  clearBtn.addEventListener('click', () => {
    if (confirm("¿Borrar todos los registros?")) {
      chrome.storage.local.remove(['savedOrders'], renderTable);
    }
  });

  // Generar datos de prueba
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
          accountNumber: "01340001010001234567",
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
          accountNumber: "01020001010009876543",
          estado: "Pending payment",
          fecha: new Date().toLocaleString()
        },
        "22883157140710199003": {
          orden: "22883157140710199003",
          fiatAmount: "2.100,00",
          fullName: "JOSE GREGORIO HERNANDEZ",
          idNumber: "15666777",
          phoneNumber: "04149990011",
          bankName: "Mercantil",
          accountNumber: null,
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

  function renderTable() {
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

        // Acción de Inyectar Todo
        tr.querySelector('.btn-fill').addEventListener('click', () => {
          inyectarTodo(o);
        });

        tr.querySelector('.btn-delete').addEventListener('click', () => {
          eliminarRegistro(id);
        });

        tableBody.appendChild(tr);
      });
    });
  }

  // Función mejorada para enviar todos los datos a Banesco
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
            fullName: order.fullName // <--- IMPORTANTE: Asegúrate de enviar esto
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

  renderTable();
});