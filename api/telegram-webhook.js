const isBuying = text.includes('comprar') || text.includes('quiero') || text.includes('adquirir') || text.includes('pagar') || text.includes('gemini');
      if (isBuying) {
        const productos = await obtenerProductos();
        const productoPrincipal = productos[0];

        if (clienteId) {
          try {
            await supabase.from('pedidos').insert([{
              cliente_id: clienteId,
              producto_id: productoPrincipal.id,
              monto: productoPrincipal.precio,
              estado: 'ESPERANDO_PAGO'
            }]);
          } catch (e) {}
        }

        // Enviar la imagen del QR directamente usando sendPhoto
        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            photo: productoPrincipal.qr_url,
            caption: `🎉 *¡Excelente elección!*\n\n📦 *${productoPrincipal.nombre}*\n💰 *Precio:* Bs. ${productoPrincipal.precio}\n\n📲 *Escanea el QR para pagar y luego presiona el botón de abajo:*`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `🔔 Ya realicé el pago (Avisar al Admin)`, callback_data: `notify_admin_${chatId}_${productoPrincipal.id}` }]
              ]
            }
          })
        });
        return res.status(200).json({ success: true });
      }
