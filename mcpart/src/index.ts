import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { socialMediaManager } from './social-media.js';
import { universalTools, handleUniversalTool } from './universal-tools.js';
import { vipTools, handleVIPTool } from './vip-tools.js';

// Art Supply Store MCP Server
const server = new Server(
  {
    name: 'art-supply-store-assistant',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Mock database for demonstration
const storeData = {
  inventory: [
    { id: 'SKU001', name: 'Acrylic Paint Set (24 colors)', category: 'Paint', quantity: 45, reorderLevel: 20, price: 34.99, supplier: 'ArtCo Supplies', lastRestocked: '2025-09-28' },
    { id: 'SKU002', name: 'Professional Watercolor Set', category: 'Paint', quantity: 12, reorderLevel: 15, price: 89.99, supplier: 'Premium Art Inc', lastRestocked: '2025-09-15' },
    { id: 'SKU003', name: 'Canvas Panel 16x20"', category: 'Canvas', quantity: 78, reorderLevel: 30, price: 12.99, supplier: 'Canvas Warehouse', lastRestocked: '2025-10-01' },
    { id: 'SKU004', name: 'Synthetic Brush Set (10pc)', category: 'Brushes', quantity: 5, reorderLevel: 10, price: 24.99, supplier: 'BrushMasters Ltd', lastRestocked: '2025-08-20' },
    { id: 'SKU005', name: 'Oil Paint Starter Kit', category: 'Paint', quantity: 23, reorderLevel: 15, price: 65.99, supplier: 'ArtCo Supplies', lastRestocked: '2025-09-25' },
    { id: 'SKU006', name: 'Drawing Pencil Set (12B-6H)', category: 'Drawing', quantity: 34, reorderLevel: 20, price: 18.99, supplier: 'Sketchers Supply', lastRestocked: '2025-09-30' },
    { id: 'SKU007', name: 'Stretched Canvas 24x36"', category: 'Canvas', quantity: 15, reorderLevel: 10, price: 28.99, supplier: 'Canvas Warehouse', lastRestocked: '2025-09-28' },
    { id: 'SKU008', name: 'Palette Knife Set (5pc)', category: 'Tools', quantity: 18, reorderLevel: 12, price: 15.99, supplier: 'ArtTools Direct', lastRestocked: '2025-09-22' },
  ],
  customers: [
    { id: 'CUST001', name: 'Sarah Martinez', email: 'sarah.m@email.com', phone: '555-0101', loyaltyPoints: 450, totalSpent: 1250.45, lastVisit: '2025-10-02', preferences: ['Watercolor', 'Brushes'] },
    { id: 'CUST002', name: 'James Chen', email: 'jchen@email.com', phone: '555-0102', loyaltyPoints: 890, totalSpent: 2340.78, lastVisit: '2025-10-03', preferences: ['Oil Paint', 'Canvas'] },
    { id: 'CUST003', name: 'Emily Rodriguez', email: 'emily.r@email.com', phone: '555-0103', loyaltyPoints: 230, totalSpent: 678.90, lastVisit: '2025-09-28', preferences: ['Drawing', 'Sketching'] },
    { id: 'CUST004', name: 'Michael Foster', email: 'm.foster@email.com', phone: '555-0104', loyaltyPoints: 1200, totalSpent: 3890.50, lastVisit: '2025-10-01', preferences: ['Acrylic', 'Canvas', 'Brushes'] },
  ],
  sales: [
    { date: '2025-10-03', revenue: 456.78, transactions: 12, topItem: 'Acrylic Paint Set' },
    { date: '2025-10-02', revenue: 623.45, transactions: 18, topItem: 'Canvas Panel 16x20"' },
    { date: '2025-10-01', revenue: 389.90, transactions: 9, topItem: 'Oil Paint Starter Kit' },
    { date: '2025-09-30', revenue: 712.34, transactions: 21, topItem: 'Drawing Pencil Set' },
  ],
  suppliers: [
    { id: 'SUP001', name: 'ArtCo Supplies', contact: 'orders@artcosupplies.com', phone: '1-800-ART-SUPP', leadTime: '5-7 days', minOrder: 500 },
    { id: 'SUP002', name: 'Premium Art Inc', contact: 'sales@premiumart.com', phone: '1-888-PREMIUM', leadTime: '7-10 days', minOrder: 1000 },
    { id: 'SUP003', name: 'Canvas Warehouse', contact: 'wholesale@canvaswarehouse.com', phone: '1-877-CANVAS-1', leadTime: '3-5 days', minOrder: 300 },
    { id: 'SUP004', name: 'BrushMasters Ltd', contact: 'orders@brushmasters.com', phone: '1-866-BRUSH-99', leadTime: '5-7 days', minOrder: 250 },
  ],
  appointments: [
    { id: 'APT001', customerName: 'Sarah Martinez', service: 'Custom Framing Consultation', date: '2025-10-05', time: '14:00', duration: '30 min' },
    { id: 'APT002', customerName: 'Lisa Park', service: 'Art Technique Workshop', date: '2025-10-06', time: '10:00', duration: '2 hours' },
  ],
  employees: [
    { id: 'EMP001', name: 'Alex Johnson', role: 'Store Manager', shift: 'Mon-Fri 9AM-6PM', hourlyRate: 22 },
    { id: 'EMP002', name: 'Maria Santos', role: 'Sales Associate', shift: 'Tue-Sat 10AM-7PM', hourlyRate: 16 },
    { id: 'EMP003', name: 'David Kim', role: 'Art Specialist', shift: 'Wed-Sun 11AM-8PM', hourlyRate: 18 },
  ]
};

// Tool definitions
const tools = [
  // INVENTORY MANAGEMENT TOOLS
  {
    name: 'check_inventory',
    description: 'Check current inventory levels for a specific product or category. Returns stock quantity, reorder status, and supplier information.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Product name, SKU, or category to search for' },
      },
      required: ['search'],
    },
  },
  {
    name: 'get_low_stock_items',
    description: 'Get a list of all items that are at or below their reorder level. Critical for preventing stockouts.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional: filter by category (Paint, Canvas, Brushes, Drawing, Tools)' },
      },
    },
  },
  {
    name: 'update_stock',
    description: 'Update inventory quantity after receiving shipment or doing physical count. Records the change in the system.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Product SKU to update' },
        quantity: { type: 'number', description: 'New quantity amount' },
        reason: { type: 'string', description: 'Reason for update (received, sold, damaged, count)' },
      },
      required: ['sku', 'quantity', 'reason'],
    },
  },
  {
    name: 'search_products',
    description: 'Search for products by name, category, or supplier. Returns detailed product information.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term' },
        filterBy: { type: 'string', description: 'Optional: category, supplier, or price_range' },
      },
      required: ['query'],
    },
  },
  
  // CUSTOMER MANAGEMENT TOOLS
  {
    name: 'lookup_customer',
    description: 'Find customer information by name, email, or phone. Returns purchase history, loyalty points, and preferences.',
    inputSchema: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Customer name, email, or phone number' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'update_loyalty_points',
    description: 'Add or redeem loyalty points for a customer. Store policy: 1 point per $1 spent, 100 points = $10 off.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID' },
        points: { type: 'number', description: 'Points to add (positive) or redeem (negative)' },
        reason: { type: 'string', description: 'Reason for point adjustment' },
      },
      required: ['customerId', 'points', 'reason'],
    },
  },
  {
    name: 'get_customer_recommendations',
    description: 'Get personalized product recommendations based on customer purchase history and preferences.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID' },
      },
      required: ['customerId'],
    },
  },
  {
    name: 'get_top_customers',
    description: 'Get list of top customers by total spending or loyalty points. Useful for VIP outreach and marketing.',
    inputSchema: {
      type: 'object',
      properties: {
        sortBy: { type: 'string', description: 'Sort by: spending or loyalty_points' },
        limit: { type: 'number', description: 'Number of customers to return (default: 10)' },
      },
      required: ['sortBy'],
    },
  },

  // SALES & ANALYTICS TOOLS
  {
    name: 'get_daily_sales',
    description: 'Get sales summary for a specific date including revenue, transaction count, and top-selling items.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
      },
    },
  },
  {
    name: 'get_sales_report',
    description: 'Generate comprehensive sales report for a date range with trends, comparisons, and insights.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'get_best_sellers',
    description: 'Get top-selling products by category or overall, with quantity sold and revenue generated.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional: filter by category' },
        period: { type: 'string', description: 'Time period: week, month, quarter, year' },
      },
      required: ['period'],
    },
  },
  {
    name: 'calculate_profit_margin',
    description: 'Calculate profit margin for a product or category based on cost and selling price.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Product SKU' },
        costPrice: { type: 'number', description: 'Cost price per unit' },
      },
      required: ['sku', 'costPrice'],
    },
  },

  // SUPPLIER & ORDERING TOOLS
  {
    name: 'get_supplier_info',
    description: 'Get detailed supplier information including contact details, lead times, and minimum order requirements.',
    inputSchema: {
      type: 'object',
      properties: {
        supplierName: { type: 'string', description: 'Supplier name or ID' },
      },
      required: ['supplierName'],
    },
  },
  {
    name: 'create_purchase_order',
    description: 'Create a purchase order for restocking. Automatically suggests items below reorder level.',
    inputSchema: {
      type: 'object',
      properties: {
        supplier: { type: 'string', description: 'Supplier name' },
        autoIncludeLowStock: { type: 'boolean', description: 'Automatically include low stock items from this supplier' },
        customItems: { type: 'string', description: 'Optional: comma-separated SKUs to include' },
      },
      required: ['supplier'],
    },
  },
  {
    name: 'compare_supplier_prices',
    description: 'Compare prices and terms across suppliers for a specific product or category.',
    inputSchema: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: 'Product name or category' },
      },
      required: ['productName'],
    },
  },

  // SCHEDULING & OPERATIONS TOOLS
  {
    name: 'check_appointments',
    description: 'Check scheduled appointments for a specific date or customer.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
      },
    },
  },
  {
    name: 'book_appointment',
    description: 'Schedule a new appointment for custom framing, consultations, or workshops.',
    inputSchema: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: 'Customer name' },
        service: { type: 'string', description: 'Service type: framing, consultation, workshop' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Time in HH:MM format' },
      },
      required: ['customerName', 'service', 'date', 'time'],
    },
  },
  {
    name: 'get_employee_schedule',
    description: 'Get employee schedule and shift information for staffing planning.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format or day of week' },
      },
    },
  },
  {
    name: 'calculate_labor_cost',
    description: 'Calculate labor costs for a specific period based on employee hours and rates.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
      },
      required: ['startDate', 'endDate'],
    },
  },

  // PRICING & PROMOTIONS TOOLS
  {
    name: 'calculate_discount',
    description: 'Calculate discounted price for promotions, bulk orders, or loyalty rewards.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Product SKU' },
        discountType: { type: 'string', description: 'Type: percentage, fixed, loyalty, bulk' },
        discountValue: { type: 'number', description: 'Discount percentage or fixed amount' },
        quantity: { type: 'number', description: 'Quantity for bulk pricing' },
      },
      required: ['sku', 'discountType', 'discountValue'],
    },
  },
  {
    name: 'suggest_bundle',
    description: 'Suggest product bundles based on frequently bought together items or complementary products.',
    inputSchema: {
      type: 'object',
      properties: {
        baseSku: { type: 'string', description: 'Base product SKU to build bundle around' },
      },
      required: ['baseSku'],
    },
  },

  // REPORTING & INSIGHTS TOOLS
  {
    name: 'generate_eod_report',
    description: 'Generate end-of-day report with sales summary, cash reconciliation needs, and action items.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
      },
    },
  },
  {
    name: 'get_inventory_value',
    description: 'Calculate total inventory value at cost or retail price for financial reporting.',
    inputSchema: {
      type: 'object',
      properties: {
        valueType: { type: 'string', description: 'Calculate at: cost or retail price' },
        category: { type: 'string', description: 'Optional: filter by category' },
      },
      required: ['valueType'],
    },
  },
  {
    name: 'forecast_demand',
    description: 'Forecast product demand based on historical sales data and seasonal trends.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Product SKU' },
        period: { type: 'string', description: 'Forecast period: week, month, quarter' },
      },
      required: ['sku', 'period'],
    },
  },

  // SOCIAL MEDIA MANAGEMENT TOOLS
  {
    name: 'post_to_social_media',
    description: 'Post content to Facebook and/or Instagram. Requires Meta API configuration. Can schedule posts for future publishing.',
    inputSchema: {
      type: 'object',
      properties: {
        platforms: { type: 'string', description: 'Comma-separated platforms: facebook, instagram, or both' },
        message: { type: 'string', description: 'Post caption/message' },
        imageUrl: { type: 'string', description: 'Optional: URL to image (required for Instagram)' },
        hashtags: { type: 'string', description: 'Optional: Comma-separated hashtags (without # symbol)' },
        scheduleTime: { type: 'string', description: 'Optional: Schedule for future (YYYY-MM-DD HH:MM format)' },
      },
      required: ['platforms', 'message'],
    },
  },
  {
    name: 'generate_post_ideas',
    description: 'Generate creative post ideas based on products, themes, or seasons. Perfect for content planning.',
    inputSchema: {
      type: 'object',
      properties: {
        theme: { type: 'string', description: 'Theme or season: fall, winter, spring, summer, sale, new_arrival, etc.' },
        products: { type: 'string', description: 'Comma-separated product names to feature' },
        count: { type: 'number', description: 'Number of ideas to generate (default: 5)' },
      },
      required: ['theme', 'products'],
    },
  },
  {
    name: 'schedule_weekly_posts',
    description: 'Create a weekly posting schedule with varied content types. Saves hours of planning time.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Week start date (YYYY-MM-DD)' },
        postsPerDay: { type: 'number', description: 'Number of posts per day (1-3 recommended)' },
        focusProducts: { type: 'string', description: 'Comma-separated products to feature this week' },
      },
      required: ['startDate', 'postsPerDay'],
    },
  },
  {
    name: 'get_social_analytics',
    description: 'Get performance analytics from Facebook and Instagram including reach, engagement, and top posts.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'Platform: facebook or instagram' },
        period: { type: 'number', description: 'Number of days to analyze (default: 7)' },
      },
      required: ['platform'],
    },
  },
  {
    name: 'get_new_comments',
    description: 'Retrieve new comments from Facebook and Instagram posts for timely responses.',
    inputSchema: {
      type: 'object',
      properties: {
        sinceHours: { type: 'number', description: 'Get comments from last X hours (default: 24)' },
        platform: { type: 'string', description: 'Optional: filter by facebook or instagram' },
      },
    },
  },
  {
    name: 'suggest_comment_reply',
    description: 'Get AI-powered reply suggestions for customer comments. Maintains friendly, professional tone.',
    inputSchema: {
      type: 'object',
      properties: {
        commentText: { type: 'string', description: 'The comment text to reply to' },
        tone: { type: 'string', description: 'Reply tone: friendly, professional, enthusiastic (default: friendly)' },
      },
      required: ['commentText'],
    },
  },
  {
    name: 'generate_hashtags',
    description: 'Generate relevant hashtags for posts to maximize reach and engagement.',
    inputSchema: {
      type: 'object',
      properties: {
        postTopic: { type: 'string', description: 'Main topic or theme of the post' },
        includeLocation: { type: 'boolean', description: 'Include location-based hashtags (default: true)' },
        count: { type: 'number', description: 'Number of hashtags to generate (default: 15)' },
      },
      required: ['postTopic'],
    },
  },
  {
    name: 'get_instagram_story_ideas',
    description: 'Get creative Instagram Story ideas featuring products, behind-the-scenes, or promotions.',
    inputSchema: {
      type: 'object',
      properties: {
        occasion: { type: 'string', description: 'Occasion: daily, weekend, sale, holiday, new_product' },
        products: { type: 'string', description: 'Optional: specific products to feature' },
      },
      required: ['occasion'],
    },
  },
  {
    name: 'create_product_campaign',
    description: 'Create a multi-post campaign to promote a specific product or collection across platforms.',
    inputSchema: {
      type: 'object',
      properties: {
        productSku: { type: 'string', description: 'Product SKU to promote' },
        duration: { type: 'number', description: 'Campaign duration in days' },
        platforms: { type: 'string', description: 'Platforms: facebook, instagram, or both' },
      },
      required: ['productSku', 'duration', 'platforms'],
    },
  },
  {
    name: 'analyze_post_performance',
    description: 'Analyze individual post performance with insights on what content performs best.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'Facebook or Instagram post ID' },
        compareToAverage: { type: 'boolean', description: 'Compare to account average (default: true)' },
      },
      required: ['postId'],
    },
  },
  {
    name: 'auto_respond_common_questions',
    description: 'Enable automatic responses to frequently asked questions (hours, location, stock availability).',
    inputSchema: {
      type: 'object',
      properties: {
        enable: { type: 'boolean', description: 'Enable or disable auto-responses' },
        questionTypes: { type: 'string', description: 'Types to auto-respond: hours, location, stock, pricing (comma-separated)' },
      },
      required: ['enable'],
    },
  },
  {
    name: 'track_competitor_activity',
    description: 'Track competitor social media activity to stay informed about market trends and pricing.',
    inputSchema: {
      type: 'object',
      properties: {
        competitors: { type: 'string', description: 'Comma-separated competitor page names or IDs' },
        metrics: { type: 'string', description: 'Metrics to track: posts, engagement, promotions, products' },
      },
      required: ['competitors'],
    },
  },
  ...universalTools,
  ...vipTools
];

