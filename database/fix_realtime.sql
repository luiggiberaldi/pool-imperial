-- ============================================================================
-- FIX REALTIME — Activar realtime en tablas que lo necesitan
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================

-- cash_sessions: crítico para sincronización multi-dispositivo de caja
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_sessions;

-- table_sessions: para mesas de billar en tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.table_sessions;

-- tables: para estado de mesas en tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;

-- orders: para pedidos de mesa en tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- order_items: para items de pedido en tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
