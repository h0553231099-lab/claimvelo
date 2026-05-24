/*
  # Add signature_data column to claims

  Stores the base64 PNG data URL of the passenger's drawn signature,
  captured at the time of claim submission.
*/

ALTER TABLE claims ADD COLUMN IF NOT EXISTS signature_data text DEFAULT '';
