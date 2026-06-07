import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ResetPasswordView from './views/ResetPasswordView.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { supabaseCloud } from './config/supabaseCloud.js'
import { storageService } from './utils/storageService.js'
import './index.css'

// ── ELIMINACIÓN TEMPORAL CORRELATIVO 7 Y HOMOLOGACIÓN EN LA NUBE ──
(async () => {
  try {
    // --- DIAGNÓSTICO EN CONSOLA ---
    try {
      const sessionData = await supabaseCloud.auth.getSession();
      if (sessionData.data?.session?.user) {
        const email = sessionData.data.session.user.email;
        const uid = sessionData.data.session.user.id;
        console.log('🔑 [Diagnóstico] Usuario:', email, 'ID:', uid);

        // 1. Consultar sync_documents
        const { data: syncDocs } = await supabaseCloud
          .from('sync_documents')
          .select('doc_id, collection, updated_at')
          .eq('user_id', uid);
        console.log('📂 [Diagnóstico] Keys en sync_documents:', syncDocs?.map(d => d.doc_id));

        // 2. Consultar cloud_backups
        const { data: backup } = await supabaseCloud
          .from('cloud_backups')
          .select('email, updated_at, backup_data')
          .eq('email', email)
          .maybeSingle();
        if (backup?.backup_data) {
          const keys = Object.keys(backup.backup_data.data?.idb || {});
          console.log('📦 [Diagnóstico] Keys en cloud_backups:', keys);
          const backupCust = backup.backup_data.data?.idb?.bodega_customers_v1 || 
                             backup.backup_data.data?.idb?.pool_imperial_customers_v1 ||
                             backup.backup_data.data?.idb?.my_customers_v1;
          console.log('👥 [Diagnóstico] Clientes en cloud_backup:', backupCust?.length, backupCust);
        } else {
          console.log('📦 [Diagnóstico] No se encontró backup en cloud_backups');
        }

        // 3. Consultar tabla pool_customers
        const { data: poolCustRows, error: poolCustErr } = await supabaseCloud
          .from('pool_customers')
          .select('*');
        console.log('👥 [Diagnóstico] Tabla pool_customers rows:', poolCustRows, poolCustErr);

        // 4. Consultar IndexedDB local
        const localKeys = [
          'bodega_customers_v1',
          'pool_imperial_customers_v1',
          'my_customers_v1',
          'customers'
        ];
        for (const k of localKeys) {
          const val = await storageService.getItem(k);
          console.log(`🏠 [Diagnóstico] Local IndexedDB key "${k}":`, val?.length, val);
        }
      }
    } catch (diagErr) {
      console.error('❌ [Diagnóstico] Error:', diagErr);
    }

    // 1. Borrar venta 7 si existe
    const SALES_KEY = 'bodega_sales_v1';
    const sales = await storageService.getItem(SALES_KEY, []);
    if (Array.isArray(sales)) {
      const salesToDelete = sales.filter(s => Number(s.saleNumber) === 7);
      if (salesToDelete.length > 0) {
        console.log(`🗑️ [TEMP] Encontradas ${salesToDelete.length} venta(s) con correlativo 7.`);
        for (const saleToDelete of salesToDelete) {
          try {
            const { error } = await supabaseCloud
              .from('sync_documents')
              .delete()
              .eq('collection', 'sale')
              .eq('doc_id', saleToDelete.id);
            
            if (error) {
              console.warn('⚠️ [TEMP] Error al borrar venta 7 de Supabase:', error.message);
            } else {
              console.log('✅ [TEMP] Borrada de Supabase sync_documents venta 7:', saleToDelete.id);
            }
          } catch (err) {
            console.warn('⚠️ [TEMP] Excepción al borrar venta 7 de Supabase:', err);
          }
        }

        const cleanSales = sales.filter(s => Number(s.saleNumber) !== 7);
        await storageService.setItem(SALES_KEY, cleanSales);
        window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
        console.log('✅ [TEMP] Borrada(s) de IndexedDB local.');
        alert('Venta correlativo 07 eliminada con éxito de local y nube.');
      }
    }

    // 2. Homologación de documentos de la nube (pool_imperial_ vs bodega_)
    const { data: { session } } = await supabaseCloud.auth.getSession();
    if (session?.user?.id) {
      const userId = session.user.id;
      console.log(`☁️ [Homologación] Iniciando homologación de la nube para user_id: ${userId}`);

      // Consultar documentos actuales para ver qué hay en la nube
      const { data: docs, error: queryErr } = await supabaseCloud
        .from('sync_documents')
        .select('collection, doc_id, data')
        .eq('user_id', userId);

      if (queryErr) {
        console.error('❌ [Homologación] Error consultando sync_documents:', queryErr.message);
      } else if (docs) {
        const docIds = docs.map(d => d.doc_id);
        console.log('📊 [Homologación] Documentos actuales en Supabase:', docIds);

        const oldCustDoc = docs.find(d => d.doc_id === 'pool_imperial_customers_v1');
        const newCustDoc = docs.find(d => d.doc_id === 'bodega_customers_v1');
        const oldProdDoc = docs.find(d => d.doc_id === 'pool_imperial_products_v1');
        const newProdDoc = docs.find(d => d.doc_id === 'bodega_products_v1');

        let migratedSomething = false;

        // FUSIONAR CLIENTES
        if (oldCustDoc) {
          console.log('🔄 [Homologación] Fusionando pool_imperial_customers_v1 con bodega_customers_v1...');
          const oldCustomers = oldCustDoc.data?.payload || [];
          const newCustomers = newCustDoc?.data?.payload || [];
          // Intentar mezclar también con los del IndexedDB local actual
          const localCustomers = await storageService.getItem('bodega_customers_v1', []);
          
          // Fusionar listas
          const merged = [...oldCustomers, ...newCustomers, ...localCustomers];
          const uniqueMap = new Map();
          // reverse y luego reverse de nuevo para conservar el orden con prioridad al elemento más reciente si hay colisión
          merged.reverse().forEach(c => {
            if (c && c.id) {
              // Si ya existe, conservar el que tenga mayor deuda o sea más completo
              const existing = uniqueMap.get(c.id);
              if (existing) {
                // Conservar el que tenga deuda mayor o el que venga del local
                if ((c.deuda || 0) > (existing.deuda || 0)) {
                  uniqueMap.set(c.id, c);
                }
              } else {
                uniqueMap.set(c.id, c);
              }
            }
          });
          const consolidatedCustomers = Array.from(uniqueMap.values()).reverse();

          // Subir consolidado a Supabase
          const { error: upsertErr } = await supabaseCloud
            .from('sync_documents')
            .upsert({
              user_id: userId,
              collection: 'store',
              doc_id: 'bodega_customers_v1',
              data: { payload: consolidatedCustomers },
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,collection,doc_id' });

          if (upsertErr) {
            console.error('❌ [Homologación] Error al subir bodega_customers_v1 consolidado:', upsertErr.message);
          } else {
            console.log('✅ [Homologación] Clientes consolidados subidos bajo bodega_customers_v1.');
            // Guardar localmente silencioso
            await storageService.setItemSilent('bodega_customers_v1', consolidatedCustomers);
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: 'bodega_customers_v1' } }));
            
            // Borrar de la nube la clave vieja
            const { error: deleteErr } = await supabaseCloud
              .from('sync_documents')
              .delete()
              .eq('user_id', userId)
              .eq('collection', 'store')
              .eq('doc_id', 'pool_imperial_customers_v1');

            if (deleteErr) {
              console.error('❌ [Homologación] Error al borrar pool_imperial_customers_v1:', deleteErr.message);
            } else {
              console.log('✅ [Homologación] Clave vieja pool_imperial_customers_v1 borrada con éxito.');
              migratedSomething = true;
            }
          }
        }

        // FUSIONAR PRODUCTOS
        if (oldProdDoc) {
          console.log('🔄 [Homologación] Fusionando pool_imperial_products_v1 con bodega_products_v1...');
          const oldProducts = oldProdDoc.data?.payload || [];
          const newProducts = newProdDoc?.data?.payload || [];
          const localProducts = await storageService.getItem('bodega_products_v1', []);

          const merged = [...oldProducts, ...newProducts, ...localProducts];
          const uniqueMap = new Map();
          merged.reverse().forEach(p => {
            if (p && p.id) {
              const existing = uniqueMap.get(p.id);
              if (existing) {
                // Conservar el que tenga mayor stock o versión más reciente
                if ((p.stock || 0) > (existing.stock || 0)) {
                  uniqueMap.set(p.id, p);
                }
              } else {
                uniqueMap.set(p.id, p);
              }
            }
          });
          const consolidatedProducts = Array.from(uniqueMap.values()).reverse();

          // Subir consolidado a Supabase
          const { error: upsertErr } = await supabaseCloud
            .from('sync_documents')
            .upsert({
              user_id: userId,
              collection: 'store',
              doc_id: 'bodega_products_v1',
              data: { payload: consolidatedProducts },
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,collection,doc_id' });

          if (upsertErr) {
            console.error('❌ [Homologación] Error al subir bodega_products_v1 consolidado:', upsertErr.message);
          } else {
            console.log('✅ [Homologación] Productos consolidados subidos bajo bodega_products_v1.');
            // Guardar localmente silencioso
            await storageService.setItemSilent('bodega_products_v1', consolidatedProducts);
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: 'bodega_products_v1' } }));

            // Borrar de la nube la clave vieja
            const { error: deleteErr } = await supabaseCloud
              .from('sync_documents')
              .delete()
              .eq('user_id', userId)
              .eq('collection', 'store')
              .eq('doc_id', 'pool_imperial_products_v1');

            if (deleteErr) {
              console.error('❌ [Homologación] Error al borrar pool_imperial_products_v1:', deleteErr.message);
            } else {
              console.log('✅ [Homologación] Clave vieja pool_imperial_products_v1 borrada con éxito.');
              migratedSomething = true;
            }
          }
        }

        if (migratedSomething) {
          alert('¡Sincronización y Homologación completadas! Se fusionaron clientes/productos antiguos de la nube en la nueva versión. Recargando la aplicación...');
          window.location.reload();
        } else {
          console.log('☁️ [Homologación] La nube ya está homologada y limpia.');
        }
      }
    }
  } catch (e) {
    console.error('❌ [TEMP] Error en la ejecución de la homologación:', e);
  }
})();

