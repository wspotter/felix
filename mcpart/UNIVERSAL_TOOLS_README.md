# Universal Daily Task Tools for mcpart MCP Server

## Overview

The mcpart MCP server now includes **19 universal tools** for daily business productivity. These tools work for ANY business type (not just art supply stores) and enable task management, note-taking, expense tracking, and scheduling through natural language conversations.

## 🎯 What's New

### Tool Count: 43 → 62 Total Tools

**Original (36 tools):**
- Art supply store inventory, customers, orders
- Social media management

**VIP Integration (7 tools):**
- Synthetic dataset generation for computer vision

**NEW Universal Tools (19 tools):** ⭐
- Task management (5 tools)
- Calendar & scheduling (4 tools)
- Notes & documentation (3 tools)
- Expense tracking (3 tools)
- Reporting (2 tools)
- Alerts & reminders (2 tools)

## 📋 Available Tools

### Task Management (5 tools)

#### `create_task`
Create a new task with due date, priority, and assignee.

**Example:**
```
User: "Remind me to submit the quarterly report by Friday"
AI: ✅ Task created: "Submit quarterly report" (due: 2025-10-10, priority: high)
```

**Parameters:**
- `title` (required): Task title
- `description`: Detailed description
- `due_date`: "today", "tomorrow", "next week", or YYYY-MM-DD
- `priority`: "low", "medium", "high"
- `assignee`: Person responsible
- `tags`: Array of tags for categorization

#### `list_tasks`
List tasks with filtering by status, priority, or due date.

**Example:**
```
User: "Show me all high priority tasks"
AI: 📋 3 high priority tasks:
    1. Review investor presentation (due today)
    2. Fix production bug (due tomorrow)
    3. Call supplier about restock (due 10/8)
```

**Filters:**
- `status`: "pending", "in_progress", "completed"
- `priority`: "low", "medium", "high"
- `due_before`: Date cutoff
- `assignee`: Filter by person
- `tags`: Filter by tags

#### `complete_task`
Mark a task as completed.

**Example:**
```
User: "Mark task #3 as done"
AI: ✅ Completed: "Call supplier about restock"
```

#### `update_task`
Update any task details.

**Example:**
```
User: "Change task #5 priority to high and move it to tomorrow"
AI: ✅ Updated task #5: priority → high, due_date → 2025-10-07
```

#### `get_daily_agenda`
Get today's task list with overdue and upcoming items.

**Example:**
```
User: "What's on my plate today?"
AI: 📋 Today's Agenda (Oct 6):
    ✅ Due today: 3 tasks
    ⚠️ Overdue: 1 task
    📅 Upcoming: 5 tasks (next 7 days)
```

---

### Calendar & Scheduling (4 tools)

#### `schedule_event`
Add a calendar event with time, location, and attendees.

**Example:**
```
User: "Schedule a team meeting tomorrow at 2pm"
AI: ✅ Event scheduled: "Team meeting" 
    📅 Oct 7, 2025 at 2:00 PM
```

**Parameters:**
- `title` (required): Event name
- `start_time` (required): ISO datetime
- `end_time`: ISO datetime
- `location`: Where
- `attendees`: Array of attendee names

#### `list_upcoming_events`
List events for the next N days.

**Example:**
```
User: "What meetings do I have this week?"
AI: 📅 Upcoming events (7 days):
    1. Team meeting (Oct 7, 2pm)
    2. Client demo (Oct 8, 10am)
    3. Budget review (Oct 10, 3pm)
```

#### `set_reminder`
Create a one-time reminder.

**Example:**
```
User: "Remind me in 2 hours to check emails"
AI: ⏰ Reminder set for 6:00 PM: "Check emails"
```

#### `get_today_schedule`
Get complete schedule for today (tasks + events).

**Example:**
```
User: "What's my full schedule today?"
AI: �� Today's Schedule (Oct 6):
    
    Tasks (3):
    - Review presentation (high priority)
    - Update inventory
    - Call supplier
    
    Events (2):
    - 10:00 AM: Vendor meeting
    - 3:00 PM: Demo walkthrough
```

---

### Notes & Documentation (3 tools)

#### `create_note`
Create a note with optional tags.

**Example:**
```
User: "Make a note about the VIP demo results"
AI: 📝 Note created: "VIP demo results"
    Tags: demo, vip
```

