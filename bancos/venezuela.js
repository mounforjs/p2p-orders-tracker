(function () {
    // 1. Datos de prueba (Simulando lo que vendría de tu extensión)
    const data = {
        cedula: "25123456",
        telefono: "04121234567",
        monto: "150.50",
        fullName: "Alex Developer",
        concepto: "Pago de servicios"
    };

    // 2. Mini-Utils para la prueba en consola
    const utils = {
        buscar: (selectors) => {
            for (const s of selectors) {
                const el = document.querySelector(s);
                if (el) return el;
            }
            return null;
        },
        inyectar: (selectors, valor) => {
            const el = utils.buscar(selectors);
            if (el) {
                el.value = valor;
                // Disparar eventos para que Angular se entere del cambio
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
                console.log(`%c[Fill] Inyectado en ${selectors[0]}: ${valor}`, "color: #2ecc71");
            } else {
                console.warn(`%c[Fill] No se encontró: ${selectors}`, "color: #e74c3c");
            }
        }
    };

    console.log("%c🚀 Iniciando prueba de auto-fill BDV...", "font-weight: bold; font-size: 14px;");

    // 3. Lógica principal
    const checkPagoNoRegistrado = utils.buscar(['mat-checkbox[formcontrolname="payRegister"]']);

    if (checkPagoNoRegistrado) {
        if (!checkPagoNoRegistrado.classList.contains('mat-checkbox-checked')) {
            const clickable = checkPagoNoRegistrado.querySelector('.mat-checkbox-layout') || checkPagoNoRegistrado;
            clickable.click();
            console.log("%c✅ Checkbox activado", "color: #f1c40f");
        } else {
            console.log("%cℹ️ Checkbox ya estaba activado", "color: #3498db");
        }
    }

    // Esperamos 500ms a que Angular muestre los campos ocultos
    setTimeout(() => {
        // Cédula
        utils.inyectar(['input[formcontrolname="document"]'], data.cedula);

        // Teléfono
        utils.inyectar(['input[formcontrolname="phone"]'], data.telefono);

        // Monto
        utils.inyectar(['input[formcontrolname="amount"]'], data.monto);

        // Concepto / Descripción
        utils.inyectar([
            'input[formcontrolname="description"]',
            'input[formcontrolname="concept"]'
        ], data.concepto || `Pago ${data.fullName.split(' ')[0]}`);

        console.log("%c🏁 Prueba finalizada", "font-weight: bold;");
    }, 500);
})();