# Tool Tutor System - Implementation Plan

## Overview

A system to help smaller open-source LLMs reliably use tools through a combination of confidence-based voting, example injection, and learning from corrections.

**Problem:** Small LLMs fumble tool calls - wrong tool, malformed JSON, missing params.

**Solution:** 
1. LLM reports confidence with each tool call
2. Low confidence triggers a voting system
3. Relevant examples are injected to teach patterns
4. Successful calls are stored to improve future performance

---

## Design Principles

### Modular & Swappable

The Tool Tutor is designed as a **standalone module** with a minimal interface. This allows:

- **Easy replacement:** Build something better? Swap it out without touching Felix core
- **Optional usage:** Disable entirely via config, Felix works the same
- **Independent testing:** Test the tutor in isolation
- **Reusable:** Could be used in other projects, not Felix-specific

### Interface Contract

The module exposes only **3 methods** to the outside world:

```python
class ToolTutorInterface(ABC):
    """Abstract interface - any implementation must provide these"""
    
    @abstractmethod
    def prepare_prompt(self, query: str, system_prompt: str) -> str:
        """Inject examples/context before LLM sees the prompt"""
        pass
    
    @abstractmethod
    def process_tool_call(self, query: str, llm_response: str, context: List[dict]) -> ToolCall:
        """Parse LLM response, apply voting if uncertain, return final decision"""
        pass
    
    @abstractmethod
    def record_result(self, query: str, tool_call: ToolCall, success: bool) -> None:
        """Learn from the outcome"""
        pass
```

### Integration Point

Felix only touches the tutor at **one place** in the pipeline:

```python
# server/main.py - single integration point

# Before LLM call
prompt = tool_tutor.prepare_prompt(query, system_prompt)

# After LLM responds  
tool_call = tool_tutor.process_tool_call(query, llm_response, context)

# After tool executes
tool_tutor.record_result(query, tool_call, success)
```

### Swapping Implementations

```python
# Current implementation
tool_tutor = VotingToolTutor(config)

# Future: ML-based implementation
tool_tutor = NeuralToolTutor(config)

# Future: Simple rule-based fallback
tool_tutor = RuleBasedToolTutor(config)

# Disabled
tool_tutor = NoOpToolTutor()  # Does nothing, passes through
```

### No Tight Coupling

The tutor:
- Does NOT import from `server/main.py`
- Does NOT know about WebSocket, sessions, audio
- Does NOT directly call tools
- Only knows about: queries, tool names, args, confidence

Felix core:
- Does NOT know how tutor works internally
- Only calls the 3 interface methods
- Can function without tutor (NoOp fallback)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER QUERY                                  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EXAMPLE RETRIEVAL                              │
│  • Embed query                                                      │
│  • Find 2-3 similar successful tool calls                           │
│  • Inject into prompt as few-shot examples                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           LLM                                       │
│  • Sees: system prompt + examples + user query                      │
│  • Outputs: tool_name, args, confidence (0.0-1.0)                   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  confidence >= threshold?  │
                    └───────────────────────┘
                      │                    │
                     YES                   NO
                      │                    │
                      ▼                    ▼
              ┌─────────────┐    ┌─────────────────────┐
              │  EXECUTE    │    │   VOTING SYSTEM     │
              │  TOOL       │    │   • Keyword voter   │
              └─────────────┘    │   • Embedding voter │
                      │          │   • History voter   │
                      │          │   • Context voter   │
                      │          └─────────────────────┘
                      │                    │
                      │                    ▼
                      │          ┌─────────────────────┐
                      │          │  OVERRIDE or        │
                      │          │  CONFIRM LLM choice │
                      │          └─────────────────────┘
                      │                    │
                      ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EXECUTE TOOL                                   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      LEARNING                                       │
│  • Successful call → store as example                               │
│  • Failed/corrected → store correction                              │
│  • Update voter weights based on accuracy                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Configuration (`server/config.py`)

New settings to add:

