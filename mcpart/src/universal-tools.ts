/**
 * Universal MCP Tools for Daily Task Management
 * 
 * 19 domain-agnostic tools for productivity, task management,
 * notes, expenses, and scheduling.
 */

import {
  createTask,
  listTasks,
  completeTask,
  updateTask,
  getDailyAgenda,
  createNote,
  searchNotes,
  updateNote,
  logExpense,
  getExpenseSummary,
  categorizeExpenses,
  scheduleEvent,
  listUpcomingEvents,
  getTodaySchedule,
  setReminder,
  listActiveReminders,
  generateDailySummary,
  exportAllData
} from './task-manager.js';

export const universalTools = [
  {
    name: "create_task",
    description: "Create a new task with due date, priority, and assignee. Supports natural language dates like 'today', 'tomorrow', 'next week'.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Optional detailed description" },
        due_date: { type: "string", description: "Due date: YYYY-MM-DD, 'today', 'tomorrow', 'next week'" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Task priority level" },
        assignee: { type: "string", description: "Person responsible" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" }
      },
      required: ["title"]
    }
  },
  
  {
    name: "list_tasks",
    description: "List tasks with optional filtering by status, priority, due date, or assignee.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "in_progress", "completed"] },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        due_before: { type: "string", description: "Show tasks due before this date" },
        assignee: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      }
    }
  },
  
  {
    name: "complete_task",
    description: "Mark a task as completed.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "ID of the task to complete" }
      },
      required: ["task_id"]
    }
  },
  
  {
    name: "update_task",
    description: "Update task details like title, due date, priority, or status.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number" },
        title: { type: "string" },
        description: { type: "string" },
        due_date: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        status: { type: "string", enum: ["pending", "in_progress", "completed"] },
        assignee: { type: "string" }
      },
      required: ["task_id"]
    }
  },
  
  {
    name: "get_daily_agenda",
    description: "Get today's task agenda including due tasks, overdue items, and upcoming tasks.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date to view (defaults to today)" }
      }
    }
  },
  
  {
    name: "schedule_event",
    description: "Add a calendar event with start time, optional end time, location, and attendees.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        start_time: { type: "string", description: "ISO datetime: 2025-10-06T14:00:00" },
        end_time: { type: "string" },
        location: { type: "string" },
        attendees: { type: "array", items: { type: "string" } }
      },
      required: ["title", "start_time"]
    }
  },
  
  {
    name: "list_upcoming_events",
    description: "List upcoming calendar events for the next N days.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of days to look ahead (default: 7)" }
      }
    }
  },
  
  {
    name: "set_reminder",
    description: "Set a reminder to be triggered at a specific time.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        remind_at: { type: "string", description: "ISO datetime" }
      },
      required: ["message", "remind_at"]
    }
  },
  
  {
    name: "get_today_schedule",
    description: "Get complete schedule for today: tasks and events in chronological order.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  
  {
    name: "create_note",
    description: "Create a new note with optional tags for organization.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["title", "content"]
    }
  },
  
  {
    name: "search_notes",
    description: "Search notes by keyword in title or content, optionally filter by tags.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["query"]
    }
  },
  
  {
    name: "tag_note",
    description: "Add or update tags on an existing note.",
    inputSchema: {
      type: "object",
      properties: {
        note_id: { type: "number" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["note_id", "tags"]
    }
  },
  
  {
    name: "log_expense",
    description: "Record a business expense with amount, category, and description.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        category: { type: "string" },
        description: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD or 'today'" },
        payment_method: { type: "string" }
      },
      required: ["amount", "category", "description"]
    }
  },
  
  {
    name: "get_expense_summary",
    description: "Get expense totals and breakdown by category for a date range.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string" },
        end_date: { type: "string" },
        category: { type: "string" }
      }
    }
  },
  
  {
    name: "categorize_expenses",
    description: "List all unique expense categories used in the system.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  
  {
    name: "generate_daily_summary",
    description: "Generate end-of-day summary report with tasks, events, and expenses.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date for summary (defaults to today)" }
      }
    }
  },
  
  {
    name: "export_data",
    description: "Export tasks, notes, or expenses to JSON format for backup or analysis.",
    inputSchema: {
      type: "object",
      properties: {
        data_type: {
          type: "string",
          enum: ["tasks", "notes", "expenses", "events", "all"],
          description: "Type of data to export"
        }
      },
      required: ["data_type"]
    }
  },
  
  {
    name: "create_alert",
    description: "Create a custom alert for important deadlines or thresholds.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        trigger_time: { type: "string", description: "ISO datetime" }
      },
      required: ["message", "trigger_time"]
    }
  },
  
  {
    name: "list_alerts",
    description: "List all active alerts and reminders that need attention.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

export async function handleUniversalTool(name: string, args: any): Promise<any> {
  switch (name) {
    case "create_task":
      return createTask(args);
    
    case "list_tasks":
      return listTasks(args);
    
    case "complete_task":
      return completeTask(args.task_id);
    
    case "update_task":
      const { task_id, ...updates } = args;
      return updateTask(task_id, updates);
    
    case "get_daily_agenda":
      return getDailyAgenda(args.date);
    
    case "schedule_event":
      return scheduleEvent(args);
    
    case "list_upcoming_events":
      return listUpcomingEvents(args.days || 7);
    
    case "set_reminder":
      return setReminder(args);
    
    case "get_today_schedule":
      return getTodaySchedule();
    
    case "create_note":
      return createNote(args);
    
    case "search_notes":
      return searchNotes(args.query, args.tags);
    
    case "tag_note":
      return updateNote(args.note_id, { tags: args.tags });
    
    case "log_expense":
      return logExpense(args);
    
    case "get_expense_summary":
      return getExpenseSummary(args);
    
    case "categorize_expenses":
      return categorizeExpenses();
    
    case "generate_daily_summary":
      return generateDailySummary(args.date);
    
    case "export_data":
      return exportAllData(args.data_type);
    
    case "create_alert":
      return setReminder({ message: args.message, remind_at: args.trigger_time });
    
    case "list_alerts":
      return listActiveReminders();
    
    default:
      throw new Error(`Unknown universal tool: ${name}`);
  }
}
