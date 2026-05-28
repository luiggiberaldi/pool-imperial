-- Add unit_price_bs column to order_items for independent Bs pricing (combos)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price_bs NUMERIC DEFAULT NULL;
