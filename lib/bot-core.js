import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvzovzegagabdhdzqpgq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

export async function obtenerProductos() {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*');
    
    if (error) throw error;
    
    // Mapeamos para que el bot entienda 'qr_url' usando la columna real 'imagen_url' de tu base de datos
    const productosMapeados = data.map(prod => ({
      ...prod,
      qr_url: prod.imagen_url,
      entregable_url: prod.pdf_url || prod.video_url
    }));

    return productosMapeados && productosMapeados.length > 0 ? productosMapeados : [{
      id: 1,
      nombre: 'Gemini Advanced 18 Meses',
      precio: 67.00,
      qr_url: 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/QR%20Binance.jpeg',
      entregable_url: 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/acceso.txt'
    }];
  } catch (err) {
    console.error('Error al obtener productos de Supabase:', err.message);
    return [{
      id: 1,
      nombre: 'Gemini Advanced 18 Meses',
      precio: 67.00,
      qr_url: 'https://nvzovzegagabdhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/QR%20Binance.jpeg',
      entregable_url: 'https://nvzovzegagabhdzqpgq.supabase.co/storage/v1/object/public/qr-pagos/acceso.txt'
    }];
  }
}

export async function gestionarCliente(userId, userName, userUsername) {
  try {
    const { data: existingClient } = await supabase
      .from('clientes')
      .select('id')
      .eq('telegram_id', userId)
      .single();

    if (existingClient) {
      await supabase
        .from('clientes')
        .update({ ultima_interaccion: new Date(), username: userUsername, nombre: userName })
        .eq('id', existingClient.id);
      return existingClient.id;
    } else {
      const { data: newClient } = await supabase
        .from('clientes')
        .insert([{ telegram_id: userId, nombre: userName, username: userUsername, estado_comercial: 'NUEVO' }])
        .select('id')
        .single();
      return newClient ? newClient.id : null;
    }
  } catch (err) {
    console.error('Error en CRM cliente:', err.message);
    return null;
  }
}
