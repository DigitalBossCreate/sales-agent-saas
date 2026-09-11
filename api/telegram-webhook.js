import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Digital Boss Bot is running' });
  }

  try {
    const update = req.body;

    if (update && update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      const userId = update.message.from.id;
      const userName = update.message.from.first_name || 'Cliente';
      const userUsername = update.message.from.username || '';

      // 1. GESTIÓN DE CLIENTE (CRM)
      let clienteId = null;
      try {
        const { data: existingClient } = await supabase
          .from('clientes')
          .select('id')
          .eq('telegram_id', userId)
          .single();

        if (existingClient) {
          clienteId = existingClient.id;
          await supabase
            .from('clientes')
            .update({ ultima_interaccion: new Date(), username: userUsername, nombre: userName })
            .eq('id', clienteId);
        } else {
          const { data: newClient } = await supabase
            .from('clientes')
            .insert([{ telegram_id: userId, nombre: userName, username: userUsername, estado_comercial: 'NUEVO' }])
            .select('id')
            .single();
          if (newClient) clienteId = newClient.id;
        }
      } catch (clientErr) {
        console.error('Error CRM:', clientErr);
      }

      // 2. GUARDAR MENSAJE
      try {
        await supabase.from('mensajes_bot').insert([
          { chat_id: chatId, nombre: userName, mensaje: text }
        ]);
      } catch (dbError) {
        console.error('Error guardando mensaje:', dbError);
      }

      // 3. CONSULTAR CATÁLOGO DE SUPABASE
      let catalogContext = '';
      let productosList = [];
      try {
        const { data: products, error: prodErr } = await supabase
          .from('productos')
          .select('*');

        if (products && products.length > 0) {
          productosList = products;
          catalogContext = products.map(p => 
            `- Producto: ${p.nombre} | SKU: ${p.sku || 'N/A'} | Precio: $${p.precio} | Descripción: ${p.descripcion} | Entrega: ${p.tipo_entrega} | Enlace: ${p.ubicacion_entrega || 'N/A'}`
          ).join('\n');
        }
      } catch (catErr) {
        console.error('Excepción catálogo:', catErr);
      }

      // Respaldo de seguridad garantizado si Supabase tarda en responder
      if (!catalogContext) {
        catalogContext = `- Producto: Gemini Advanced 18 Meses | SKU: GEM-18M | Precio: $72.00 | Descripción: Acceso oficial a Gemini Advanced por 18 meses cuenta personal con garantía. | Entrega: ENLACE`;
      }

      // 4. CONSULTAR MÉTODOS DE PAGO
      let paymentContext = '';
      try {
        const { data: payments } = await supabase
          .from('metodos_pago')
          .select('*');

        if (payments && payments.length > 0) {
          paymentContext = payments.map(pm => 
            `Método: ${pm.nombre} (${pm.moneda}) - Instrucciones: ${pm.instrucciones} | Datos: ${pm.datos_pago}`
          ).join('\n');
        }
      } catch (payErr) {
        console.error('Error pagos:', payErr);
      }

      if (!paymentContext) {
        paymentContext = `Método: QR / Transferencia Bancaria (BOB) - Instrucciones: Realiza la transferencia por el monto exacto.`;
      }

      // 5. PROMPT MAESTRO
      const systemPrompt = `
Eres el agente de ventas autónomo y profesional de "Digital Boss". Tu objetivo es guiar al cliente, responder dudas, ofrecer el catálogo, manejar objeciones y cerrar ventas en Telegram.

CATÁLOGO ACTUALIZADO DE PRODUCTOS:
${catalogContext}

MÉTODOS DE PAGO:
${paymentContext}

REGLAS:
- Usa estrictamente la información del catálogo anterior para responder cualquier pregunta sobre productos o precios.
- Si el cliente pregunta por un producto, indícale su precio, detalles y cómo adquirirlo de forma amable y comercial.
`;

      // 6. LLAMADA A GROQ
      let aiResponse = '¡Hola! Bienvenido a Digital Boss. ¿En qué puedo ayudarte?';
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-20b',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text }
            ],
            temperature: 0.7
          })
        });

        const groqData = await groqRes.json();
        if (groqData.choices && groqData.choices.length > 0) {
          aiResponse = groqData.choices[0].message.content;
        }
      } catch (aiError) {
        aiResponse = `¡Hola! Tenemos disponible Gemini Advanced por $72. ¿Te gustaría adquirirlo?`;
      }

      // 7. DETECCIÓN DE COMPRA Y REGISTRO DE PEDIDO
      const lowerText = text.toLowerCase();
      if ((lowerText.includes('comprar') || lowerText.includes('quiero') || lowerText.includes('adquirir')) && clienteId) {
        const matchedProduct = productosList.find(p => lowerText.includes(p.nombre.toLowerCase()) || (p.sku && lowerText.includes(p.sku.toLowerCase()))) || productosList[0];
        
        if (matchedProduct) {
          try {
            await supabase.from('pedidos').insert([{
              cliente_id: clienteId,
              producto_id: matchedProduct.id,
              monto: matchedProduct.precio,
              estado: 'ESPERANDO_PAGO'
            }]);
            aiResponse += `\n\n📝 Pedido registrado con éxito para *${matchedProduct.nombre}* por un valor de $${matchedProduct.precio}.`;
          } catch (orderErr) {
            console.error('Error pedido:', orderErr);
          }
        }
      }

      // 8. RESPUESTA A TELEGRAM
      const token = process.env.TELEGRAM_BOT_TOKEN;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: aiResponse,
          parse_mode: 'Markdown'
        })
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error general:', error);
    return res.status(500).json({ error: error.message });
  }
}
