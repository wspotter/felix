# Instructions for Merging AMD Server Changes to NVIDIA Server

⚠️ **READ THIS FIRST - IMPORTANT**

## Context
There are multiple .md files in this repo. **IGNORE ALL OF THEM** except this file. Specifically ignore:
- `AMD_TO_NVIDIA_MERGE_PLAN.md` - Detailed technical plan (too complex for you)
- `DETAILED_BUILD_PLAN.md` - Outdated build notes
- `MISTAKES.md` - Old error logs
- `SETUP_IMAGE_GENERATION.md` - Unrelated feature
- `TTS_FIX_NEEDED.md` - Outdated
- `VISION.md` - Project vision doc
- `.github/copilot-instructions.md` - General reference, not for this task

**ONLY follow the step-by-step instructions below.**

## Your Mission
You are merging new features from an AMD GPU server into an NVIDIA GPU server. The features are **hardware-agnostic** (admin dashboard, auth system, tool learning), but you must **avoid copying AMD-specific GPU code**.

## Critical Rules

### ✅ DO:
1. Copy frontend files entirely (HTML, CSS, JS) - they have no GPU code
2. Copy new Python files that are pure logic (auth, admin routes, tool tutor)
3. **Compare and merge** existing Python files carefully (config.py, main.py, session.py)
4. Create new data directories and config entries
5. Run `python test_imports.py` after every 3-4 file changes
6. Stop immediately if you see errors and report them
7. **Use timeouts** on all commands that might hang: `timeout 10s <command>`
8. **Always wait for command completion** - never background processes or redirect to `/dev/null`

### ❌ DON'T:
1. Copy any references to `MI50`, `ROCm`, `HIP`, or AMD-specific hardware
2. Change existing GPU device settings (`cuda:0` is correct for NVIDIA)
3. Overwrite files without comparing first
4. Continue if tests fail - stop and ask for help
5. Skip the backup step
6. **NEVER use `/dev/null` redirects** - you need to see all output
7. **NEVER use `/tmp` for important files** - keep everything in the repo
8. **NEVER background processes with `&`** - run commands synchronously
9. **NEVER use `nohup`** - you must see command output immediately
10. **NEVER pipe to `/dev/null`** or suppress errors with `2>&1 >/dev/null`

---

## Step-by-Step Execution Plan

### STEP 0: Backup (REQUIRED)
```bash
cd /home/stacy/felix/felix
git branch backup-nvidia-$(date +%Y%m%d)
git add -A
git commit -m "Backup before AMD merge"
```

**IMPORTANT:** Run each command separately and wait for it to complete. Show me the output of each command.

**Wait for confirmation, then proceed.**

---

### STEP 1: Copy Safe Frontend Files (Zero Risk)

These files are pure HTML/CSS/JavaScript with no GPU dependencies.

```bash
# Admin dashboard files
git show 9707dad:frontend/admin.html > frontend/admin.html
git show 9707dad:frontend/static/admin.js > frontend/static/admin.js
git show 9707dad:frontend/static/admin.css > frontend/static/admin.css
```

**After copying, verify:**
```bash
ls -lh frontend/admin.html frontend/static/admin.{js,css}
```

Expected: Three files exist and are not empty.

**Test:**
```bash
python test_imports.py
```

Expected output: `SUCCESS: All modules imported correctly`

---

### STEP 2: Update Service Worker

**File:** `frontend/sw.js`

**Find this section (around line 7-15):**
```javascript
const STATIC_ASSETS = [
    '/',
    '/static/style.css',
    '/static/app.module.js',
    // ... more files
];
```

**Add these three lines after the `/` line:**
```javascript
const STATIC_ASSETS = [
    '/',
    '/admin.html',           // ADD THIS
    '/static/style.css',
    '/static/admin.css',     // ADD THIS
    '/static/app.module.js',
    '/static/admin.js',      // ADD THIS
    // ... rest unchanged
];
```

**Test:**
```bash
python test_imports.py
```

---

### STEP 3: Create Data Directory

```bash
mkdir -p data
echo '[]' > data/users.json
echo '{}' > data/sessions.json
git show 9707dad:data/.gitkeep > data/.gitkeep
```

**Verify:**
```bash
ls -la data/
```

Expected: `.gitkeep`, `users.json`, `sessions.json` exist

---

### STEP 4: Update Configuration File

**File:** `server/config.py`

**Task:** Add new settings at the end of the `Settings` class, before the `class Config:` line.

**Find this pattern (near the end of the Settings class):**
```python
class Settings(BaseSettings):
    # ... existing settings ...
    
    class Config:
        env_file = ".env"
```

**Add BEFORE `class Config:`:**
```python
    # Admin/Auth settings
    admin_token: str = ""
    session_timeout: int = 3600
    enable_auth: bool = False
    
    # Data persistence
    data_dir: str = "data"
    
    # Tool Tutor system
    enable_tool_tutor: bool = True
    tool_confidence_threshold: float = 0.7
    
    class Config:
        env_file = ".env"
```

**Test:**
```bash
python test_imports.py
```

---

### STEP 5: Copy New Backend Files (Pure Python, No GPU)

```bash
# Check if auth.py exists in AMD commit
git show 9707dad:server/auth.py > /dev/null 2>&1
if [ $? -eq 0 ]; then
    git show 9707dad:server/auth.py > server/auth.py
    echo "✓ Copied server/auth.py"
else
    echo "⚠ auth.py doesn't exist in AMD commit, skipping"
fi

# Tool Tutor files (may not exist, that's OK)
git show 9707dad:server/tools/tutor.py > server/tools/tutor.py 2>/dev/null && echo "✓ Copied tutor.py" || echo "⚠ No tutor.py"
git show 9707dad:server/tools/confidence.py > server/tools/confidence.py 2>/dev/null && echo "✓ Copied confidence.py" || echo "⚠ No confidence.py"
git show 9707dad:server/tools/examples.py > server/tools/examples.py 2>/dev/null && echo "✓ Copied examples.py" || echo "⚠ No examples.py"
```

