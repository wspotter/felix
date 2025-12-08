# Felix AMD→NVIDIA Merge Plan

## Overview
Merge commit `9707dad` from AMD server (copilot-dev) to NVIDIA server, adapting hardware-specific configurations while preserving all features.

---

## Pre-Merge Checklist

### 1. Backup Current State
```bash
cd /home/stacy/felix/felix
git branch backup-nvidia-$(date +%Y%m%d)
git add -A && git commit -m "Backup before AMD merge"
```

### 2. Verify Environment
```bash
# Check Python version
python --version  # Should be 3.10+

# Check installed packages
pip list | grep -E "fastapi|uvicorn|playwright"

# Check CUDA availability (NVIDIA specific)
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```

---

## Merge Strategy: Cherry-Pick + Manual Adaptation

### Phase 1: Safe Frontend Updates (Zero Risk)

#### 1.1 Service Worker Cache Bump
**Already done** - bumped to v6

#### 1.2 Flyout CSS Fixes
```bash
git show 9707dad:frontend/static/style.css > /tmp/amd-style.css
```
**Extract these sections:**
- `.flyout-close` z-index fix
- Modal scroll fixes
- Any new CSS variables

**Manually merge into:** `frontend/static/style.css`

#### 1.3 OpenRouter Dropdown
**Already present** in `frontend/index.html` line 441 - verify it appears after cache clear

---

### Phase 2: Documentation Updates (Zero Risk)

#### 2.1 Updated Copilot Instructions
```bash
git show 9707dad:.github/copilot-instructions.md > /tmp/amd-copilot.md
```

**Action:** Review and merge relevant sections, **excluding AMD GPU references**
- Keep: Protocol documentation, tool patterns, common pitfalls
- Skip: AMD MI50/ROCm specific configuration
- Adapt: Change "AMD MI50" to "NVIDIA GPU", `WHISPER_DEVICE=cuda:0` stays same

**Manually merge into:** `.github/copilot-instructions.md`

---

### Phase 3: Backend Features (Requires Adaptation)

#### 3.1 Data Directory Structure
```bash
# Create data directory
mkdir -p data
```

**Files to create:**
- `data/.gitkeep` - Copy from AMD commit
- `data/users.json` - Empty array `[]` initially
- `data/sessions.json` - Empty object `{}` initially

**From AMD commit:**
```bash
git show 9707dad:data/.gitkeep > data/.gitkeep
# Manually create empty JSON files with proper schema
```

#### 3.2 Configuration Updates

**File:** `server/config.py`

**Add these settings:**
```python
# Admin/Auth settings
admin_token: str = ""  # Set in .env
session_timeout: int = 3600  # 1 hour
enable_auth: bool = False  # Disabled by default

# Data persistence
data_dir: str = "data"

# Tool Tutor
enable_tool_tutor: bool = True
tool_confidence_threshold: float = 0.7
```

**Add to `.env`:**
```bash
# Optional: Admin dashboard (leave empty to disable)
ADMIN_TOKEN=

# Optional: Enable multi-user auth (default: false)
ENABLE_AUTH=false

# Tool learning system
ENABLE_TOOL_TUTOR=true
TOOL_CONFIDENCE_THRESHOLD=0.7
```

#### 3.3 Admin Dashboard Files

**Copy these files directly (no GPU dependency):**
```bash
git show 9707dad:frontend/admin.html > frontend/admin.html
git show 9707dad:frontend/static/admin.js > frontend/static/admin.js
git show 9707dad:frontend/static/admin.css > frontend/static/admin.css
```

**Update service worker to cache admin files:**
```javascript
// frontend/sw.js
const STATIC_ASSETS = [
    '/',
    '/admin.html',  // ADD THIS
    '/static/style.css',
    '/static/admin.css',  // ADD THIS
    '/static/admin.js',  // ADD THIS
    // ... rest unchanged
];
```

#### 3.4 Authentication Middleware

**File:** `server/auth.py` (new file)
```bash
git show 9707dad:server/auth.py > server/auth.py
```

**Review for NVIDIA compatibility:**
- Should be pure Python, no GPU code
- Verify imports work: `bcrypt`, `jwt`, `datetime`
- Install if needed: `pip install bcrypt pyjwt`

#### 3.5 Session Management Updates

**File:** `server/session.py`

**Compare versions:**
```bash
git show 9707dad:server/session.py > /tmp/amd-session.py
diff server/session.py /tmp/amd-session.py
```

**Likely changes:**
- User ID tracking
- Session persistence to JSON
- Auth token validation

**Action:** Manually merge new fields/methods, keep existing logic intact

