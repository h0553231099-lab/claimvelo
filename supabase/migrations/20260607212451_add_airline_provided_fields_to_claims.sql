DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claims' AND column_name = 'airline_provided_anything'
  ) THEN
    ALTER TABLE claims ADD COLUMN airline_provided_anything boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claims' AND column_name = 'airline_provided_types'
  ) THEN
    ALTER TABLE claims ADD COLUMN airline_provided_types text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claims' AND column_name = 'airline_provided_details'
  ) THEN
    ALTER TABLE claims ADD COLUMN airline_provided_details jsonb DEFAULT '{}';
  END IF;
END $$;
