# 🎨 MCP Art Supply Store

**Model Context Protocol Server with 36 Business Management Tools**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)](https://modelcontextprotocol.io/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

A complete Model Context Protocol (MCP) server for managing an art supply store business with 36 professional tools across 8 categories, plus social media integration.

## ✨ Features

### 📦 36 Business Management Tools

#### 🛍️ Inventory Management (5 tools)
- Add/update/remove products
- Check stock levels
- Low stock alerts
- Track product details

#### 👥 Customer Management (4 tools)
- Add/update/retrieve customers
- Customer purchase history
- Loyalty tracking
- Contact management

#### 📝 Order Processing (5 tools)
- Create/update/cancel orders
- Order status tracking
- Order history
- Fulfillment management

#### 💰 Financial Tools (3 tools)
- Sales reports
- Revenue tracking
- Profit analysis

#### 🎨 Art Classes (5 tools)
- Schedule management
- Student enrollment
- Instructor tracking
- Class capacity monitoring

#### 📊 Analytics (4 tools)
- Sales analytics
- Customer insights
- Product performance
- Trend analysis

#### 📢 Marketing (3 tools)
- Campaign management
- Promotion tracking
- Customer targeting

#### 🌐 Social Media (12 tools)
- Facebook post creation
- Instagram publishing
- Post scheduling
- Comment management
- Analytics tracking
- Multi-platform support

### 🎯 Key Capabilities

- **Complete Business Management** - All tools for running an art supply store
- **Social Media Integration** - Facebook & Instagram via Meta Graph API (FREE)
- **Real-time Analytics** - Track sales, customers, and performance
- **Web Dashboard** - Beautiful UI for testing and monitoring
- **TypeScript** - Type-safe, maintainable code
- **MCP Protocol** - Standard Model Context Protocol implementation

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- (Optional) Facebook/Instagram Business accounts for social media features

### Installation

```bash
# Clone the repository
git clone https://github.com/wspotter/mcpart.git
cd mcpart

# Install dependencies
npm install

# Build the project
npm run build

# Configure environment (optional - for social media)
cp .env.example .env
# Edit .env with your API keys
```

### Running the Server

**As MCP Server:**
```bash
npm start
```

**With Dashboard:**
```bash
npm run dashboard
# Open http://localhost:3000
```

## 📖 Documentation

### Quick Links
- **[Setup Guide](README.md)** - Installation and configuration
- **[Tools Documentation](TOOLS_DOCUMENTATION.md)** - All 36 tools reference
- **[Facebook/Instagram Setup](FACEBOOK_INSTAGRAM_SETUP.md)** - Social media integration (500+ lines)
- **[Integration Guide](OPENWEBUI_INTEGRATION.md)** - Using with Open WebUI
- **[Quick Reference](QUICK_REFERENCE.md)** - Command cheat sheet

Total: **1,500+ lines** of documentation

## 🛠️ Tool Categories

### 1. Inventory Management
```typescript
inventory_add_product
inventory_update_product
inventory_remove_product
inventory_check_stock
inventory_list_low_stock
```

### 2. Customer Management
```typescript
customer_add
customer_update
customer_get
customer_list_purchases
```

### 3. Order Processing
```typescript
order_create
order_update
order_cancel
order_get_status
order_list
```

### 4. Financial Tools
```typescript
finance_get_sales_report
finance_get_revenue
finance_get_profit_analysis
```

### 5. Art Classes
```typescript
class_schedule
class_enroll_student
class_list_students
class_get_schedule
class_update_instructor
```

### 6. Analytics
```typescript
analytics_sales_trends
analytics_customer_insights
analytics_product_performance
analytics_monthly_report
```

### 7. Marketing
```typescript
marketing_create_campaign
marketing_track_promotion
marketing_get_customer_segments
```

### 8. Social Media (Meta Graph API - FREE!)
```typescript
social_facebook_create_post
social_instagram_create_post
social_schedule_post
social_get_post_analytics
social_reply_to_comment
social_get_comments
social_delete_post
social_update_post
social_get_page_insights
social_get_instagram_insights
social_upload_media
social_get_scheduled_posts
```

## 🎨 Dashboard

Beautiful web interface for testing and monitoring:

### Features
- **8 Category Navigation** - Organized sidebar
- **Tool Cards** - Visual tool display with descriptions
- **Real-time Testing** - Test any tool with JSON input
- **Search Functionality** - Find tools quickly
- **Responsive Design** - Works on all devices
- **Dark Theme** - Easy on the eyes

### Access
```bash
npm run dashboard
open http://localhost:3000
```

## 🌐 Social Media Integration

### Facebook & Instagram (FREE!)

Uses Meta Graph API - **no cost** for basic posting and analytics.

**Setup Steps:**
1. Create Facebook App
2. Get Page Access Token
3. Configure `.env` file
4. Connect Instagram Business Account
5. Start posting!

**See:** [FACEBOOK_INSTAGRAM_SETUP.md](FACEBOOK_INSTAGRAM_SETUP.md) for detailed guide (500+ lines)

**Features:**
- Create posts with images
- Schedule future posts
- Monitor comments
- Reply to comments
- Track analytics
- Multi-platform (FB + IG)

## 📊 Example Usage

### Add a Product
```typescript
{
  "name": "inventory_add_product",
  "arguments": {
    "name": "Acrylic Paint Set",
    "sku": "APS-001",
    "quantity": 50,
    "price": 29.99,
    "category": "Paint",
    "supplier": "ArtPro Inc"
  }
}
```

### Create Facebook Post
```typescript
{
  "name": "social_facebook_create_post",
  "arguments": {
    "message": "New paint sets just arrived! 🎨",
    "imageUrl": "https://example.com/paint.jpg",
    "link": "https://shop.example.com/paint-sets"
  }
}
```

### Check Sales Report
```typescript
{
  "name": "finance_get_sales_report",
  "arguments": {
    "startDate": "2025-10-01",
    "endDate": "2025-10-31"
  }
}
```

## 🔧 Configuration

### Environment Variables

```bash
# .env file

# Server
PORT=3000

# Meta Graph API (for social media - optional)
META_ACCESS_TOKEN=your_page_access_token
META_PAGE_ID=your_facebook_page_id
META_INSTAGRAM_ACCOUNT_ID=your_instagram_business_account_id

# API Version
META_API_VERSION=v18.0
```

### MCP Configuration

Add to your MCP client config (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "art-supply-store": {
      "command": "node",
      "args": ["/path/to/mcpart/build/index.js"],
      "env": {
        "META_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

## 📁 Project Structure

```
mcpart/
├── src/
│   ├── index.ts              # Main MCP server
│   ├── dashboard.ts          # Web dashboard server
│   └── social-media.ts       # Social media manager
├── public/
│   ├── index.html            # Dashboard UI
│   ├── styles.css            # Dashboard styling
│   └── script.js             # Dashboard logic
├── build/                    # Compiled TypeScript
├── docs/
│   ├── TOOLS_DOCUMENTATION.md
│   ├── FACEBOOK_INSTAGRAM_SETUP.md
│   └── QUICK_REFERENCE.md
├── .env.example              # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## 🎯 Use Cases

- **Art Supply Stores** - Complete business management
- **Retail Shops** - Inventory and sales tracking
- **Class Management** - Schedule and enrollment
- **Social Media Marketing** - Automated posting
- **Business Analytics** - Performance tracking
- **Customer Management** - Loyalty and history
- **AI Assistants** - Give AI tools to manage business

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- [ ] Additional payment integrations
- [ ] Email marketing tools
- [ ] Advanced analytics dashboards
- [ ] Mobile app
- [ ] More social platforms (Twitter, TikTok)
- [ ] Inventory forecasting
- [ ] CRM features

## 📄 License

MIT License - free to use in your projects!

## 🙏 Credits

Built with:
- **MCP TypeScript SDK** - [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- **Meta Graph API** - Facebook/Instagram integration
- **Express.js** - Dashboard server
- **TypeScript** - Type-safe development

## 🌟 Star This Repo!

If you find this MCP server useful, please give it a ⭐!

## 📞 Support

- **Documentation:** See `/docs` folder
- **Issues:** [GitHub Issues](https://github.com/wspotter/mcpart/issues)
- **Discussions:** [GitHub Discussions](https://github.com/wspotter/mcpart/discussions)

## 🔮 Roadmap

- [x] 24 core business tools
- [x] Social media integration (12 tools)
- [x] Web dashboard
- [x] TypeScript implementation
- [x] Meta Graph API integration
- [ ] Additional social platforms
- [ ] Email marketing
- [ ] Advanced analytics
- [ ] Mobile app
- [ ] Multi-store support

## 📈 Stats

- **36 Tools** across 8 categories
- **1,500+ lines** of documentation
- **TypeScript** for type safety
- **Free** social media posting
- **Production-ready** code
- **Comprehensive** error handling

## 💼 Perfect For

- Small business owners
- Art supply stores
- Retail shops
- AI assistant developers
- MCP protocol developers
- Social media managers

## 🎉 Get Started

```bash
git clone https://github.com/wspotter/mcpart.git
cd mcpart
npm install
npm run build
npm run dashboard
# Visit http://localhost:3000
```

---

**Version:** 1.0  
**Tools:** 36 professional tools  
**Status:** Production-Ready  
**Created:** October 2025

Made with 💚 for the MCP community!

Transform your AI assistant into a complete business management system! 🎨