// ── Auto-actualización del Service Worker ──
if ('serviceWorker' in navigator) {
  // Cuando el nuevo SW toma control, recargar para cargar los assets nuevos.
  // Esto garantiza que el usuario siempre ejecuta la versión más reciente.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) {
      reloading = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      // Chequear actualizaciones cada 60 segundos
      setInterval(() => reg.update().catch(() => {}), 60 * 1000);
    } catch (_) {}
  });
}

/* eslint-disable react-refresh/only-export-components */

// ── Evitar que la rueda del mouse cambie valores en inputs numéricos ──
document.addEventListener('wheel', (e) => {
  if (e.target?.type === 'number' && document.activeElement === e.target) {
    e.preventDefault();  // Bloquear ANTES de que el browser cambie el valor
    e.target.blur();     // Luego quitar foco para que no siga capturando scroll
  }
}, { passive: false });

// Detectar token de recuperación en la URL al cargar (antes de React)
function detectRecovery() {
  const hash = window.location.hash;
  const params = new URLSearchParams(window.location.search);
  return hash.includes('type=recovery') || params.has('code');
}

function AppRouter() {
  const [isRecovery, setIsRecovery] = useState(detectRecovery);

  useEffect(() => {
    const { data: { subscription } } = supabaseCloud.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (isRecovery) {
    return (
      <ResetPasswordView
        onDone={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsRecovery(false);
        }}
      />
    );
  }

  return <App />;
}

import { ConfirmProvider } from './hooks/useConfirm.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <AppRouter />
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>,
)

