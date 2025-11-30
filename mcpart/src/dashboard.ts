import express from 'express';
import cors from 'cors';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Store for MCP server stats
interface ServerStats {
  status: 'running' | 'stopped';
  uptime: number;
  toolCalls: number;
  lastActivity: string;
  connectedClients: number;
  toolCallHistory: { [key: string]: number };
}

const stats: ServerStats = {
  status: 'running',
  uptime: Date.now(),
  toolCalls: 0,
  lastActivity: new Date().toISOString(),
  connectedClients: 0,
  toolCallHistory: {}
};

// Mock tools data for art supply store
const toolsData = {
  inventory: [
    { name: 'check_inventory', description: 'Check stock levels for products', category: 'Inventory Management' },
    { name: 'get_low_stock_items', description: 'Get items needing reorder', category: 'Inventory Management' },
    { name: 'update_stock', description: 'Update inventory quantities', category: 'Inventory Management' },
    { name: 'search_products', description: 'Search product catalog', category: 'Inventory Management' },
  ],
  customers: [
    { name: 'lookup_customer', description: 'Find customer information', category: 'Customer Management' },
    { name: 'update_loyalty_points', description: 'Manage loyalty rewards', category: 'Customer Management' },
    { name: 'get_customer_recommendations', description: 'Product recommendations', category: 'Customer Management' },
    { name: 'get_top_customers', description: 'View top customers', category: 'Customer Management' },
  ],
  sales: [
    { name: 'get_daily_sales', description: 'Daily sales summary', category: 'Sales & Analytics' },
    { name: 'get_sales_report', description: 'Comprehensive sales report', category: 'Sales & Analytics' },
    { name: 'get_best_sellers', description: 'Top selling products', category: 'Sales & Analytics' },
    { name: 'calculate_profit_margin', description: 'Calculate profitability', category: 'Sales & Analytics' },
  ],
  suppliers: [
    { name: 'get_supplier_info', description: 'Supplier contact details', category: 'Supplier Management' },
    { name: 'create_purchase_order', description: 'Generate purchase orders', category: 'Supplier Management' },
    { name: 'compare_supplier_prices', description: 'Compare pricing', category: 'Supplier Management' },
  ],
  operations: [
    { name: 'check_appointments', description: 'View appointments', category: 'Operations' },
    { name: 'book_appointment', description: 'Schedule appointments', category: 'Operations' },
    { name: 'get_employee_schedule', description: 'Staff schedules', category: 'Operations' },
    { name: 'calculate_labor_cost', description: 'Labor cost analysis', category: 'Operations' },
  ],
  pricing: [
    { name: 'calculate_discount', description: 'Calculate discounts', category: 'Pricing & Promotions' },
    { name: 'suggest_bundle', description: 'Create product bundles', category: 'Pricing & Promotions' },
  ],
  reporting: [
    { name: 'generate_eod_report', description: 'End of day report', category: 'Reporting' },
    { name: 'get_inventory_value', description: 'Inventory valuation', category: 'Reporting' },
    { name: 'forecast_demand', description: 'Demand forecasting', category: 'Reporting' },
  ],
  socialMedia: [
    { name: 'post_to_social_media', description: 'Post to Facebook/Instagram', category: 'Social Media Management' },
    { name: 'generate_post_ideas', description: 'Generate creative post ideas', category: 'Social Media Management' },
    { name: 'schedule_weekly_posts', description: 'Plan weekly content calendar', category: 'Social Media Management' },
    { name: 'get_social_analytics', description: 'View performance metrics', category: 'Social Media Management' },
    { name: 'get_new_comments', description: 'Check new comments', category: 'Social Media Management' },
    { name: 'suggest_comment_reply', description: 'AI-powered reply suggestions', category: 'Social Media Management' },
    { name: 'generate_hashtags', description: 'Generate relevant hashtags', category: 'Social Media Management' },
    { name: 'get_instagram_story_ideas', description: 'Instagram Story ideas', category: 'Social Media Management' },
    { name: 'create_product_campaign', description: 'Multi-post product campaign', category: 'Social Media Management' },
    { name: 'analyze_post_performance', description: 'Analyze individual posts', category: 'Social Media Management' },
    { name: 'auto_respond_common_questions', description: 'Auto-respond to FAQs', category: 'Social Media Management' },
    { name: 'track_competitor_activity', description: 'Monitor competitor activity', category: 'Social Media Management' },
  ]
};

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    ...stats,
    uptime: Date.now() - stats.uptime
  });
});

app.get('/api/tools', (req, res) => {
  const allTools = Object.values(toolsData).flat();
  const toolsWithStats = allTools.map(tool => ({
    ...tool,
    callCount: stats.toolCallHistory[tool.name] || 0
  }));
  
  res.json({
    tools: toolsWithStats,
    categories: {
      'Inventory Management': toolsData.inventory.length,
      'Customer Management': toolsData.customers.length,
      'Sales & Analytics': toolsData.sales.length,
      'Supplier Management': toolsData.suppliers.length,
      'Operations': toolsData.operations.length,
      'Pricing & Promotions': toolsData.pricing.length,
      'Reporting': toolsData.reporting.length,
      'Social Media Management': toolsData.socialMedia.length,
    }
  });
});

app.post('/api/test-tool', (req, res) => {
  const { toolName, input } = req.body;
  
  // Update stats
  stats.toolCalls++;
  stats.lastActivity = new Date().toISOString();
  if (!stats.toolCallHistory[toolName]) {
    stats.toolCallHistory[toolName] = 0;
  }
  stats.toolCallHistory[toolName]++;
  
  // Simulate tool execution
  const allTools = Object.values(toolsData).flat();
  const tool = allTools.find(t => t.name === toolName);
  
  if (tool) {
    res.json({
      success: true,
      result: `Tool "${toolName}" executed successfully. (This is a simulation - connect to the MCP server for real execution)`,
      category: tool.category,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(404).json({
      success: false,
      error: 'Tool not found'
    });
  }
});

// Serve the dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`MCP Dashboard running at http://localhost:${PORT}`);
  console.log(`View your dashboard in a web browser!`);
});
