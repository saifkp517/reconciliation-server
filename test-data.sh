#!/bin/bash

BASE_URL="http://localhost:3000"
ZOHO_ORG_ID="60067911989"

export $(grep -v '^#' ./.env | xargs)

echo "🔑 Fetching Zoho access token directly..."
TOKEN_RESPONSE=$(curl -s -X POST "https://accounts.zoho.in/oauth/v2/token" \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "client_id=$ZOHO_CLIENT_ID" \
  --data-urlencode "client_secret=$ZOHO_CLIENT_SECRET" \
  --data-urlencode "refresh_token=$ZOHO_REFRESH_TOKEN")

echo "Token response: $TOKEN_RESPONSE"
ZOHO_TOKEN=$(echo $TOKEN_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")
echo "✅ Token: ${ZOHO_TOKEN:0:20}..."


# random quantity between min and max
rand_qty() { echo $(( RANDOM % ($2 - $1 + 1) + $1 )); }

upload_db() {
  curl -s -X POST "$BASE_URL/sales" \
    -H "Content-Type: application/json" \
    -d "$1" > /dev/null
  echo "✅ DB upload done"
}

upload_zoho() {
  echo "☁️  Uploading to Zoho..."
  RESPONSE=$(curl -s -X POST "https://www.zohoapis.in/inventory/v1/salesorders?organization_id=$ZOHO_ORG_ID" \
    -H "Authorization: Zoho-oauthtoken $ZOHO_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$1")
  echo $RESPONSE | python3 -m json.tool
  echo ""
}

# ───────────────────────────────────────
# DAY 1: 2026-04-01 — CLEAN
# ───────────────────────────────────────
echo "📅 DAY 1: CLEAN"
for i in 1 2 3; do
  Q6=$(rand_qty 50 200)
  Q8=$(rand_qty 25 100)
  upload_db "{
    \"customer_id\": 44, \"sale_date\": \"2026-04-01\", \"invoice_no\": \"INV-D1-00$i\",
    \"items\": [
      { \"dimension\": \"6 inches\", \"quantity\": $Q6, \"unit_sp\": 35.00, \"unit_cp\": 28.00, \"zoho_item_id\": \"3644122000000051021\", \"name\": \"6 inches\" },
      { \"dimension\": \"8 inches\", \"quantity\": $Q8, \"unit_sp\": 45.00, \"unit_cp\": 36.00, \"zoho_item_id\": \"3644122000000051039\", \"name\": \"8 inches\" }
    ]
  }"
  upload_zoho "{
    \"customer_id\": \"3644122000000045745\", \"date\": \"2026-04-01\",
    \"line_items\": [
      { \"item_id\": \"3644122000000051021\", \"name\": \"6 inches\", \"quantity\": $Q6, \"rate\": 35.00 },
      { \"item_id\": \"3644122000000051039\", \"name\": \"8 inches\", \"quantity\": $Q8, \"rate\": 45.00 }
    ]
  }"
done

# ───────────────────────────────────────
# DAY 2: 2026-04-02 — COUNT MISMATCH
# 3 in DB, 2 in Zoho
# ───────────────────────────────────────
echo "📅 DAY 2: COUNT_MISMATCH"
for i in 1 2 3; do
  Q6=$(rand_qty 50 200)
  Q8=$(rand_qty 25 100)
  upload_db "{
    \"customer_id\": 44, \"sale_date\": \"2026-04-02\", \"invoice_no\": \"INV-D2-00$i\",
    \"items\": [
      { \"dimension\": \"6 inches\", \"quantity\": $Q6, \"unit_sp\": 35.00, \"unit_cp\": 28.00, \"zoho_item_id\": \"3644122000000051021\", \"name\": \"6 inches\" },
      { \"dimension\": \"8 inches\", \"quantity\": $Q8, \"unit_sp\": 45.00, \"unit_cp\": 36.00, \"zoho_item_id\": \"3644122000000051039\", \"name\": \"8 inches\" }
    ]
  }"
  # only upload 2 to Zoho
  if [ $i -lt 3 ]; then
    upload_zoho "{
      \"customer_id\": \"3644122000000045745\", \"date\": \"2026-04-02\",
      \"line_items\": [
        { \"item_id\": \"3644122000000051021\", \"name\": \"6 inches\", \"quantity\": $Q6, \"rate\": 35.00 },
        { \"item_id\": \"3644122000000051039\", \"name\": \"8 inches\", \"quantity\": $Q8, \"rate\": 45.00 }
      ]
    }"
  fi
done

# ───────────────────────────────────────
# DAY 3: 2026-04-03 — PRICE MISMATCH
# same qty, different rate in Zoho
# ───────────────────────────────────────
echo "📅 DAY 3: PRICE_MISMATCH"
for i in 1 2 3; do
  Q6=$(rand_qty 50 200)
  Q8=$(rand_qty 25 100)
  WRONG_RATE=$(( RANDOM % 10 + 40 )) # random wrong rate between 40-49 instead of 45
  upload_db "{
    \"customer_id\": 44, \"sale_date\": \"2026-04-03\", \"invoice_no\": \"INV-D3-00$i\",
    \"items\": [
      { \"dimension\": \"6 inches\", \"quantity\": $Q6, \"unit_sp\": 35.00, \"unit_cp\": 28.00, \"zoho_item_id\": \"3644122000000051021\", \"name\": \"6 inches\" },
      { \"dimension\": \"8 inches\", \"quantity\": $Q8, \"unit_sp\": 45.00, \"unit_cp\": 36.00, \"zoho_item_id\": \"3644122000000051039\", \"name\": \"8 inches\" }
    ]
  }"
  upload_zoho "{
    \"customer_id\": \"3644122000000045745\", \"date\": \"2026-04-03\",
    \"line_items\": [
      { \"item_id\": \"3644122000000051021\", \"name\": \"6 inches\", \"quantity\": $Q6, \"rate\": 35.00 },
      { \"item_id\": \"3644122000000051039\", \"name\": \"8 inches\", \"quantity\": $Q8, \"rate\": $WRONG_RATE.00 }
    ]
  }"
done

echo ""
echo "🎉 Done! Now test:"
echo "GET $BASE_URL/reconciliation?from=2026-04-01&to=2026-04-03"
