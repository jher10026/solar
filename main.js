// ===== VARIABLES GLOBALES =====
let chartDay, chartWeek, uvMap, heatCircle, locationMarker;
let fakeHistoricData = {};
let selectedDayData = null;
let userLocation = { lat: -13.6564, lng: -73.3873 }; // Andahuaylas por defecto
let lastDataTimestamp = null;
let connectionCheckInterval = null;
const ADMIN_USER = 'jhermy';
const ADMIN_PASS = 'jhermy2025';
const CONNECTION_TIMEOUT = 30000; // 30 segundos

// ===== CONFIGURACIÓN FIREBASE =====
const firebaseConfig = {
    apiKey: "AIzaSyCMcKmdqqKA6VPgOHaHfLyDqdBezH5pc3Y",
    authDomain: "solarguard-andahuaylas.firebaseapp.com",
    databaseURL: "https://solarguard-andahuaylas-default-rtdb.firebaseio.com",
    projectId: "solarguard-andahuaylas",
    storageBucket: "solarguard-andahuaylas.firebasestorage.app",
    messagingSenderId: "665309056619",
    appId: "1:665309056619:web:5b48b36c94df68b1442b2e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', function() {
    initCharts();
    initMap();
    startClock();
    setupTheme();
    startListeningToESP32();
    getUserLocation();
    startConnectionCheck();
});

// ===== VERIFICAR CONEXIÓN CADA SEGUNDO =====
function startConnectionCheck() {
    connectionCheckInterval = setInterval(() => {
        if (lastDataTimestamp) {
            const timeSinceLastData = Date.now() - lastDataTimestamp;
            if (timeSinceLastData > CONNECTION_TIMEOUT) {
                updateSensorStatus(false);
                updateUVAlert('offline');
            }
        }
    }, 1000);
}

// ===== OBTENER UBICACIÓN REAL CON ALTA PRECISIÓN =====
function getUserLocation() {
    if ("geolocation" in navigator) {
        console.log("📍 Solicitando ubicación GPS...");
        
        // Opciones para alta precisión
        const options = {
            enableHighAccuracy: true, // Alta precisión
            timeout: 10000, // 10 segundos
            maximumAge: 0 // No usar caché
        };
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                console.log("✅ Ubicación GPS obtenida:", userLocation);
                console.log(`📍 Latitud: ${userLocation.lat.toFixed(6)}`);
                console.log(`📍 Longitud: ${userLocation.lng.toFixed(6)}`);
                console.log(`🎯 Precisión: ${position.coords.accuracy.toFixed(0)} metros`);
                
                // Actualizar mapa con ubicación real
                if (uvMap) {
                    // Centrar mapa en ubicación exacta
                    uvMap.setView([userLocation.lat, userLocation.lng], 15);
                    
                    // Actualizar círculo de calor
                    if (heatCircle) {
                        heatCircle.setLatLng([userLocation.lat, userLocation.lng]);
                    }
                    
                    // Actualizar marcador de ubicación
                    if (locationMarker) {
                        locationMarker.setLatLng([userLocation.lat, userLocation.lng]);
                        locationMarker.openPopup();
                    }
                    
                    console.log("🗺️ Mapa actualizado con ubicación GPS");
                }
            },
            (error) => {
                console.warn("⚠️ Error de geolocalización:", error.message);
                console.log("📍 Usando ubicación por defecto: Andahuaylas");
                
                let errorMsg = '';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMsg = "Permiso de ubicación denegado";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMsg = "Ubicación no disponible";
                        break;
                    case error.TIMEOUT:
                        errorMsg = "Tiempo de espera agotado";
                        break;
                    default:
                        errorMsg = "Error desconocido";
                }
                console.log(`❌ ${errorMsg}`);
            },
            options
        );
    } else {
        console.log("❌ Geolocalización no soportada por el navegador");
        console.log("📍 Usando ubicación por defecto: Andahuaylas");
    }
}

// ===== ESCUCHAR DATOS DEL ESP32 =====
function startListeningToESP32() {
    console.log("📡 Conectando a Firebase...");
    
    db.ref('sensorData').on('value', (snapshot) => {
        const data = snapshot.val();
        
        if (data && data.uvIndex !== undefined) {
            console.log("✅ Datos recibidos:", data);
            lastDataTimestamp = Date.now();
            updateDashboard(data);
            updateSensorStatus(true);
        }
    }, (error) => {
        console.error("❌ Error al conectar:", error);
        updateSensorStatus(false);
    });

    db.ref('historic').on('value', (snapshot) => {
        const historicData = snapshot.val();
        if (historicData) {
            processHistoricData(historicData);
        }
    });
}

// ===== ACTUALIZAR DASHBOARD =====
function updateDashboard(data) {
    const uvIndex = data.uvIndex || 0;
    const lux = data.lux || 0;
    const nivel = data.uvLevel || "Desconocido";
    const timestamp = data.timestamp || Date.now();

    console.log(`🌡️ UV: ${uvIndex} (${nivel}) | 💡 Lux: ${lux}`);

    document.getElementById('uvValue').textContent = uvIndex.toFixed(1);
    document.getElementById('uvLevel').textContent = nivel;

    updateUVRing(uvIndex);
    updateHeatMapColor(uvIndex);
    updateUVAlert(uvIndex);

    document.getElementById('luxValue').textContent = Math.floor(lux);
    updateLightIcon(lux);
    updateLightDescription(lux);

    updateRecommendation(uvIndex);
    
    // 🚨 SISTEMA DE ALERTAS - Verificar niveles peligrosos
    checkDangerousUVLevels(uvIndex);

    saveRealDataToFirebase(uvIndex, lux, nivel, timestamp);
    addToLocalHistoric(uvIndex, lux, nivel, timestamp, true);

    updateChart24Hours();
    updateWeekChart();
    updateStats();
}

// ===== NUEVA: ACTUALIZAR ALERTA UV =====
function updateUVAlert(uvIndex) {
    const alertDiv = document.getElementById('uvAlert');
    
    if (uvIndex === 'offline') {
        alertDiv.textContent = '⚫ SENSOR APAGADO';
        alertDiv.style.background = 'linear-gradient(135deg, #95a5a6, #7f8c8d)';
        alertDiv.style.color = 'white';
        return;
    }
    
    if (uvIndex < 6) {
        alertDiv.textContent = '✅ RADIACIÓN SEGURA';
        alertDiv.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
        alertDiv.style.color = 'white';
    } else if (uvIndex < 8) {
        alertDiv.textContent = '⚠️ RADIACIÓN MODERADA';
        alertDiv.style.background = 'linear-gradient(135deg, #f39c12, #f1c40f)';
        alertDiv.style.color = 'white';
    } else {
        alertDiv.textContent = '🚨 RADIACIÓN PELIGROSA';
        alertDiv.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
        alertDiv.style.color = 'white';
    }
}

