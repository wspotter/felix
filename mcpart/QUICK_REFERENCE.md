# 🎯 Quick Reference - Art Supply Store MCP Tools

> **Quick lookup guide** - For full documentation see [TOOLS_DOCUMENTATION.md](./TOOLS_DOCUMENTATION.md)

---

## 📦 Inventory Management

| Tool | Usage | Returns |
|------|-------|---------|
| `check_inventory` | Check stock levels | Current qty, reorder level, supplier |
| `get_low_stock_items` | Find items to reorder | List of low stock products |
| `update_stock` | Update quantities | Confirmation with change log |
| `search_products` | Find products | Matching products with details |

**Common Parameters:**
- `sku`: Product code (e.g., "AP-100")
- `category`: Paint, Canvas, Brushes, Drawing, Tools
- `quantity`: Number amount
- `reason`: received, sold, damaged, count

---

## 👥 Customer Management

| Tool | Usage | Returns |
|------|-------|---------|
| `lookup_customer` | Find customer info | Profile, history, loyalty points |
| `update_loyalty_points` | Add/redeem points | New balance, rewards available |
| `get_customer_recommendations` | Product suggestions | Personalized recommendations |
| `get_top_customers` | Best customers list | Ranked by spending/points |

**Common Parameters:**
- `identifier`: Name, email, or phone
- `customerId`: Customer ID (e.g., "CUST001")
- `points`: Number (positive = add, negative = redeem)
- `sortBy`: spending, loyalty_points

---

## 💰 Sales & Analytics

| Tool | Usage | Returns |
|------|-------|---------|
| `get_daily_sales` | Day's sales summary | Revenue, transactions, top items |
| `get_sales_report` | Period analysis | Trends, comparisons, insights |
| `get_best_sellers` | Top products | Ranked by sales/revenue |
| `calculate_profit_margin` | Profit analysis | Margin %, markup, potential profit |

**Common Parameters:**
- `date`: YYYY-MM-DD format
- `startDate`, `endDate`: Date range
- `period`: week, month, quarter, year
- `costPrice`: Cost per unit

---

## 🚚 Supplier Management

| Tool | Usage | Returns |
|------|-------|---------|
| `get_supplier_info` | Supplier details | Contact, terms, lead times |
| `create_purchase_order` | Generate PO | Order items, quantities, total |
| `compare_supplier_prices` | Price comparison | Best value, fastest delivery |

**Common Parameters:**
- `supplierName`: Supplier name
- `autoIncludeLowStock`: true/false
- `productName`: Product or category

---

## 📅 Operations

| Tool | Usage | Returns |
|------|-------|---------|
| `check_appointments` | View schedule | Appointment list with details |
| `book_appointment` | Schedule service | Confirmation, calendar entry |
| `get_employee_schedule` | Staff schedule | Shifts, hours, coverage |
| `calculate_labor_cost` | Labor expenses | Cost breakdown by employee |

**Common Parameters:**
- `service`: framing, consultation, workshop
- `time`: HH:MM format (24-hour)
- `date`: YYYY-MM-DD or day name

---

## 🏷️ Pricing & Promotions

| Tool | Usage | Returns |
|------|-------|---------|
| `calculate_discount` | Apply discount | Final price, savings breakdown |
| `suggest_bundle` | Bundle recommendations | Bundle items, savings |

**Common Parameters:**
- `discountType`: percentage, fixed, loyalty, bulk
- `discountValue`: Percentage or dollar amount
- `baseSku`: Product to build bundle around

---

## 📊 Reporting

| Tool | Usage | Returns |
|------|-------|---------|
| `generate_eod_report` | End-of-day report | Sales, inventory, action items |
| `get_inventory_value` | Inventory worth | Total value, margin analysis |
| `forecast_demand` | Future demand | Expected sales, reorder advice |

**Common Parameters:**
- `valueType`: cost, retail
- `forecastPeriod`: week, month, quarter

---

## 🔥 Most Common Workflows

### Opening Store (Morning)
```bash
1. check_appointments          # See today's schedule
2. get_low_stock_items         # Check reorder needs
3. get_employee_schedule       # Confirm staffing
```

### Helping Customer
```bash
1. lookup_customer             # Get customer info
2. get_customer_recommendations # Suggest products
3. calculate_discount          # Apply any discounts
4. update_loyalty_points       # Add points after purchase
```

### Closing Store (Evening)
```bash
1. get_daily_sales             # Review day's sales
2. generate_eod_report         # Complete EOD tasks
3. create_purchase_order       # Order low stock items
```

### Weekly Analysis
```bash
1. get_sales_report            # Review week's performance
2. get_best_sellers            # Identify top products
3. get_top_customers           # Recognize VIPs
4. forecast_demand             # Plan next week
```

---

## 💡 Pro Tips

✅ **Always use YYYY-MM-DD format** for dates  
✅ **Check return values** for error messages  
✅ **Chain tools logically** for complex workflows  
✅ **Use categories** to filter results  
✅ **Test on dashboard** at http://localhost:3000  

---

## 🚨 Common Error Solutions

| Error | Solution |
|-------|----------|
| "SKU not found" | Use `search_products` to find valid SKUs |
| "Customer not found" | Check spelling, try email/phone instead |
| "Invalid date format" | Use YYYY-MM-DD (e.g., 2025-10-04) |
| "Below minimum order" | Add more items to meet supplier minimum |
| "Invalid parameter" | Check [TOOLS_DOCUMENTATION.md](./TOOLS_DOCUMENTATION.md) for valid values |

---

## 📍 Quick Links

- 📖 **Full Documentation**: [TOOLS_DOCUMENTATION.md](./TOOLS_DOCUMENTATION.md)
- 🌐 **Dashboard**: http://localhost:3000
- 🔗 **Open WebUI Setup**: [OPENWEBUI_INTEGRATION.md](./OPENWEBUI_INTEGRATION.md)
- 📚 **MCP Spec**: https://modelcontextprotocol.io/specification/latest

---

## 📊 Tool Count by Category

| Category | Tools | Most Used |
|----------|-------|-----------|
| Inventory | 4 | check_inventory |
| Customer | 4 | lookup_customer |
| Sales | 4 | get_daily_sales |
| Supplier | 3 | create_purchase_order |
| Operations | 4 | check_appointments |
| Pricing | 2 | calculate_discount |
| Reporting | 3 | generate_eod_report |
| **Total** | **24** | |

---

**Last Updated**: October 4, 2025  
**Quick Reference Version**: 1.0