```python
# Tool Tutor Settings
TOOL_TUTOR_ENABLED: bool = True
CONFIDENCE_THRESHOLD: float = 0.8          # 0.0-1.0, user configurable
EXAMPLE_COUNT: int = 3                      # How many examples to inject
LEARNING_ENABLED: bool = True               # Store successful calls
STRICT_MODE: bool = False                   # Ask user to confirm uncertain calls
AUTO_CORRECT: bool = True                   # Let voters override LLM

# Voter Weights (must sum to 1.0)
VOTER_WEIGHT_KEYWORD: float = 0.25
VOTER_WEIGHT_EMBEDDING: float = 0.35
VOTER_WEIGHT_HISTORY: float = 0.20
VOTER_WEIGHT_CONTEXT: float = 0.20
```

---

### 2. Example Store (`server/tools/tutor/examples.py`)

**Purpose:** Store and retrieve successful tool call examples.

**Data structure:**
```python
{
    "id": "uuid",
    "query": "play some miles davis",
    "query_embedding": [0.1, 0.2, ...],      # Pre-computed
    "tool": "music_play",
    "args": {"query": "miles davis"},
    "success": true,
    "timestamp": "2024-12-02T10:00:00Z",
    "source": "auto" | "manual" | "correction"
}
```

**Storage:** JSON file at `server/tools/tutor/data/examples.json`

**Functions:**
```python
class ExampleStore:
    def __init__(self, path: str)
    def add(self, query: str, tool: str, args: dict, success: bool, source: str)
    def find_similar(self, query: str, limit: int = 3) -> List[Example]
    def get_by_tool(self, tool: str, limit: int = 10) -> List[Example]
    def delete(self, id: str)
    def export_training_data(self) -> List[dict]  # For fine-tuning
```

**Bootstrap:** Seed with ~50 hand-crafted examples covering all tools.

---

### 3. Voters (`server/tools/tutor/voters.py`)

#### 3a. Keyword Voter

**Purpose:** Fast regex/keyword matching.

**Implementation:**
```python
class KeywordVoter:
    def __init__(self):
        self.patterns = {
            "music_play": [r"\bplay\b", r"\bmusic\b", r"\blisten\b", r"\bsong\b"],
            "get_weather": [r"\bweather\b", r"\btemperature\b", r"\bforecast\b"],
            "web_search": [r"\bsearch\b", r"\bgoogle\b", r"\blook up\b", r"\bfind\b"],
            "recall": [r"\bremember\b", r"\bmemory\b", r"\byesterday\b", r"\blast time\b"],
            # ... all tools
        }
    
    def vote(self, query: str) -> Dict[str, float]:
        """Returns {tool_name: confidence} for all tools"""
```

**Weight:** 0.25

---

#### 3b. Embedding Voter

**Purpose:** Semantic similarity to past successful queries.

**Implementation:**
```python
class EmbeddingVoter:
    def __init__(self, example_store: ExampleStore):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')  # CPU
        self.example_store = example_store
    
    def vote(self, query: str) -> Dict[str, float]:
        """
        1. Embed query
        2. Find top-k similar examples
        3. Aggregate tool votes by similarity score
        """
```

**Weight:** 0.35

---

#### 3c. History Voter

**Purpose:** User's personal tool usage patterns.

**Implementation:**
```python
class HistoryVoter:
    def __init__(self):
        self.history = {}  # {user_id: {tool: count}}
    
    def vote(self, query: str, user_id: str = "default") -> Dict[str, float]:
        """Returns tools weighted by how often this user uses them"""
    
    def record(self, user_id: str, tool: str):
        """Record a tool usage"""
```

**Storage:** JSON file at `server/tools/tutor/data/history.json`

**Weight:** 0.20

---

#### 3d. Context Voter

**Purpose:** Recent conversation context.

**Implementation:**
```python
class ContextVoter:
    def __init__(self):
        pass
    
    def vote(self, query: str, recent_messages: List[dict]) -> Dict[str, float]:
        """
        Analyze recent conversation for tool hints:
        - Recently used tools (continuity)
        - Topics mentioned (music, weather, etc.)
        - Pronouns suggesting continuation ("that", "it", "more")
        """
```

**Weight:** 0.20

---

### 4. Voting System (`server/tools/tutor/voting.py`)

**Purpose:** Aggregate voter opinions, decide on tool.

