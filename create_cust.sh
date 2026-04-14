$ cat create_cust.sh
#!/usr/bin/env bash

set -euo pipefail

# ---- CONFIG ----

ORG_ID="60067911989"

CLIENT_ID="1000.YPEKK9YYXLQGIS2NCYYJ688ZR6T78D"
CLIENT_SECRET="0d7d0ca0292b53590cb6c8f588452a62a2f4e31764"
REFRESH_TOKEN="1000.b298c408897070df1126389d7e56950a.56633c51c5224b18ea1579569e155394"

ZOHO_API="https://www.zohoapis.in/inventory/v1/contacts"
AUTH_URL="https://accounts.zoho.in/oauth/v2/token"

DB_URL="postgresql://postgres.tulkzjduogboensuqinb:supabasepassword123@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"


get_access_token() {
  curl -s --request POST "$AUTH_URL" \
    --data "refresh_token=$REFRESH_TOKEN" \
    --data "client_id=$CLIENT_ID" \
    --data "client_secret=$CLIENT_SECRET" \
    --data "grant_type=refresh_token" \
  | jq -r '.access_token'
}

ACCESS_TOKEN=$(get_access_token)

PAGE=1
HAS_MORE=true

for PAGE in 1 2 3; do
  echo "Fetching page $PAGE..."

  RESPONSE=$(curl -s --request GET \
    --url "${ZOHO_API}?organization_id=${ORG_ID}&page=${PAGE}" \
    --header "Authorization: Zoho-oauthtoken ${ACCESS_TOKEN}")

  ERROR_CODE=$(echo "$RESPONSE" | jq -r '.code // empty')

  if [ "$ERROR_CODE" = "57" ]; then
    echo "Token expired, refreshing..."
    ACCESS_TOKEN=$(get_access_token)
    continue
  fi

  HAS_MORE=$(echo "$RESPONSE" | jq -r '.page_context.has_more_page')

  echo "$RESPONSE" | jq -c '.contacts[]' | while read -r contact; do
    ZOHO_ID=$(echo "$contact" | jq -r '.contact_id')
    NAME=$(echo "$contact" | jq -r '.contact_name')
    PHONE=$(echo "$contact" | jq -r '.phone // ""')

    [ -z "$ZOHO_ID" ] && continue

    ESC_NAME=${NAME//\'/\'\'}
    ESC_PHONE=${PHONE//\'/\'\'}

    psql "$DB_URL" --command \
"INSERT INTO customers (zoho_id, name, phone)
 VALUES ('$ZOHO_ID', '$ESC_NAME', '$ESC_PHONE')
 ON CONFLICT (zoho_id)
 DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone;"
  done

  PAGE=$((PAGE + 1))
done

echo "Sync complete."