// Register all tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // INVENTORY MANAGEMENT
      // VIP DATASET GENERATION TOOLS
      case 'vip_generate_dataset':
      case 'vip_check_status':
      case 'vip_list_datasets':
      case 'vip_get_dataset_info':
      case 'vip_stop_pipeline':
      case 'vip_validate_config':
      case 'vip_health_check': {
        const result = await handleVIPTool(name, args);
        return {
          content: [{
            type: 'text',
            text: result
          }]
        };
      }


      // UNIVERSAL DAILY TASK TOOLS
      case 'create_task':
      case 'list_tasks':
      case 'complete_task':
      case 'update_task':
      case 'get_daily_agenda':
      case 'schedule_event':
      case 'list_upcoming_events':
      case 'set_reminder':
      case 'get_today_schedule':
      case 'create_note':
      case 'search_notes':
      case 'tag_note':
      case 'log_expense':
      case 'get_expense_summary':
      case 'categorize_expenses':
      case 'generate_daily_summary':
      case 'export_data':
      case 'create_alert':
      case 'list_alerts': {
        const result = await handleUniversalTool(name, args);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }
      case 'check_inventory': {
        const search = String(args?.search || '').toLowerCase();
        const results = storeData.inventory.filter(item =>
          item.name.toLowerCase().includes(search) ||
          item.id.toLowerCase().includes(search) ||
          item.category.toLowerCase().includes(search)
        );
        return {
          content: [{
            type: 'text',
            text: results.length > 0
              ? `Found ${results.length} item(s):\n\n${results.map(item => 
                  `${item.name} (${item.id})\n- Category: ${item.category}\n- Stock: ${item.quantity} units${item.quantity <= item.reorderLevel ? ' ⚠️ LOW STOCK' : ''}\n- Price: $${item.price}\n- Supplier: ${item.supplier}\n- Last Restocked: ${item.lastRestocked}`
                ).join('\n\n')}`
              : `No items found matching "${args?.search}"`
          }]
        };
      }

      case 'get_low_stock_items': {
        const category = args?.category ? String(args.category) : null;
        let lowStockItems = storeData.inventory.filter(item => item.quantity <= item.reorderLevel);
        if (category) {
          lowStockItems = lowStockItems.filter(item => item.category.toLowerCase() === category.toLowerCase());
        }
        return {
          content: [{
            type: 'text',
            text: lowStockItems.length > 0
              ? `⚠️ ${lowStockItems.length} item(s) need reordering:\n\n${lowStockItems.map(item =>
                  `${item.name} (${item.id})\n- Current: ${item.quantity} | Reorder Level: ${item.reorderLevel}\n- Need to order: ${item.reorderLevel * 2 - item.quantity} units\n- Supplier: ${item.supplier}`
                ).join('\n\n')}`
              : '✅ All items are adequately stocked!'
          }]
        };
      }

      case 'update_stock': {
        const sku = String(args?.sku || '');
        const quantity = Number(args?.quantity || 0);
        const reason = String(args?.reason || 'manual update');
        const item = storeData.inventory.find(i => i.id === sku);
        
        if (!item) {
          return { content: [{ type: 'text', text: `❌ Product ${sku} not found` }] };
        }
        
        const oldQty = item.quantity;
        item.quantity = quantity;
        const diff = quantity - oldQty;
        
        return {
          content: [{
            type: 'text',
            text: `✅ Stock updated for ${item.name}\n- Previous: ${oldQty} units\n- New: ${quantity} units\n- Change: ${diff > 0 ? '+' : ''}${diff} units\n- Reason: ${reason}\n- ${quantity <= item.reorderLevel ? '⚠️ Now below reorder level!' : 'Stock level OK'}`
          }]
        };
      }

      case 'search_products': {
        const query = String(args?.query || '').toLowerCase();
        const filterBy = args?.filterBy ? String(args.filterBy) : null;
        
        let results = storeData.inventory.filter(item =>
          item.name.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query)
        );
        
        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} product(s):\n\n${results.map(item =>
              `📦 ${item.name}\n- SKU: ${item.id} | Price: $${item.price}\n- Category: ${item.category} | Stock: ${item.quantity}\n- Supplier: ${item.supplier}`
            ).join('\n\n')}`
          }]
        };
      }

      // CUSTOMER MANAGEMENT
      case 'lookup_customer': {
        const identifier = String(args?.identifier || '').toLowerCase();
        const customer = storeData.customers.find(c =>
          c.name.toLowerCase().includes(identifier) ||
          c.email.toLowerCase().includes(identifier) ||
          c.phone.includes(identifier) ||
          c.id.toLowerCase() === identifier
        );
        
        if (!customer) {
          return { content: [{ type: 'text', text: `❌ Customer not found: "${args?.identifier}"` }] };
        }
        
        return {
          content: [{
            type: 'text',
            text: `👤 ${customer.name} (${customer.id})\n\n📧 ${customer.email}\n📱 ${customer.phone}\n\n💰 Total Spent: $${customer.totalSpent.toFixed(2)}\n⭐ Loyalty Points: ${customer.loyaltyPoints} (≈ $${(customer.loyaltyPoints / 10).toFixed(2)} credit)\n📅 Last Visit: ${customer.lastVisit}\n🎨 Preferences: ${customer.preferences.join(', ')}`
          }]
        };
      }

      case 'update_loyalty_points': {
        const customerId = String(args?.customerId || '');
        const points = Number(args?.points || 0);
        const reason = String(args?.reason || 'adjustment');
        const customer = storeData.customers.find(c => c.id === customerId);
        
        if (!customer) {
          return { content: [{ type: 'text', text: `❌ Customer ${customerId} not found` }] };
        }
        
        const oldPoints = customer.loyaltyPoints;
        customer.loyaltyPoints += points;
        
        return {
          content: [{
            type: 'text',
            text: `✅ Loyalty points updated for ${customer.name}\n- Previous: ${oldPoints} points\n- Change: ${points > 0 ? '+' : ''}${points} points\n- New Balance: ${customer.loyaltyPoints} points (≈ $${(customer.loyaltyPoints / 10).toFixed(2)} credit)\n- Reason: ${reason}`
          }]
        };
      }

      case 'get_customer_recommendations': {
        const customerId = String(args?.customerId || '');
        const customer = storeData.customers.find(c => c.id === customerId);
        
        if (!customer) {
          return { content: [{ type: 'text', text: `❌ Customer ${customerId} not found` }] };
        }
        
        const recommendations = storeData.inventory.filter(item =>
          customer.preferences.some(pref => 
            item.name.toLowerCase().includes(pref.toLowerCase()) ||
            item.category.toLowerCase().includes(pref.toLowerCase())
          )
        ).slice(0, 5);
        
        return {
          content: [{
            type: 'text',
            text: `🎯 Personalized recommendations for ${customer.name}:\n\nBased on preferences: ${customer.preferences.join(', ')}\n\n${recommendations.map(item =>
              `• ${item.name} - $${item.price}\n  ${item.quantity} in stock`
            ).join('\n')}`
          }]
        };
      }

      case 'get_top_customers': {
        const sortBy = String(args?.sortBy || 'spending');
        const limit = Number(args?.limit || 10);
        
        const sorted = [...storeData.customers].sort((a, b) =>
          sortBy === 'loyalty_points' ? b.loyaltyPoints - a.loyaltyPoints : b.totalSpent - a.totalSpent
        ).slice(0, limit);
        
        return {
          content: [{
            type: 'text',
            text: `🏆 Top ${limit} Customers by ${sortBy === 'loyalty_points' ? 'Loyalty Points' : 'Total Spending'}:\n\n${sorted.map((c, i) =>
              `${i + 1}. ${c.name}\n   ${sortBy === 'loyalty_points' ? `${c.loyaltyPoints} points` : `$${c.totalSpent.toFixed(2)} spent`} | Last visit: ${c.lastVisit}`
            ).join('\n\n')}`
          }]
        };
      }

      // SALES & ANALYTICS
      case 'get_daily_sales': {
        const date = String(args?.date || '2025-10-03');
        const salesData = storeData.sales.find(s => s.date === date);
        
        if (!salesData) {
          return { content: [{ type: 'text', text: `No sales data found for ${date}` }] };
        }
        
        return {
          content: [{
            type: 'text',
            text: `📊 Sales Report for ${salesData.date}\n\n💵 Revenue: $${salesData.revenue.toFixed(2)}\n🛒 Transactions: ${salesData.transactions}\n📈 Avg Transaction: $${(salesData.revenue / salesData.transactions).toFixed(2)}\n🏆 Top Seller: ${salesData.topItem}`
          }]
        };
      }

      case 'get_sales_report': {
        const startDate = String(args?.startDate || '');
        const endDate = String(args?.endDate || '');
        
        const periodSales = storeData.sales.filter(s => s.date >= startDate && s.date <= endDate);
        const totalRevenue = periodSales.reduce((sum, s) => sum + s.revenue, 0);
        const totalTransactions = periodSales.reduce((sum, s) => sum + s.transactions, 0);
        
        return {
          content: [{
            type: 'text',
            text: `📊 Sales Report: ${startDate} to ${endDate}\n\n💰 Total Revenue: $${totalRevenue.toFixed(2)}\n🛒 Total Transactions: ${totalTransactions}\n📈 Average Transaction: $${(totalRevenue / totalTransactions).toFixed(2)}\n📅 Days in Period: ${periodSales.length}\n📊 Daily Average: $${(totalRevenue / periodSales.length).toFixed(2)}`
          }]
        };
      }

      case 'get_best_sellers': {
        const category = args?.category ? String(args.category) : null;
        const period = String(args?.period || 'week');
        
        let items = storeData.inventory;
        if (category) {
          items = items.filter(i => i.category.toLowerCase() === category.toLowerCase());
        }
        
        const bestSellers = items.sort((a, b) => b.price - a.price).slice(0, 5);
        
        return {
          content: [{
            type: 'text',
            text: `🏆 Best Sellers${category ? ` in ${category}` : ''} (${period}):\n\n${bestSellers.map((item, i) =>
              `${i + 1}. ${item.name}\n   Price: $${item.price} | In stock: ${item.quantity}`
            ).join('\n\n')}`
          }]
        };
      }

      case 'calculate_profit_margin': {
        const sku = String(args?.sku || '');
        const costPrice = Number(args?.costPrice || 0);
        const item = storeData.inventory.find(i => i.id === sku);
        
        if (!item) {
          return { content: [{ type: 'text', text: `❌ Product ${sku} not found` }] };
        }
        
        const profit = item.price - costPrice;
        const margin = (profit / item.price) * 100;
        
        return {
          content: [{
            type: 'text',
            text: `💰 Profit Analysis: ${item.name}\n\n- Selling Price: $${item.price}\n- Cost Price: $${costPrice.toFixed(2)}\n- Profit per Unit: $${profit.toFixed(2)}\n- Profit Margin: ${margin.toFixed(1)}%\n- Potential Revenue (current stock): $${(item.quantity * profit).toFixed(2)}`
          }]
        };
      }

      // SUPPLIER & ORDERING
      case 'get_supplier_info': {
        const supplierName = String(args?.supplierName || '').toLowerCase();
        const supplier = storeData.suppliers.find(s =>
          s.name.toLowerCase().includes(supplierName) ||
          s.id.toLowerCase() === supplierName
        );
        
        if (!supplier) {
          return { content: [{ type: 'text', text: `❌ Supplier not found: "${args?.supplierName}"` }] };
        }
        
        const supplierProducts = storeData.inventory.filter(i => i.supplier === supplier.name);
        
        return {
          content: [{
            type: 'text',
            text: `🏢 ${supplier.name} (${supplier.id})\n\n📧 ${supplier.contact}\n📱 ${supplier.phone}\n⏱️ Lead Time: ${supplier.leadTime}\n💵 Minimum Order: $${supplier.minOrder}\n\n📦 Products from this supplier: ${supplierProducts.length}\n${supplierProducts.slice(0, 5).map(p => `• ${p.name}`).join('\n')}`
          }]
        };
      }

      case 'create_purchase_order': {
        const supplier = String(args?.supplier || '');
        const autoInclude = Boolean(args?.autoIncludeLowStock);
        
        const supplierInfo = storeData.suppliers.find(s => s.name.toLowerCase().includes(supplier.toLowerCase()));
        
        if (!supplierInfo) {
          return { content: [{ type: 'text', text: `❌ Supplier not found: "${supplier}"` }] };
        }
        
        const supplierProducts = storeData.inventory.filter(i => i.supplier === supplierInfo.name);
        const lowStock = autoInclude ? supplierProducts.filter(i => i.quantity <= i.reorderLevel) : [];
        
        const orderTotal = lowStock.reduce((sum, item) => sum + (item.price * (item.reorderLevel * 2 - item.quantity)), 0);
        
        return {
          content: [{
            type: 'text',
            text: `📝 Purchase Order Created\n\n🏢 Supplier: ${supplierInfo.name}\n📅 Date: ${new Date().toISOString().split('T')[0]}\n⏱️ Expected Delivery: ${supplierInfo.leadTime}\n\n${lowStock.length > 0 ? `Items to Order:\n${lowStock.map(item =>
              `• ${item.name} (${item.id})\n  Order Qty: ${item.reorderLevel * 2 - item.quantity} | Est. Cost: $${(item.price * (item.reorderLevel * 2 - item.quantity) * 0.6).toFixed(2)}`
            ).join('\n\n')}\n\n💰 Estimated Total: $${(orderTotal * 0.6).toFixed(2)}` : 'No items below reorder level for this supplier.'}`
          }]
        };
      }

      case 'compare_supplier_prices': {
        const productName = String(args?.productName || '').toLowerCase();
        const products = storeData.inventory.filter(i =>
          i.name.toLowerCase().includes(productName) ||
          i.category.toLowerCase().includes(productName)
        );
        
        if (products.length === 0) {
          return { content: [{ type: 'text', text: `No products found matching "${args?.productName}"` }] };
        }
        
        const supplierMap = new Map();
        products.forEach(p => {
          if (!supplierMap.has(p.supplier)) {
            supplierMap.set(p.supplier, []);
          }
          supplierMap.get(p.supplier).push(p);
        });
        
        return {
          content: [{
            type: 'text',
            text: `💲 Price Comparison for "${args?.productName}":\n\n${Array.from(supplierMap.entries()).map(([supplier, items]) => {
              const supplierInfo = storeData.suppliers.find(s => s.name === supplier);
              return `${supplier}:\n${items.map((item: any) => `• ${item.name} - $${item.price}`).join('\n')}\nLead Time: ${supplierInfo?.leadTime || 'N/A'}`;
            }).join('\n\n')}`
          }]
        };
      }

      // SCHEDULING & OPERATIONS
      case 'check_appointments': {
        const date = String(args?.date || new Date().toISOString().split('T')[0]);
        const appointments = storeData.appointments.filter(a => a.date === date);
        
        return {
          content: [{
            type: 'text',
            text: appointments.length > 0
              ? `📅 Appointments for ${date}:\n\n${appointments.map(apt =>
                  `⏰ ${apt.time} - ${apt.service}\n👤 Customer: ${apt.customerName}\n⏱️ Duration: ${apt.duration}`
                ).join('\n\n')}`
              : `No appointments scheduled for ${date}`
          }]
        };
      }

      case 'book_appointment': {
        const customerName = String(args?.customerName || '');
        const service = String(args?.service || '');
        const date = String(args?.date || '');
        const time = String(args?.time || '');
        
        const newApt = {
          id: `APT${String(storeData.appointments.length + 1).padStart(3, '0')}`,
          customerName,
          service,
          date,
          time,
          duration: service.toLowerCase().includes('workshop') ? '2 hours' : '30 min'
        };
        
        storeData.appointments.push(newApt);
        
        return {
          content: [{
            type: 'text',
            text: `✅ Appointment Booked!\n\n📅 ${date} at ${time}\n👤 ${customerName}\n🎨 Service: ${service}\n⏱️ Duration: ${newApt.duration}\n🎫 Confirmation: ${newApt.id}`
          }]
        };
      }

      case 'get_employee_schedule': {
        const date = String(args?.date || new Date().toLocaleDateString('en-US', { weekday: 'long' }));
        
        return {
          content: [{
            type: 'text',
            text: `👥 Employee Schedule:\n\n${storeData.employees.map(emp =>
              `${emp.name} - ${emp.role}\n📅 ${emp.shift}\n💵 Rate: $${emp.hourlyRate}/hr`
            ).join('\n\n')}`
          }]
        };
      }

      case 'calculate_labor_cost': {
        const startDate = String(args?.startDate || '');
        const endDate = String(args?.endDate || '');
        
        const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
        const totalCost = storeData.employees.reduce((sum, emp) => sum + (emp.hourlyRate * 40 * days / 7), 0);
        
        return {
          content: [{
            type: 'text',
            text: `💰 Labor Cost Analysis\n📅 Period: ${startDate} to ${endDate} (${days} days)\n\n${storeData.employees.map(emp =>
              `${emp.name}: $${(emp.hourlyRate * 40 * days / 7).toFixed(2)}`
            ).join('\n')}\n\n💵 Total Labor Cost: $${totalCost.toFixed(2)}\n📊 Daily Average: $${(totalCost / days).toFixed(2)}`
          }]
        };
      }

      // PRICING & PROMOTIONS
      case 'calculate_discount': {
        const sku = String(args?.sku || '');
        const discountType = String(args?.discountType || 'percentage');
        const discountValue = Number(args?.discountValue || 0);
        const quantity = Number(args?.quantity || 1);
        
        const item = storeData.inventory.find(i => i.id === sku);
        if (!item) {
          return { content: [{ type: 'text', text: `❌ Product ${sku} not found` }] };
        }
        
        let finalPrice = item.price;
        let discount = 0;
        
        switch (discountType) {
          case 'percentage':
            discount = item.price * (discountValue / 100);
            finalPrice = item.price - discount;
            break;
          case 'fixed':
            discount = discountValue;
            finalPrice = item.price - discount;
            break;
          case 'loyalty':
            discount = discountValue / 10;
            finalPrice = item.price - discount;
            break;
          case 'bulk':
            if (quantity >= 5) {
              discount = item.price * 0.15;
              finalPrice = item.price - discount;
            }
            break;
        }
        
        return {
          content: [{
            type: 'text',
            text: `💲 Price Calculation: ${item.name}\n\n- Original Price: $${item.price}\n- Discount Type: ${discountType}\n- Discount Amount: $${discount.toFixed(2)}\n- Final Price: $${finalPrice.toFixed(2)}\n- Quantity: ${quantity}\n- Total: $${(finalPrice * quantity).toFixed(2)}`
          }]
        };
      }

      case 'suggest_bundle': {
        const baseSku = String(args?.baseSku || '');
        const baseItem = storeData.inventory.find(i => i.id === baseSku);
        
        if (!baseItem) {
          return { content: [{ type: 'text', text: `❌ Product ${baseSku} not found` }] };
        }
        
        const complementary = storeData.inventory
          .filter(i => i.category === baseItem.category || i.id !== baseSku)
          .slice(0, 3);
        
        const bundlePrice = baseItem.price + complementary.reduce((sum, item) => sum + item.price, 0);
        const bundleDiscount = bundlePrice * 0.15;
        
        return {
          content: [{
            type: 'text',
            text: `🎁 Suggested Bundle:\n\n📦 Base Item:\n• ${baseItem.name} - $${baseItem.price}\n\n➕ Add to Bundle:\n${complementary.map(item =>
              `• ${item.name} - $${item.price}`
            ).join('\n')}\n\n💰 Bundle Price:\n- Individual Total: $${bundlePrice.toFixed(2)}\n- Bundle Discount (15%): -$${bundleDiscount.toFixed(2)}\n- Bundle Price: $${(bundlePrice - bundleDiscount).toFixed(2)}\n💵 Customer Saves: $${bundleDiscount.toFixed(2)}`
          }]
        };
      }

      // REPORTING & INSIGHTS
      case 'generate_eod_report': {
        const date = String(args?.date || '2025-10-03');
        const salesData = storeData.sales.find(s => s.date === date);
        const lowStock = storeData.inventory.filter(i => i.quantity <= i.reorderLevel);
        const appointments = storeData.appointments.filter(a => a.date === date);
        
        return {
          content: [{
            type: 'text',
            text: `📋 End of Day Report - ${date}\n\n💰 SALES SUMMARY:\n- Revenue: $${salesData?.revenue.toFixed(2) || '0.00'}\n- Transactions: ${salesData?.transactions || 0}\n- Avg Transaction: $${salesData ? (salesData.revenue / salesData.transactions).toFixed(2) : '0.00'}\n\n⚠️ ACTION ITEMS:\n- ${lowStock.length} items need reordering\n- ${appointments.length} appointments completed\n\n📊 KEY METRICS:\n- Top Seller: ${salesData?.topItem || 'N/A'}\n- Inventory Alerts: ${lowStock.length}\n\n✅ CLOSING TASKS:\n□ Count cash drawer\n□ Review low stock report\n□ Confirm tomorrow's appointments\n□ Lock up and set alarm`
          }]
        };
      }

      case 'get_inventory_value': {
        const valueType = String(args?.valueType || 'retail');
        const category = args?.category ? String(args.category) : null;
        
        let items = storeData.inventory;
        if (category) {
          items = items.filter(i => i.category.toLowerCase() === category.toLowerCase());
        }
        
        const retailValue = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const costValue = retailValue * 0.6; // Assume 40% markup
        
        return {
          content: [{
            type: 'text',
            text: `💎 Inventory Valuation${category ? ` - ${category}` : ''}\n\n📦 Total Items: ${items.length}\n📊 Total Units: ${items.reduce((sum, i) => sum + i.quantity, 0)}\n\n💰 Value at Cost: $${costValue.toFixed(2)}\n💵 Value at Retail: $${retailValue.toFixed(2)}\n📈 Potential Profit: $${(retailValue - costValue).toFixed(2)}`
          }]
        };
      }

      case 'forecast_demand': {
        const sku = String(args?.sku || '');
        const period = String(args?.period || 'month');
        const item = storeData.inventory.find(i => i.id === sku);
        
        if (!item) {
          return { content: [{ type: 'text', text: `❌ Product ${sku} not found` }] };
        }
        
        const baselineSales = 50;
        const periodMultiplier = period === 'week' ? 0.25 : period === 'month' ? 1 : 3;
        const forecast = Math.round(baselineSales * periodMultiplier);
        
        return {
          content: [{
            type: 'text',
            text: `📈 Demand Forecast: ${item.name}\n\n📅 Period: Next ${period}\n📊 Forecasted Sales: ~${forecast} units\n📦 Current Stock: ${item.quantity} units\n\n${item.quantity < forecast ? `⚠️ WARNING: Current stock may not meet demand!\n💡 Recommended order: ${forecast - item.quantity + item.reorderLevel} units` : '✅ Current stock sufficient for forecasted demand'}`
          }]
        };
      }

      // SOCIAL MEDIA MANAGEMENT
      case 'post_to_social_media': {
        if (!socialMediaManager.isConfigured()) {
          return {
            content: [{
              type: 'text',
              text: `⚠️ Social media not configured yet!\n\nTo use this feature:\n1. Create a Facebook Business account\n2. Create a Facebook App\n3. Get your access tokens\n4. Add them to your .env file\n\nSee FACEBOOK_INSTAGRAM_SETUP.md for detailed instructions.`
            }]
          };
        }

        const platforms = String(args?.platforms || 'facebook').toLowerCase().split(',').map(p => p.trim());
        const message = String(args?.message || '');
        const imageUrl = args?.imageUrl ? String(args.imageUrl) : undefined;
        const hashtags = args?.hashtags ? String(args.hashtags).split(',').map(h => h.trim()) : undefined;
        const scheduleTime = args?.scheduleTime ? String(args.scheduleTime) : undefined;

        const results = [];
        
        for (const platform of platforms) {
          if (platform === 'facebook' || platform === 'both') {
            const result = await socialMediaManager.postToFacebook({
              platform: 'facebook',
              message,
              imageUrl,
              scheduledTime: scheduleTime
            });
            results.push(result);
          }
          
          if (platform === 'instagram' || platform === 'both') {
            const result = await socialMediaManager.postToInstagram({
              platform: 'instagram',
              message,
              imageUrl,
              hashtags
            });
            results.push(result);
          }
        }

        const successCount = results.filter(r => r.success).length;
        const failedResults = results.filter(r => !r.success);

        return {
          content: [{
            type: 'text',
            text: `📱 Social Media Post Results\n\n✅ ${successCount}/${results.length} successful\n\n${results.map(r =>
              r.success 
                ? `✓ ${r.platform}: Posted${r.scheduledTime ? ` (scheduled for ${r.scheduledTime})` : ''}\n  Post ID: ${r.postId}`
                : `✗ ${r.platform}: Failed - ${r.error}`
            ).join('\n\n')}${failedResults.length > 0 ? '\n\n💡 Tip: Check your API tokens and permissions if posts failed.' : ''}`
          }]
        };
      }

      case 'generate_post_ideas': {
        const theme = String(args?.theme || '');
        const productsArg = String(args?.products || '');
        const count = Number(args?.count || 5);
        
        const products = productsArg.split(',').map(p => p.trim());
        const ideas = socialMediaManager.generatePostIdeas(theme, products);

        return {
          content: [{
            type: 'text',
            text: `💡 Post Ideas - ${theme}\n\n${ideas.slice(0, count).map((idea, i) =>
              `${i + 1}. ${idea}`
            ).join('\n\n')}\n\n✨ Pro tip: Customize these ideas with your store's personality and current promotions!`
          }]
        };
      }

      case 'schedule_weekly_posts': {
        const startDate = String(args?.startDate || '');
        const postsPerDay = Number(args?.postsPerDay || 1);
        const focusProducts = String(args?.focusProducts || '');
        
        const products = focusProducts ? focusProducts.split(',').map(p => p.trim()) : ['Acrylic Paint', 'Brushes', 'Canvas'];
        const postTypes = ['product_feature', 'behind_the_scenes', 'customer_spotlight', 'tip_of_the_day', 'promotion'];
        
        const schedule = [];
        const start = new Date(startDate);
        
        for (let day = 0; day < 7; day++) {
          const currentDate = new Date(start);
          currentDate.setDate(start.getDate() + day);
          const dateStr = currentDate.toISOString().split('T')[0];
          const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
          
          for (let post = 0; post < postsPerDay; post++) {
            const postType = postTypes[Math.floor(Math.random() * postTypes.length)];
            const product = products[Math.floor(Math.random() * products.length)];
            
            schedule.push({
              date: dateStr,
              day: dayName,
              time: post === 0 ? '10:00 AM' : post === 1 ? '2:00 PM' : '6:00 PM',
              type: postType,
              suggestion: `${postType.replace('_', ' ').toUpperCase()}: Feature ${product}`
            });
          }
        }

        return {
          content: [{
            type: 'text',
            text: `📅 Weekly Posting Schedule\n📍 Week of ${startDate}\n\n${schedule.map(s =>
              `${s.day}, ${s.date} @ ${s.time}\n  ${s.suggestion}`
            ).join('\n\n')}\n\n💡 Use 'generate_post_ideas' for specific content, then 'post_to_social_media' to publish!`
          }]
        };
      }

      case 'get_social_analytics': {
        if (!socialMediaManager.isConfigured()) {
          return {
            content: [{
              type: 'text',
              text: `⚠️ Social media not configured. See FACEBOOK_INSTAGRAM_SETUP.md for setup instructions.`
            }]
          };
        }

        const platform = String(args?.platform || 'facebook');
        const period = Number(args?.period || 7);

        try {
          if (platform.toLowerCase() === 'facebook') {
            const analytics = await socialMediaManager.getFacebookAnalytics(period);
            
            return {
              content: [{
                type: 'text',
                text: `📊 Facebook Analytics - ${analytics.period}\n\n📈 Performance Metrics:\n  👥 Reach: ${analytics.metrics.reach.toLocaleString()}\n  👁️ Impressions: ${analytics.metrics.impressions.toLocaleString()}\n  💬 Engagement: ${analytics.metrics.engagement.toLocaleString()}\n  ⭐ Followers: ${analytics.metrics.followers.toLocaleString()}\n\n🏆 Top Posts:\n${analytics.topPosts.map((post, i) =>
                  `${i + 1}. ${post.content}\n   ❤️ ${post.likes} | 💬 ${post.comments} | 🔄 ${post.shares}`
                ).join('\n\n')}\n\n💡 Insight: Post more content like your top performers to boost engagement!`
              }]
            };
          } else {
            return {
              content: [{
                type: 'text',
                text: `📊 Instagram Analytics coming soon! Currently only Facebook analytics are available.`
              }]
            };
          }
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `❌ Failed to fetch analytics: ${error.message}`
            }]
          };
        }
      }

      case 'get_new_comments': {
        if (!socialMediaManager.isConfigured()) {
          return {
            content: [{
              type: 'text',
              text: `⚠️ Social media not configured. See FACEBOOK_INSTAGRAM_SETUP.md for setup instructions.`
            }]
          };
        }

        const sinceHours = Number(args?.sinceHours || 24);
        
        try {
          const comments = await socialMediaManager.getFacebookComments(sinceHours);
          
          if (comments.length === 0) {
            return {
              content: [{
                type: 'text',
                text: `✅ No new comments in the last ${sinceHours} hours. All caught up!`
              }]
            };
          }

          return {
            content: [{
              type: 'text',
              text: `💬 New Comments (Last ${sinceHours} hours)\n\n${comments.map((comment, i) =>
                `${i + 1}. From ${comment.from} on ${comment.platform}\n   "${comment.text}"\n   🕐 ${new Date(comment.timestamp).toLocaleString()}`
              ).join('\n\n')}\n\n💡 Use 'suggest_comment_reply' to get AI-powered reply suggestions!`
            }]
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `❌ Failed to fetch comments: ${error.message}`
            }]
          };
        }
      }

      case 'suggest_comment_reply': {
        const commentText = String(args?.commentText || '');
        const tone = String(args?.tone || 'friendly');
        
        if (!commentText) {
          return {
            content: [{
              type: 'text',
              text: `❌ Please provide the comment text to reply to.`
            }]
          };
        }

        const suggestions = socialMediaManager.generateCommentReplySuggestions(commentText);

        return {
          content: [{
            type: 'text',
            text: `💬 Reply Suggestions (${tone} tone)\n\nOriginal comment: "${commentText}"\n\n${suggestions.map((suggestion, i) =>
              `${i + 1}. ${suggestion}`
            ).join('\n\n')}\n\n✨ Feel free to customize these replies to match your store's voice!`
          }]
        };
      }

      case 'generate_hashtags': {
        const postTopic = String(args?.postTopic || '');
        const includeLocation = Boolean(args?.includeLocation ?? true);
        const count = Number(args?.count || 15);
        
        if (!postTopic) {
          return {
            content: [{
              type: 'text',
              text: `❌ Please provide a post topic to generate hashtags.`
            }]
          };
        }

        const hashtags = socialMediaManager.generateHashtags(postTopic, includeLocation);

        return {
          content: [{
            type: 'text',
            text: `#️⃣ Hashtag Suggestions for "${postTopic}"\n\n${hashtags.slice(0, count).map(tag => `#${tag}`).join(' ')}\n\n📋 Copy-paste ready: ${hashtags.slice(0, count).map(tag => `#${tag}`).join(' ')}\n\n💡 Pro tip: Use 10-15 hashtags per post for maximum reach without looking spammy!`
          }]
        };
      }

      case 'get_instagram_story_ideas': {
        const occasion = String(args?.occasion || 'daily');
        const productsArg = args?.products ? String(args.products) : '';
        
        const storyIdeas = [
          `📸 Behind the counter: Show off new ${productsArg || 'art supplies'} that just arrived!`,
          `🎨 Quick tip: Demo how to use ${productsArg || 'one of your products'} in 15 seconds`,
          `❓ Poll: "What's your favorite art medium?" with product stickers`,
          `⏰ Countdown sticker: "${occasion}" sale starts in...`,
          `🌟 Customer spotlight: Share a tagged photo of customer artwork (with permission)`,
          `💯 This or That: Show two products and let followers vote`,
          `🎯 Link sticker: "New blog post: Top 5 ${productsArg || 'art supplies'} for beginners"`,
          `📦 Unboxing: Quick reveal of what's in today's shipment`
        ];

        return {
          content: [{
            type: 'text',
            text: `📱 Instagram Story Ideas - ${occasion}\n\n${storyIdeas.map((idea, i) =>
              `${i + 1}. ${idea}`
            ).join('\n\n')}\n\n✨ Remember: Stories are temporary, so have fun and be authentic!`
          }]
        };
      }

      case 'create_product_campaign': {
        const productSku = String(args?.productSku || '');
        const duration = Number(args?.duration || 7);
        const platforms = String(args?.platforms || 'both');
        
        const product = storeData.inventory.find(p => p.id === productSku);
        
        if (!product) {
          return {
            content: [{
              type: 'text',
              text: `❌ Product ${productSku} not found in inventory.`
            }]
          };
        }

        const campaignPosts = [
          {
            day: 1,
            type: 'Announcement',
            content: `🎉 Introducing: ${product.name}! Perfect for ${product.category.toLowerCase()} artists. $${product.price} - Available now!`
          },
          {
            day: 3,
            type: 'Feature Highlight',
            content: `✨ Why ${product.name}? Let us show you what makes this ${product.category} essential for your creative toolkit!`
          },
          {
            day: 5,
            type: 'Customer Testimonial',
            content: `⭐ "Love the ${product.name}!" - Hear what our customers are saying about this amazing product!`
          },
          {
            day: duration,
            type: 'Last Chance',
            content: `⏰ Don't miss out! Get your ${product.name} today while supplies last. Only ${product.quantity} in stock!`
          }
        ];

        return {
          content: [{
            type: 'text',
            text: `🎯 Product Campaign: ${product.name}\n📅 Duration: ${duration} days\n📱 Platforms: ${platforms}\n💰 Price: $${product.price}\n\n📋 Campaign Schedule:\n\n${campaignPosts.filter(p => p.day <= duration).map(post =>
              `Day ${post.day} - ${post.type}\n${post.content}`
            ).join('\n\n')}\n\n💡 Use 'post_to_social_media' to publish each post, and 'generate_hashtags' for maximum reach!`
          }]
        };
      }

      case 'analyze_post_performance': {
        const postId = String(args?.postId || '');
        const compareToAverage = Boolean(args?.compareToAverage ?? true);
        
        if (!postId) {
          return {
            content: [{
              type: 'text',
              text: `❌ Please provide a post ID to analyze.`
            }]
          };
        }

        // Mock analysis (real implementation would call Meta Graph API)
        const mockAnalysis = {
          postId,
          reach: 2340,
          impressions: 3120,
          engagement: 187,
          likes: 156,
          comments: 23,
          shares: 8,
          engagementRate: 8.0,
          accountAverage: {
            reach: 1850,
            engagementRate: 5.5
          }
        };

        const performance = mockAnalysis.engagementRate > mockAnalysis.accountAverage.engagementRate ? '📈 Above' : '📉 Below';

        return {
          content: [{
            type: 'text',
            text: `📊 Post Performance Analysis\n🆔 Post ID: ${postId}\n\n📈 Metrics:\n  👥 Reach: ${mockAnalysis.reach.toLocaleString()}\n  👁️ Impressions: ${mockAnalysis.impressions.toLocaleString()}\n  💬 Engagement: ${mockAnalysis.engagement} (${mockAnalysis.engagementRate}%)\n  ❤️ Likes: ${mockAnalysis.likes}\n  💬 Comments: ${mockAnalysis.comments}\n  🔄 Shares: ${mockAnalysis.shares}\n\n${compareToAverage ? `📊 vs Account Average:\n  ${performance} average (${mockAnalysis.engagementRate}% vs ${mockAnalysis.accountAverage.engagementRate}%)\n  Reach ${mockAnalysis.reach > mockAnalysis.accountAverage.reach ? '+' : ''}${((mockAnalysis.reach / mockAnalysis.accountAverage.reach - 1) * 100).toFixed(1)}%\n\n` : ''}💡 Insight: ${mockAnalysis.engagementRate > 7 ? 'Great post! Create more content like this.' : 'Try experimenting with different content types or posting times.'}`
          }]
        };
      }

      case 'auto_respond_common_questions': {
        const enable = Boolean(args?.enable ?? false);
        const questionTypes = String(args?.questionTypes || 'hours,location,stock');
        
        const types = questionTypes.split(',').map(t => t.trim());

        return {
          content: [{
            type: 'text',
            text: `🤖 Auto-Response Settings ${enable ? 'ENABLED' : 'DISABLED'}\n\n${enable ? '✅ Will auto-respond to:\n' + types.map(type =>
              `  • ${type.charAt(0).toUpperCase() + type.slice(1)} questions`
            ).join('\n') : '❌ Auto-responses are disabled'}\n\n⚙️ Note: Auto-responses help provide quick answers, but always review and personalize when possible!\n\n💡 This is a mock feature. In production, this would integrate with Facebook's Messenger API for automated responses.`
          }]
        };
      }

      case 'track_competitor_activity': {
        const competitors = String(args?.competitors || '');
        const metrics = String(args?.metrics || 'posts,engagement');
        
        if (!competitors) {
          return {
            content: [{
              type: 'text',
              text: `❌ Please provide competitor page names to track.`
            }]
          };
        }

        const competitorList = competitors.split(',').map(c => c.trim());
        const metricsList = metrics.split(',').map(m => m.trim());

        // Mock competitor data
        const mockData = competitorList.map(comp => ({
          name: comp,
          postsThisWeek: Math.floor(Math.random() * 10) + 3,
          avgEngagement: Math.floor(Math.random() * 200) + 50,
          recentPromotion: Math.random() > 0.5 ? 'Yes - Sale on brushes' : 'No recent promotions'
        }));

        return {
          content: [{
            type: 'text',
            text: `🔍 Competitor Activity Tracking\n📊 Metrics: ${metricsList.join(', ')}\n\n${mockData.map(comp =>
              `📍 ${comp.name}\n  📝 Posts this week: ${comp.postsThisWeek}\n  💬 Avg engagement: ${comp.avgEngagement}\n  🎯 Promotions: ${comp.recentPromotion}`
            ).join('\n\n')}\n\n💡 Note: This is a demonstration feature. In production, this would track public competitor pages to help you stay competitive.`
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `❌ Error executing ${name}: ${error.message}`
      }],
      isError: true,
    };
  }
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('Fatal error in MCP server:', err);
  process.exit(1);
});