#### `search_notes`
Search notes by keyword or tags.

**Example:**
```
User: "Find all notes about the demo"
AI: 📝 Found 3 notes:
    1. VIP demo results (Oct 6)
    2. Demo preparation checklist (Oct 5)
    3. Demo talking points (Oct 4)
```

#### `tag_note`
Add or update tags on an existing note.

**Example:**
```
User: "Tag note #5 with 'urgent' and 'investor'"
AI: ✅ Updated note #5 tags: urgent, investor
```

---

### Expense Tracking (3 tools)

#### `log_expense`
Record a business expense.

**Example:**
```
User: "Log a $45 lunch expense"
AI: 💰 Expense logged: $45.00 (Food category)
    Date: Oct 6, 2025
```

**Parameters:**
- `amount` (required): Dollar amount
- `category` (required): Expense category
- `description` (required): What it was for
- `date`: "today" or YYYY-MM-DD
- `payment_method`: How paid

#### `get_expense_summary`
Get expense totals and breakdown by category.

**Example:**
```
User: "How much have I spent this month?"
AI: 💰 October Expense Summary:
    Total: $3,456.78
    
    By category:
    - Office Supplies: $456.23
    - Software: $1,250.00
    - Travel: $892.55
    - Food: $858.00
```

**Filters:**
- `start_date`: Start of range
- `end_date`: End of range
- `category`: Specific category

#### `categorize_expenses`
List all unique expense categories.

**Example:**
```
User: "What expense categories do I use?"
AI: 📊 Expense categories (8):
    - Food
    - Office Supplies
    - Software
    - Travel
    - Hardware
    - Marketing
    - Utilities
    - Professional Services
```

---

### Reporting (2 tools)

#### `generate_daily_summary`
End-of-day summary report.

**Example:**
```
User: "Give me today's summary"
AI: 📊 Daily Summary for Oct 6, 2025

    📋 Tasks: 5 due today (2 overdue)
    📅 Events: 3
    💰 Expenses: $170.99
    ✅ Completed: 7 tasks
```

#### `export_data`
Export tasks, notes, or expenses to JSON.

**Example:**
```
User: "Export all my tasks"
AI: ✅ Exported 42 tasks to JSON
    [Downloads task data]
```

**Options:**
- `data_type`: "tasks", "notes", "expenses", "events", "all"

---

### Alerts & Reminders (2 tools)

#### `create_alert`
Create a custom alert for deadlines.

**Example:**
```
User: "Alert me on Friday about the deadline"
AI: 🔔 Alert set: Friday, Oct 10 at 9:00 AM
    "Project deadline"
```

#### `list_alerts`
List all active alerts and reminders.

**Example:**
```
User: "What alerts do I have?"
AI: 🔔 Active alerts (3):
    1. Project deadline (Oct 10, 9am)
    2. Follow up with client (Oct 8, 2pm)
    3. Submit expense report (Oct 11, 5pm)
```

---

## 🚀 Usage in Open WebUI

### Natural Language Examples

**Task Management:**
- "Create a high priority task to review the investor pitch by Thursday"
- "Show me all pending tasks"
- "Mark task 5 as complete"
- "What do I need to do today?"

**Calendar:**
- "Schedule a client meeting tomorrow at 10am"
- "What events do I have this week?"
- "Remind me to check inventory at 3pm"

**Notes:**
- "Create a note about the demo preparation"
- "Find all notes tagged with 'urgent'"
- "Add 'investor' tag to note 3"

**Expenses:**
- "Log a $125 software expense"
- "How much did I spend on office supplies this month?"
- "Show me all expense categories"

**Reporting:**
- "Give me a daily summary"
- "Export all my tasks to JSON"

---

## 💾 Data Storage

All data is stored in JSON files in the `data/` directory:

```
mcpart/
  data/
    tasks.json        - All tasks
    notes.json        - All notes
    expenses.json     - All expenses
    events.json       - Calendar events
    reminders.json    - Alerts and reminders
```

**Backup:** Simply copy the `data/` directory to back up all your task data.

---

## 🎯 Integration with Existing Tools

Universal tools work seamlessly with existing mcpart tools:

**Example combined workflows:**

1. **Inventory + Tasks:**
```
User: "Check low stock items"
AI: ⚠️ 3 items low: Acrylic Paint, Brushes, Canvas

User: "Create a task to reorder those tomorrow"
AI: ✅ Task created: "Reorder low stock items" (due Oct 7)
```