#### 3.6 Main Server Updates

**File:** `server/main.py`

**Compare versions:**
```bash
git show 9707dad:server/main.py > /tmp/amd-main.py
diff server/main.py /tmp/amd-main.py
```

**Expected changes:**
- Admin dashboard routes (`/admin.html`, `/api/admin/*`)
- Auth middleware integration
- Session persistence hooks
- Health check endpoints

**Critical:** Verify no AMD-specific imports or GPU device hardcoding

---

### Phase 4: Tool Tutor System (Medium Risk)

#### 4.1 Tool Tutor Core Files

**New files to copy:**
```bash
# Core tutor logic
git show 9707dad:server/tools/tutor.py > server/tools/tutor.py

# Confidence tracking
git show 9707dad:server/tools/confidence.py > server/tools/confidence.py

# Example injection
git show 9707dad:server/tools/examples.py > server/tools/examples.py
```

**Verify:**
- No GPU/hardware dependencies
- Pure Python logic
- Uses only standard libraries or existing deps

#### 4.2 Tutor Integration

**File:** `server/llm/conversation.py`

**Compare:**
```bash
git show 9707dad:server/llm/conversation.py > /tmp/amd-conversation.py
diff server/llm/conversation.py /tmp/amd-conversation.py
```

**Expected changes:**
- Tool example injection in system prompt
- Confidence tracking hooks
- Learning feedback loop

**Action:** Merge carefully, test prompt generation

---

### Phase 5: Playwright E2E Tests (Optional)

#### 5.1 Test Infrastructure

**Only if you want automated UI testing:**

```bash
# Install Playwright
pip install playwright pytest-playwright
playwright install chromium

# Copy test directory
git show 9707dad:.playwright-mcp/ > /dev/null  # Check if exists
mkdir -p .playwright-mcp
git show 9707dad:.playwright-mcp/workflow-layout.png > .playwright-mcp/workflow-layout.png
# ... copy other test assets

# Copy test files
git show 9707dad:tests/test_ui.py > tests/test_ui.py
git show 9707dad:tests/test_settings.py > tests/test_settings.py
```

**Update `requirements.txt`:**
```
playwright>=1.40.0
pytest-playwright>=0.4.3
```

---

## Post-Merge Tasks

### 1. Install New Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Migration Script (if needed)

**Create:** `migrate_nvidia.py`
```python
"""
Migrate NVIDIA server to match AMD feature set
"""
import os
import json

# Ensure data directory exists
os.makedirs('data', exist_ok=True)

# Create empty data files if they don't exist
if not os.path.exists('data/users.json'):
    with open('data/users.json', 'w') as f:
        json.dump([], f)

if not os.path.exists('data/sessions.json'):
    with open('data/sessions.json', 'w') as f:
        json.dump({}, f)

print("✓ Data directory initialized")
print("✓ Migration complete")
```

**Run:**
```bash
python migrate_nvidia.py
```

### 3. Update .env

**Add new variables:**
```bash
# Admin (optional - leave empty to disable)
ADMIN_TOKEN=

# Auth (optional - default false)
ENABLE_AUTH=false

# Tool learning
ENABLE_TOOL_TUTOR=true
TOOL_CONFIDENCE_THRESHOLD=0.7

# NVIDIA-specific (verify existing)
WHISPER_DEVICE=cuda:0
OLLAMA_HOST=localhost:11434
```

### 4. Test Checklist

**Run each test:**

```bash
# 1. Import test
python test_imports.py

# 2. Start server
./run.sh

# 3. Basic voice test
# - Open http://localhost:8000
# - Click mic, say "hello"
# - Verify response

# 4. Settings test
# - Open settings (gear icon)
# - Verify OpenRouter appears in dropdown
# - Change backend to OpenRouter
# - Save and reload
# - Verify persistence

# 5. Admin dashboard test (if enabled)
# - Set ADMIN_TOKEN=test123 in .env
# - Restart server
# - Open http://localhost:8000/admin.html
# - Check health stats, sessions

# 6. Tool tutor test
# - Use a tool (e.g., "what's the weather?")
# - Check logs for confidence scores
# - Verify examples injected on low confidence

# 7. Playwright tests (if installed)
pytest tests/test_ui.py -v
```

---

## Rollback Plan

**If anything breaks:**

```bash
# Restore backup
git checkout backup-nvidia-YYYYMMDD

# Or reset to current HEAD
git reset --hard HEAD

# Restart server
./run.sh
```

---

## File-by-File Checklist

