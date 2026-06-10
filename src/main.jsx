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


    // --- PLAN B: RECONSTRUCCIÓN DE CLIENTES DESDE VENTAS ---
    try {
      const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
      const subR = (a, b) => round2(a - b);
      const procesarImpactoClienteLocal = (clienteInicial, transaccion) => {
        let cliente = { ...clienteInicial };
        const { usaSaldoFavor = 0, esCredito = false, deudaGenerada = 0, vueltoParaMonedero = 0 } = transaccion;

        if (usaSaldoFavor > 0) {
          const disponible = round2(cliente.favor || 0);
          const efectivo = Math.min(usaSaldoFavor, disponible);
          cliente.favor = round2(subR(disponible, efectivo));
        }

        if (esCredito) {
          cliente.deuda = round2((cliente.deuda || 0) + deudaGenerada);
        }

        if (vueltoParaMonedero > 0) {
          const deudaActual = round2(cliente.deuda || 0);

          if (deudaActual > 0.001) {
            if (deudaActual >= vueltoParaMonedero) {
              cliente.deuda = round2(subR(deudaActual, vueltoParaMonedero));
            } else {
              const sobra = round2(subR(vueltoParaMonedero, deudaActual));
              cliente.deuda = 0;
              cliente.favor = round2((cliente.favor || 0) + sobra);
            }
          } else {
            cliente.favor = round2((cliente.favor || 0) + vueltoParaMonedero);
          }
        }

        const saldoNeto = subR((cliente.favor || 0), (cliente.deuda || 0));

        if (saldoNeto >= 0) {
          cliente.favor = round2(saldoNeto);
          cliente.deuda = 0;
        } else {
          cliente.favor = 0;
          cliente.deuda = round2(Math.abs(saldoNeto));
        }

        return cliente;
      };

      const CUSTOMERS_KEY = 'bodega_customers_v1';
      const localCustomers = await storageService.getItem(CUSTOMERS_KEY, []);
      
      // Solo reconstruir si no hay clientes en la base de datos local
      if (!Array.isArray(localCustomers) || localCustomers.length === 0) {
        console.log('🔄 [Plan B] No se encontraron clientes locales. Escaneando historial de ventas...');
        
        const SALES_KEY = 'bodega_sales_v1';
        const sales = await storageService.getItem(SALES_KEY, []);
        
        if (Array.isArray(sales) && sales.length > 0) {
          // Filtrar ventas que tengan clienteId o customerId
          const customerSales = sales.filter(s => s && (s.customerId || s.clienteId));
          
          if (customerSales.length > 0) {
            console.log(`📥 [Plan B] Encontradas ${customerSales.length} ventas asociadas a clientes.`);
            
            // Agrupar ventas por cliente ID
            const salesByCustomer = {};
            customerSales.forEach(s => {
              const cId = s.customerId || s.clienteId;
              if (!salesByCustomer[cId]) {
                salesByCustomer[cId] = [];
              }
              salesByCustomer[cId].push(s);
            });

            const reconstructedCustomers = [];

            // Procesar cada cliente
            for (const [cId, cSales] of Object.entries(salesByCustomer)) {
              // Ordenar cronológicamente (más antiguo primero)
              cSales.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

              // Encontrar los datos básicos del cliente en alguna de las ventas
              let name = 'Cliente sin nombre';
              let phone = null;
              let documentId = null;
              let firstTimestamp = new Date().toISOString();

              for (const s of cSales) {
                const sName = s.customerName || s.clienteName;
                if (sName && sName !== 'Consumidor Final') {
                  name = sName;
                }
                const sPhone = s.customerPhone || s.clientePhone;
                if (sPhone) phone = sPhone;

                const sDoc = s.customerDocument || s.clienteDocument;
                if (sDoc) documentId = sDoc;

                if (s.timestamp && new Date(s.timestamp) < new Date(firstTimestamp)) {
                  firstTimestamp = s.timestamp;
                }
              }

              // Inicializar cliente
              let client = {
                id: cId,
                name: name.trim(),
                phone: phone ? phone.trim() : null,
                documentId: documentId ? documentId.trim() : null,
                deuda: 0,
                favor: 0,
                createdAt: firstTimestamp
              };

              // Re-correr cada venta cronológicamente aplicando el impacto financiero
              cSales.forEach(s => {
                let transaccion = {};
                
                if (s.tipo === 'COBRO_DEUDA') {
                  const paymentAmount = s.totalCop || s.totalUsd || 0;
                  transaccion = { costoTotal: 0, pagoReal: paymentAmount, vueltoParaMonedero: paymentAmount };
                } else if (s.tipo === 'VENTA_FIADA') {
                  const debtAmount = s.fiadoUsd || s.fiado_usd || 0;
                  transaccion = { esCredito: true, deudaGenerada: debtAmount };
                } else {
                  // Venta normal, verificar si usó saldo a favor
                  const saldoFavorUsed = s.payments?.find(p => p.methodId === 'saldo_favor')?.amountUsd || 0;
                  if (saldoFavorUsed > 0) {
                    transaccion = { usaSaldoFavor: saldoFavorUsed };
                  }
                }

                client = procesarImpactoClienteLocal(client, transaccion);
              });

              console.log(`👤 [Plan B] Reconstruido: ${client.name} | Deuda: $${client.deuda} | Favor: $${client.favor}`);
              reconstructedCustomers.push(client);
            }

            if (reconstructedCustomers.length > 0) {
              // Ordenar alfabéticamente
              reconstructedCustomers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

              // Guardar localmente
              await storageService.setItem(CUSTOMERS_KEY, reconstructedCustomers);
              window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: CUSTOMERS_KEY } }));

              // Subir a la nube
              const { data: { session } } = await supabaseCloud.auth.getSession();
              if (session?.user?.id) {
                const { error: upsertErr } = await supabaseCloud
                  .from('sync_documents')
                  .upsert({
                    user_id: session.user.id,
                    collection: 'store',
                    doc_id: 'bodega_customers_v1',
                    data: { payload: reconstructedCustomers },
                    updated_at: new Date().toISOString()
                  }, { onConflict: 'user_id,collection,doc_id' });

                if (upsertErr) {
                  console.error('❌ [Plan B] Error al subir clientes reconstruidos a Supabase:', upsertErr.message);
                } else {
                  console.log('✅ [Plan B] Clientes reconstruidos subidos a Supabase.');
                }
              }

              alert(`¡Reconstrucción exitosa! Se recuperaron ${reconstructedCustomers.length} clientes y sus deudas desde el historial de ventas.`);
              window.location.reload();
            }
          }
        }
      }
    } catch (planBErr) {
      console.error('❌ [Plan B] Error durante la reconstrucción:', planBErr);
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

      // Consultar documentos actuales para ver qué hay en la nube
      const { data: docs, error: queryErr } = await supabaseCloud
        .from('sync_documents')
        .select('collection, doc_id, data')
        .eq('user_id', userId);

      if (queryErr) {
        console.error('❌ [Homologación] Error consultando sync_documents:', queryErr.message);
      } else if (docs) {
        const docIds = docs.map(d => d.doc_id);

        const oldCustDoc = docs.find(d => d.doc_id === 'pool_imperial_customers_v1');
        const newCustDoc = docs.find(d => d.doc_id === 'bodega_customers_v1');
        const oldProdDoc = docs.find(d => d.doc_id === 'pool_imperial_products_v1');
        const newProdDoc = docs.find(d => d.doc_id === 'bodega_products_v1');

        let migratedSomething = false;

        // FUSIONAR CLIENTES
        if (oldCustDoc) {
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
              migratedSomething = true;
            }
          }
        }

        // FUSIONAR PRODUCTOS
        if (oldProdDoc) {
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
              migratedSomething = true;
            }
          }
        }

        if (migratedSomething) {
          alert('¡Sincronización y Homologación completadas! Se fusionaron clientes/productos antiguos de la nube en la nueva versión. Recargando la aplicación...');
          window.location.reload();
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