**Test:**
```bash
python test_imports.py
```

If this fails, one of the new files has a problem. Report which file and what the error says.

---

### STEP 6: Compare and Merge server/main.py (CAREFUL!)

**Task:** The AMD version has new admin routes. We need to add them without breaking existing code.

```bash
# Save current version
cp server/main.py server/main.py.backup

# Get AMD version for comparison (keep in repo, NOT /tmp)
git show 9707dad:server/main.py > server/main.py.amd

# Show differences
diff server/main.py server/main.py.amd | head -100
```

**What to look for:**
1. New route definitions like `@app.get("/admin.html")` or `@app.get("/api/admin/*")`
2. New imports at the top (e.g., `from .auth import ...`)
3. Middleware additions

**DO NOT** copy lines that reference:
- `MI50`
- `ROCm`
- `HIP`
- Specific GPU device indices like `cuda:1` or `cuda:2`

**After merging new routes/imports manually, test:**
```bash
python test_imports.py
```

**If it fails:** Restore backup and report error
```bash
cp server/main.py.backup server/main.py
```

---

### STEP 7: Compare and Merge server/session.py (CAREFUL!)

```bash
# Save backup
cp server/session.py server/session.py.backup

# Compare (keep in repo, NOT /tmp)
git show 9707dad:server/session.py > server/session.py.amd
diff server/session.py server/session.py.amd | head -100
```

**What to look for:**
1. New fields in Session class (like `user_id`, `auth_token`)
2. New methods (like `save_to_disk()`, `load_from_disk()`)
3. Session persistence logic

**Add these carefully to the existing Session class.**

**Test:**
```bash
python test_imports.py
```

**If it fails:** Restore backup
```bash
cp server/session.py.backup server/session.py
```

---

### STEP 8: Install New Dependencies

```bash
timeout 60s pip install bcrypt pyjwt
```

**If timeout occurs, report it immediately and wait for guidance.**

**Test everything still works:**
```bash
timeout 10s python test_imports.py
```

---

### STEP 9: Update .env File

**File:** `.env`

**Add these lines at the end:**
```bash
# Admin Dashboard (leave empty to disable)
ADMIN_TOKEN=

# Multi-user auth (default: disabled)
ENABLE_AUTH=false

# Tool learning system
ENABLE_TOOL_TUTOR=true
TOOL_CONFIDENCE_THRESHOLD=0.7
```

---

### STEP 10: Final Tests

```bash
# 1. Import test
timeout 10s python test_imports.py

# 2. Do NOT start the server yourself - just verify imports work
# The user will start the server manually

# 3. Report completion
echo "Merge complete - ready for user to test server startup"
```

**DO NOT:**
- Start the server with `uvicorn` or `./run.sh`
- Use `&` to background any process
- Use `nohup` or redirect to `/dev/null`
- Wait for server output or test the web interface

**Just confirm imports work and report completion.**

---

## Success Criteria

You succeeded if:
- ✅ `python test_imports.py` shows `SUCCESS`
- ✅ All files copied/modified successfully
- ✅ No references to `MI50`, `ROCm`, or `HIP` in any copied files
- ✅ All commands completed within timeout periods
- ✅ No authorization prompts encountered

**Note:** The user will test server startup and web interface manually after you're done.

---

## If Something Goes Wrong

### Import errors after copying a file:
```bash
# Check which file caused it (with timeout)
timeout 5s python -c "import server.main"  # Test main
timeout 5s python -c "import server.auth"  # Test auth
timeout 5s python -c "import server.session"  # Test session

# Restore from backup if needed
git checkout server/main.py  # or whichever file
```

### Command hangs or times out:
```bash
# Report the command that timed out
# DO NOT retry with longer timeout
# STOP and ask for guidance
```

### Can't find a file in AMD commit:
```bash
# Some files might not exist - that's OK
# Skip that file and continue
```

### Authorization prompt appears:
```bash
# If you see "Password:", "Confirm (y/n)?", or similar prompts:
# STOP IMMEDIATELY
# Report what command triggered it
# DO NOT try to answer the prompt
```

---

## Communication Protocol

After completing each STEP, report:

```
STEP X COMPLETE
✓ Files created: [list]
✓ Files modified: [list]
✓ Test result: [PASS/FAIL]
⚠ Warnings: [if any]
```

If you encounter an error:

```
STEP X FAILED
❌ Error: [exact error message]
📁 File: [which file caused it]
🔄 Action taken: [what you did]
❓ Question: [what you need clarification on]
```

---

## Example Execution Flow

```
You: "Starting merge process"

[Execute STEP 0]
You: "STEP 0 COMPLETE
✓ Backup branch created: backup-nvidia-20251208
✓ Commit: Backup before AMD merge
Proceeding to STEP 1..."

[Execute STEP 1]
You: "STEP 1 COMPLETE
✓ Files created: frontend/admin.html, frontend/static/admin.js, frontend/static/admin.css
✓ Test result: PASS
Proceeding to STEP 2..."

[Continue through all steps]

You: "ALL STEPS COMPLETE
✓ 15 files modified
✓ 6 files created
✓ Final test: PASS
✓ Server starts successfully
Merge complete!"
```

---

## Ready?

Confirm you understand by saying:
"Ready to begin merge. Starting with STEP 0: Backup"

Then execute step-by-step, reporting after each one.
