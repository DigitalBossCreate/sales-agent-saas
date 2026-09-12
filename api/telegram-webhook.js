import { obtenerProductos, gestionarCliente } from '../lib/bot-core.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabdhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '';

async function guardarMensajeHistorial(telegramId, rol, mensaje) {
  try {
    await supabase.from('historial_chat').insert([{
      telegram_id: telegramId,
      rol: rol,
      mensaje: mensaje
    }]);
  } catch (e) {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Digital Boss Bot Core is running' });
  }

  try {
    const update = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (update && update.message) {
      const chatId = update.message.chat.id.toString();
      const userId = update.message.from.id;
      const userName = update.message.from.first_name || 'Cliente';
      const userUsername = update.message.from.username || '';
      const text = (update.message.text || '').trim();
      const textLower = text.toLowerCase();

      // Permitir acceso de admin si coincide con la variable o si el comando es explícito de admin
      const isAdmin = (ADMIN_CHAT_ID && chatId === ADMIN_CHAT_ID.toString()) || textLower === '/admin' || textLower === 'soy el admin';

      const clienteId = await gestionarCliente(userId, userName, userUsername);
      await guardarMensajeHistorial(userId, 'user', textLower);

      // ==========================================
      // ASISTENTE DE ADMINISTRACIÓN GUIADA (ADMIN)
      // ==========================================
      if (isAdmin) {
        const { data: adminInfo } = await supabase
          .from('clientes')
          .select('estado_admin, temp_prod_data')
          .eq('telegram_id', userId)
          .single();

        const estadoAdmin = adminInfo?.estado_admin || 'IDLE';
        let prodData = adminInfo?.temp_prod_data || {};

        if (textLower === '/admin' || textLower === 'soy el admin') {
          await supabase.from('clientes').update({ estado_admin: 'IDLE', temp_prod_data: {} }).eq('telegram_id', userId);
          const adminMsg = `🔐 *Panel de Administrador Pro*\n\nTu Telegram Chat ID es: \`${chatId}\`\n\n🛠️ *Comandos de Gestión:*\n• /nuevo (Crear producto guiado)\n• /catalogo_admin (Ver productos e IDs)\n• /eliminar [ID] (Borrar producto)`;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: adminMsg, parse_mode: 'Markdown' })
          });
          return res.status(200).json({ success: true });
        }

        if (textLower === '/nuevo') {
          await supabase.from('clientes').update({ 
            estado_admin: 'CREANDO_NOMBRE', 
            temp_prod_data: {} 
          }).eq('telegram_id', userId);

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              chat_id: chatId, 
              text: `🛠️ *Asistente de Creación de Producto*\n\nPaso 1/6: Escribe el **Nombre** del nuevo producto (Ej: *Canva Pro 1 Año*):`, 
              parse_mode: 'Markdown' 
            })
          });
          return res.status(200).json({ success: true });
        }

        if (estadoAdmin === 'CREANDO_NOMBRE') {
          prodData.nombre = text;
          await supabase.from('clientes').update({ estado_admin: 'CREANDO_PRECIO', temp_prod_data: prodData }).eq('telegram_id', userId);
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `Paso 2/6: Escribe el **Precio** en Bolivianos (Solo número, ej: \`35\`):`, parse_mode: 'Markdown' })
          });
          return res.status(200).json({ success: true });
        }

        if (estadoAdmin === 'CREANDO_PRECIO') {
          prodData.precio = parseFloat(text) || 0;
          await supabase.from('clientes').update({ estado_admin: 'CREANDO_PROMPT', temp_prod_data: prodData }).eq('telegram_id', userId);
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `Paso 3/6: Escribe la **Estrategia & Beneficios (Prompt de ventas)** para este producto:`, parse_mode: 'Markdown' })
          });
          return res.status(200).json({ success: true });
        }

        if (estadoAdmin === 'CREANDO_PROMPT') {
          prodData.prompt_ventas = text;
          await supabase.from('clientes').update({ estado_admin: 'CREANDO_TIPO', temp_prod_data: prodData }).eq('telegram_id', userId);
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `Paso 4/6: Define el **Tipo de Entrega**. Escribe \`manual\` (si pides correo y activas tú, ej: cuentas/IA) o \`automatico\` (si entregas enlace directo, ej: cursos):`, parse_mode: 'Markdown' })
          });
          return res.status(200).json({ success: true });
        }

        if (estadoAdmin === 'CREANDO_TIPO') {
          prodData.tipo_entrega = textLower.includes('auto') ? 'automatico' : 'manual';
          await supabase.from('clientes').update({ estado_admin: 'CREANDO_ENLACE', temp_prod_data: prodData }).eq('telegram_id', userId);
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `Paso 5/6: Envía el **Enlace del Entregable** (PDF, video o archivo de acceso alojado en Supabase):`, parse_mode: 'Markdown' })
          });
          return res.status(200).json({ success: true });
        }

        if (estadoAdmin === 'CREANDO_ENLACE') {
          prodData.pdf_url = text;
          prodData.imagen_url = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/Takenos-ok.jpeg';
          prodData.qr_binance_url = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/QR%20Binance.jpeg';
          prodData.objeciones_respuestas = 'Soporte y estabilidad asegurada durante todo tu periodo.';
          prodData.faqs = '1️⃣ Entrega inmediata.\n2️⃣ Funciona de manera segura y privada.';

          const { error } = await supabase.from('productos').insert([prodData]);
          await supabase.from('clientes').update({ estado_admin: 'IDLE', temp_prod_data: {} }).eq('telegram_id', userId);

          if (error) {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: `❌ Error al guardar en Supabase: ${error.message}` })
            });
          } else {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: `🎉 ¡Producto **${prodData.nombre}** creado y publicado con éxito en el catálogo! 🚀`, parse_mode: 'Markdown' })
            });
          }
          return res.status(200).json({ success: true });
        }

        if (textLower === '/catalogo_admin') {
          const prods = await obtenerProductos();
          let listado = `📋 *Catálogo Actual de Productos*:\n\n`;
          prods.forEach((p, index) => {
            listado += `${index + 1}. *${p.nombre}* - Bs. ${p.precio} [ID: \`${p.id}\`]\n`;
          });
          listado += `\nPara eliminar uno, escribe \`/eliminar [ID]\``;
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: listado, parse_mode: 'Markdown' })
          });
          return res.status(200).json({ success: true });
        }

        if (textLower.startsWith('/eliminar ')) {
          const prodIdDel = text.replace('/eliminar ', '').trim();
          await supabase.from('productos').delete().eq('id', prodIdDel);
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `🗑️ Producto con ID \`${prodIdDel}\` eliminado del catálogo correctamente.` })
          });
          return res.status(200).json({ success: true });
        }
      }
      // ==========================================

      if (textLower.startsWith('/liberar ')) {
        const targetId = text.replace('/liberar ', '').trim();
        await supabase.from('clientes').update({ estado_chat: 'ACTIVO' }).eq('telegram_id', targetId);
        
        const mensajeUpsell = `🎁 *¡Activación completada con éxito!*\n\nYa puedes disfrutar de tu cuenta. Y ya que confiaste en nosotros, ¿te gustaría complementar tu ecosistema digital con otra herramienta o curso con descuento? Escribe *"ver catálogo"*. 🔥`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: targetId, text: mensajeUpsell, parse_mode: 'Markdown' })
        });

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `✅ Cliente ${targetId} liberado y upsell enviado correctamente.` })
        });
        return res.status(200).json({ success: true });
      }

      // --- FILTRO ESTRICTO DE PAUSA (Activación manual) ---
      const { data: clienteInfo } = await supabase
        .from('clientes')
        .select('estado_chat')
        .eq('telegram_id', userId)
        .single();

      if (clienteInfo && clienteInfo.estado_chat === 'ESPERANDO_CORREO') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID || chatId,
            text: `✉️ *Correo recibido del cliente (\`${chatId}\`)*:\n\n\`${update.message.text}\`\n\n_Realiza la activación y luego escribe:_ \`/liberar ${chatId}\``,
            parse_mode: 'Markdown'
          })
        });

        await supabase.from('clientes').update({ estado_chat: 'EN_ESPERANDO_ENTREGA' }).eq('telegram_id', userId);

        const respuestaPaciencia = `⏳ *¡Correo recibido correctamente!*\n\nEstamos procesando tu pedido y preparando tu acceso manual. Por favor ten un poco de paciencia; en breve te enviaremos tus datos listos por aquí. 🚀`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: respuestaPaciencia, parse_mode: 'Markdown' })
        });
        await guardarMensajeHistorial(userId, 'assistant', respuestaPaciencia);
        return res.status(200).json({ success: true });
      }

      if (clienteInfo && clienteInfo.estado_chat === 'EN_ESPERANDO_ENTREGA') {
        return res.status(200).json({ success: true });
      }
      // --------------------------------------------------------------------------------------------

      // Si el cliente dice que "no quiere"
      if (textLower.startsWith('no ') || textLower.includes('no quiero') || textLower.includes('no gracias')) {
        const msgNo = `Comprendo perfectamente, *${userName}* 👍. Si en algún momento cambias de opinión o necesitas otra herramienta digital, aquí estaré para ayudarte. ¡Que tengas un excelente día! 😊`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msgNo, parse_mode: 'Markdown' })
        });
        await guardarMensajeHistorial(userId, 'assistant', msgNo);
        return res.status(200).json({ success: true });
      }

      // Consultar historial para contexto
      const { data: historialReciente } = await supabase
        .from('historial_chat')
        .select('mensaje, rol')
        .eq('telegram_id', userId)
        .order('creado_at', { ascending: false })
        .limit(4);

      const contextoPrevio = historialReciente ? historialReciente.map(h => h.mensaje).join(' ') : '';
      const hablabaDeProducto = contextoPrevio.includes('gemin') || contextoPrevio.includes('ia') || contextoPrevio.includes('curso');

      // Saludo amigable general
      if ((textLower === 'hola' || textLower === 'buenas' || textLower === 'buenas tardes' || textLower === 'buenas noches' || textLower === 'start' || textLower === '/start') && !hablabaDeProducto) {
        const saludoMsg = `¡Hola, *${userName}*! 👋 Bienvenido a Digital Boss. Soy tu asesor de inteligencia artificial. ¿Qué herramienta o curso te gustaría consultar hoy? (Ej: *Gemini*) 🚀`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: saludoMsg, parse_mode: 'Markdown' })
        });
        await guardarMensajeHistorial(userId, 'assistant', saludoMsg);
        return res.status(200).json({ success: true });
      }

      // Obtener producto principal de la base de datos
      const productos = await obtenerProductos();
      const productoPrincipal = productos[0] || {};
      const nombreProd = productoPrincipal.nombre || 'Gemini Advanced 18 Meses';
      const precioProd = productoPrincipal.precio || 67;
      const promptProd = productoPrincipal.prompt_ventas || 'Acceso completo y premium durante 18 meses con estabilidad garantizada.';
      const objecionesProd = productoPrincipal.objeciones_respuestas || 'Cuentas con soporte técnico y estabilidad durante todo tu periodo.';

      // Envío de video de persuasión dinámico
      if (textLower.includes('video') || textLower.includes('demosturacion') || textLower.includes('muestra') || textLower.includes('como funciona') || textLower.includes('ver')) {
        const videoUrl = productoPrincipal.video_url || 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/video%20gemini/video%20para%20gemini.mp4';

        const capVideo = `🎥 *Mira ${nombreProd} en acción.*\n\n💰 Inversión única: *Bs. ${precioProd}*\n\n¿Te gustaría adquirirlo ahora? 👇`;
        await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            video: videoUrl,
            caption: capVideo,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Sí, Comprar Ahora!`, callback_data: `start_purchase_${productoPrincipal.id}` }]
              ]
            }
          })
        });
        await guardarMensajeHistorial(userId, 'assistant', '[Envío de Video Demo]');
        return res.status(200).json({ success: true });
      }

      // Manejo dinámico de objeciones
      if (textLower.includes('correo') || textLower.includes('personal') || textLower.includes('activa') || textLower.includes('cae') || textLower.includes('garantia') || textLower.includes('seguro') || (hablabaDeProducto && (textLower.includes('si') || textLower.includes('como') || textLower.includes('donde')))) {
        const respuestaObjecionDinamica = `¡Exacto, *${userName}*! 🤝\n\n` +
          `${objecionesProd}\n\n` +
          `💰 Inversión única: **Bs. ${precioProd}**\n\n` +
          `¿Deseas que avancemos con tu acceso seguro? 👇`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: respuestaObjecionDinamica, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Sí, Comprar Ahora!`, callback_data: `start_purchase_${productoPrincipal.id}` }]
              ]
            }
          })
        });
        await guardarMensajeHistorial(userId, 'assistant', respuestaObjecionDinamica);
        return res.status(200).json({ success: true });
      }

      // Solicitud general de información
      const isInfoQuery = textLower.includes('informacion') || textLower.includes('info') || textLower.includes('detalles') || textLower.includes('que es') || textLower.includes('cuanto cuesta') || textLower.includes('precio');
      const isProductQuery = textLower.includes('gemin') || textLower.includes('gemeni') || textLower.includes('ia') || textLower.includes('curso');

      if (isInfoQuery || (isProductQuery && !textLower.includes('comprar'))) {
        const ventasTexto = `💡 *Información Oficial - ${nombreProd}*\n\n` +
          `✨ *Estrategia & Beneficios:*\n` +
          `${promptProd}\n\n` +
          `💰 *Inversión única:* Bs. ${precioProd}\n\n` +
          `💡 *Tip:* Escribe *"ver video"* si deseas una demostración visual.\n\n` +
          `¿Listo para dar el salto? 👇`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: ventasTexto, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Lo quiero, Comprar Ahora!`, callback_data: `start_purchase_${productoPrincipal.id}` }],
                [{ text: `🎥 Ver Demostración en Video`, callback_data: `send_demo_video_${productoPrincipal.id}` }],
                [{ text: `❓ Preguntas Frecuentes (FAQs)`, callback_data: `faq_product_${productoPrincipal.id}` }]
              ]
            }
          })
        });
        await guardarMensajeHistorial(userId, 'assistant', ventasTexto);
        return res.status(200).json({ success: true });
      }

      // Intención directa de compra
      if (textLower.includes('comprar') || textLower.includes('adquirir') || textLower.includes('pagar')) {
        const compraMsg = `🎉 *¡Excelente decisión de compra!*\n\n📦 *${nombreProd}*\n💰 *Precio:* Bs. ${precioProd}\n\n👇 Selecciona tu método de pago preferido para emitir el QR:`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: compraMsg, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🇧🇴 Pagar con QR Takenos (Bs. ${precioProd})`, callback_data: `pay_takenos_${productoPrincipal.id}` }],
                [{ text: `🌐 Pagar con USDT Binance (USD)`, callback_data: `pay_binance_${productoPrincipal.id}` }]
              ]
            }
          })
        });
        await guardarMensajeHistorial(userId, 'assistant', compraMsg);
        return res.status(200).json({ success: true });
      }

      const defaultMsg = 'Estoy aquí para ayudarte a elegir la mejor herramienta o curso digital. Cuéntame, ¿qué deseas consultar? 😊';
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: defaultMsg })
      });
      await guardarMensajeHistorial(userId, 'assistant', defaultMsg);
    } 
    else if (update && update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      const token = process.env.TELEGRAM_BOT_TOKEN;

      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQuery.id, text: 'Procesando...' })
      });

      if (data.startsWith('faq_product_')) {
        const prodId = data.replace('faq_product_', '');
        const { data: prodData } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const faqsTexto = prodData?.faqs || '1️⃣ Entrega inmediata tras verificar tu pago.\n2️⃣ Soporte y estabilidad asegurada.';

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `📌 *Preguntas Frecuentes Oficiales:*\n\n${faqsTexto}\n\n¿Deseas adquirirlo ahora? 🚀`, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Sí, Comprar Ahora!`, callback_data: `start_purchase_${prodId}` }]
              ]
            }
          })
        });
      }
      else if (data.startsWith('send_demo_video_')) {
        const prodId = data.replace('send_demo_video_', '');
        const { data: prodData } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const videoUrl = prodData?.video_url || 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/video%20gemini/video%20para%20gemini.mp4';

        await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            video: videoUrl,
            caption: `🎥 *Demostración en Vivo*\n\n¿Deseas adquirirlo ahora? 👇`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🛒 ¡Sí, Comprar Ahora!`, callback_data: `start_purchase_${prodId}` }]
              ]
            }
          })
        });
      }
      else if (data.startsWith('start_purchase_')) {
        const prodId = data.replace('start_purchase_', '');
        const { data: productoPrincipal } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const prod = productoPrincipal || { id: prodId, nombre: 'Producto Digital', precio: 67 };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `🎉 *¡Excelente elección!*\n\n📦 *${prod.nombre}*\n💰 *Precio:* Bs. ${prod.precio}\n\n👇 Selecciona tu método de pago preferido:`, 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🇧🇴 Pagar con QR Takenos (Bs. ${prod.precio})`, callback_data: `pay_takenos_${prod.id}` }],
                [{ text: `🌐 Pagar con USDT Binance (USD)`, callback_data: `pay_binance_${prod.id}` }]
              ]
            }
          })
        });
      }
      else if (data.startsWith('pay_takenos_') || data.startsWith('pay_binance_')) {
        const parts = data.split('_');
        const method = parts[1]; // takenos o binance
        const prodId = parts[2];

        const { data: productoPrincipal } = await supabase.from('productos').select('*').eq('id', prodId).single();
        const prod = productoPrincipal || { id: prodId, nombre: 'Producto Digital', precio: 67, imagen_url: '', qr_binance_url: '' };

        const qrUrl = method === 'takenos' ? prod.imagen_url : (prod.qr_binance_url || prod.imagen_url);

        try {
          await supabase.from('pedidos').insert([{
            producto_id: prod.id,
            monto: prod.precio,
            estado: 'ESPERANDO_PAGO'
          }]);
        } catch (e) {}

        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            photo: qrUrl,
            caption: `📲 *Escanea el QR de ${method.toUpperCase()} para realizar tu pago.*\n\nUna vez realizado, haz clic en el botón de abajo para notificar al administrador:`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🔔 Ya realicé el pago (Avisar al Admin)`, callback_data: `notify_admin_${chatId}_${prod.id}` }]
              ]
            }
          })
        });
      }
      else if (data.startsWith('notify_admin_')) {
        const parts = data.split('_');
        const targetChatId = parts[2];
        const prodId = parts[3];

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: `⏳ *Pago notificado.* Nuestro equipo está verificando tu comprobante. ¡En un momento te entregamos tu acceso! 🚀`, 
            parse_mode: 'Markdown' 
          })
        });

        const adminDest = ADMIN_CHAT_ID || chatId;
        const adminAlertText = `🔔 *NUEVO PAGO PENDIENTE*\n\n👤 *Cliente Chat ID:* \`${targetChatId}\`\n📦 *Producto ID:* \`${prodId}\``;
        const adminKeyboard = {
          inline_keyboard: [
            [
              { text: `✅ Aprobar y Entregar`, callback_data: `approve_delivery_${targetChatId}_${prodId}` },
              { text: `❌ Rechazar`, callback_data: `reject_payment_${targetChatId}` }
            ]
          ]
        };

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: adminDest, text: adminAlertText, parse_mode: 'Markdown', reply_markup: adminKeyboard })
        });
      }
      else if (data.startsWith('approve_delivery_')) {
        const parts = data.split('_');
        const targetChatId = parts[2];
        const prodId = parts[3];

        let entregableUrl = 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/acceso.txt';
        let nombreProd = 'Producto Digital';
        let tipoEntrega = 'manual';

        try {
          const { data: prodData } = await supabase.from('productos').select('*').eq('id', prodId).single();
          if (prodData) {
            nombreProd = prodData.nombre;
            tipoEntrega = prodData.tipo_entrega || 'manual';
            if (prodData.pdf_url) entregableUrl = prodData.pdf_url;
            else if (prodData.video_url) entregableUrl = prodData.video_url;
          }
          await supabase.from('pedidos').update({ estado: 'PAGADO' }).eq('estado', 'ESPERANDO_PAGO');
        } catch (e) {}

        if (tipoEntrega === 'automatico') {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              chat_id: targetChatId, 
              text: `¡Pago aprobado con éxito! 🎉\n\nTu curso: *${nombreProd}*\n🔗 *Enlace de Acceso / Descarga:* ${entregableUrl}\n\n¡Gracias por tu compra! 🚀`, 
              parse_mode: 'Markdown' 
            })
          });

          setTimeout(async () => {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                chat_id: targetChatId, 
                text: `🎁 *¡Oferta exclusiva VIP!*\n\n¿Te gustaría complementar tu aprendizaje con más herramientas o cursos con descuento? Escribe *"ver catálogo"*. 🔥`, 
                parse_mode: 'Markdown' 
              })
            });
          }, 2000);

        } else {
          await supabase.from('clientes').update({ estado_chat: 'ESPERANDO_CORREO' }).eq('telegram_id', targetChatId);

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              chat_id: targetChatId, 
              text: `¡Pago aprobado con éxito! 🎉\n\nPara activar tu acceso a *${nombreProd}*, por favor *escribe aquí tu correo electrónico* personal en el siguiente mensaje. ✉️`, 
              parse_mode: 'Markdown' 
            })
          });
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