### Frontend (Safe - No GPU code)
- [ ] `frontend/admin.html` - Copy entire file
- [ ] `frontend/static/admin.js` - Copy entire file  
- [ ] `frontend/static/admin.css` - Copy entire file
- [ ] `frontend/static/style.css` - **Merge** flyout fixes only
- [ ] `frontend/sw.js` - **Already updated** to v6
- [ ] `frontend/index.html` - **Verify** OpenRouter option present (line 441)

### Backend Core (Review for GPU refs)
- [ ] `server/config.py` - **Merge** new settings, verify no AMD hardcoding
- [ ] `server/main.py` - **Merge** admin routes, verify no device pinning
- [ ] `server/session.py` - **Merge** persistence logic
- [ ] `server/auth.py` - **Copy** (new file)

### Backend Tools (Safe)
- [ ] `server/tools/tutor.py` - **Copy** (new file)
- [ ] `server/tools/confidence.py` - **Copy** (new file)
- [ ] `server/tools/examples.py` - **Copy** (new file)
- [ ] `server/llm/conversation.py` - **Merge** tutor hooks

### Data & Config
- [ ] `data/.gitkeep` - **Copy**
- [ ] `data/users.json` - **Create** empty `[]`
- [ ] `data/sessions.json` - **Create** empty `{}`
- [ ] `.env` - **Add** new variables
- [ ] `requirements.txt` - **Add** `bcrypt`, `pyjwt`, `playwright` (optional)

### Documentation
- [ ] `.github/copilot-instructions.md` - **Merge** with NVIDIA adaptations
- [ ] `README.md` - **Merge** admin dashboard section, adapt GPU refs

### Tests (Optional)
- [ ] `.playwright-mcp/` - **Copy** directory (if doing E2E tests)
- [ ] `tests/test_ui.py` - **Copy** (if doing E2E tests)
- [ ] `tests/test_settings.py` - **Copy** (if doing E2E tests)

### Cleanup (Skip - moved to del-review/)
- ❌ Old docs in `del-review/` - Don't copy, they're archived

---

## Risk Assessment

| Component | Risk | Reason |
|-----------|------|--------|
| Frontend files | **LOW** | Pure HTML/CSS/JS, no GPU code |
| Admin dashboard | **LOW** | Python web routes, no hardware deps |
| Auth system | **LOW** | Standard bcrypt/JWT, CPU only |
| Tool Tutor | **MEDIUM** | New LLM integration, test prompt changes |
| Data persistence | **LOW** | File I/O only |
| Session updates | **MEDIUM** | Core state management changes |
| Playwright tests | **LOW** | Optional, doesn't affect runtime |

---

## Success Criteria

✅ **Merge successful if:**
1. Server starts without errors: `./run.sh`
2. All imports pass: `python test_imports.py`
3. Voice conversation works (basic test)
4. Settings persist after reload
5. OpenRouter option visible and functional
6. Admin dashboard loads (if `ADMIN_TOKEN` set)
7. Tool Tutor logs show confidence scores

---

## Estimated Time

- **Conservative (small LLM doing work):** 2-3 hours
- **Optimistic (experienced dev):** 45-60 minutes
- **Critical path:** Backend file merges (session.py, main.py)

---

## Commands Summary

**One-shot merge sequence (for automation):**

```bash
# 1. Backup
git branch backup-nvidia-$(date +%Y%m%d)

# 2. Create data directory
mkdir -p data
echo '[]' > data/users.json
echo '{}' > data/sessions.json

# 3. Cherry-pick safe files
git show 9707dad:frontend/admin.html > frontend/admin.html
git show 9707dad:frontend/static/admin.js > frontend/static/admin.js
git show 9707dad:frontend/static/admin.css > frontend/static/admin.css

# 4. Install deps
pip install bcrypt pyjwt

# 5. Run tests
python test_imports.py

# 6. Start server
./run.sh
```

---

## Instructions for Small LLM

**Follow these rules:**

1. **Execute Phases 1-4 in order** (Skip Phase 5 unless explicitly requested)
2. **After each phase**, run `python test_imports.py` to catch errors early
3. **For "Merge" actions**: Do a careful diff first, merge line-by-line
4. **For "Copy" actions**: Copy entire file directly
5. **Critical check**: Search all copied files for `MI50`, `ROCm`, `HIP` strings and remove/adapt them
6. **Test after each major file change**: `python test_imports.py`
7. **If errors occur**: Stop, report the error, wait for guidance
8. **Document each step**: Note what you changed and why

**Priority order:**
1. Frontend files (safest)
2. Documentation
3. Data directory setup
4. Backend config files
5. Backend core files (most risky)

Good luck! 🚀
