# Open WebUI Integration Guide

## Overview
This guide explains how to integrate your Art Supply Store MCP server with Open WebUI.

## Prerequisites
- Open WebUI installed (Docker or pip installation)
- Your MCP server running (this project)
- Node.js and npm installed

## Integration Methods

### Method 1: Using Open WebUI's MCP Support (Recommended)

Open WebUI has built-in support for MCP servers through its **Tools & Functions** feature.

#### Step 1: Configure MCP Server Endpoint
Your MCP server needs to be accessible to Open WebUI. You have two options:

**Option A: Local Stdio Connection**
```json
{
  "mcpServers": {
    "art-supply-store": {
      "command": "node",
      "args": ["/home/stacy/mcp/build/index.js"],
      "env": {}
    }
  }
}
```

**Option B: HTTP/WebSocket Bridge** (if Open WebUI requires HTTP)
You'll need to create a bridge that converts HTTP requests to stdio communication.

#### Step 2: Add MCP Server to Open WebUI

1. **Open Open WebUI** → Settings → Admin Panel → Tools & Functions
2. **Add MCP Server Configuration**:
   - Navigate to "External Tools" or "MCP Servers"
   - Add your server configuration
   - Specify the command: `node /home/stacy/mcp/build/index.js`

#### Step 3: Test the Integration
Once configured, your 25+ business tools should appear in Open WebUI's tool selector.

---

### Method 2: OpenAI-Compatible API Bridge

Since Open WebUI works seamlessly with OpenAI-compatible APIs, you can create an API wrapper for your MCP server.

#### Create an Express API Bridge

Create a new file: `src/openai-bridge.ts`

```typescript
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

const app = express();
app.use(express.json());

let mcpClient: Client;

// Initialize MCP client
async function initMCPClient() {
  const serverProcess = spawn('node', ['build/index.js']);
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['build/index.js']
  });
  
  mcpClient = new Client({
    name: 'openwebui-bridge',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  await mcpClient.connect(transport);
}

// OpenAI-compatible endpoint for tools/functions
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, tools, tool_choice } = req.body;
    
    // Handle tool calls from Open WebUI
    if (tools && tools.length > 0) {
      const toolResults = [];
      
      for (const tool of tools) {
        const result = await mcpClient.callTool({
          name: tool.function.name,
          arguments: JSON.parse(tool.function.arguments || '{}')
        });
        
        toolResults.push({
          role: 'tool',
          tool_call_id: tool.id,
          content: JSON.stringify(result.content)
        });
      }
      
      res.json({
        id: 'chatcmpl-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'art-supply-assistant',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: toolResults
          },
          finish_reason: 'tool_calls'
        }]
      });
    } else {
      // Regular chat completion
      res.json({
        id: 'chatcmpl-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'art-supply-assistant',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'I can help you with inventory, customers, sales, and more. What would you like to know?'
          },
          finish_reason: 'stop'
        }]
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List available tools
app.get('/v1/tools', async (req, res) => {
  try {
    const tools = await mcpClient.listTools();
    res.json({
      data: tools.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 8081;
initMCPClient().then(() => {
  app.listen(PORT, () => {
    console.log(`OpenAI-compatible API bridge running on http://localhost:${PORT}`);
    console.log('Add this to Open WebUI as an OpenAI API endpoint');
  });
});
```

Then in Open WebUI:
1. Go to Settings → Connections
2. Add OpenAI-compatible API
3. Set URL to: `http://localhost:8081/v1`
4. Your tools will be available as function calls

---

### Method 3: Using Open WebUI Pipelines

Open WebUI's **Pipelines** framework allows custom Python/JS integrations.

#### Create a Pipeline

Create `openwebui-pipeline.py`:

```python
from typing import List, Dict, Any
import subprocess
import json

class Pipeline:
    def __init__(self):
        self.name = "Art Supply Store Assistant"
        self.description = "Business management tools for art supply stores"
        
    async def on_startup(self):
        # Start your MCP server
        self.mcp_process = subprocess.Popen(
            ['node', '/home/stacy/mcp/build/index.js'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
    async def on_shutdown(self):
        self.mcp_process.terminate()
        
    async def inlet(self, body: dict, user: dict) -> dict:
        # Pre-process requests
        return body
        
    async def outlet(self, body: dict, user: dict) -> dict:
        # Post-process responses, inject tool results
        messages = body.get("messages", [])
        
        # Check if user is requesting tool usage
        if any("inventory" in msg.get("content", "").lower() for msg in messages):
            # Call MCP tool via JSON-RPC
            tool_request = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "check_inventory",
                    "arguments": {}
                }
            }
            
            self.mcp_process.stdin.write(json.dumps(tool_request).encode())
            self.mcp_process.stdin.flush()
            
            result = self.mcp_process.stdout.readline()
            # Inject result into response
            
        return body
```

