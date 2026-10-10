CREATE OR REPLACE FUNCTION validate_settlement_correction() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  original settlement_events%ROWTYPE;
  current_category_id uuid;
  current_category_name text;
BEGIN
  IF NEW.kind <> 'correction' THEN RETURN NEW; END IF;
  SELECT * INTO original FROM settlement_events WHERE id = NEW.original_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement correction original event is invalid' USING ERRCODE = '23514';
  END IF;
  IF original.kind = 'correction'
    OR original.seller_id IS DISTINCT FROM NEW.seller_id
    OR original.seller_name IS DISTINCT FROM NEW.seller_name THEN
    RAISE EXCEPTION 'Settlement correction original event mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT seller.category_id, category.name
    INTO current_category_id, current_category_name
    FROM sellers seller
    JOIN seller_categories category ON category.id = seller.category_id
    WHERE seller.id = NEW.seller_id
    FOR SHARE OF seller, category;
  IF NOT FOUND
    OR current_category_id IS DISTINCT FROM NEW.seller_category_id
    OR current_category_name IS DISTINCT FROM NEW.seller_category_name THEN
    RAISE EXCEPTION 'Settlement correction seller category mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
