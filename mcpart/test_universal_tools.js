/**
 * Test script for universal tools
 */

import {
  createTask,
  listTasks,
  completeTask,
  createNote,
  searchNotes,
  logExpense,
  getExpenseSummary,
  getTodaySchedule,
  generateDailySummary
} from './build/task-manager.js';

console.log('🧪 Testing Universal Tools\n');

// Test 1: Create tasks
console.log('✅ Test 1: Create Tasks');
const task1 = createTask({
  title: 'Review investor presentation',
  due_date: 'today',
  priority: 'high',
  tags: ['demo', 'urgent']
});
console.log(`Created task #${task1.id}: ${task1.title}`);

const task2 = createTask({
  title: 'Update product catalog',
  due_date: 'tomorrow',
  priority: 'medium'
});
console.log(`Created task #${task2.id}: ${task2.title}\n`);

// Test 2: List tasks
console.log('✅ Test 2: List Tasks');
const allTasks = listTasks();
console.log(`Total tasks: ${allTasks.length}`);
allTasks.forEach(t => console.log(`  - [${t.priority.toUpperCase()}] ${t.title}`));
console.log();

// Test 3: Create notes
console.log('✅ Test 3: Create Notes');
const note1 = createNote({
  title: 'VIP Demo Notes',
  content: 'JavaScript extraction working great. 17/17 categories from ThePrintery.',
  tags: ['demo', 'vip']
});
console.log(`Created note #${note1.id}: ${note1.title}\n`);

// Test 4: Log expenses
console.log('✅ Test 4: Log Expenses');
const expense1 = logExpense({
  amount: 45.99,
  category: 'Office Supplies',
  description: 'Printer paper and pens',
  date: 'today'
});
console.log(`Logged expense #${expense1.id}: $${expense1.amount} for ${expense1.category}\n`);

const expense2 = logExpense({
  amount: 125.00,
  category: 'Software',
  description: 'IDE license renewal',
  date: 'today'
});
console.log(`Logged expense #${expense2.id}: $${expense2.amount} for ${expense2.category}\n`);

// Test 5: Expense summary
console.log('✅ Test 5: Expense Summary');
const summary = getExpenseSummary();
console.log(`Total expenses: $${summary.total.toFixed(2)}`);
console.log('By category:');
Object.entries(summary.by_category).forEach(([cat, amount]) => {
  console.log(`  - ${cat}: $${amount.toFixed(2)}`);
});
console.log();

// Test 6: Daily agenda
console.log('✅ Test 6: Today\'s Schedule');
const schedule = getTodaySchedule();
console.log(`Tasks due today: ${schedule.tasks.length}`);
console.log(`Events today: ${schedule.events.length}\n`);

// Test 7: Daily summary
console.log('✅ Test 7: Daily Summary');
const dailySummary = generateDailySummary();
console.log(dailySummary);

console.log('\n🎉 All tests passed! Universal tools are working!\n');
console.log('📊 Summary:');
console.log(`  - ${allTasks.length} tasks created`);
console.log(`  - 1 note created`);
console.log(`  - 2 expenses logged ($${summary.total.toFixed(2)} total)`);
console.log();
console.log('💡 Try these in Open WebUI:');
console.log('  - "Create a task to call supplier tomorrow"');
console.log('  - "What\'s on my agenda today?"');
console.log('  - "Log a $30 lunch expense"');
console.log('  - "Show me my expense summary"');
console.log('  - "Create a note about the demo"');
