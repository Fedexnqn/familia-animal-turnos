const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Inicializar Firebase Admin
admin.initializeApp();

// ============================================
// CONFIGURACIÓN DE ONESIGNAL (desde variables de entorno)
// ============================================

// Estas variables se configuran con:
// firebase functions:config:set onesignal.app_id="TU_APP_ID"
// firebase functions:config:set onesignal.rest_api_key="TU_API_KEY"

const ONESIGNAL_APP_ID = functions.config().onesignal.app_id;
const ONESIGNAL_REST_API_KEY = functions.config().onesignal.rest_api_key;

console.log('🔔 OneSignal App ID:', ONESIGNAL_APP_ID ? '✅ Configurado' : '❌ No configurado');
console.log('🔑 OneSignal API Key:', ONESIGNAL_REST_API_KEY ? '✅ Configurada' : '❌ No configurada');

// ============================================
// FUNCIÓN 1: Enviar notificación desde el frontend
// ============================================

exports.enviarNotificacion = functions.https.onCall(async (data, context) => {
  // 1. Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Debes estar autenticado para enviar notificaciones'
    );
  }

  console.log(`📨 Usuario ${context.auth.uid} enviando notificación`);

  // 2. Validar datos
  const { turno } = data;
  
  if (!turno || !turno.mascota || !turno.duenio) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Datos de turno incompletos'
    );
  }

  // 3. Construir mensaje
  const mensaje = `🐾 Nuevo turno: ${turno.mascota} - ${turno.duenio} a las ${turno.hora}`;

  // Verificar que las claves estén configuradas
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.error('❌ OneSignal no configurado correctamente');
    throw new functions.https.HttpsError(
      'failed-precondition',
      'OneSignal no está configurado. Ejecuta: firebase functions:config:set onesignal.app_id="ID" onesignal.rest_api_key="KEY"'
    );
  }

  try {
    // 4. Enviar a OneSignal
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ['Subscribed Users'],
        headings: {
          es: '🐾 Nuevo turno registrado',
          en: '🐾 New appointment registered'
        },
        contents: {
          es: mensaje,
          en: mensaje
        },
        data: {
          turnoId: turno.id || 'nuevo',
          fecha: turno.fecha,
          hora: turno.hora,
          mascota: turno.mascota
        },
        url: 'https://familiaanimal.com.ar'
      })
    });

    const resultado = await response.json();
    console.log('📨 Resultado OneSignal:', resultado);

    if (resultado.errors) {
      console.error('❌ Errores de OneSignal:', resultado.errors);
      throw new Error('Error en OneSignal: ' + JSON.stringify(resultado.errors));
    }

    return {
      success: true,
      message: 'Notificación enviada correctamente',
      data: resultado
    };

  } catch (error) {
    console.error('❌ Error:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Error al enviar notificación: ' + error.message
    );
  }
});

// ============================================
// FUNCIÓN 2: Notificación automática al crear turno
// ============================================

exports.notificarNuevoTurno = functions.firestore
  .document('turnos/{turnoId}')
  .onCreate(async (snap, context) => {
    const turno = snap.data();
    const turnoId = context.params.turnoId;

    console.log(`📝 Nuevo turno creado: ${turnoId} - ${turno.mascota}`);

    // Verificar que tenemos datos completos
    if (!turno.mascota || !turno.duenio) {
      console.log('⚠️ Turno sin datos completos, omitiendo notificación');
      return null;
    }

    // Verificar que las claves estén configuradas
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.error('❌ OneSignal no configurado, omitiendo notificación');
      return null;
    }

    const mensaje = `🐾 Nuevo turno: ${turno.mascota} - ${turno.duenio} a las ${turno.hora}`;

    try {
      const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          included_segments: ['Subscribed Users'],
          headings: {
            es: '🐾 Nuevo turno registrado',
            en: '🐾 New appointment registered'
          },
          contents: {
            es: mensaje,
            en: mensaje
          },
          data: {
            turnoId: turnoId,
            fecha: turno.fecha,
            hora: turno.hora,
            mascota: turno.mascota
          },
          url: 'https://familiaanimal.com.ar/admin'
        })
      });

      const resultado = await response.json();
      console.log('📨 Notificación automática enviada:', resultado);
      return resultado;

    } catch (error) {
      console.error('❌ Error en notificación automática:', error);
      return null;
    }
  });

// ============================================
// FUNCIÓN 3: Probar conexión con OneSignal
// ============================================

exports.testOneSignal = functions.https.onCall(async (data, context) => {
  // Solo admin puede testear
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debes estar autenticado');
  }

  const uid = context.auth.uid;
  const userDoc = await admin.firestore().collection('usuarios').doc(uid).get();
  
  if (!userDoc.exists || userDoc.data().rol !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tienes permisos');
  }

  // Verificar que las claves estén configuradas
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'OneSignal no está configurado. Ejecuta: firebase functions:config:set onesignal.app_id="ID" onesignal.rest_api_key="KEY"'
    );
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ['Subscribed Users'],
        headings: { es: '🔔 Prueba de notificación' },
        contents: { es: '✅ OneSignal funciona correctamente!' },
        url: 'https://familiaanimal.com.ar'
      })
    });

    const resultado = await response.json();
    
    return {
      success: true,
      message: 'Notificación de prueba enviada',
      data: resultado
    };

  } catch (error) {
    console.error('❌ Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