// ===== ACTUALIZAR ANILLO UV =====
// ✅ CÓDIGO CORREGIDO
function updateUVRing(uvIndex) {
    const ring = document.getElementById('uvRing');
    const maxUV = 15;
    const circumference = 2 * Math.PI * 90;
    const progress = (uvIndex / maxUV) * circumference;
    
    // ✅ AGREGAR ESTAS DOS LÍNEAS CRÍTICAS:
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference - progress;
    
    // Cambiar color según nivel UV
    if (uvIndex < 3) ring.style.stroke = '#27ae60';
    else if (uvIndex < 6) ring.style.stroke = '#f39c12';
    else if (uvIndex < 8) ring.style.stroke = '#e67e22';
    else if (uvIndex < 11) ring.style.stroke = '#e74c3c';
    else ring.style.stroke = '#8e44ad';
    
    console.log(`🎨 Anillo UV actualizado: ${uvIndex.toFixed(1)} - Color aplicado`);
}

// ===== ACTUALIZAR ICONO DE LUZ =====
function updateLightIcon(lux) {
    const icon = document.getElementById('lightIcon');
    if (lux < 50) icon.textContent = '🌙';
    else if (lux < 400) icon.textContent = '🌤️';
    else if (lux < 1000) icon.textContent = '⛅';
    else if (lux < 10000) icon.textContent = '☀️';
    else icon.textContent = '🔆';
}

// ===== DESCRIPCIÓN DE LUZ =====
function updateLightDescription(lux) {
    const desc = document.getElementById('lightDescription');
    if (lux < 50) desc.textContent = 'Noche/Muy oscuro';
    else if (lux < 400) desc.textContent = 'Crepúsculo/Interior';
    else if (lux < 1000) desc.textContent = 'Nublado';
    else if (lux < 10000) desc.textContent = 'Parcialmente nublado';
    else desc.textContent = 'Cielo despejado';
}

// ===== ACTUALIZAR RECOMENDACIÓN =====
function updateRecommendation(uvIndex) {
    const card = document.getElementById('recommendationCard');
    let text, className;
    
    if (uvIndex < 3) {
        text = 'Protección mínima. Disfruta del sol sin preocupaciones.';
        className = 'recom-green';
    } else if (uvIndex < 6) {
        text = 'Usa protector solar SPF 30+. Sombrero recomendado.';
        className = 'recom-yellow';
    } else if (uvIndex < 8) {
        text = '⚠️ Usar ropa protectora. Evita el sol entre 11AM-3PM.';
        className = 'recom-orange';
    } else if (uvIndex < 11) {
        text = '⚠️ EVITA la exposición solar. Busca sombra constantemente.';
        className = 'recom-red';
    } else {
        text = '🚨 PELIGRO EXTREMO. NO exponerse al sol.';
        className = 'recom-purple';
    }
    
    document.getElementById('recommendationText').textContent = text;
    card.className = `info-card ${className}`;
}

// ===== ESTADO DEL SENSOR (SOLO PUNTO) =====
function updateSensorStatus(isOnline) {
    const statusDot = document.getElementById('statusDot');
    
    if (isOnline) {
        statusDot.style.background = '#2ecc71';
        statusDot.style.boxShadow = '0 0 10px #2ecc71, 0 0 20px rgba(46, 204, 113, 0.5)';
    } else {
        statusDot.style.background = '#95a5a6';
        statusDot.style.boxShadow = 'none';
    }
    // ✅ AGREGAR ESTA LÍNEA:
    updateHeatMapColor('offline');
}

// ===== HISTÓRICO LOCAL =====
const localHistoric = {};

function addToLocalHistoric(uvIndex, lux, nivel, timestamp, isReal = false) {
    const now = new Date(timestamp);
    const date = now.toISOString().split('T')[0];
    const time = now.toLocaleTimeString('es-PE');
    
    if (!localHistoric[date]) {
        localHistoric[date] = {};
    }
    
    localHistoric[date][timestamp] = {
        uvIndex,
        lux,
        uvLevel: nivel,
        time,
        date,
        timestamp,
        isReal
    };
}

// ===== GUARDAR DATOS REALES EN FIREBASE (BORRAR TODO EL DÍA AL CONECTAR ESP32) =====
// ===== VARIABLE PARA CONTROLAR BORRADO DIARIO =====
let dayAlreadyCleared = {}; // {fecha: true/false}

// ===== FUNCIÓN HELPER: OBTENER DÍA DE LA SEMANA CORRECTO =====
function getCorrectDayOfWeek(dateString) {
    // Crear fecha desde string YYYY-MM-DD sin usar UTC
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getDay(); // 0=Domingo, 1=Lunes, ..., 6=Sábado
}