**Implementation:**
```python
class VotingSystem:
    def __init__(self, config: Settings):
        self.example_store = ExampleStore(...)
        self.voters = [
            (KeywordVoter(), config.VOTER_WEIGHT_KEYWORD),
            (EmbeddingVoter(self.example_store), config.VOTER_WEIGHT_EMBEDDING),
            (HistoryVoter(), config.VOTER_WEIGHT_HISTORY),
            (ContextVoter(), config.VOTER_WEIGHT_CONTEXT),
        ]
    
    def vote(
        self, 
        query: str, 
        llm_suggestion: str = None,
        candidates: List[str] = None,
        context: List[dict] = None
    ) -> VoteResult:
        """
        Returns:
            VoteResult(
                winner="music_play",
                confidence=0.82,
                votes={"music_play": 0.82, "web_search": 0.15, ...},
                voters={"keyword": {...}, "embedding": {...}, ...}
            )
        """
        results = {}
        for voter, weight in self.voters:
            voter_results = voter.vote(query, ...)
            for tool, score in voter_results.items():
                results[tool] = results.get(tool, 0) + (score * weight)
        
        winner = max(results, key=results.get)
        return VoteResult(winner=winner, confidence=results[winner], ...)
```

---

### 5. Confidence Parser (`server/llm/confidence.py`)

**Purpose:** Extract confidence from LLM response.

**Approach 1: Structured output**

Modify system prompt to request:
```
When calling a tool, output in this format:
TOOL: tool_name
CONFIDENCE: 0.85
ARGS: {"param": "value"}
```

**Approach 2: JSON with confidence**
```json
{
    "tool": "music_play",
    "confidence": 0.85,
    "args": {"query": "miles davis"}
}
```

**Approach 3: Uncertainty detection**

Parse for uncertainty phrases:
- "I think..." → confidence -= 0.2
- "maybe..." → confidence -= 0.3
- "I'm not sure..." → confidence -= 0.4

**Implementation:**
```python
class ConfidenceParser:
    def parse(self, llm_response: str) -> ToolCall:
        """
        Returns:
            ToolCall(
                tool="music_play",
                args={"query": "miles davis"},
                confidence=0.85,
                raw_response="..."
            )
        """
```

---

### 6. Example Injector (`server/tools/tutor/injector.py`)

**Purpose:** Add relevant examples to prompt before LLM sees it.

**Implementation:**
```python
class ExampleInjector:
    def __init__(self, example_store: ExampleStore, embedding_model):
        self.store = example_store
        self.model = embedding_model
    
    def inject(self, query: str, system_prompt: str, count: int = 3) -> str:
        """
        1. Find similar examples
        2. Format as few-shot prompt
        3. Insert into system prompt
        """
        examples = self.store.find_similar(query, limit=count)
        
        example_text = "Here are examples of tool usage:\n\n"
        for ex in examples:
            example_text += f"User: {ex.query}\n"
            example_text += f"Tool: {ex.tool}({json.dumps(ex.args)})\n\n"
        
        return system_prompt + "\n\n" + example_text
```

---

### 7. Learning Module (`server/tools/tutor/learning.py`)

**Purpose:** Store successful calls, learn from corrections.

**Implementation:**
```python
class LearningModule:
    def __init__(self, example_store: ExampleStore, history_voter: HistoryVoter):
        self.store = example_store
        self.history = history_voter
    
    def record_success(self, query: str, tool: str, args: dict):
        """Tool call succeeded - store as example"""
        self.store.add(query, tool, args, success=True, source="auto")
        self.history.record("default", tool)
    
    def record_failure(self, query: str, tool: str, args: dict, error: str):
        """Tool call failed - store for analysis"""
        self.store.add(query, tool, args, success=False, source="auto")
    
    def record_correction(self, query: str, wrong_tool: str, correct_tool: str, args: dict):
        """User or voter corrected the LLM - store both"""
        self.store.add(query, wrong_tool, {}, success=False, source="correction")
        self.store.add(query, correct_tool, args, success=True, source="correction")
```

---

### 8. Main Integration (`server/tools/tutor/__init__.py`)

**Purpose:** Tie it all together.