2. **VIP + Notes:**
```
User: "Generate a VIP dataset for retail products"
AI: ✅ Dataset generation started...

User: "Make a note about the dataset config I used"
AI: 📝 Note created with VIP configuration details
```

3. **Social Media + Expenses:**
```
User: "Create an Instagram post about new products"
AI: ✅ Post scheduled

User: "Log a $50 expense for social media ads"
AI: 💰 Expense logged: $50.00 (Marketing)
```

---

## 📊 Tool Statistics

**Total Tools:** 62
- Art Supply Store: 36 tools
- VIP Integration: 7 tools
- Universal Daily Tasks: 19 tools ⭐

**Categories:**
- Inventory Management: 12 tools
- Customer Management: 8 tools
- Sales & Orders: 6 tools
- Social Media: 5 tools
- Supplier Management: 5 tools
- Dataset Generation (VIP): 7 tools
- Task Management: 5 tools ⭐
- Calendar & Scheduling: 4 tools ⭐
- Notes: 3 tools ⭐
- Expenses: 3 tools ⭐
- Reporting: 2 tools ⭐
- Alerts: 2 tools ⭐

---

## 🧪 Testing

Test the universal tools:

```bash
cd /home/stacy/mcpart
node test_universal_tools.js
```

Expected output:
```
🧪 Testing Universal Tools

✅ Test 1: Create Tasks
✅ Test 2: List Tasks
✅ Test 3: Create Notes
✅ Test 4: Log Expenses
✅ Test 5: Expense Summary
✅ Test 6: Today's Schedule
✅ Test 7: Daily Summary

🎉 All tests passed!
```

---

## 🔧 Technical Details

### Files Added:
- `src/task-manager.ts` - Core task/note/expense logic (530 lines)
- `src/universal-tools.ts` - MCP tool definitions (250 lines)
- `build/task-manager.js` - Compiled JavaScript
- `build/universal-tools.js` - Compiled JavaScript

### Integration Points:
- `src/index.ts` - Imports and registers universal tools
- Tools array: `...universalTools` added after `...vipTools`
- Handler: 19 new cases in CallToolRequestSchema switch

### Date Parsing:
Natural language dates supported:
- "today" → Current date
- "tomorrow" → Current date + 1 day
- "next week" → Current date + 7 days
- "YYYY-MM-DD" → Exact date

---

## 🎉 What This Enables

**Before:** mcpart was an art supply store assistant
**After:** mcpart is a **universal business productivity assistant**

You can now:
- ✅ Manage tasks and projects
- ✅ Schedule meetings and events
- ✅ Track business expenses
- ✅ Take organized notes
- ✅ Generate daily reports
- ✅ Set custom reminders
- ✅ Export all data for analysis

**AND still:**
- ✅ Manage inventory
- ✅ Handle customer relationships
- ✅ Track sales
- ✅ Run social media campaigns
- ✅ Generate synthetic datasets (VIP)

---

## 📝 Next Steps

1. **Test in Open WebUI**: 
   - Connect mcpart MCP server
   - Try natural language task commands
   - Verify all 19 tools are available

2. **Daily Usage**:
   - Start each day with "What's on my agenda?"
   - Log expenses as they occur
   - Create notes for important decisions
   - End day with "Generate daily summary"

3. **Backup**:
   - Regularly copy `data/` directory
   - Export critical data with `export_data` tool

4. **Customize**:
   - Add more expense categories
   - Create task templates
   - Set recurring reminders

---

## 🚀 Demo Script for Investors

```
1. "What's on my agenda today?"
   → Shows tasks, events, reminders

2. "Create a high priority task to prepare investor deck by Friday"
   → Creates task with natural language date

3. "Log a $45 lunch expense for today"
   → Tracks business expense

4. "How much have I spent this month?"
   → Shows expense breakdown

5. "Create a note about the JavaScript extraction breakthrough"
   → Documents important milestone

6. "Search notes for 'investor'"
   → Finds all investor-related notes

7. "Generate daily summary"
   → Comprehensive end-of-day report

8. "Export all tasks"
   → Data portability demonstration
```

---

**Universal tools transform mcpart from a domain-specific assistant into a complete business productivity platform!** 🎉