Upload this pipeline to Open WebUI via Admin Panel → Settings → Pipelines.

---

## Configuration Files

### For Claude Desktop / VS Code (Already Configured)
Your `.vscode/mcp.json`:
```json
{
  "mcpServers": {
    "mcp-typescript-server": {
      "command": "node",
      "args": ["build/index.js"],
      "env": {}
    }
  }
}
```

### For Open WebUI (Example Configuration)

If Open WebUI supports direct MCP configuration, create `~/.config/openwebui/mcp-servers.json`:

```json
{
  "art-supply-store": {
    "command": "node",
    "args": ["/home/stacy/mcp/build/index.js"],
    "env": {},
    "description": "Art Supply Store Business Management",
    "tools": true
  }
}
```

---

## Quick Start Guide

### 1. Ensure Your MCP Server is Running
```bash
cd /home/stacy/mcp
npm run build
npm start  # or npm run dashboard
```

### 2. Install Open WebUI (if not already installed)
```bash
docker run -d -p 3001:8080 \
  -v open-webui:/app/backend/data \
  --name open-webui \
  ghcr.io/open-webui/open-webui:main
```

### 3. Configure Open WebUI to Use Your MCP Server

**Option A: Via UI**
1. Open http://localhost:3001
2. Settings → Admin Panel → Connections
3. Add MCP Server or Custom API
4. Point to your server

**Option B: Via Environment Variables**
```bash
docker run -d -p 3001:8080 \
  -e MCP_SERVER_URL="http://host.docker.internal:3000" \
  -v open-webui:/app/backend/data \
  --name open-webui \
  ghcr.io/open-webui/open-webui:main
```

---

## Testing the Integration

1. **Open WebUI** → Start a new chat
2. Try asking: 
   - "Check inventory for acrylic paints"
   - "Who are my top customers?"
   - "Show me today's sales"
   - "Create a purchase order for oil paint brushes"

3. Your 25+ MCP tools should be available as function calls

---

## Available Tools (25+ Business Functions)

Once integrated, Open WebUI will have access to:

### 📦 Inventory Management
- check_inventory
- get_low_stock_items
- update_stock
- search_products

### 👥 Customer Management
- lookup_customer
- update_loyalty_points
- get_customer_recommendations
- get_top_customers

### 💰 Sales & Analytics
- get_daily_sales
- get_sales_report
- get_best_sellers
- calculate_profit_margin

### 🚚 Supplier Management
- get_supplier_info
- create_purchase_order
- compare_supplier_prices

### 📅 Operations
- check_appointments
- book_appointment
- get_employee_schedule
- calculate_labor_cost

### 🏷️ Pricing & Promotions
- calculate_discount
- suggest_bundle

### 📊 Reporting
- generate_eod_report
- get_inventory_value
- forecast_demand

---

## Troubleshooting

### MCP Server Not Connecting
- Ensure the server is built: `npm run build`
- Check server is running: `npm start` or `npm run dashboard`
- Verify port 3000 is not blocked

### Tools Not Appearing in Open WebUI
- Check Open WebUI logs for MCP connection errors
- Verify your MCP server configuration path is correct
- Ensure Node.js is in Open WebUI's PATH

### Tool Execution Failing
- Check MCP server logs
- View dashboard at http://localhost:3000 for debug info
- Test tools directly via dashboard before using in Open WebUI

---

## Additional Resources

- **MCP Specification**: https://modelcontextprotocol.io/specification/latest
- **Open WebUI Docs**: https://docs.openwebui.com/
- **Open WebUI Pipelines**: https://github.com/open-webui/pipelines
- **Your Dashboard**: http://localhost:3000

---

## Next Steps

1. ✅ Your MCP server is ready
2. 🔲 Install Open WebUI
3. 🔲 Choose integration method (direct MCP, API bridge, or Pipeline)
4. 🔲 Configure Open WebUI to connect to your server
5. 🔲 Test tools in Open WebUI chat interface
6. 🔲 Customize system prompts to leverage your business tools

---

## Support

For issues specific to:
- **MCP Server**: Check your dashboard at http://localhost:3000
- **Open WebUI Integration**: https://discord.gg/5rJgQTnV4s
- **This Integration**: Review this document and server logs