```python
class ToolTutor:
    def __init__(self, config: Settings):
        self.config = config
        self.example_store = ExampleStore(...)
        self.voting_system = VotingSystem(config)
        self.confidence_parser = ConfidenceParser()
        self.injector = ExampleInjector(...)
        self.learning = LearningModule(...)
    
    def prepare_prompt(self, query: str, system_prompt: str) -> str:
        """Inject examples before LLM call"""
        if not self.config.TOOL_TUTOR_ENABLED:
            return system_prompt
        return self.injector.inject(query, system_prompt, self.config.EXAMPLE_COUNT)
    
    def process_tool_call(
        self, 
        query: str, 
        llm_response: str,
        context: List[dict] = None
    ) -> ToolCall:
        """Parse LLM response, vote if uncertain, return final decision"""
        
        tool_call = self.confidence_parser.parse(llm_response)
        
        if tool_call.confidence >= self.config.CONFIDENCE_THRESHOLD:
            # LLM is confident, trust it
            return tool_call
        
        # LLM is uncertain, ask voters
        vote_result = self.voting_system.vote(
            query=query,
            llm_suggestion=tool_call.tool,
            context=context
        )
        
        if self.config.AUTO_CORRECT and vote_result.confidence > tool_call.confidence:
            # Voters are more confident, override
            tool_call.tool = vote_result.winner
            tool_call.overridden = True
        
        return tool_call
    
    def record_result(self, query: str, tool_call: ToolCall, success: bool):
        """Learn from the result"""
        if not self.config.LEARNING_ENABLED:
            return
        
        if success:
            self.learning.record_success(query, tool_call.tool, tool_call.args)
        else:
            self.learning.record_failure(query, tool_call.tool, tool_call.args, "")
```

---

## File Structure

```
server/tools/tutor/
├── __init__.py          # ToolTutor main class
├── examples.py          # ExampleStore
├── voters.py            # All voter classes
├── voting.py            # VotingSystem
├── confidence.py        # ConfidenceParser
├── injector.py          # ExampleInjector
├── learning.py          # LearningModule
└── data/
    ├── examples.json    # Stored examples
    ├── history.json     # User history
    └── seed/
        └── examples.json  # Bootstrap examples
```

---

## Implementation Steps

### Phase 1: Foundation (2 hours)
- [ ] Create `server/tools/tutor/` directory structure
- [ ] Implement `ExampleStore` with JSON persistence
- [ ] Create seed examples file (~50 examples covering all tools)
- [ ] Add configuration settings to `server/config.py`
- [ ] Write unit tests for ExampleStore

### Phase 2: Voters (1.5 hours)
- [ ] Implement `KeywordVoter` with patterns for all tools
- [ ] Implement `EmbeddingVoter` using sentence-transformers
- [ ] Implement `HistoryVoter` with JSON persistence
- [ ] Implement `ContextVoter` with conversation analysis
- [ ] Write unit tests for each voter

### Phase 3: Voting System (1 hour)
- [ ] Implement `VotingSystem` to aggregate votes
- [ ] Implement `VoteResult` dataclass
- [ ] Add weighted voting logic
- [ ] Write unit tests for voting

### Phase 4: LLM Integration (1 hour)
- [ ] Modify system prompt to request confidence scores
- [ ] Implement `ConfidenceParser` to extract confidence
- [ ] Implement `ExampleInjector` to add few-shot examples
- [ ] Test with actual LLM responses

### Phase 5: Learning (30 minutes)
- [ ] Implement `LearningModule` to record results
- [ ] Add success/failure/correction recording
- [ ] Test learning loop

### Phase 6: Integration (1 hour)
- [ ] Create `ToolTutor` main class
- [ ] Integrate into `server/main.py` pipeline
- [ ] Add to `server/llm/ollama.py` for prompt preparation
- [ ] Wire up confidence threshold from settings

### Phase 7: Testing & Tuning (1 hour)
- [ ] Create test script with 20 diverse queries
- [ ] Run baseline (no tutor) and record results
- [ ] Run with tutor enabled and compare
- [ ] Tune voter weights based on results
- [ ] Document findings

---

## Seed Examples

Here are initial examples to bootstrap the system:

