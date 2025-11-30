/**
 * Universal Task Management System
 * 
 * Domain-agnostic task, note, and expense tracking for any business.
 * Integrates with mcpart MCP server for chat-based productivity.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const TASKS_FILE = join(DATA_DIR, 'tasks.json');
const NOTES_FILE = join(DATA_DIR, 'notes.json');
const EXPENSES_FILE = join(DATA_DIR, 'expenses.json');
const EVENTS_FILE = join(DATA_DIR, 'events.json');
const REMINDERS_FILE = join(DATA_DIR, 'reminders.json');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  due_date?: string;
  assignee?: string;
  tags?: string[];
  created_at: string;
  completed_at?: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: number;
  amount: number;
  category: string;
  description: string;
  date: string;
  payment_method?: string;
  created_at: string;
}

export interface CalendarEvent {
  id: number;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  location?: string;
  attendees?: string[];
  created_at: string;
}

export interface Reminder {
  id: number;
  message: string;
  remind_at: string;
  status: 'active' | 'triggered' | 'dismissed';
  created_at: string;
}

function loadData<T>(filepath: string): T[] {
  if (!existsSync(filepath)) {
    return [];
  }
  try {
    const data = readFileSync(filepath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading ${filepath}:`, error);
    return [];
  }
}

function saveData<T>(filepath: string, data: T[]): void {
  try {
    writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error saving ${filepath}:`, error);
    throw error;
  }
}

function parseDate(dateStr: string): string {
  const normalized = dateStr.toLowerCase().trim();
  const now = new Date();
  
  if (normalized === 'today') {
    return now.toISOString().split('T')[0];
  }
  
  if (normalized === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  
  if (normalized === 'next week') {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
  }
  
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  
  return now.toISOString().split('T')[0];
}

// ========== TASK MANAGEMENT ==========

export function createTask(params: {
  title: string;
  description?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high';
  assignee?: string;
  tags?: string[];
}): Task {
  const tasks = loadData<Task>(TASKS_FILE);
  const newId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
  
  const task: Task = {
    id: newId,
    title: params.title,
    description: params.description,
    status: 'pending',
    priority: params.priority || 'medium',
    due_date: params.due_date ? parseDate(params.due_date) : undefined,
    assignee: params.assignee,
    tags: params.tags || [],
    created_at: new Date().toISOString()
  };
  
  tasks.push(task);
  saveData(TASKS_FILE, tasks);
  
  return task;
}

export function listTasks(filters?: {
  status?: string;
  priority?: string;
  due_before?: string;
  assignee?: string;
  tags?: string[];
}): Task[] {
  let tasks = loadData<Task>(TASKS_FILE);
  
  if (filters) {
    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }
    if (filters.priority) {
      tasks = tasks.filter(t => t.priority === filters.priority);
    }
    if (filters.due_before) {
      const cutoff = parseDate(filters.due_before);
      tasks = tasks.filter(t => t.due_date && t.due_date <= cutoff);
    }
    if (filters.assignee) {
      tasks = tasks.filter(t => t.assignee === filters.assignee);
    }
    if (filters.tags && filters.tags.length > 0) {
      tasks = tasks.filter(t => 
        t.tags && filters.tags!.some(tag => t.tags!.includes(tag))
      );
    }
  }
  
  return tasks.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    
    if (priorityDiff !== 0) return priorityDiff;
    
    if (a.due_date && b.due_date) {
      return a.due_date.localeCompare(b.due_date);
    }
    
    return 0;
  });
}

export function completeTask(taskId: number): Task {
  const tasks = loadData<Task>(TASKS_FILE);
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  
  task.status = 'completed';
  task.completed_at = new Date().toISOString();
  
  saveData(TASKS_FILE, tasks);
  return task;
}

export function updateTask(taskId: number, updates: Partial<Task>): Task {
  const tasks = loadData<Task>(TASKS_FILE);
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  
  Object.assign(task, updates);
  
  if (updates.due_date) {
    task.due_date = parseDate(updates.due_date);
  }
  
  saveData(TASKS_FILE, tasks);
  return task;
}

export function getDailyAgenda(date?: string): {
  tasks: Task[];
  overdue: Task[];
  upcoming: Task[];
} {
  const targetDate = date ? parseDate(date) : new Date().toISOString().split('T')[0];
  const tasks = loadData<Task>(TASKS_FILE);
  
  const today = tasks.filter(t => 
    t.status !== 'completed' && t.due_date === targetDate
  );
  
  const overdue = tasks.filter(t => 
    t.status !== 'completed' && t.due_date && t.due_date < targetDate
  );
  
  const upcoming = tasks.filter(t => 
    t.status !== 'completed' && t.due_date && t.due_date > targetDate
  ).slice(0, 5);
  
  return { tasks: today, overdue, upcoming };
}

// ========== NOTE MANAGEMENT ==========

export function createNote(params: {
  title: string;
  content: string;
  tags?: string[];
}): Note {
  const notes = loadData<Note>(NOTES_FILE);
  const newId = notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1;
  
  const note: Note = {
    id: newId,
    title: params.title,
    content: params.content,
    tags: params.tags || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  notes.push(note);
  saveData(NOTES_FILE, notes);
  
  return note;
}

export function searchNotes(query: string, tags?: string[]): Note[] {
  let notes = loadData<Note>(NOTES_FILE);
  
  const lowerQuery = query.toLowerCase();
  notes = notes.filter(n => 
    n.title.toLowerCase().includes(lowerQuery) ||
    n.content.toLowerCase().includes(lowerQuery)
  );
  
  if (tags && tags.length > 0) {
    notes = notes.filter(n => 
      tags.some(tag => n.tags.includes(tag))
    );
  }
  
  return notes.sort((a, b) => 
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

export function updateNote(noteId: number, updates: Partial<Note>): Note {
  const notes = loadData<Note>(NOTES_FILE);
  const note = notes.find(n => n.id === noteId);
  
  if (!note) {
    throw new Error(`Note ${noteId} not found`);
  }
  
  Object.assign(note, updates);
  note.updated_at = new Date().toISOString();
  
  saveData(NOTES_FILE, notes);
  return note;
}

// ========== EXPENSE TRACKING ==========

export function logExpense(params: {
  amount: number;
  category: string;
  description: string;
  date?: string;
  payment_method?: string;
}): Expense {
  const expenses = loadData<Expense>(EXPENSES_FILE);
  const newId = expenses.length > 0 ? Math.max(...expenses.map(e => e.id)) + 1 : 1;
  
  const expense: Expense = {
    id: newId,
    amount: params.amount,
    category: params.category,
    description: params.description,
    date: params.date ? parseDate(params.date) : new Date().toISOString().split('T')[0],
    payment_method: params.payment_method,
    created_at: new Date().toISOString()
  };
  
  expenses.push(expense);
  saveData(EXPENSES_FILE, expenses);
  
  return expense;
}

export function getExpenseSummary(params?: {
  start_date?: string;
  end_date?: string;
  category?: string;
}): {
  total: number;
  by_category: Record<string, number>;
  expenses: Expense[];
} {
  let expenses = loadData<Expense>(EXPENSES_FILE);
  
  if (params) {
    if (params.start_date) {
      const start = parseDate(params.start_date);
      expenses = expenses.filter(e => e.date >= start);
    }
    if (params.end_date) {
      const end = parseDate(params.end_date);
      expenses = expenses.filter(e => e.date <= end);
    }
    if (params.category) {
      expenses = expenses.filter(e => e.category === params.category);
    }
  }
  
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  
  const by_category = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  
  return { total, by_category, expenses };
}

export function categorizeExpenses(): string[] {
  const expenses = loadData<Expense>(EXPENSES_FILE);
  const categories = new Set(expenses.map(e => e.category));
  return Array.from(categories).sort();
}

// ========== CALENDAR & EVENTS ==========

export function scheduleEvent(params: {
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  location?: string;
  attendees?: string[];
}): CalendarEvent {
  const events = loadData<CalendarEvent>(EVENTS_FILE);
  const newId = events.length > 0 ? Math.max(...events.map(e => e.id)) + 1 : 1;
  
  const event: CalendarEvent = {
    id: newId,
    title: params.title,
    description: params.description,
    start_time: new Date(params.start_time).toISOString(),
    end_time: params.end_time ? new Date(params.end_time).toISOString() : undefined,
    location: params.location,
    attendees: params.attendees,
    created_at: new Date().toISOString()
  };
  
  events.push(event);
  saveData(EVENTS_FILE, events);
  
  return event;
}

export function listUpcomingEvents(days: number = 7): CalendarEvent[] {
  const events = loadData<CalendarEvent>(EVENTS_FILE);
  const now = new Date();
  const future = new Date(now);
  future.setDate(future.getDate() + days);
  
  return events
    .filter(e => {
      const eventDate = new Date(e.start_time);
      return eventDate >= now && eventDate <= future;
    })
    .sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
}

export function getTodaySchedule(): {
  events: CalendarEvent[];
  tasks: Task[];
} {
  const today = new Date().toISOString().split('T')[0];
  
  const events = loadData<CalendarEvent>(EVENTS_FILE)
    .filter(e => e.start_time.startsWith(today))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  
  const { tasks } = getDailyAgenda(today);
  
  return { events, tasks };
}

// ========== REMINDERS ==========

export function setReminder(params: {
  message: string;
  remind_at: string;
}): Reminder {
  const reminders = loadData<Reminder>(REMINDERS_FILE);
  const newId = reminders.length > 0 ? Math.max(...reminders.map(r => r.id)) + 1 : 1;
  
  const reminder: Reminder = {
    id: newId,
    message: params.message,
    remind_at: new Date(params.remind_at).toISOString(),
    status: 'active',
    created_at: new Date().toISOString()
  };
  
  reminders.push(reminder);
  saveData(REMINDERS_FILE, reminders);
  
  return reminder;
}

export function listActiveReminders(): Reminder[] {
  const reminders = loadData<Reminder>(REMINDERS_FILE);
  const now = new Date();
  
  return reminders
    .filter(r => r.status === 'active' && new Date(r.remind_at) <= now)
    .sort((a, b) => a.remind_at.localeCompare(b.remind_at));
}

export function generateDailySummary(date?: string): string {
  const targetDate = date ? parseDate(date) : new Date().toISOString().split('T')[0];
  
  const { tasks, overdue } = getDailyAgenda(targetDate);
  const expenses = getExpenseSummary({ start_date: targetDate, end_date: targetDate });
  const events = loadData<CalendarEvent>(EVENTS_FILE)
    .filter(e => e.start_time.startsWith(targetDate));
  
  let summary = `📊 Daily Summary for ${targetDate}\n\n`;
  
  summary += `📋 Tasks: ${tasks.length} due today`;
  if (overdue.length > 0) {
    summary += ` (${overdue.length} overdue)`;
  }
  summary += `\n`;
  
  summary += `📅 Events: ${events.length}\n`;
  summary += `💰 Expenses: $${expenses.total.toFixed(2)}\n`;
  
  const completedToday = loadData<Task>(TASKS_FILE)
    .filter(t => t.completed_at && t.completed_at.startsWith(targetDate));
  summary += `✅ Completed: ${completedToday.length} tasks\n`;
  
  return summary;
}

export function exportAllData(dataType: string): any {
  const loadFile = (filename: string) => {
    const path = join(DATA_DIR, filename);
    if (!existsSync(path)) return [];
    return JSON.parse(readFileSync(path, 'utf-8'));
  };
  
  if (dataType === 'all') {
    return {
      tasks: loadFile('tasks.json'),
      notes: loadFile('notes.json'),
      expenses: loadFile('expenses.json'),
      events: loadFile('events.json'),
      reminders: loadFile('reminders.json')
    };
  }
  
  return loadFile(`${dataType}.json`);
}
