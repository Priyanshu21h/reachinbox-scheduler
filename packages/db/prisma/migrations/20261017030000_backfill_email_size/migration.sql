UPDATE "Email"
SET "sizeBytes" = octet_length(convert_to("body", 'UTF8'))
WHERE "sizeBytes" = 0;
