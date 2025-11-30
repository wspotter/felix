# 📚 Art Supply Store MCP Server - Complete Tools Documentation

This document provides comprehensive documentation for all 25 tools available in the Art Supply Store MCP Server.

---

## 📋 Table of Contents

1. [Inventory Management Tools](#inventory-management-tools)
2. [Customer Management Tools](#customer-management-tools)
3. [Sales & Analytics Tools](#sales--analytics-tools)
4. [Supplier & Ordering Tools](#supplier--ordering-tools)
5. [Scheduling & Operations Tools](#scheduling--operations-tools)
6. [Pricing & Promotions Tools](#pricing--promotions-tools)
7. [Reporting & Insights Tools](#reporting--insights-tools)

---

## 📦 Inventory Management Tools

### 1. `check_inventory`

**Description:** Check current stock levels for a product or category.

**Parameters:**
- `sku` (optional, string): Specific product SKU to check
- `category` (optional, string): Filter by category
  - Valid values: `Paint`, `Canvas`, `Brushes`, `Drawing`, `Tools`

**Returns:** Product details including current quantity, reorder level, price, and supplier information.

**Example Usage:**
```json
{
  "name": "check_inventory",
  "arguments": {
    "sku": "AP-100"
  }
}
```

**Example Response:**
```
🎨 Acrylic Paint Set (AP-100)
Current Stock: 15 units
Reorder Level: 10 units
Status: ✅ Adequate Stock
Price: $45.99
Category: Paint
Supplier: ArtSupply Co
```

---

### 2. `get_low_stock_items`

**Description:** Get list of all products below their reorder level that need restocking.

**Parameters:**
- `category` (optional, string): Filter by specific category
  - Valid values: `Paint`, `Canvas`, `Brushes`, `Drawing`, `Tools`

**Returns:** List of low stock items with current quantities and reorder levels.

**Example Usage:**
```json
{
  "name": "get_low_stock_items",
  "arguments": {
    "category": "Brushes"
  }
}
```

**Example Response:**
```
⚠️ Low Stock Alert - 2 items need reordering:

🖌️ Professional Brush Set (BR-300)
Current: 8 units | Reorder at: 10 units
Supplier: BrushMaster Inc | Lead Time: 7 days

🖌️ Detail Brushes Pack (BR-400)
Current: 12 units | Reorder at: 15 units
Supplier: ArtSupply Co | Lead Time: 5 days
```

---

### 3. `update_stock`

**Description:** Update inventory quantity after receiving shipment or doing physical count. Records the change in the system.

**Parameters:**
- `sku` (required, string): Product SKU to update
- `quantity` (required, number): New quantity amount
- `reason` (required, string): Reason for update
  - Valid values: `received`, `sold`, `damaged`, `count`

**Returns:** Confirmation of stock update with before/after quantities.

**Example Usage:**
```json
{
  "name": "update_stock",
  "arguments": {
    "sku": "AP-100",
    "quantity": 30,
    "reason": "received"
  }
}
```

**Example Response:**
```
✅ Stock Updated for Acrylic Paint Set (AP-100)
Previous: 15 units
New: 30 units
Change: +15 units
Reason: received
Updated: 2025-10-04 14:30:00
```

---

### 4. `search_products`

**Description:** Search for products by name, category, or supplier. Returns detailed product information.

**Parameters:**
- `query` (required, string): Search term (product name, SKU, category, or supplier)
- `filterBy` (optional, string): Additional filter criteria
  - Valid values: `category`, `supplier`, `price_range`

**Returns:** List of matching products with full details.

**Example Usage:**
```json
{
  "name": "search_products",
  "arguments": {
    "query": "canvas",
    "filterBy": "category"
  }
}
```

**Example Response:**
```
🔍 Found 2 products matching "canvas":

📄 Professional Canvas (CN-200)
Price: $29.99 | Stock: 25 units
Category: Canvas | Supplier: ArtSupply Co

📄 Canvas Board Set (CN-500)
Price: $35.99 | Stock: 18 units
Category: Canvas | Supplier: Canvas Pros
```

---

## 👥 Customer Management Tools

### 5. `lookup_customer`

**Description:** Find customer information by name, email, or phone. Returns purchase history, loyalty points, and preferences.

**Parameters:**
- `identifier` (required, string): Customer name, email, or phone number

**Returns:** Complete customer profile including contact info, purchase history, loyalty points, and preferences.

**Example Usage:**
```json
{
  "name": "lookup_customer",
  "arguments": {
    "identifier": "sarah.johnson@email.com"
  }
}
```

**Example Response:**
```
👤 Customer Profile: Sarah Johnson

📧 Email: sarah.johnson@email.com
📞 Phone: 555-0101
⭐ Loyalty Points: 450

📊 Purchase History:
• Total Spent: $3,250
• Last Purchase: 2025-09-28
• Favorite Categories: Paint, Canvas

🎨 Preferences: Professional grade acrylics, large canvases
```

---

### 6. `update_loyalty_points`

**Description:** Add or redeem loyalty points for a customer. Store policy: 1 point per $1 spent, 100 points = $10 off.

**Parameters:**
- `customerId` (required, string): Customer ID (e.g., "CUST001")
- `points` (required, number): Points to add (positive) or redeem (negative)
- `reason` (required, string): Reason for point adjustment
  - Common values: `purchase`, `redemption`, `promotion`, `adjustment`

**Returns:** Updated loyalty points balance with transaction details.

**Example Usage:**
```json
{
  "name": "update_loyalty_points",
  "arguments": {
    "customerId": "CUST001",
    "points": 50,
    "reason": "purchase"
  }
}
```

**Example Response:**
```
✅ Loyalty Points Updated for Sarah Johnson

Transaction: +50 points (purchase)
Previous Balance: 450 points
New Balance: 500 points

💰 Rewards Available: $50 discount (5 x $10 rewards)
```

---

### 7. `get_customer_recommendations`

**Description:** Get personalized product recommendations based on customer purchase history and preferences.

**Parameters:**
- `customerId` (required, string): Customer ID

**Returns:** List of recommended products tailored to customer's buying patterns.

**Example Usage:**
```json
{
  "name": "get_customer_recommendations",
  "arguments": {
    "customerId": "CUST001"
  }
}
```

**Example Response:**
```
🎯 Personalized Recommendations for Sarah Johnson

Based on purchase history (Acrylics, Large Canvas):

1. 🖌️ Professional Brush Set (BR-300)
   $34.99 | Perfect for acrylic painting
   Reason: Complements recent acrylic purchases

2. 🎨 Premium Acrylic Varnish (AP-150)
   $18.99 | Protects finished paintings
   Reason: Frequently bought with canvas

3. 📐 Professional Easel (DR-600)
   $89.99 | Adjustable studio easel
   Reason: Popular with canvas buyers
```

---

### 8. `get_top_customers`

**Description:** Get list of top customers by total spending or loyalty points. Useful for VIP outreach and marketing.

**Parameters:**
- `sortBy` (required, string): Sorting criteria
  - Valid values: `spending`, `loyalty_points`
- `limit` (optional, number): Number of customers to return (default: 10)

**Returns:** Ranked list of top customers with metrics.

**Example Usage:**
```json
{
  "name": "get_top_customers",
  "arguments": {
    "sortBy": "spending",
    "limit": 5
  }
}
```

**Example Response:**
```
🏆 Top 5 Customers by Spending

1. 👑 Sarah Johnson
   Total Spent: $3,250 | Loyalty Points: 450
   Last Visit: 2025-09-28

2. 🥈 Mike Chen
   Total Spent: $2,800 | Loyalty Points: 380
   Last Visit: 2025-09-30

3. 🥉 Emily Davis
   Total Spent: $1,950 | Loyalty Points: 295
   Last Visit: 2025-10-01

[...]
```

---

## 💰 Sales & Analytics Tools

### 9. `get_daily_sales`

**Description:** Get sales summary for a specific date including revenue, transaction count, and top-selling items.

**Parameters:**
- `date` (optional, string): Date in YYYY-MM-DD format (default: today)

**Returns:** Comprehensive daily sales summary.

**Example Usage:**
```json
{
  "name": "get_daily_sales",
  "arguments": {
    "date": "2025-10-01"
  }
}
```

**Example Response:**
```
📊 Daily Sales Report - October 1, 2025

💰 Total Revenue: $1,245.50
🛒 Transactions: 18
📈 Average Sale: $69.19

🏆 Top Sellers:
1. Acrylic Paint Set - 5 units
2. Canvas Board Set - 4 units
3. Professional Brush Set - 3 units

📦 Categories:
• Paint: $650 (52%)
• Brushes: $280 (22%)
• Canvas: $315 (26%)
```

---

### 10. `get_sales_report`

**Description:** Generate comprehensive sales report for a date range with trends, comparisons, and insights.

**Parameters:**
- `startDate` (required, string): Start date in YYYY-MM-DD format
- `endDate` (required, string): End date in YYYY-MM-DD format

**Returns:** Detailed sales analysis with trends and comparisons.

**Example Usage:**
```json
{
  "name": "get_sales_report",
  "arguments": {
    "startDate": "2025-10-01",
    "endDate": "2025-10-03"
  }
}
```

**Example Response:**
```
📈 Sales Report: Oct 1-3, 2025 (3 days)

💰 Total Revenue: $3,891.48
🛒 Total Transactions: 54
📊 Average Transaction: $72.06

Daily Breakdown:
• Oct 1: $1,245.50 (18 transactions)
• Oct 2: $1,389.00 (20 transactions)
• Oct 3: $1,256.98 (16 transactions)

📈 Trend: +0.9% vs previous period

🏆 Best Performing Category: Paint (48%)
📉 Needs Attention: Drawing supplies (12%)
```

---

### 11. `get_best_sellers`

**Description:** Get top-selling products by category or overall, with quantity sold and revenue generated.

**Parameters:**
- `period` (required, string): Time period for analysis
  - Valid values: `week`, `month`, `quarter`, `year`
- `category` (optional, string): Filter by specific category

**Returns:** Ranked list of best-selling products with sales metrics.

**Example Usage:**
```json
{
  "name": "get_best_sellers",
  "arguments": {
    "period": "month",
    "category": "Paint"
  }
}
```

**Example Response:**
```
🏆 Best Sellers - Last Month (Paint Category)

1. 🎨 Acrylic Paint Set (AP-100)
   Units Sold: 85 | Revenue: $3,909
   Growth: +15% vs previous month

2. 🖌️ Oil Paint Set (OP-200)
   Units Sold: 62 | Revenue: $3,596
   Growth: +8% vs previous month

3. ✨ Watercolor Set (WC-400)
   Units Sold: 48 | Revenue: $1,391
   Growth: -5% vs previous month

Total Category Revenue: $8,896
Category Share: 45% of total sales
```

---

### 12. `calculate_profit_margin`

**Description:** Calculate profit margin for a product or category based on cost and selling price.

**Parameters:**
- `sku` (required, string): Product SKU
- `costPrice` (required, number): Cost price per unit

**Returns:** Detailed profit margin analysis.

**Example Usage:**
```json
{
  "name": "calculate_profit_margin",
  "arguments": {
    "sku": "AP-100",
    "costPrice": 28.50
  }
}
```

**Example Response:**
```
💹 Profit Margin Analysis - Acrylic Paint Set (AP-100)

💵 Cost Price: $28.50
🏷️ Retail Price: $45.99
💰 Profit per Unit: $17.49

📊 Profit Margin: 38.0%
📈 Markup: 61.4%

Current Stock: 15 units
Potential Profit: $262.35

✅ Margin Status: Healthy (target: 30-40%)
```

---

## 🚚 Supplier & Ordering Tools

### 13. `get_supplier_info`

**Description:** Get detailed supplier information including contact details, lead times, and minimum order requirements.

**Parameters:**
- `supplierName` (required, string): Supplier name or ID

**Returns:** Complete supplier profile with terms and contact information.

**Example Usage:**
```json
{
  "name": "get_supplier_info",
  "arguments": {
    "supplierName": "ArtSupply Co"
  }
}
```

**Example Response:**
```
🏢 Supplier Profile: ArtSupply Co

📞 Contact: (555) 123-4567
📧 Email: orders@artsupply.com
🌐 Website: www.artsupply.com

📦 Terms:
• Lead Time: 5-7 business days
• Minimum Order: $250
• Payment Terms: Net 30
• Free Shipping: Orders over $500

📊 Products Supplied:
• Acrylic Paint Set (AP-100)
• Professional Canvas (CN-200)
• Sketchbook Set (DR-500)

⭐ Rating: 4.8/5 | Reliable delivery record
```

---

### 14. `create_purchase_order`

**Description:** Create a purchase order for restocking. Automatically suggests items below reorder level.

**Parameters:**
- `supplier` (required, string): Supplier name
- `autoIncludeLowStock` (optional, boolean): Automatically include low stock items from this supplier
- `customItems` (optional, string): Comma-separated SKUs to include manually

**Returns:** Generated purchase order with items, quantities, and total cost.

**Example Usage:**
```json
{
  "name": "create_purchase_order",
  "arguments": {
    "supplier": "BrushMaster Inc",
    "autoIncludeLowStock": true
  }
}
```

**Example Response:**
```
📋 Purchase Order Generated

🏢 Supplier: BrushMaster Inc
📅 Date: 2025-10-04
🚚 Expected Delivery: 2025-10-11 (7 days)

Items to Order:
1. Professional Brush Set (BR-300)
   Current: 8 | Order: 25 units | Cost: $700.00

2. Detail Brushes Pack (BR-400)
   Current: 12 | Order: 20 units | Cost: $359.80

💰 Subtotal: $1,059.80
🚚 Shipping: $25.00
💵 Total: $1,084.80

✅ Meets minimum order: $500
📄 PO Number: PO-2025-0004
```

---

### 15. `compare_supplier_prices`

**Description:** Compare prices and terms across suppliers for a specific product or category.

**Parameters:**
- `productName` (required, string): Product name or category to compare

**Returns:** Side-by-side comparison of suppliers with pricing and terms.

**Example Usage:**
```json
{
  "name": "compare_supplier_prices",
  "arguments": {
    "productName": "brushes"
  }
}
```

**Example Response:**
```
💲 Price Comparison for "brushes"

🏢 BrushMaster Inc:
• Professional Brush Set - $28.00
• Detail Brushes Pack - $17.99
Lead Time: 7 days

🏢 ArtSupply Co:
• Professional Brush Set - $30.50
• Deluxe Brush Collection - $42.99
Lead Time: 5 days

💡 Best Value: BrushMaster Inc (9% cheaper on average)
⚡ Fastest Delivery: ArtSupply Co (2 days faster)
```

---

## 📅 Scheduling & Operations Tools

### 16. `check_appointments`

**Description:** Check scheduled appointments for a specific date or customer.

**Parameters:**
- `date` (optional, string): Date in YYYY-MM-DD format (default: today)

**Returns:** List of scheduled appointments with details.

**Example Usage:**
```json
{
  "name": "check_appointments",
  "arguments": {
    "date": "2025-10-05"
  }
}
```

**Example Response:**
```
📅 Appointments for October 5, 2025

10:00 AM - Custom Framing
👤 Customer: Emily Davis
📝 Notes: Large landscape painting - need specialty frame
⏱️ Duration: 45 minutes

2:00 PM - Art Consultation
👤 Customer: New customer (walk-in)
📝 Notes: Oil painting beginner package
⏱️ Duration: 30 minutes

Total: 2 appointments scheduled
```

---

### 17. `book_appointment`

**Description:** Schedule a new appointment for custom framing, consultations, or workshops.

**Parameters:**
- `customerName` (required, string): Customer name
- `service` (required, string): Type of service
  - Valid values: `framing`, `consultation`, `workshop`
- `date` (required, string): Date in YYYY-MM-DD format
- `time` (required, string): Time in HH:MM format (24-hour)

**Returns:** Confirmation of booked appointment.

**Example Usage:**
```json
{
  "name": "book_appointment",
  "arguments": {
    "customerName": "John Smith",
    "service": "framing",
    "date": "2025-10-06",
    "time": "14:30"
  }
}
```

**Example Response:**
```
✅ Appointment Booked Successfully

📅 Date: October 6, 2025
⏰ Time: 2:30 PM
👤 Customer: John Smith
🖼️ Service: Custom Framing
⏱️ Duration: 45 minutes (estimated)

📧 Confirmation email sent to customer
📅 Added to store calendar

💡 Reminder: Prepare frame samples and price list
```

---

### 18. `get_employee_schedule`

**Description:** Get employee schedule and shift information for staffing planning.

**Parameters:**
- `date` (optional, string): Date in YYYY-MM-DD format or day of week (e.g., "Monday")

**Returns:** Staff schedule with shift details.

**Example Usage:**
```json
{
  "name": "get_employee_schedule",
  "arguments": {
    "date": "2025-10-04"
  }
}
```

**Example Response:**
```
👥 Employee Schedule - October 4, 2025 (Friday)

🕐 Morning Shift (9:00 AM - 2:00 PM):
• Sarah Johnson - Store Manager
  Rate: $22/hr | Total: 5 hours

🕑 Afternoon Shift (2:00 PM - 7:00 PM):
• Mike Chen - Sales Associate
  Rate: $16/hr | Total: 5 hours
• Emily Davis - Sales Associate
  Rate: $15/hr | Total: 5 hours

💰 Total Labor Cost: $265.00
👥 Coverage: Good (2 staff during peak hours)
```

---

### 19. `calculate_labor_cost`

**Description:** Calculate labor costs for a specific period based on employee hours and rates.

**Parameters:**
- `startDate` (required, string): Start date in YYYY-MM-DD format
- `endDate` (required, string): End date in YYYY-MM-DD format

**Returns:** Detailed labor cost breakdown.

**Example Usage:**
```json
{
  "name": "calculate_labor_cost",
  "arguments": {
    "startDate": "2025-10-01",
    "endDate": "2025-10-03"
  }
}
```

**Example Response:**
```
💼 Labor Cost Analysis - Oct 1-3, 2025 (3 days)

Employee Breakdown:
1. Sarah Johnson (Manager)
   Hours: 15 | Rate: $22/hr | Total: $330.00

2. Mike Chen (Associate)
   Hours: 15 | Rate: $16/hr | Total: $240.00

3. Emily Davis (Associate)
   Hours: 15 | Rate: $15/hr | Total: $225.00

💰 Total Labor Cost: $795.00
📊 Average per Day: $265.00
📈 Labor % of Revenue: 20.4% (target: 18-25%)

✅ Labor costs within acceptable range
```

---

## 🏷️ Pricing & Promotions Tools

### 20. `calculate_discount`

**Description:** Calculate discounted price for promotions, bulk orders, or loyalty rewards.

**Parameters:**
- `sku` (required, string): Product SKU
- `discountType` (required, string): Type of discount
  - Valid values: `percentage`, `fixed`, `loyalty`, `bulk`
- `discountValue` (required, number): Discount percentage (for percentage type) or fixed amount
- `quantity` (optional, number): Quantity for bulk pricing

**Returns:** Price breakdown with discount applied.

**Example Usage:**
```json
{
  "name": "calculate_discount",
  "arguments": {
    "sku": "AP-100",
    "discountType": "percentage",
    "discountValue": 15,
    "quantity": 3
  }
}
```

**Example Response:**
```
💰 Discount Calculation - Acrylic Paint Set (AP-100)

🏷️ Regular Price: $45.99 per unit
📦 Quantity: 3 units
💵 Subtotal: $137.97

🎯 Discount Applied: 15% off (Promotional)
💸 Discount Amount: -$20.70
✨ Final Price: $117.27

📊 Unit Price After Discount: $39.09
💡 Customer Saves: $20.70 (15%)

Per Unit Breakdown:
• Original: $45.99
• Discounted: $39.09
• Savings: $6.90 each
```

---

### 21. `suggest_bundle`

**Description:** Suggest product bundles based on frequently bought together items or complementary products.

**Parameters:**
- `baseSku` (required, string): Base product SKU to build bundle around

**Returns:** Recommended bundle with pricing and savings.

**Example Usage:**
```json
{
  "name": "suggest_bundle",
  "arguments": {
    "baseSku": "AP-100"
  }
}
```

**Example Response:**
```
🎁 Suggested Bundle - Complete Acrylic Painting Kit

Based on: Acrylic Paint Set (AP-100)

Bundle Includes:
1. 🎨 Acrylic Paint Set (AP-100) - $45.99
2. 📄 Professional Canvas (CN-200) - $29.99
3. 🖌️ Professional Brush Set (BR-300) - $34.99

💰 Individual Prices Total: $110.97
🎯 Bundle Price: $94.32 (15% discount)
💸 Customer Saves: $16.65!

📊 Why this bundle?
• 78% of customers who buy acrylic paints also purchase canvas
• Most popular beginner/intermediate combo
• Everything needed to start painting immediately

✅ Recommended as "Complete Starter Kit"
```

---

## 📊 Reporting & Insights Tools

### 22. `generate_eod_report`

**Description:** Generate end-of-day report with sales summary, cash reconciliation needs, and action items.

**Parameters:**
- `date` (optional, string): Date in YYYY-MM-DD format (default: today)

**Returns:** Comprehensive EOD report with tasks and recommendations.

**Example Usage:**
```json
{
  "name": "generate_eod_report",
  "arguments": {
    "date": "2025-10-04"
  }
}
```

**Example Response:**
```
🌙 End of Day Report - October 4, 2025

💰 SALES SUMMARY
Revenue: $1,423.50
Transactions: 22
Average Sale: $64.70
Payment Methods:
• Credit Card: $1,120 (79%)
• Cash: $303.50 (21%)

📦 INVENTORY
Low Stock Items: 3 products need reordering
• Professional Brush Set (BR-300)
• Detail Brushes Pack (BR-400)
• Watercolor Set (WC-400)

👥 CUSTOMER ACTIVITY
New Customers: 2
Loyalty Redemptions: 3 ($30 total)
Top Customer: Sarah Johnson ($125.50)

📅 TOMORROW'S SCHEDULE
Appointments: 2 scheduled
Staff: Full coverage (3 employees)

✅ ACTION ITEMS
1. Create purchase order for BrushMaster Inc
2. Follow up with new customers (send welcome email)
3. Prepare for Saturday workshop (materials check)
4. Review weekend staff schedule

💡 INSIGHTS
• Canvas sales up 18% this week
• Consider promoting brush bundles (low stock)
• Friday sales tracking above average
```

---

### 23. `get_inventory_value`

**Description:** Calculate total inventory value at cost or retail price for financial reporting.

**Parameters:**
- `valueType` (required, string): Calculation method
  - Valid values: `cost`, `retail`
- `category` (optional, string): Filter by specific category

**Returns:** Detailed inventory valuation report.

**Example Usage:**
```json
{
  "name": "get_inventory_value",
  "arguments": {
    "valueType": "retail",
    "category": "Paint"
  }
}
```

**Example Response:**
```
💎 Inventory Valuation Report - Paint Category

Calculation Method: Retail Price

Product Breakdown:
1. Acrylic Paint Set (AP-100)
   Units: 15 | Unit Price: $45.99 | Value: $689.85

2. Oil Paint Set (OP-200)
   Units: 22 | Unit Price: $58.00 | Value: $1,276.00

3. Watercolor Set (WC-400)
   Units: 12 | Unit Price: $28.99 | Value: $347.88

4. Premium Acrylic (Mixed SKUs)
   Units: 18 | Avg Price: $35.50 | Value: $639.00

📊 CATEGORY TOTALS
Total Units: 67 items
Retail Value: $2,952.73
Cost Value: $1,821.18
Potential Margin: $1,131.55 (38.3%)

📈 Performance:
• Inventory turnover: 2.3x per month (Good)
• Days of inventory: 13 days
• Fast-moving: Acrylic Paint Set
• Slow-moving: Watercolor Set (consider promotion)
```

---

### 24. `forecast_demand`

**Description:** Forecast product demand based on historical sales data and seasonal trends.

**Parameters:**
- `sku` (required, string): Product SKU
- `forecastPeriod` (optional, string): Period to forecast
  - Valid values: `week`, `month`, `quarter` (default: `month`)

**Returns:** Demand forecast with recommendations.

**Example Usage:**
```json
{
  "name": "forecast_demand",
  "arguments": {
    "sku": "AP-100",
    "forecastPeriod": "month"
  }
}
```

**Example Response:**
```
📈 Demand Forecast - Acrylic Paint Set (AP-100)

Forecast Period: Next 30 days

📊 HISTORICAL DATA
Last 30 days: 85 units sold
Last 90 days: 245 units sold (avg 81.7/month)
Year over year: +12% growth

🔮 FORECAST
Expected Sales: 92-98 units
Confidence: 85%
Trend: Increasing (+8%)

📅 SEASONAL FACTORS
• October: Moderate demand (art class season)
• Historical pattern: Strong sales in fall
• Upcoming events: Back-to-school effect ending

📦 INVENTORY RECOMMENDATION
Current Stock: 15 units
Recommended Order: 85 units
Safety Stock: 20 units
Reorder Point: 25 units

⚠️ Stockout Risk: MODERATE
Current stock may last 4-5 days at forecasted rate

🎯 ACTION ITEMS
1. Place order for 85 units immediately
2. Consider promotional pricing to boost slower colors
3. Bundle with canvas for higher margin
4. Alert marketing team for email campaign

💡 INSIGHTS
• Trending up due to fall art classes
• Strong weekend sales pattern
• Professional artists buying for commissions
• Consider premium line expansion
```

---

## 📊 Quick Reference Table

| Tool Name | Category | Required Parameters | Optional Parameters |
|-----------|----------|---------------------|---------------------|
| `check_inventory` | Inventory | - | sku, category |
| `get_low_stock_items` | Inventory | - | category |
| `update_stock` | Inventory | sku, quantity, reason | - |
| `search_products` | Inventory | query | filterBy |
| `lookup_customer` | Customer | identifier | - |
| `update_loyalty_points` | Customer | customerId, points, reason | - |
| `get_customer_recommendations` | Customer | customerId | - |
| `get_top_customers` | Customer | sortBy | limit |
| `get_daily_sales` | Sales | - | date |
| `get_sales_report` | Sales | startDate, endDate | - |
| `get_best_sellers` | Sales | period | category |
| `calculate_profit_margin` | Sales | sku, costPrice | - |
| `get_supplier_info` | Supplier | supplierName | - |
| `create_purchase_order` | Supplier | supplier | autoIncludeLowStock, customItems |
| `compare_supplier_prices` | Supplier | productName | - |
| `check_appointments` | Operations | - | date |
| `book_appointment` | Operations | customerName, service, date, time | - |
| `get_employee_schedule` | Operations | - | date |
| `calculate_labor_cost` | Operations | startDate, endDate | - |
| `calculate_discount` | Pricing | sku, discountType, discountValue | quantity |
| `suggest_bundle` | Pricing | baseSku | - |
| `generate_eod_report` | Reporting | - | date |
| `get_inventory_value` | Reporting | valueType | category |
| `forecast_demand` | Reporting | sku | forecastPeriod |

---

## 🎯 Common Use Cases

### Scenario 1: Daily Opening Checklist
```bash
1. check_inventory (check overall stock)
2. get_low_stock_items (identify reorder needs)
3. check_appointments (review today's schedule)
4. get_employee_schedule (confirm staffing)
```

### Scenario 2: Customer Service
```bash
1. lookup_customer (get customer info)
2. get_customer_recommendations (suggest products)
3. calculate_discount (apply loyalty discount)
4. update_loyalty_points (add points for purchase)
```

### Scenario 3: End of Day Closing
```bash
1. get_daily_sales (review day's performance)
2. generate_eod_report (complete EOD checklist)
3. create_purchase_order (order low stock items)
4. forecast_demand (plan for tomorrow)
```

### Scenario 4: Business Analysis
```bash
1. get_sales_report (review period performance)
2. get_best_sellers (identify top products)
3. get_inventory_value (financial reporting)
4. calculate_profit_margin (analyze profitability)
```

---

## 🔧 Error Handling

All tools follow consistent error handling:

**Common Error Responses:**
- **Missing required parameter**: `"Error: [parameter] is required"`
- **Invalid parameter value**: `"Error: Invalid value for [parameter]"`
- **Not found**: `"Error: [Item] not found"`
- **Out of range**: `"Error: [Value] out of acceptable range"`

**Example Error:**
```json
{
  "error": "Product SKU 'INVALID-SKU' not found in inventory",
  "suggestion": "Use search_products to find valid SKUs"
}
```

---

## 📝 Best Practices

1. **Always validate input** before calling tools
2. **Use date formats consistently** (YYYY-MM-DD)
3. **Check return values** for error messages
4. **Chain tools logically** (e.g., check_inventory → create_purchase_order)
5. **Cache frequently used data** (customer info, inventory) to reduce calls
6. **Handle edge cases** (weekend dates, holidays, out of stock)
7. **Use optional parameters** to filter and refine results

---

## 🚀 Advanced Features

### Batch Operations
Some tools support batch operations through array inputs (future enhancement).

### Real-time Updates
Dashboard at http://localhost:3000 shows real-time tool usage and statistics.

### Webhooks (Coming Soon)
Subscribe to events like:
- Low stock alerts
- Large sales notifications
- Daily report generation

---

## 📞 Support

- **Dashboard**: http://localhost:3000
- **Documentation**: This file
- **MCP Specification**: https://modelcontextprotocol.io/specification/latest
- **GitHub**: Your repository URL

---

**Last Updated**: October 4, 2025  
**Version**: 1.0.0  
**Total Tools**: 24 (25 with upcoming features)
