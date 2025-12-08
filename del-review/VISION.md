# 🎙️ Voice Agent Vision Document

## The Big Picture

**What we're building:** A friendly, approachable voice AI assistant that feels like talking to a helpful friend, not a cold corporate robot. Think of it as "the anti-Alexa" - warm, personality-driven, and designed to make AI feel accessible to people who might be intimidated by technology.

**Target Users:** 
- Non-technical users who are curious about AI but feel overwhelmed
- People who prefer speaking over typing
- Anyone who wants a local, private AI assistant (no cloud dependency)
- Developers wanting to understand real-time voice AI architecture

**Core Philosophy:**
1. **Privacy First** - Everything runs locally. Your conversations stay on your machine.
2. **Personality Over Perfection** - A friendly character with quirks beats a flawless but soulless assistant
3. **Low Latency is King** - Voice interactions must feel natural, not like walkie-talkie conversations
4. **Approachable Design** - Cute avatar, soft colors, glass morphism - make AI feel friendly

---

## The Experience We Want

### First Impression
User opens the app and sees a cute, animated character with big expressive eyes. The interface is clean, modern, with soft glassmorphism effects. There's a subtle glow around the character. The user feels like they're about to have a conversation with a friendly being, not operate a machine.

### The Conversation Flow
1. User clicks the orb or presses spacebar - the character's eyes light up, ears perk
2. Character shows "listening" state - eyes focused, maybe slight head tilt
3. User speaks naturally - no "wake words", no robotic prompts
4. When user pauses, character shifts to "thinking" - eyes look up, contemplative expression
5. Character responds with voice AND personality - the mouth animates, eyes express emotion
6. If user interrupts (barge-in), character IMMEDIATELY stops and listens - no awkward overlap

### Emotional States
The avatar should have distinct, readable emotional states:
- **Idle**: Gentle breathing animation, occasional blinks, peaceful
- **Listening**: Alert, focused, leaning in slightly
- **Thinking**: Eyes looking up/to side, processing expression
- **Speaking**: Animated mouth, expressive eyes matching content
- **Happy**: Bigger eyes, maybe slight bounce
- **Confused**: Head tilt, questioning expression
- **Interrupted**: Quick transition, respectful acknowledgment

---

## Technical Architecture Vision

### Current Stack (What We Have)
```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Avatar    │  │   Audio     │  │   WebSocket     │  │
│  │   (SVG)     │  │   Handler   │  │   Client        │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└───────────────────────────┬─────────────────────────────┘
                            │ WebSocket (bidirectional)
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    BACKEND (Python)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Silero    │  │   Whisper   │  │   Ollama        │  │
│  │   VAD       │  │   STT       │  │   LLM           │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐                       │
│  │   Piper     │  │   Session   │                       │
│  │   TTS       │  │   Manager   │                       │
│  └─────────────┘  └─────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

### Dream Architecture (Where We're Going)
```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │  Avatar    │  │  Theme     │  │  Audio     │  │  Chat      │  │
│  │  Engine    │  │  System    │  │  Pipeline  │  │  History   │  │
│  │  (Canvas/  │  │  (CSS Vars │  │  (Web      │  │  (Virtual  │  │
│  │   WebGL)   │  │   + Prefs) │  │   Audio)   │  │   Scroll)  │  │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                  │
│  │  Settings  │  │  Keyboard  │  │  Mobile    │                  │
│  │  Panel     │  │  Shortcuts │  │  PWA       │                  │
│  └────────────┘  └────────────┘  └────────────┘                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                    WebSocket + WebRTC (future)
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│                         BACKEND                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Session Manager                           │ │
│  │  - Conversation state    - Barge-in handling                │ │
│  │  - User preferences      - Rate limiting                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ VAD Pipeline │  │ STT Engine   │  │ LLM Router           │   │
│  │ - Silero     │  │ - Whisper    │  │ - Ollama (default)   │   │
│  │ - WebRTC VAD │  │ - Faster     │  │ - OpenAI (optional)  │   │
│  │   (future)   │  │   Whisper    │  │ - Anthropic (opt)    │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ TTS Engine   │  │ Emotion      │  │ Memory/Context       │   │
│  │ - Piper      │  │ Analyzer     │  │ - Short-term buffer  │   │
│  │ - Coqui      │  │ - Sentiment  │  │ - Long-term (SQLite) │   │
│  │   (future)   │  │ - Tone tags  │  │ - RAG (future)       │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Tool/Agent System                         │ │
│  │  - Web search      - File operations    - Smart home        │ │
│  │  - Calculator      - Weather            - Custom plugins    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

---

## Feature Roadmap

### Phase 1: Core Experience (CURRENT - MVP)
- [x] Basic voice-to-voice conversation
- [x] Real-time streaming responses
- [x] Barge-in support (interrupt while speaking)
- [x] Cute avatar with emotional states
- [x] Theme system (10 themes)
- [x] Push-to-talk (spacebar)
- [ ] Voice activity detection trigger (hands-free)
- [ ] Settings persistence (localStorage)
- [ ] Mobile responsive layout

### Phase 2: Polish & Personality
- [ ] Avatar 2.0 - More expressions, smoother animations
- [ ] Custom voice selection (multiple Piper voices)
- [ ] Personality presets (friendly, professional, playful)
- [ ] Sound effects (subtle UI feedback)
- [ ] Typing indicator for text responses
- [ ] Export conversation history
- [ ] Keyboard shortcuts panel