function getCorrectDate(offsetDays = 0) {
    // Obtener fecha actual en zona local
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

// ===== GUARDAR DATOS REALES EN FIREBASE (BORRAR TODO EL DÍA LA PRIMERA VEZ) =====
function saveRealDataToFirebase(uvIndex, lux, nivel, timestamp) {
    const now = new Date(timestamp);
    const date = now.toISOString().split('T')[0];
    const time = now.toLocaleTimeString('es-PE');
    
    const dataToSave = {
        uvIndex,
        lux,
        uvLevel: nivel,
        time,
        date,
        timestamp,
        isReal: true
    };
    
    // ✅ PRIMERO: Agregar a memoria local INMEDIATAMENTE
    if (!localHistoric[date]) {
        localHistoric[date] = {};
    }
    localHistoric[date][timestamp] = dataToSave;
    
    // ✅ ACTUALIZAR GRÁFICOS INMEDIATAMENTE (ANTES de borrar Firebase)
    updateChart24Hours();
    updateWeekChart();
    updateStats();
    
    // Verificar si ya borramos este día
    if (!dayAlreadyCleared[date]) {
        console.log(`🔄 PRIMERA CONEXIÓN del día ${date} - Borrando Firebase...`);
        
        // BORRAR Firebase
        db.ref(`historic/${date}`).remove()
            .then(() => {
                console.log(`✅ Día ${date} BORRADO en Firebase`);
                dayAlreadyCleared[date] = true;
                
                // Guardar dato en Firebase
                return db.ref(`historic/${date}/${timestamp}`).set(dataToSave);
            })
            .then(() => {
                console.log(`✅ Primer dato guardado: ${date} ${time}`);
            })
            .catch(error => {
                console.error('❌ Error:', error);
            });
    } else {
        // Ya borramos antes, solo guardar
        db.ref(`historic/${date}/${timestamp}`).set(dataToSave)
            .then(() => {
                console.log(`✅ Dato guardado: ${date} ${time}`);
            })
            .catch(error => {
                console.error('❌ Error guardando:', error);
            });
    }
}

// ===== GUARDAR DATO DESPUÉS DEL BORRADO =====


// ===== PROCESAR HISTÓRICO DESDE FIREBASE =====
function processHistoricData(historicData) {
    Object.entries(historicData).forEach(([date, dayData]) => {
        if (!localHistoric[date]) {
            localHistoric[date] = {};
        }
        Object.entries(dayData).forEach(([timestamp, record]) => {
            localHistoric[date][timestamp] = record;
        });
    });
    
    updateChart24Hours();
    updateWeekChart();
    updateStats();
}

// ===== GRÁFICO DE 24 HORAS =====
function updateChart24Hours() {
    // Obtener fecha de hoy en zona local (sin UTC)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;
    
    const todayData = localHistoric[todayDate] || {};
    
    const hourlyData = Array(24).fill(null);
    Object.values(todayData).forEach(r => {
        if (r.time) {
            const hour = parseInt(r.time.split(':')[0]);
            if (hour >= 0 && hour < 24) {
                if (hourlyData[hour] === null || r.uvIndex > hourlyData[hour]) {
                    hourlyData[hour] = r.uvIndex;
                }
            }
        }
    });
    
    if (chartDay) {
        chartDay.data.datasets[0].data = hourlyData;
        chartDay.options.plugins.title.text = '📅 Hoy - ' + today.toLocaleDateString('es-PE');
        chartDay.update();
    }
}

// ===== ACTUALIZAR GRÁFICO SEMANAL =====
function updateWeekChart() {
    const weekData = [];
    const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const labels = [];
    const dateLabels = [];
    const colors = [];
    
    // Obtener fecha de hoy en zona local
    const today = new Date();
    const todayDayOfWeek = today.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
    
    // Calcular cuántos días retroceder hasta el lunes
    const daysFromMonday = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
    
    // Generar los 7 días de la semana (Lun-Dom)
    for (let i = 0; i < 7; i++) {
        // Calcular fecha para cada día usando zona local
        const date = new Date(today);
        date.setDate(date.getDate() - daysFromMonday + i);
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const ds = `${year}-${month}-${day}`;
        
        const dayData = localHistoric[ds] || {};
        
        labels.push(dayNames[i]);
        dateLabels.push(ds);
        
        const uvValues = Object.values(dayData).map(r => r.uvIndex || 0);
        
        // Calcular PROMEDIO UV (en lugar de máximo)
        const avgUV = uvValues.length > 0 ? (uvValues.reduce((a, b) => a + b, 0) / uvValues.length) : 0;
        weekData.push(avgUV);
        
        // Color según PROMEDIO UV (escala de peligrosidad)
        if (avgUV < 3) {
            colors.push('#27ae60'); // Verde - Bajo (seguro)
        } else if (avgUV < 6) {
            colors.push('#f39c12'); // Amarillo - Moderado
        } else if (avgUV < 8) {
            colors.push('#e67e22'); // Naranja - Alto
        } else if (avgUV < 11) {
            colors.push('#e74c3c'); // Rojo - Muy Alto (peligroso)
        } else {
            colors.push('#8e44ad'); // Morado - Extremo (muy peligroso)
        }
    }
    
    if (chartWeek) {
        chartWeek.data.labels = labels;
        chartWeek.data.datasets[0].data = weekData;
        chartWeek.data.datasets[0].backgroundColor = colors;
        chartWeek.data.datasets[0].borderColor = colors.map(c => c);
        chartWeek.data.dateLabels = dateLabels;
        chartWeek.update();
    }
}

// ===== ACTUALIZAR ESTADÍSTICAS =====
function updateStats() {
    // Obtener fecha de hoy en zona local
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;
    
    const todayData = localHistoric[todayDate] || {};
    
    const todayUVs = Object.values(todayData).map(r => r.uvIndex || 0);
    if (todayUVs.length > 0) {
        const maxUV = Math.max(...todayUVs);
        const maxRecord = Object.values(todayData).find(r => r.uvIndex === maxUV);
        
        // ✅ MOSTRAR UV MÁXIMO EN TIEMPO REAL
        document.getElementById('maxUVToday').textContent = maxUV.toFixed(1);
        document.getElementById('peakTime').textContent = maxRecord ? maxRecord.time.substring(0, 5) : '--:--';
    } else {
        document.getElementById('maxUVToday').textContent = '--';
        document.getElementById('peakTime').textContent = '--:--';
    }

    const allUVs = [];
    Object.values(localHistoric).forEach(day => {
        Object.values(day).forEach(r => {
            if (r.uvIndex) allUVs.push(r.uvIndex);
        });
    });
    const weekAvg = allUVs.length > 0 ? (allUVs.reduce((a, b) => a + b, 0) / allUVs.length) : 0;
    document.getElementById('avgWeek').textContent = weekAvg > 0 ? weekAvg.toFixed(1) : '--';
}

// ===== INICIALIZAR GRÁFICAS CON MEJOR DISEÑO =====
function initCharts() {
    const hourLabels = Array.from({length: 24}, (_, i) => `${i}:00`);
    const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 50, 0.95)',
                titleColor: '#fff',
                bodyColor: '#fff',
                padding: 15,
                displayColors: false,
                borderColor: '#667eea',
                borderWidth: 2,
                titleFont: { size: 14, weight: 'bold' },
                bodyFont: { size: 13 },
                callbacks: {
                    label: function(context) {
                        return context.parsed.y !== null ? `UV: ${context.parsed.y.toFixed(1)}` : 'Sin datos';
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 15,
                grid: { 
                    color: 'rgba(102, 126, 234, 0.1)',
                    lineWidth: 1
                },
                ticks: { 
                    color: '#a0aec0', 
                    font: { size: 12, weight: '500' },
                    padding: 10
                }
            },
            x: {
                grid: { 
                    color: 'rgba(102, 126, 234, 0.05)',
                    lineWidth: 1
                },
                ticks: { 
                    color: '#a0aec0', 
                    font: { size: 11, weight: '500' },
                    padding: 8
                }
            }
        }
    };

    // Gráfico de 24 horas
    const ctxDay = document.getElementById('chartDay').getContext('2d');
    chartDay = new Chart(ctxDay, {
        type: 'line',
        data: {
            labels: hourLabels,
            datasets: [{
                label: 'Índice UV',
                data: Array(24).fill(null),
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.15)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 5,
                pointHoverRadius: 8,
                pointBackgroundColor: '#667eea',
                pointBorderColor: '#fff',
                pointBorderWidth: 3,
                pointHoverBackgroundColor: '#764ba2',
                pointHoverBorderColor: '#fff'
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                title: {
                    display: true,
                    text: '📅 Hoy',
                    color: '#e2e8f0',
                    font: { size: 16, weight: 'bold' },
                    padding: { top: 10, bottom: 20 }
                }
            }
        }
    });

    // Gráfico semanal con click
    const ctxWeek = document.getElementById('chartWeek').getContext('2d');
    chartWeek = new Chart(ctxWeek, {
        type: 'bar',
        data: {
            labels: dayLabels,
            datasets: [{
                label: 'UV Máximo',
                data: Array(7).fill(0),
                backgroundColor: '#764ba2',
                borderColor: '#667eea',
                borderWidth: 2,
                borderRadius: 10,
                hoverBackgroundColor: '#667eea',
                hoverBorderColor: '#764ba2',
                hoverBorderWidth: 3
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                title: {
                    display: true,
                    text: '📊 Esta Semana (Lunes - Domingo)',
                    color: '#e2e8f0',
                    font: { size: 16, weight: 'bold' },
                    padding: { top: 10, bottom: 20 }
                },
                tooltip: {
                    ...commonOptions.plugins.tooltip,
                    callbacks: {
                        label: function(context) {
                            return `UV Máximo: ${context.parsed.y.toFixed(1)}`;
                        },
                        afterLabel: function() {
                            return '👆 Click para ver 24 horas';
                        }
                    }
                }
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const date = chartWeek.data.dateLabels[index];
                    showDayDetails(date);
                }
            }
        }
    });
}

