// ===== SERVICE WORKER PARA NOTIFICACIONES UV =====
// 📁 Archivo: sw.js
// 📍 Ubicación: Guardar en la RAÍZ del proyecto (mismo nivel que index.html)

const CACHE_NAME = 'solarguard-v1';
const APP_VERSION = '1.0.0';

console.log(`🚀 Service Worker SolarGuard ${APP_VERSION} iniciando...`);

// Instalar Service Worker
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker instalado');
    self.skipWaiting();
});

// Activar Service Worker
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activado');
    event.waitUntil(self.clients.claim());
});

// Escuchar mensajes desde main.js
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_UV_NOTIFICATION') {
        const { uvIndex, threshold, level } = event.data;
        showUVNotification(uvIndex, threshold, level);
    }
});

// Mostrar notificación UV
function showUVNotification(uvIndex, threshold, level) {
    const title = getNotificationTitle(uvIndex);
    const body = getNotificationBody(uvIndex, threshold, level);
    const icon = getNotificationIcon(uvIndex);
    
    const options = {
        body: body,
        icon: icon,
        badge: 'https://img.icons8.com/fluency/96/sun.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: 'uv-alert',
        renotify: true,
        requireInteraction: true, // Permanece hasta que el usuario la cierre
        actions: [
            {
                action: 'view',
                title: '👁️ Ver Dashboard'
            },
            {
                action: 'dismiss',
                title: '✕ Cerrar'
            }
        ],
        data: {
            uvIndex: uvIndex,
            timestamp: Date.now()
        }
    };
    
    self.registration.showNotification(title, options);
}

// Obtener título según nivel UV
function getNotificationTitle(uv) {
    if (uv >= 11) return '☢️ PELIGRO EXTREMO UV';
    if (uv >= 8) return '🚨 ALERTA UV MUY ALTO';
    if (uv >= 6) return '⚠️ PRECAUCIÓN UV ALTO';
    return '💡 AVISO UV';
}

// Obtener mensaje según nivel
function getNotificationBody(uv, threshold, level) {
    const base = `Índice UV: ${uv.toFixed(1)} (${level})`;
    
    if (uv >= 11) {
        return `${base}\n\n☢️ NIVEL EXTREMO\n¡NO se exponga al sol! Riesgo crítico de daño cutáneo.`;
    }
    if (uv >= 8) {
        return `${base}\n\n🚨 PELIGRO\nEvite exposición solar. Use protección máxima.`;
    }
    if (uv >= 6) {
        return `${base}\n\n⚠️ ALTO\nUse protector solar SPF 50+, sombrero y gafas.`;
    }
    return `${base}\n\nSuperó su umbral configurado (${threshold.toFixed(1)})`;
}

// Obtener icono según nivel
function getNotificationIcon(uv) {
    if (uv >= 11) return 'https://img.icons8.com/emoji/96/radioactive.png';
    if (uv >= 8) return 'https://img.icons8.com/emoji/96/warning.png';
    if (uv >= 6) return 'https://img.icons8.com/emoji/96/sun.png';
    return 'https://img.icons8.com/fluency/96/sun.png';
}

// Manejar clicks en la notificación
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'view') {
        // Abrir o enfocar la app
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Manejar cierre de notificación
self.addEventListener('notificationclose', (event) => {
    console.log('🔕 Notificación cerrada por el usuario');
});