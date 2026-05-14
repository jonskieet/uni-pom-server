#!/bin/bash

# ============================================================
# API Testing Examples — cURL commands
# ============================================================
# Thay ${BASE_URL} bằng http://localhost:5000 hoặc production URL
# Thay ${TOKEN} bằng JWT token lấy từ login

BASE_URL="http://localhost:5000/api"
TOKEN=""  # Sẽ lấy từ login

# ============================================================
# 1. AUTHENTICATION
# ============================================================

# Login
echo "🔐 Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "CHANGE_ME"
  }')

echo "Login Response: $LOGIN_RESPONSE"

# Extract token (requires jq or similar)
# TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
# echo "Token: $TOKEN"

# Get current user info
echo ""
echo "👤 Getting current user..."
curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Change password
echo ""
echo "🔑 Changing password..."
curl -s -X POST "$BASE_URL/auth/change-password" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "old_password": "CHANGE_ME",
    "new_password": "your_new_password_123"
  }' | jq .

# ============================================================
# 2. PRODUCTS
# ============================================================

# Get all products
echo ""
echo "📦 Getting all products..."
curl -s -X GET "$BASE_URL/products?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Get product by ID
echo ""
echo "📦 Getting product by ID..."
curl -s -X GET "$BASE_URL/products/1" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Create product
echo ""
echo "➕ Creating product..."
curl -s -X POST "$BASE_URL/products" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "brand_id": 1,
    "category_id": 1,
    "name": "Test Switch",
    "part_number": "TEST-001",
    "unit": "Cái",
    "price": 1000000,
    "vat_rate": 0.1,
    "status": "active",
    "description": "Test product"
  }' | jq .

# ============================================================
# 3. BRANDS
# ============================================================

# Get all brands
echo ""
echo "🏢 Getting all brands..."
curl -s -X GET "$BASE_URL/brands" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Create brand
echo ""
echo "➕ Creating brand..."
curl -s -X POST "$BASE_URL/brands" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test Brand",
    "short_name": "TB",
    "country": "Vietnam"
  }' | jq .

# ============================================================
# 4. CATEGORIES
# ============================================================

# Get all categories
echo ""
echo "📂 Getting all categories..."
curl -s -X GET "$BASE_URL/categories" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Create category
echo ""
echo "➕ Creating category..."
curl -s -X POST "$BASE_URL/categories" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test Category",
    "description": "Test category description"
  }' | jq .

# ============================================================
# 5. SOLUTIONS
# ============================================================

# Get all solutions
echo ""
echo "💡 Getting all solutions..."
curl -s -X GET "$BASE_URL/solutions" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Create solution
echo ""
echo "➕ Creating solution..."
curl -s -X POST "$BASE_URL/solutions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test Solution",
    "code": "TEST",
    "description": "Test solution"
  }' | jq .

# ============================================================
# 6. POMS
# ============================================================

# Get all POMs
echo ""
echo "📋 Getting all POMs..."
curl -s -X GET "$BASE_URL/poms?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Create POM
echo ""
echo "➕ Creating POM..."
curl -s -X POST "$BASE_URL/poms" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "project_name": "Test Project",
    "customer_name": "Test Customer",
    "solution_id": 1,
    "note": "Test POM"
  }' | jq .

# Add item to POM
echo ""
echo "➕ Adding item to POM..."
curl -s -X POST "$BASE_URL/poms/1/items" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "product_id": 1,
    "quantity": 5,
    "unit_price": 1000000,
    "vat_rate": 0.1,
    "note": "Test item"
  }' | jq .

# Change POM status
echo ""
echo "📝 Changing POM status..."
curl -s -X PUT "$BASE_URL/poms/1/status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "status": "submitted"
  }' | jq .

# ============================================================
# 7. SURVEYS
# ============================================================

# Get all surveys
echo ""
echo "🔍 Getting all surveys..."
curl -s -X GET "$BASE_URL/surveys?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Create survey
echo ""
echo "➕ Creating survey..."
curl -s -X POST "$BASE_URL/surveys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "pom_id": 1,
    "report_type": "LAN",
    "project_name": "Test Project",
    "customer_name": "Test Customer",
    "site_address": "123 Test Street",
    "surveyor_name": "Test Surveyor"
  }' | jq .

# Add item to survey
echo ""
echo "➕ Adding item to survey..."
curl -s -X POST "$BASE_URL/surveys/1/items" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "product_id": 1,
    "product_name": "Test Switch",
    "quantity_proposed": 5,
    "quantity_actual": 5,
    "unit": "Cái",
    "location": "Floor 1",
    "condition_note": "Good condition"
  }' | jq .

# ============================================================
# 8. USERS
# ============================================================

# Get all users
echo ""
echo "👥 Getting all users..."
curl -s -X GET "$BASE_URL/users" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Create user
echo ""
echo "➕ Creating user..."
curl -s -X POST "$BASE_URL/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "username": "newuser",
    "full_name": "New User",
    "role": "sales",
    "password": "temp_password_123"
  }' | jq .

echo ""
echo "✅ Testing complete!"