### Phase 3: Intelligence Upgrades
- [ ] Conversation memory (remember context across sessions)
- [ ] Emotion-aware responses (detect user mood, adjust tone)
- [ ] Multi-turn task handling ("remind me about this later")
- [ ] Basic tool use (web search, calculations, time/date)
- [ ] System prompt customization UI

### Phase 4: Advanced Features
- [ ] Multiple LLM backends (OpenAI, Anthropic, local models)
- [ ] Voice cloning (speak in custom voices)
- [ ] Multi-language support
- [ ] Wake word detection ("Hey Nova")
- [ ] Desktop app (Electron/Tauri)
- [ ] Mobile PWA with offline support
- [ ] Plugin system for custom tools

### Phase 5: Social & Sharing
- [ ] Share conversation snippets
- [ ] Export as podcast/audio
- [ ] Collaborative sessions
- [ ] Community themes marketplace
- [ ] Custom avatar builder

---

## Design System

### Colors (CSS Variables)
```css
/* Base structure for all themes */
--bg-primary: /* Main background */
--bg-secondary: /* Card/panel backgrounds */
--bg-glass: /* Glassmorphism overlay */
--text-primary: /* Main text */
--text-secondary: /* Muted text */
--accent-primary: /* Buttons, links, highlights */
--accent-secondary: /* Hover states, secondary actions */
--orb-color: /* Main orb/avatar glow */
--orb-glow: /* Ambient glow effect */
--success: /* Positive feedback */
--warning: /* Caution states */
--error: /* Error states */
```

### Typography
- **Display**: Inter or SF Pro Display - clean, modern
- **Body**: System font stack for performance
- **Monospace**: JetBrains Mono for any code display

### Animation Principles
1. **Ease-out for entrances** - Things arrive confidently
2. **Ease-in-out for state changes** - Smooth transitions feel natural
3. **Spring physics for playful elements** - Avatar bounces, not slides
4. **60fps minimum** - Jank kills the vibe
5. **Respect reduced-motion** - Accessibility matters

### Avatar Design Language
- **Shape**: Rounded square with soft corners (approachable, not aggressive)
- **Eyes**: Large, expressive (40% of face), with visible pupils
- **Mouth**: Simple but readable - line for neutral, curves for emotion
- **Colors**: Should adapt to theme while maintaining readability
- **Animations**: Subtle, continuous (breathing, blinking) plus state-based

---

## Technical Decisions & Rationale

### Why WebSockets over REST?
- Real-time bidirectional communication
- Lower latency for streaming audio
- Natural fit for conversation flow
- Easy state synchronization

### Why Piper TTS?
- Runs completely locally (privacy)
- Fast inference on CPU
- Good quality voices
- Active development community

### Why Silero VAD?
- Extremely lightweight
- Works well with streaming audio
- Accurate speech detection
- Easy to integrate with Python

### Why Ollama?
- Local LLM hosting made easy
- Hot-swappable models
- Good API compatibility
- Growing model ecosystem

### Why Vanilla JS (for now)?
- No build step = faster iteration
- Simpler debugging
- Easier to understand full stack
- Can always add framework later

---

## User Personas

### 1. "Curious Carol" - The AI Newcomer
- 55 years old, heard about ChatGPT from grandkids
- Intimidated by typing, prefers speaking
- Wants: Simple, friendly, non-judgmental
- Needs: Clear visual feedback, patient responses

### 2. "Developer Dan" - The Tinkerer
- 28 years old, software engineer
- Wants to understand how voice AI works
- Wants: Clean code, extensible architecture
- Needs: Good documentation, hackable design

### 3. "Privacy Pete" - The Security Conscious
- 40 years old, IT professional
- Refuses to use cloud AI services
- Wants: 100% local, no data leaving machine
- Needs: Transparency about what runs where

### 4. "Mobile Maya" - The On-The-Go User
- 32 years old, busy professional
- Uses phone for everything
- Wants: Quick voice interactions while multitasking
- Needs: PWA, hands-free mode, low battery usage

---

## Success Metrics

### User Experience
- Time to first voice response: < 2 seconds
- Barge-in response time: < 200ms
- User satisfaction: "Would you recommend to a friend?"

### Technical
- Audio latency: < 100ms round trip
- TTS generation: < 500ms for first audio chunk
- Memory usage: < 500MB idle
- Works on 4GB RAM machines

### Engagement
- Average session length
- Return user rate
- Feature discovery rate
- Theme changes (engagement signal)

---

## What Makes This Different

1. **Character-First Design**: The avatar isn't decoration, it's the interface
2. **Local-First Architecture**: Privacy by default, cloud by choice
3. **Emotional Intelligence**: The UI responds to conversation mood
4. **Hackable Foundation**: Built to be extended and customized
5. **Inclusive Design**: Works for tech novices and experts alike

---

## The Dream

Imagine opening this app and feeling like you're about to chat with a friend. The character greets you warmly, remembers your name from last time, and asks how your day is going. You can speak naturally, interrupt when you need to, and the character responds with genuine personality - sometimes funny, sometimes thoughtful, always helpful.

This isn't about replacing human connection. It's about making AI feel less like a tool and more like a companion. Something that makes you smile, that you actually *want* to talk to.

That's the vibe we're building.

---

*"Make AI feel like magic, not machinery."*
