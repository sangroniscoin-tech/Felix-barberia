// El service worker. Existe SOLO para recibir los avisos de reserva y
// cancelación y para abrir el panel al tocarlos.
//
// **No cachea nada, a propósito.** Un service worker que guarde la app volvería
// a servir precios y horarios viejos, y que nada de lo que ve el cliente salga
// de una copia guardada es una regla de este proyecto, no un detalle. Si algún
// día se quiere que la web funcione sin conexión, es su propia decisión.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Félix Barbería";
  // El cuerpo no lleva nombre ni teléfono: esto se pinta en la pantalla de
  // bloqueo, donde lo ve cualquiera que coja el teléfono.
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
    // Sin `tag`, para que dos reservas seguidas no se pisen la una a la otra.
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      // Si la web ya está abierta en alguna pestaña, esa misma pestaña tiene
      // que IR al destino, no sólo ponerse delante: antes se hacía `focus()` y
      // se quedaba donde estuviera, así que el aviso avisaba y no llevaba a
      // ninguna parte. Primero navegar, después enfocar.
      for (const c of list) {
        if (typeof c.navigate !== "function") continue;
        try {
          const navegada = (await c.navigate(url)) || c;
          if (navegada && "focus" in navegada) return navegada.focus();
          return;
        } catch {
          // Una ventana que este service worker no controla no acepta
          // `navigate`. Se abre una nueva, que sí se puede.
          break;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