```json
[
  {"query": "play some jazz", "tool": "music_play", "args": {"query": "jazz"}},
  {"query": "play miles davis", "tool": "music_play", "args": {"query": "miles davis"}},
  {"query": "put on some music", "tool": "music_play", "args": {"query": ""}},
  {"query": "pause the music", "tool": "music_pause", "args": {}},
  {"query": "stop playing", "tool": "music_stop", "args": {}},
  {"query": "next song", "tool": "music_next", "args": {}},
  {"query": "skip this track", "tool": "music_next", "args": {}},
  {"query": "previous song", "tool": "music_previous", "args": {}},
  {"query": "turn it up", "tool": "music_volume", "args": {"level": 80}},
  {"query": "volume down", "tool": "music_volume", "args": {"level": 40}},
  {"query": "what's playing", "tool": "music_now_playing", "args": {}},
  {"query": "what song is this", "tool": "music_now_playing", "args": {}},
  
  {"query": "what's the weather", "tool": "get_weather", "args": {"location": "here"}},
  {"query": "is it going to rain", "tool": "get_weather", "args": {"location": "here"}},
  {"query": "temperature in austin", "tool": "get_weather", "args": {"location": "austin"}},
  {"query": "weather forecast", "tool": "get_weather", "args": {"location": "here"}},
  
  {"query": "search for python tutorials", "tool": "web_search", "args": {"query": "python tutorials"}},
  {"query": "google best restaurants", "tool": "web_search", "args": {"query": "best restaurants"}},
  {"query": "look up how to cook pasta", "tool": "web_search", "args": {"query": "how to cook pasta"}},
  {"query": "find information about mars", "tool": "web_search", "args": {"query": "mars planet"}},
  
  {"query": "remember that I like coffee", "tool": "remember", "args": {"content": "user likes coffee", "importance": 5}},
  {"query": "save this for later", "tool": "remember", "args": {"content": "", "importance": 5}},
  {"query": "what did I tell you yesterday", "tool": "recall", "args": {"query": "yesterday"}},
  {"query": "do you remember my favorite color", "tool": "recall", "args": {"query": "favorite color"}},
  
  {"query": "what time is it", "tool": "get_current_time", "args": {}},
  {"query": "current time", "tool": "get_current_time", "args": {}},
  {"query": "what's today's date", "tool": "get_current_time", "args": {}},
  
  {"query": "tell me a joke", "tool": "tell_joke", "args": {}},
  {"query": "make me laugh", "tool": "tell_joke", "args": {}},
  {"query": "say something funny", "tool": "tell_joke", "args": {}},
  
  {"query": "search the knowledge base for mayors", "tool": "knowledge_search", "args": {"query": "mayors"}},
  {"query": "what do you know about willowbrook", "tool": "knowledge_search", "args": {"query": "willowbrook"}}
]
```

---

## Testing Plan

### Test Queries (Baseline vs Tutor)

| # | Query | Expected Tool | Notes |
|---|-------|---------------|-------|
| 1 | "play some coltrane" | music_play | Easy |
| 2 | "what's the temp outside" | get_weather | Slang |
| 3 | "google best pizza near me" | web_search | Verb as tool hint |
| 4 | "do you remember what I said about cars" | recall | Memory query |
| 5 | "skip" | music_next | Single word |
| 6 | "louder" | music_volume | Implicit action |
| 7 | "that thing from yesterday" | recall | Vague reference |
| 8 | "look that up" | web_search | Pronoun, continuation |
| 9 | "pause" | music_pause | Context dependent |
| 10 | "what's the weather gonna be like tomorrow in NYC" | get_weather | Complex |
| 11 | "find me some information on black holes" | web_search OR knowledge_search | Ambiguous |
| 12 | "tell me something interesting" | tell_joke OR knowledge_search | Very ambiguous |
| 13 | "add that to my memories" | remember | Reference to previous |
| 14 | "search my memories for recipes" | recall | Explicit memory search |
| 15 | "what time zone am I in" | get_current_time | Indirect |
| 16 | "volume 50" | music_volume | Shorthand |
| 17 | "search for it" | web_search | Needs context |
| 18 | "stop" | music_stop OR (interrupt) | Ambiguous |
| 19 | "can you look up the capital of france" | web_search | Polite form |
| 20 | "I want to hear some beethoven" | music_play | Indirect request |

### Success Metrics

