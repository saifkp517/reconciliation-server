#!/bin/bash

source .env

BASE_URL="https://www.zohoapis.in/books/v3"

# -------------------------------
# 🔑 Get Access Token
# -------------------------------
get_access_token() {
  RESPONSE=$(curl -s -X POST  "https://accounts.zoho.in/oauth/v2/token" \
    -d "refresh_token=$ZOHO_REFRESH_TOKEN" \
    -d "client_id=$ZOHO_CLIENT_ID" \
    -d "client_secret=$ZOHO_CLIENT_SECRET" \
    -d "grant_type=refresh_token")

  ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')

  if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" == "null" ]; then
    echo "❌ Failed to get access token"
    echo "$RESPONSE" | jq
    exit 1
  fi

  echo "$ACCESS_TOKEN"
}

ACCESS_TOKEN=$(get_access_token)

HEADERS=(
  -H "Authorization: Zoho-oauthtoken $ACCESS_TOKEN"
  -H "Content-Type: application/json"
)

# -------------------------------
# 📦 Item Mapping
# -------------------------------
get_item_id() {
  case $1 in
    "4") echo "3644122000000051003" ;;
    "6") echo "3644122000000051021" ;;
    "8") echo "3644122000000051039" ;;
  esac
}

# -------------------------------
# 👤 Create Customer
# -------------------------------
create_customer() {
  NAME="$1"

  RESPONSE=$(curl -s "${HEADERS[@]}" \
    -X POST "$BASE_URL/contacts?organization_id=$ZOHO_ORGANIZATION_ID" \
    -d "{
      \"contact_name\": \"$NAME\",
      \"contact_type\": \"customer\"
    }")

  CODE=$(echo "$RESPONSE" | jq -r '.code')

  if [ "$CODE" != "0" ]; then
    echo "❌ Customer creation failed: $NAME"
    echo "$RESPONSE" | jq
    return 1
  fi

  echo "$RESPONSE" | jq -r '.contact.contact_id'
}

# -------------------------------
# 🧾 Create Estimate
# -------------------------------
create_estimate() {
  CUSTOMER_ID="$1"
  LINE_ITEMS="$2"

  RESPONSE=$(curl -s "${HEADERS[@]}" \
    -X POST "$BASE_URL/estimates?organization_id=$ZOHO_ORGANIZATION_ID" \
    -d "{
      \"customer_id\": $CUSTOMER_ID,
      \"line_items\": $LINE_ITEMS
    }")

  CODE=$(echo "$RESPONSE" | jq -r '.code')

  if [ "$CODE" != "0" ]; then
    echo "❌ Estimate failed for customer_id: $CUSTOMER_ID"
    echo "$RESPONSE" | jq
    return 1
  fi

  echo "✅ Estimate created for customer_id: $CUSTOMER_ID"
}

# -------------------------------
# 🔄 Process Order
# -------------------------------
process_order() {
  CUSTOMER="$1"
  ITEMS="$2"

  if [ "$CUSTOMER" == "Cash Sale" ]; then
    CUSTOMER_ID="$CASH_CUSTOMER_ID"
  else
    CUSTOMER_ID=$(create_customer "$CUSTOMER") || return
  fi

  echo "→ Processing $CUSTOMER (ID: $CUSTOMER_ID)"
  create_estimate "$CUSTOMER_ID" "$ITEMS"
  echo "-----------------------------"
}

# -------------------------------
# 🏁 Start
# -------------------------------

echo "🚀 Starting..."

CASH_CUSTOMER_ID=$(create_customer "Cash Sale")

# Orders from your PDF

process_order "manjunat andrahalli" "[
  {\"item_id\":\"$(get_item_id 4)\",\"rate\":29,\"quantity\":120}
]"

process_order "Danamatnahalli" "[
  {\"item_id\":\"$(get_item_id 6)\",\"rate\":36,\"quantity\":500}
]"

process_order "ragavendra kolar" "[
  {\"item_id\":\"$(get_item_id 6)\",\"rate\":40,\"quantity\":500}
]"

process_order "Prabhakar G Gowda" "[
  {\"item_id\":\"$(get_item_id 6)\",\"rate\":30.5,\"quantity\":200}
]"

process_order "Venkat achalapathi" "[
  {\"item_id\":\"$(get_item_id 4)\",\"rate\":30,\"quantity\":64},
  {\"item_id\":\"$(get_item_id 6)\",\"rate\":38,\"quantity\":500}
]"

process_order "Cash Sale" "[
  {\"item_id\":\"$(get_item_id 6)\",\"rate\":34,\"quantity\":290}
]"

process_order "Cash Sale" "[
  {\"item_id\":\"$(get_item_id 4)\",\"rate\":29,\"quantity\":50},
  {\"item_id\":\"$(get_item_id 6)\",\"rate\":34,\"quantity\":100}
]"

process_order "sanju Vemagal" "[
  {\"item_id\":\"$(get_item_id 6)\",\"rate\":36,\"quantity\":1000}
]"

process_order "Kumaranna" "[
  {\"item_id\":\"$(get_item_id 6)\",\"rate\":36,\"quantity\":250},
  {\"item_id\":\"$(get_item_id 4)\",\"rate\":30,\"quantity\":400}
]"

echo "🎉 Done."