// ===== MOSTRAR DETALLES DEL DÍA =====
function showDayDetails(date) {
    const dayData = localHistoric[date] || {};
    
    if (Object.keys(dayData).length === 0) {
        alert(`❌ No hay datos para ${date}`);
        return;
    }
    
    const hourlyData = Array(24).fill(null);
    Object.values(dayData).forEach(r => {
        if (r.time) {
            const hour = parseInt(r.time.split(':')[0]);
            if (hour >= 0 && hour < 24) {
                if (hourlyData[hour] === null || r.uvIndex > hourlyData[hour]) {
                    hourlyData[hour] = r.uvIndex;
                }
            }
        }
    });
    
    if (chartDay) {
        chartDay.data.datasets[0].data = hourlyData;
        
        // FIX: Crear fecha correctamente sin desfase
        const [year, month, day] = date.split('-');
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        chartDay.options.plugins.title.text = '📅 ' + dateObj.toLocaleDateString('es-PE', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        chartDay.update();
        
        document.getElementById('chartDay').scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        const uvValues = hourlyData.filter(v => v !== null);
        const maxUV = uvValues.length > 0 ? Math.max(...uvValues).toFixed(1) : '0';
        const avgUV = uvValues.length > 0 ? (uvValues.reduce((a, b) => a + b, 0) / uvValues.length).toFixed(1) : '0';
        
        setTimeout(() => {
            alert(`📊 Datos de ${date}\n\n🔥 UV Máximo: ${maxUV}\n📊 UV Promedio: ${avgUV}\n📈 ${uvValues.length} registros horarios`);
        }, 500);
    }
}

// ===== INICIALIZAR MAPA CON MEJOR DISEÑO =====
function initMap() {
    uvMap = L.map('uvMap', {
        zoomControl: true,
        attributionControl: false
    }).setView([userLocation.lat, userLocation.lng], 15); // Zoom 15 para más detalle
    
    // Tile layer con mejor contraste
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(uvMap);
    
    // Círculo de calor - más visible
    heatCircle = L.circle([userLocation.lat, userLocation.lng], {
        color: '#27ae60',
        fillColor: '#27ae60',
        fillOpacity: 0.25,
        radius: 300,
        weight: 4
    }).addTo(uvMap);
    
    // Marcador de ubicación con animación
    const customIcon = L.divIcon({
        className: 'custom-location-marker',
        html: `<div style="
            background: linear-gradient(135deg, #667eea, #764ba2); 
            width: 24px; 
            height: 24px; 
            border-radius: 50%; 
            border: 4px solid white; 
            box-shadow: 0 0 15px rgba(102, 126, 234, 0.8), 0 0 30px rgba(102, 126, 234, 0.4);
            animation: pulse-marker 2s infinite;
        "></div>
        <style>
            @keyframes pulse-marker {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
        </style>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
    
    locationMarker = L.marker([userLocation.lat, userLocation.lng], { icon: customIcon })
        .addTo(uvMap)
        .bindPopup(`
            <div style="text-align: center; padding: 5px;">
                <b style="color: #667eea; font-size: 16px;">📍 Tu ubicación</b><br>
                <span style="font-size: 13px;">Monitoreando radiación UV</span><br>
                <small style="color: #a0aec0;">Lat: ${userLocation.lat.toFixed(6)}<br>Lng: ${userLocation.lng.toFixed(6)}</small>
            </div>
        `, {
            className: 'custom-popup',
            maxWidth: 250
        })
        .openPopup();
    
    console.log("🗺️ Mapa inicializado correctamente");
}

function updateHeatMapColor(uvIndex) {
    if (!heatCircle) return;
    
    let color, fillOpacity;

    // 🔴 SI ESTÁ OFFLINE
    if (uvIndex === 'offline') {
        color = '#95a5a6'; // Gris
        fillOpacity = 0.2;
        heatCircle.setStyle({
            color: color,
            fillColor: color,
            fillOpacity: fillOpacity,
            radius: 200,
            weight: 2
        });
        console.log('🗺️ Círculo de calor: OFFLINE (gris)');
        return;
    }
    
    if (uvIndex < 3) {
        color = '#27ae60'; // Verde
        fillOpacity = 0.25;
    } else if (uvIndex < 6) {
        color = '#f39c12'; // Amarillo
        fillOpacity = 0.3;
    } else if (uvIndex < 8) {
        color = '#e67e22'; // Naranja
        fillOpacity = 0.35;
    } else if (uvIndex < 11) {
        color = '#e74c3c'; // Rojo
        fillOpacity = 0.4;
    } else {
        color = '#8e44ad'; // Morado
        fillOpacity = 0.45;
    }
    
    heatCircle.setStyle({
        color: color,
        fillColor: color,
        fillOpacity: fillOpacity,
        radius: 300 + (uvIndex * 50),
        weight: 4
    });
    
    console.log(`🗺️ Círculo de calor actualizado: UV ${uvIndex} - Color: ${color}`);
}

// ===== RELOJ =====
function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('es-PE');
    document.getElementById('updateTime').textContent = time;
}

// ===== TEMA =====
function setupTheme() {
    const toggle = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');
    const logo = document.getElementById('careerLogo');
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    icon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
    if (logo) logo.style.filter = savedTheme === 'dark' ? 'invert(1)' : 'invert(0)';
    
    toggle.addEventListener('click', () => {
        const current = document.body.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        icon.textContent = newTheme === 'dark' ? '🌙' : '☀️';
        if (logo) logo.style.filter = newTheme === 'dark' ? 'invert(1)' : 'invert(0)';
    });
}

// ===== ENFERMEDADES =====
function toggleDisease(card) {
    const content = card.querySelector('.disease-content');
    const isActive = card.classList.contains('active');
    
    document.querySelectorAll('.disease-card').forEach(c => {
        c.classList.remove('active');
        c.querySelector('.disease-content').style.maxHeight = null;
        c.querySelector('.disease-toggle').textContent = '+';
    });
    
    if (!isActive) {
        card.classList.add('active');
        content.style.maxHeight = content.scrollHeight + 'px';
    }
    
    const toggle = card.querySelector('.disease-toggle');
    toggle.textContent = card.classList.contains('active') ? '−' : '+';
}

// ===== EXPORTAR CSV =====
function exportDataToCSV() {
    if (Object.keys(localHistoric).length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    let csv = 'Fecha,Hora,UV,Nivel,Lux\n';
    Object.entries(localHistoric).forEach(([date, day]) => {
        Object.values(day).forEach(r => {
            csv += `${date},${r.time},${r.uvIndex},${r.uvLevel},${r.lux}\n`;
        });
    });
    const blob = new Blob([csv], {type: 'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `solarguard_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

// ==================== ADMIN ====================
function openAdminLogin() {
    document.getElementById('adminLoginModal').style.display = 'flex';
    document.getElementById('adminUser').focus();
}

function closeAdminLogin() {
    document.getElementById('adminLoginModal').style.display = 'none';
    document.getElementById('loginError').textContent = '';
    document.getElementById('adminUser').value = '';
    document.getElementById('adminPass').value = '';
}

function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('adminUser').value;
    const pass = document.getElementById('adminPass').value;
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        closeAdminLogin();
        openAdminPanel();
    } else {
        document.getElementById('loginError').textContent = '✘ Credenciales incorrectas';
        document.getElementById('adminPass').value = '';
    }
}

function openAdminPanel() {
    document.getElementById('adminPanel').style.display = 'block';
    document.body.style.overflow = 'hidden';
    if (Object.keys(fakeHistoricData).length === 0) generateFakeData();
}

function logoutAdmin() {
    if (confirm('¿Cerrar sesión?')) {
        document.getElementById('adminPanel').style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// ===== GENERAR DATOS FICTICIOS =====
function generateFakeData() {
    fakeHistoricData = {};
    
    // Obtener fecha de hoy en zona local
    const today = new Date();
    const todayDayOfWeek = today.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
    const daysFromMonday = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
    
    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - daysFromMonday + i);
        
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const ds = `${year}-${month}-${day}`;
        
        fakeHistoricData[ds] = generateDayData(ds, d);
    }
    
    renderHistoricList();
}

function generateDayData(dateString, dateObj) {
    const records = {};
    
    for (let hour = 6; hour <= 18; hour++) {
        const timestamp = new Date(dateObj);
        timestamp.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
        const ts = timestamp.getTime();
        
        let uv;
        if (hour >= 11 && hour <= 15) {
            uv = 8 + Math.random() * 4;
        } else if (hour >= 9 && hour <= 17) {
            uv = 4 + Math.random() * 4;
        } else {
            uv = 1 + Math.random() * 3;
        }
        
        uv = parseFloat(uv.toFixed(1));
        
        records[ts] = {
            time: `${hour.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}:00`,
            uvIndex: uv,
            uvLevel: getUVLevelAdmin(uv),
            lux: Math.floor(1000 + Math.random() * 50000),
            date: dateString,
            timestamp: ts,
            isReal: false
        };
    }
    
    return records;
}

function getUVLevelAdmin(uv) {
    if (uv < 3) return 'Bajo';
    if (uv < 6) return 'Moderado';
    if (uv < 8) return 'Alto';
    if (uv < 11) return 'Muy Alto';
    return 'Extremo';
}

function renderHistoricList() {
    const list = document.getElementById('historicDataList');
    if (Object.keys(fakeHistoricData).length === 0) {
        list.innerHTML = '<p class="empty-message">Sin datos generados</p>';
        return;
    }
    
    // Obtener fecha de hoy en zona local
    const todayObj = new Date();
    const year = todayObj.getFullYear();
    const month = String(todayObj.getMonth() + 1).padStart(2, '0');
    const day = String(todayObj.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    
    const dates = Object.keys(fakeHistoricData).sort();
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    list.innerHTML = dates.map(date => {
        const dayData = fakeHistoricData[date];
        const recs = Object.values(dayData);
        const uvs = recs.map(r => r.uvIndex);
        const max = Math.max(...uvs).toFixed(1);
        const min = Math.min(...uvs).toFixed(1);
        const avg = (uvs.reduce((a, b) => a + b, 0) / uvs.length).toFixed(1);
        const isToday = date === today;
        
        // FIX: Crear fecha correctamente sin desfase
        const [year, month, dayNum] = date.split('-');
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(dayNum));
        const dayName = dayNames[dateObj.getDay()];
        
        // Color según UV promedio
        let bgColor = '';
        if (avg < 3) bgColor = 'rgba(39, 174, 96, 0.1)';
        else if (avg < 6) bgColor = 'rgba(243, 156, 18, 0.1)';
        else if (avg < 8) bgColor = 'rgba(230, 126, 34, 0.1)';
        else if (avg < 11) bgColor = 'rgba(231, 76, 60, 0.1)';
        else bgColor = 'rgba(142, 68, 173, 0.1)';
        
        return `<div class="historic-day-item" style="background: ${bgColor}; ${isToday ? 'border: 2px solid #667eea;' : ''}">
            <div class="historic-day-info">
                <h4>📅 ${dayName} ${date}${isToday ? ' <span style="color:#667eea;font-weight:bold;">(HOY)</span>' : ''}</h4>
                <div class="historic-stats">
                    <span>📊 ${recs.length} registros</span>
                    <span style="color: #e74c3c;">📈 Max: ${max}</span>
                    <span style="color: #27ae60;">📉 Min: ${min}</span>
                    <span style="color: #667eea;">⌀ ${avg}</span>
                </div>
            </div>
            <div class="historic-actions">
                <button class="btn-expand" onclick="viewDay('${date}')" title="Ver 24 horas">👁️</button>
                <button class="btn-edit" onclick="editDay('${date}')" title="Editar registros">✏️</button>
                <button class="btn-delete" onclick="deleteDay('${date}')" title="Eliminar día">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

function viewDay(date) {
    showDayDetails(date);
}

function deleteDay(date) {
    if (confirm(`⚠️ ¿Eliminar TODOS los datos de ${date}?\n\nEsto incluye:\n- Datos ficticios\n- Datos reales del ESP32\n- Registro de 24 horas\n- Se borrará de Firebase\n\n¿Continuar?`)) {
        console.log(`🗑️ Eliminando TODOS los datos de ${date}...`);
        
        // 1. Borrar de Firebase (IMPORTANTE: esto es permanente)
        db.ref(`historic/${date}`).remove()
            .then(() => {
                console.log(`✅ ${date} eliminado de Firebase`);
                
                // 2. Borrar de fakeHistoricData (memoria temporal)
                if (fakeHistoricData[date]) {
                    delete fakeHistoricData[date];
                    console.log(`✅ ${date} eliminado de datos ficticios`);
                }
                
                // 3. Borrar de localHistoric (memoria local)
                if (localHistoric[date]) {
                    delete localHistoric[date];
                    console.log(`✅ ${date} eliminado de histórico local`);
                }
                
                // 4. Si es hoy, limpiar gráfico de 24h
                const today = new Date().toISOString().split('T')[0];
                if (date === today) {
                    if (chartDay) {
                        chartDay.data.datasets[0].data = Array(24).fill(null);
                        chartDay.options.plugins.title.text = '📅 Hoy - Sin datos';
                        chartDay.update();
                        console.log(`📊 Gráfico de 24h limpiado`);
                    }
                    
                    // Resetear bandera para permitir nuevo borrado cuando conecte ESP32
                    dayAlreadyCleared[date] = false;
                    console.log(`🔄 Bandera reseteada para ${date}`);
                }
                
                // 5. Actualizar lista visual del admin
                renderHistoricList();
                
                // 6. Actualizar TODOS los gráficos
                updateChart24Hours();
                updateWeekChart();
                updateStats();
                
                console.log(`✅ ${date} COMPLETAMENTE ELIMINADO`);
                alert(`✅ Todos los datos de ${date} han sido eliminados\n\n📊 Gráficos actualizados\n🔥 Firebase limpiado`);
            })
            .catch((error) => {
                console.error(`❌ Error eliminando ${date} de Firebase:`, error);
                alert(`❌ Error al eliminar: ${error.message}`);
            });
    }
}

// ===== APLICAR DATOS A GRÁFICAS =====
function applyToCharts() {
    if (Object.keys(fakeHistoricData).length === 0) {
        alert('❌ Primero genera datos con el botón "📄 Generar Datos"');
        return;
    }

    Object.entries(fakeHistoricData).forEach(([date, dayData]) => {
        localHistoric[date] = { ...dayData };
        console.log(`📋 Datos cargados: ${date} (${Object.keys(dayData).length} registros)`);
    });

    saveFakeDataToFirebase();

    updateChart24Hours();
    updateWeekChart();
    updateStats();

    showNotification('✅ Datos aplicados correctamente a las gráficas');
    
    alert('✅ ¡Datos aplicados con éxito!\n\n📊 Los gráficos han sido actualizados\n👆 Haz click en cualquier día de la semana para ver sus 24 horas');
}

function saveFakeDataToFirebase() {
    Object.entries(fakeHistoricData).forEach(([date, dayData]) => {
        db.ref(`historic/${date}`).set(dayData)
            .then(() => console.log(`✅ ${date} guardado en Firebase`))
            .catch(error => console.error(`❌ Error guardando ${date}:`, error));
    });
}

function clearAllData() {
    if (confirm('⚠️ ¿Eliminar TODOS los datos generados?\n\nEsto también limpiará las gráficas.')) {
        fakeHistoricData = {};
        renderHistoricList();
        
        if (chartDay) {
            chartDay.data.datasets[0].data = Array(24).fill(null);
            chartDay.options.plugins.title.text = '📅 Hoy';
            chartDay.update();
        }
        if (chartWeek) {
            chartWeek.data.datasets[0].data = Array(7).fill(0);
            chartWeek.update();
        }
        
        document.getElementById('maxUVToday').textContent = '--';
        document.getElementById('peakTime').textContent = '--:--';
        document.getElementById('avgWeek').textContent = '--';
        
        alert('🗑️ Datos eliminados correctamente');
    }
}

function showNotification(message) {
    const notice = document.getElementById('updateNotice');
    notice.textContent = message;
    notice.style.display = 'block';
    
    setTimeout(() => {
        notice.style.display = 'none';
    }, 3000);
}

// ==================== SISTEMA DE ALERTAS UV CONFIGURABLE ====================

let alertsEnabled = true;
let alertThreshold = 8; // Nivel UV mínimo para alertar (por defecto 8)
let lastAlertUV = null;

// ===== INICIALIZAR SISTEMA DE ALERTAS =====
function initAlertSystem() {
    // Cargar configuración guardada
    const savedState = localStorage.getItem('alertsEnabled');
    const savedThreshold = localStorage.getItem('alertThreshold');
    
    if (savedState !== null) {
        alertsEnabled = savedState === 'true';
    }
    
    if (savedThreshold !== null) {
        alertThreshold = parseFloat(savedThreshold);
    }
    
    // Actualizar botón visual
    updateAlertButton();
    
    // Actualizar slider en el modal
    const slider = document.getElementById('alertThresholdSlider');
    const value = document.getElementById('alertThresholdValue');
    if (slider && value) {
        slider.value = alertThreshold;
        value.textContent = alertThreshold.toFixed(1);
        updateThresholdColor(alertThreshold);
    }
    
    console.log(`🔔 Sistema de alertas: ${alertsEnabled ? 'ACTIVADO' : 'DESACTIVADO'}`);
    console.log(`⚙️ Umbral de alerta: UV ${alertThreshold}`);
}

// ===== ABRIR MODAL DE CONFIGURACIÓN =====
function openAlertSettings() {
    const modal = document.getElementById('alertSettingsModal');
    const slider = document.getElementById('alertThresholdSlider');
    const value = document.getElementById('alertThresholdValue');
    const toggle = document.getElementById('alertEnabledToggle');
    
    // Cargar valores actuales
    slider.value = alertThreshold;
    value.textContent = alertThreshold.toFixed(1);
    toggle.checked = alertsEnabled;
    
    updateThresholdColor(alertThreshold);
    updatePreviewAlert(alertThreshold);
    
    modal.classList.add('active');
    console.log('⚙️ Modal de configuración abierto');
}

// ===== CERRAR MODAL =====
function closeAlertSettings() {
    const modal = document.getElementById('alertSettingsModal');
    modal.classList.remove('active');
}

// ===== ACTUALIZAR SLIDER EN TIEMPO REAL =====
function updateAlertThreshold(value) {
    const valueDisplay = document.getElementById('alertThresholdValue');
    valueDisplay.textContent = parseFloat(value).toFixed(1);
    
    updateThresholdColor(value);
    updatePreviewAlert(value);
}

// ===== ACTUALIZAR COLOR DEL SLIDER SEGÚN NIVEL =====
function updateThresholdColor(uv) {
    const slider = document.getElementById('alertThresholdSlider');
    let color;
    
    if (uv < 3) color = '#27ae60';
    else if (uv < 6) color = '#f39c12';
    else if (uv < 8) color = '#e67e22';
    else if (uv < 11) color = '#e74c3c';
    else color = '#8e44ad';
    
    slider.style.setProperty('--slider-color', color);
}

// ===== VISTA PREVIA DE ALERTA =====
function updatePreviewAlert(uv) {
    const preview = document.getElementById('alertPreview');
    
    let alertClass = '';
    let alertTitle = '';
    let alertMessage = '';
    
    if (uv < 6) {
        alertClass = 'safe';
        alertTitle = '✅ RADIACIÓN SEGURA';
        alertMessage = 'No se mostrarán alertas a este nivel';
    } else if (uv < 8) {
        alertClass = 'moderate';
        alertTitle = '⚠️ RADIACIÓN MODERADA';
        alertMessage = 'Alerta de precaución - Usar protección solar';
    } else if (uv < 11) {
        alertClass = 'dangerous';
        alertTitle = '🚨 PELIGRO UV ALTO';
        alertMessage = '¡Radiación UV peligrosa! Evite la exposición solar';
    } else {
        alertClass = 'extreme';
        alertTitle = '☢️ PELIGRO EXTREMO';
        alertMessage = '¡NIVEL UV EXTREMO! NO se exponga al sol';
    }
    
    preview.className = `alert-preview ${alertClass}`;
    preview.innerHTML = `
        <div class="alert-icon">🚨</div>
        <div class="alert-content">
            <div class="alert-title">${alertTitle}</div>
            <div class="alert-message">${alertMessage}</div>
            <div class="alert-uv-value">☀️ UV: ${parseFloat(uv).toFixed(1)}</div>
        </div>
    `;
}

// ===== GUARDAR CONFIGURACIÓN =====
function saveAlertSettings() {
    const slider = document.getElementById('alertThresholdSlider');
    const toggle = document.getElementById('alertEnabledToggle');
    
    const newThreshold = parseFloat(slider.value);
    const newEnabled = toggle.checked;
    
    // Guardar en localStorage
    localStorage.setItem('alertThreshold', newThreshold);
    localStorage.setItem('alertsEnabled', newEnabled);
    
    // Actualizar variables globales
    alertThreshold = newThreshold;
    alertsEnabled = newEnabled;
    
    // Actualizar botón principal
    updateAlertButton();
    
    console.log(`💾 Configuración guardada: UV ${newThreshold} | ${newEnabled ? 'Activado' : 'Desactivado'}`);
    
    // 🔥 CERRAR MODAL
    // 🔥 CERRAR MODAL
    const modal = document.getElementById('alertSettingsModal');
    modal.classList.remove('active');
    
    // 🔥 MOSTRAR NOTIFICACIÓN (con delay)
    setTimeout(() => {
        showTemporaryNotification(
            '✅ Configuración guardada',
            `Alertas ${newEnabled ? 'activadas' : 'desactivadas'} a partir de UV ${newThreshold.toFixed(1)}`,
            'success'
        );
    }, 300);
}

// ===== ALTERNAR ESTADO DE ALERTAS (BOTÓN RÁPIDO) =====
function toggleAlerts() {
    if (alertsEnabled) {
        if (confirm('⚠️ ¿Desactivar alertas UV?\n\nNo recibirás notificaciones cuando se detecten niveles peligrosos.\n\n¿Estás seguro?')) {
            alertsEnabled = false;
            localStorage.setItem('alertsEnabled', 'false');
            updateAlertButton();
            showTemporaryNotification('🔕 Alertas desactivadas', 'No recibirás notificaciones de UV peligroso', 'info');
        }
    } else {
        alertsEnabled = true;
        localStorage.setItem('alertsEnabled', 'true');
        updateAlertButton();
        showTemporaryNotification('🔔 Alertas activadas', `Recibirás notificaciones a partir de UV ${alertThreshold.toFixed(1)}`, 'success');
    }
}

// ===== ACTUALIZAR BOTÓN VISUAL =====
function updateAlertButton() {
    const btn = document.getElementById('alertToggleBtn');
    const icon = document.getElementById('alertIcon');
    
    if (alertsEnabled) {
        btn.classList.add('active');
        btn.classList.remove('inactive');
        icon.textContent = '🔔';
        btn.title = `Alertas activadas (UV ≥ ${alertThreshold.toFixed(1)}) - Click para configurar`;
    } else {
        btn.classList.add('inactive');
        btn.classList.remove('active');
        icon.textContent = '🔕';
        btn.title = 'Alertas desactivadas - Click para configurar';
    }
}

// ===== VERIFICAR NIVELES PELIGROSOS (MODIFICADO) =====
function checkDangerousUVLevels(uvIndex) {
    // Solo alertar si está activado y supera el umbral
    if (!alertsEnabled) {
        console.log(`🔕 Alerta bloqueada (UV ${uvIndex.toFixed(1)}) - Sistema desactivado`);
        return;
    }
    
    if (uvIndex < alertThreshold) {
        // Resetear cuando baja del umbral
        lastAlertUV = null;
        return;
    }
    
    // Evitar alertas repetitivas (solo si el UV cambió significativamente)
    if (lastAlertUV === null || Math.abs(uvIndex - lastAlertUV) >= 1) {
        lastAlertUV = uvIndex;
        showUVAlert(uvIndex);
        playAlertSound();
        console.log(`🚨 ALERTA ACTIVADA: UV ${uvIndex.toFixed(1)} (umbral: ${alertThreshold})`);
    }
}

// ===== MOSTRAR ALERTA VISUAL =====
function showUVAlert(uvIndex) {
    const container = document.getElementById('alertContainer');
    
    let alertClass = 'dangerous';
    let alertTitle = '🚨 PELIGRO UV ALTO';
    let alertMessage = '¡Radiación UV peligrosa detectada! Evite la exposición solar.';
    
    if (uvIndex >= 11) {
        alertClass = 'extreme';
        alertTitle = '☢️ PELIGRO EXTREMO';
        alertMessage = '¡NIVEL UV EXTREMO! NO se exponga al sol bajo ninguna circunstancia.';
    } else if (uvIndex >= 8) {
        alertClass = 'dangerous';
        alertTitle = '🚨 PELIGRO UV ALTO';
        alertMessage = '¡Radiación UV peligrosa! Use protección máxima y evite exposición prolongada.';
    } else if (uvIndex >= 6) {
        alertClass = 'moderate';
        alertTitle = '⚠️ PRECAUCIÓN UV MODERADO';
        alertMessage = 'Nivel UV elevado. Use protector solar SPF 30+ y sombrero.';
    }
    
    const now = new Date();
    const time = now.toLocaleTimeString('es-PE');
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `uv-alert-notification ${alertClass}`;
    alertDiv.innerHTML = `
        <div class="alert-icon">🚨</div>
        <div class="alert-content">
            <div class="alert-title">${alertTitle}</div>
            <div class="alert-message">${alertMessage}</div>
            <div class="alert-uv-value">☀️ UV: ${uvIndex.toFixed(1)}</div>
            <div class="alert-time">🕐 ${time}</div>
        </div>
        <button class="alert-close" onclick="closeAlert(this)">✕</button>
    `;
    
    container.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentElement) {
            alertDiv.style.animation = 'slideOutRight 0.5s ease';
            setTimeout(() => {
                if (alertDiv.parentElement) {
                    alertDiv.remove();
                }
            }, 500);
        }
    }, 15000);
    
    const alerts = container.querySelectorAll('.uv-alert-notification');
    if (alerts.length > 3) {
        alerts[0].remove();
    }
}

// ===== CERRAR ALERTA =====
function closeAlert(button) {
    const alert = button.closest('.uv-alert-notification');
    alert.style.animation = 'slideOutRight 0.5s ease';
    setTimeout(() => alert.remove(), 500);
}

// ===== REPRODUCIR SONIDO =====
function playAlertSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
        
        setTimeout(() => {
            const oscillator2 = audioContext.createOscillator();
            const gainNode2 = audioContext.createGain();
            
            oscillator2.connect(gainNode2);
            gainNode2.connect(audioContext.destination);
            
            oscillator2.frequency.value = 1000;
            oscillator2.type = 'sine';
            gainNode2.gain.value = 0.3;
            
            oscillator2.start(audioContext.currentTime);
            oscillator2.stop(audioContext.currentTime + 0.2);
        }, 300);
    } catch (error) {
        console.log('⚠️ No se pudo reproducir sonido:', error.message);
    }
}

// ===== MOSTRAR NOTIFICACIÓN TEMPORAL =====
function showTemporaryNotification(title, message, type) {
    const container = document.getElementById('alertContainer');
    
    let bgColor = 'linear-gradient(135deg, #3498db, #2980b9)';
    if (type === 'success') bgColor = 'linear-gradient(135deg, #2ecc71, #27ae60)';
    
    const notif = document.createElement('div');
    notif.className = 'uv-alert-notification';
    notif.style.background = bgColor;
    notif.innerHTML = `
        <div class="alert-icon">${type === 'success' ? '✅' : 'ℹ️'}</div>
        <div class="alert-content">
            <div class="alert-title">${title}</div>
            <div class="alert-message">${message}</div>
        </div>
        <button class="alert-close" onclick="closeAlert(this)">✕</button>
    `;
    
    container.appendChild(notif);
    
    setTimeout(() => {
        if (notif.parentElement) {
            notif.style.animation = 'slideOutRight 0.5s ease';
            setTimeout(() => {
                if (notif.parentElement) notif.remove();
            }, 500);
        }
    }, 4000);
}

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        initAlertSystem();
    }, 100);
});

// ===== RESETEAR BANDERA DE BORRADO A MEDIANOCHE =====
function resetDailyClearFlag() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const timeUntilMidnight = tomorrow - now;
    
    setTimeout(() => {
        console.log('🌙 MEDIANOCHE - Reseteando banderas de borrado');
        dayAlreadyCleared = {};
        
        // Programar para la siguiente medianoche
        resetDailyClearFlag();
    }, timeUntilMidnight);
    
    console.log(`⏰ Reseteo programado para medianoche (${Math.floor(timeUntilMidnight / 1000 / 60)} minutos)`);
}

// Iniciar el reseteo automático
resetDailyClearFlag();

// ==================== SISTEMA DE EDICIÓN DE DATOS ====================

let currentEditDate = null;
let editedRecords = {};

// ===== ABRIR MODAL DE EDICIÓN =====
function editDay(date) {
    currentEditDate = date;
    
    // Obtener datos del día (puede ser de fakeHistoricData o localHistoric)
    let dayData = fakeHistoricData[date] || localHistoric[date] || {};
    
    if (Object.keys(dayData).length === 0) {
        alert('⚠️ No hay registros para editar en este día');
        return;
    }
    
    // Copiar datos para editar
    editedRecords = JSON.parse(JSON.stringify(dayData));
    
    // Mostrar modal
    const modal = document.getElementById('editModal');
    modal.classList.add('active');
    
    // Renderizar registros
    renderEditRecords();
    
    console.log(`✏️ Editando día: ${date} (${Object.keys(dayData).length} registros)`);
}

// ===== RENDERIZAR REGISTROS EDITABLES =====
function renderEditRecords() {
    const container = document.getElementById('editRecordsContainer');
    
    // Ordenar por timestamp
    const records = Object.entries(editedRecords).sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    if (records.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #95a5a6;">No hay registros para mostrar</p>';
        return;
    }
    
    container.innerHTML = records.map(([timestamp, record]) => {
        const time = record.time || new Date(parseInt(timestamp)).toLocaleTimeString('es-PE');
        const uvIndex = record.uvIndex || 0;
        const lux = record.lux || 0;
        
        return `
            <div class="edit-record-item" data-timestamp="${timestamp}">
                <label>${time}</label>
                <div>
                    <label>UV Index:</label>
                    <input type="number" 
                           class="edit-uv" 
                           value="${uvIndex}" 
                           min="0" 
                           max="20" 
                           step="0.1"
                           onchange="updateEditRecord('${timestamp}', 'uvIndex', this.value)">
                </div>
                <div>
                    <label>Lux:</label>
                    <input type="number" 
                           class="edit-lux" 
                           value="${lux}" 
                           min="0" 
                           max="120000"
                           step="100"
                           onchange="updateEditRecord('${timestamp}', 'lux', this.value)">
                </div>
                <div>
                    <label>Nivel:</label>
                    <input type="text" 
                           class="edit-level" 
                           value="${record.uvLevel || 'Bajo'}" 
                           readonly
                           style="background: rgba(0,0,0,0.2);">
                </div>
                <button class="edit-record-delete" 
                        onclick="deleteEditRecord('${timestamp}')" 
                        title="Eliminar registro">
                    🗑️
                </button>
            </div>
        `;
    }).join('');
}

// ===== ACTUALIZAR REGISTRO AL EDITAR =====
function updateEditRecord(timestamp, field, value) {
    if (!editedRecords[timestamp]) return;
    
    if (field === 'uvIndex') {
        const uv = parseFloat(value);
        editedRecords[timestamp].uvIndex = uv;
        
        // Actualizar nivel UV automáticamente
        let level = 'Bajo';
        if (uv >= 11) level = 'Extremo';
        else if (uv >= 8) level = 'Muy Alto';
        else if (uv >= 6) level = 'Alto';
        else if (uv >= 3) level = 'Moderado';
        
        editedRecords[timestamp].uvLevel = level;
        
        // Actualizar campo de nivel en el HTML
        const item = document.querySelector(`[data-timestamp="${timestamp}"]`);
        if (item) {
            item.querySelector('.edit-level').value = level;
        }
        
        console.log(`✏️ UV actualizado: ${timestamp} → ${uv} (${level})`);
    } else if (field === 'lux') {
        editedRecords[timestamp].lux = parseInt(value);
        console.log(`✏️ Lux actualizado: ${timestamp} → ${value}`);
    }
}

// ===== ELIMINAR REGISTRO =====
function deleteEditRecord(timestamp) {
    if (confirm('⚠️ ¿Eliminar este registro?\n\nEsta acción no se puede deshacer.')) {
        delete editedRecords[timestamp];
        renderEditRecords();
        console.log(`🗑️ Registro eliminado: ${timestamp}`);
    }
}

// ===== GUARDAR CAMBIOS =====
function saveEdits() {
    if (!currentEditDate) return;
    
    if (Object.keys(editedRecords).length === 0) {
        alert('⚠️ No hay registros para guardar. El día quedará vacío.');
        return;
    }
    
    if (!confirm(`💾 ¿Guardar cambios en ${currentEditDate}?\n\n${Object.keys(editedRecords).length} registros serán actualizados.`)) {
        return;
    }
    
    console.log(`💾 Guardando cambios en ${currentEditDate}...`);
    
    // Actualizar fakeHistoricData si existe
    if (fakeHistoricData[currentEditDate]) {
        fakeHistoricData[currentEditDate] = { ...editedRecords };
        console.log(`✅ fakeHistoricData actualizado`);
    }
    
    // Actualizar localHistoric
    localHistoric[currentEditDate] = { ...editedRecords };
    console.log(`✅ localHistoric actualizado`);
    
    // Guardar en Firebase
    db.ref(`historic/${currentEditDate}`).set(editedRecords)
        .then(() => {
            console.log(`✅ Cambios guardados en Firebase: ${currentEditDate}`);
            
            // Actualizar gráficos
            updateChart24Hours();
            updateWeekChart();
            updateStats();
            renderHistoricList();
            
            // Cerrar modal
            closeEditModal();
            
            alert(`✅ Cambios guardados correctamente\n\n📊 Gráficos actualizados\n🔥 Firebase sincronizado`);
        })
        .catch(error => {
            console.error('❌ Error guardando en Firebase:', error);
            alert(`❌ Error al guardar: ${error.message}`);
        });
}

// ===== CERRAR MODAL =====
function closeEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.remove('active');
    currentEditDate = null;
    editedRecords = {};
    console.log('✏️ Editor cerrado');
}

// Cerrar modal al hacer click fuera
document.addEventListener('click', function(e) {
    const modal = document.getElementById('editModal');
    if (e.target === modal) {
        closeEditModal();
    }
});