- **Baseline accuracy:** % of correct tool selections without tutor
- **Tutor accuracy:** % of correct tool selections with tutor
- **Override accuracy:** When voters override LLM, % that are correct
- **Latency impact:** Average ms added per query

---

## Future Enhancements

1. **Fine-tuning export:** Generate training data from successful examples
2. **UI for examples:** Browse, edit, delete examples in frontend
3. **Voter tuning:** Auto-adjust weights based on accuracy
4. **Multi-user:** Per-user history and preferences
5. **Tool chaining:** Detect when multiple tools needed
6. **Explanation mode:** Show user why a tool was chosen
7. **A/B testing:** Compare different voter configurations

---

## GUI Layer (Separate from Core Module)

The GUI is intentionally **not part of the core module**. It's a separate presentation layer that talks to the tutor via API endpoints.

### API Endpoints (for GUI)

```python
# server/tools/tutor/api.py - REST endpoints for GUI

@router.get("/tutor/examples")
async def list_examples(tool: str = None, limit: int = 50):
    """List stored examples, optionally filter by tool"""

@router.post("/tutor/examples")
async def add_example(query: str, tool: str, args: dict):
    """Manually add an example"""

@router.delete("/tutor/examples/{id}")
async def delete_example(id: str):
    """Delete an example"""

@router.get("/tutor/stats")
async def get_stats():
    """Get accuracy stats, vote counts, etc."""

@router.get("/tutor/history")
async def get_history(limit: int = 100):
    """Recent tool calls with outcomes"""

@router.post("/tutor/test")
async def test_query(query: str):
    """Test a query - shows what tutor would do without executing"""

@router.put("/tutor/config")
async def update_config(confidence_threshold: float = None, ...):
    """Update tutor settings"""
```

### GUI Options

**Option A: Felix Frontend Tab**
- Add a "Tutor" tab to existing Felix UI
- Uses same WebSocket + REST
- Integrated experience

**Option B: Standalone Dashboard**
- Separate HTML page like mcpart dashboard
- Independent of main Felix UI
- Easier to iterate on

**Option C: CLI Tool**
- `python -m server.tools.tutor.cli stats`
- `python -m server.tools.tutor.cli add-example "play jazz" music_play`
- Quick admin without browser

### GUI Features (Future)

```
┌─────────────────────────────────────────────────────────────────┐
│  TOOL TUTOR DASHBOARD                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Accuracy: 87%   │  │ Examples: 156   │  │ Overrides: 23   │  │
│  │ ↑ 5% this week  │  │ ↑ 12 today      │  │ 91% correct     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                 │
│  RECENT CALLS                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ "play coltrane" → music_play ✓ (conf: 0.95)             │    │
│  │ "that thing" → recall ⚠ (voted, was: web_search)        │    │
│  │ "weather" → get_weather ✓ (conf: 0.88)                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  EXAMPLES BY TOOL                         SETTINGS              │
│  ┌─────────────────────────┐              ┌─────────────────┐   │
│  │ music_play (34)    [+]  │              │ Threshold: 0.8  │   │
│  │ web_search (28)    [+]  │              │ Examples: 3     │   │
│  │ get_weather (22)   [+]  │              │ Learning: ON    │   │
│  │ recall (18)        [+]  │              │ Auto-correct:ON │   │
│  │ ...                     │              └─────────────────┘   │
│  └─────────────────────────┘                                    │
│                                                                 │
│  TEST QUERY                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ > "look up recipes for pasta"                           │    │
│  │   Keyword: web_search (0.7)                             │    │
│  │   Embedding: web_search (0.8)                           │    │
│  │   History: web_search (0.6)                             │    │
│  │   → Winner: web_search (0.72)                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Separate?

1. **Core module stays lean** - No UI dependencies
2. **Multiple UIs possible** - CLI, web, API clients
3. **Swap module, keep UI** - New tutor implementation? GUI still works
4. **Ship core first** - GUI can come later without blocking

---

## Dependencies

Already installed:
- `sentence-transformers` (via mcpower)
- `numpy` (for similarity calculations)

No new dependencies required.

---

## Notes

- All voters run on CPU to avoid VRAM pressure
- Example embeddings are pre-computed on save
- System is designed to be disable-able via config
- Learning is opt-in and can be toggled
- Strict mode can require user confirmation for uncertain calls
