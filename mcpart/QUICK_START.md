# Universal Tools - Quick Start Guide

## 🚀 Get Started in 60 Seconds

### 1. Test It Works
```bash
cd /home/stacy/mcpart
node test_universal_tools.js
```

Expected: "🎉 All tests passed!"

### 2. Try in Chat (Open WebUI)

Connect mcpart MCP server, then try these commands:

**First Time:**
```
"What's on my agenda today?"
```

**Create a Task:**
```
"Create a high priority task to review presentation by tomorrow"
```

**Log an Expense:**
```
"Log a $45 lunch expense"
```

**Make a Note:**
```
"Create a note about the VIP demo results"
```

**Daily Summary:**
```
"Generate daily summary"
```

## 📊 What You Get

- ✅ 5 task management tools
- ✅ 4 calendar & scheduling tools
- ✅ 3 notes & documentation tools
- ✅ 3 expense tracking tools
- ✅ 2 reporting tools
- ✅ 2 alert & reminder tools

**Total: 19 universal tools + 43 existing = 62 tools**

## 🎯 Most Useful Commands

### Morning Routine
```
"What's on my agenda today?"
```

### Create Tasks
```
"Remind me to [task] by [date]"
"Create a task to [task] with high priority"
```

### Track Expenses
```
"Log a $[amount] [category] expense"
"How much have I spent this month?"
```

### Take Notes
```
"Create a note about [topic]"
"Find notes tagged with [tag]"
```

### End of Day
```
"Generate daily summary"
```

## 📁 Data Location

All your data is stored in:
```
/home/stacy/mcpart/data/
  - tasks.json
  - notes.json
  - expenses.json
  - events.json
  - reminders.json
```

**Backup:** Copy the `data/` directory!

## 📖 Full Documentation

- **UNIVERSAL_TOOLS_README.md** - Complete guide (600+ lines)
- **UNIVERSAL_TOOLS_SUMMARY.md** - Implementation details

## 🧪 Test Commands

```bash
# Quick test
node test_universal_tools.js

# Build from source
npm run build

# Check tool count
# Should show 62 tools when connected to Open WebUI
```

## 💡 Pro Tips

1. **Natural dates work:** "today", "tomorrow", "next week"
2. **Priorities:** Use "high", "medium", "low"
3. **Tags:** Add tags to tasks/notes for organization
4. **Export:** Use "export data" to backup everything
5. **Combine workflows:** Mix inventory, VIP, and tasks!

---

**You're ready! Start with:** `"What's on my agenda today?"`
