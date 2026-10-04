# Understudy — AI Apprentice

A voice-powered apprentice that observes a fictional invoice workflow, asks what changes the expert's mind, builds an evidence-linked Work Map, and checks a new trainee's decisions before saving.

**Status:** first functional implementation. Automated evidence-validation tests and local build are available. Live OpenAI / ElevenLabs calls and microphone/screen behavior require your keys and a real browser test. No mock AI or canned learned policies are returned when credentials are absent.

## Deploy a shareable Vercel demo (recommended)

1. In Vercel, Add New → Project → import `Meesha404/ai-apprentice`.
2. Framework: Other. Build command: `npm run build`. Output directory: `public`. Keep the repository root as Root Directory. The tracked `vercel.json` supplies these settings.
3. Add environment variables before deploying:
   - `OPENAI_API_KEY`: your private OpenAI API key with Responses Write access.
   - `OPENAI_MODEL`: `gpt-4.1-mini`.
   - `ELEVENLABS_API_KEY`: your private ElevenLabs key.
   - `ELEVENLABS_AGENT_ID`: the published agent ID.
   - `DEMO_ACCESS_CODE`: choose a private code of at least 12 characters; share this code with judges, never API keys.
4. Deploy. Open the production HTTPS URL, enter the demo access code, and connect voice. If you change environment variables later, redeploy.
5. Open the invoice sandbox from the same production URL and share its tab. Keep the main app tab open. Both tabs must have the same origin.

The interface is publicly reachable; paid API actions require the demo code. Hosting is prepared but not yet verified on an actual Vercel deployment. The code is a small-demo gate, not individual user authentication. Anyone with it can consume provider credits. In-memory request caps reset on cold starts and do not apply globally across Vercel instances; use provider spending controls. No server-side evidence persistence is enabled. ElevenLabs WebSocket traffic flows directly from the browser to ElevenLabs, not through a Vercel WebSocket server.

## Run on your Mac

If using the ZIP, extract it and open Terminal in its `ai-apprentice` folder, then run `npm install` and `cp .env.example .env`. The clone instructions below apply after the source has been uploaded to GitHub.

Install Node.js 22 or later if needed, then:

```bash
git clone https://github.com/Meesha404/ai-apprentice.git
cd ai-apprentice
npm install
cp .env.example .env
```

Open `.env` in a text editor. Fill in OPENAI_API_KEY, ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID. Never share the keys or commit `.env`. OPENAI_MODEL is configurable; the default is `gpt-4.1-mini`. Change it to a vision-capable model available in your account if needed.

```bash
npm run build
npm test
npm start
```

Open http://127.0.0.1:3000 in desktop Chrome. Allow microphone and screen recording. On macOS, Chrome may need Screen & System Audio Recording permission in System Settings and a restart.

## ElevenLabs setup

1. Claim the event offer in your ElevenLabs account.
2. Create an ElevenAgents conversational agent; paste `AGENT_PROMPT.md` as its system prompt. Use a short greeting as described there.
3. Select an available voice and supported LLM in the dashboard. Enable the user transcript, agent response and audio events needed by the JavaScript SDK. Enable appropriate user interruption / turn-taking settings. Disable frequent inactivity reminders if configured.
4. Use a private/authenticated agent; copy its Agent ID to ELEVENLABS_AGENT_ID. The server obtains short-lived signed WebSocket URLs. Never put your API key in client code.
5. Test a voice conversation before the screen demo. The app sends screen observations as contextual updates and explicit question requests at quiet moments.

## Demo journey

1. Read EXPERT_ROLE_CARD.md privately. It is not imported by the app or included in model context.
2. Open the invoice workspace from Capture, then share only that tab. Connect voice. The initial version observes changed screen frames at most once per 12 seconds to control costs.
3. Process the three expert invoices. Pause after meaningful decisions. The apprentice queues context-sensitive questions. The manual "Ask at this pause" control is available when you are ready. Aim for at least three live questions including one guardrail question.
4. Finish task → Debrief. Answer the generated questions, one at a time. Typed answers/corrections are available in Capture. Generate the map; inspect each quote and image; use Speak teach-back. Correct misunderstandings, regenerate, and confirm only when accurate.
5. Activate tutor, then open unseen trainee cases. Try the wrong category for a purchased equipment invoice. The tutor checks the confirmed learned map before save; unsupported or failed checks never save.
6. Export the session JSON before closing the tab. It contains transcript, screenshots, map and practice history.

## What is implemented

- Browser screen sharing; resized JPEG frames → OpenAI vision; visible-change events with timestamps.
- ElevenLabs Agents SDK voice with contextual screen updates, transcript and audio-level handling.
- Conservative question timing: workspace activity, microphone volume, agent speaking state, and a 45-second question cooldown. Reading cannot be reliably detected; manual readiness is available. This is a heuristic, not a perfect natural-pause detector.
- At least three generated debrief questions; expert teach-back; exact-quote and event-ID validation of map entries.
- Expert confirmation invalidated by a new expert statement; corrections require regenerating the map.
- New invoice set; server-side model assessment against the confirmed map; block/unknown fails closed. No expert policy file is loaded at runtime.
- Off-record disconnects microphone and screen capture, discards pending observation results, and stops recording locally. It does not erase provider records already transmitted.
- No persistence by default: evidence is kept in browser memory until exported. Refresh loses it.

## Architecture

Vanilla browser UI + bundled `@elevenlabs/client`; Node.js HTTP server; OpenAI Responses API; ElevenLabs signed conversation URLs. Same-origin BroadcastChannel carries sandbox activity and pre-save checks; both tabs must use the exact same host and port. Activity signals support timing and save interception; screenshot vision is the source of captured screen evidence.

`POST /api/observe`, `/api/debrief`, `/api/map`, `/api/check` call OpenAI. `POST /api/voice` obtains the ElevenLabs signed URL. Keys stay server-side. The map is expert-reviewed training data; it is not a production financial control and a local developer can alter it.

## Costs and limits

60 frame analyses per page session; 250 total OpenAI calls per server process; one in-flight request per endpoint. This is a request cap, not a guaranteed dollar limit. Configure provider spending alerts/limits. No polling when screen content is unchanged. Text/debrief/map operations also cost tokens. SDK voice sessions incur provider usage separately.

## Privacy / deployment

Synthetic data only. Avoid sharing the role card, passwords, other applications or real personal data. Automatic PII redaction is **not implemented**. The capture selector and synthetic-only workflow are the current protections. A production version needs redaction, deletion controls, retention policy and stronger access controls.

The server binds to localhost by default. On Vercel, paid API endpoints fail closed until a 12+ character DEMO_ACCESS_CODE is configured. Wider production access needs individual authentication, distributed rate limiting, durable secure storage and provider billing controls. GitHub Pages alone cannot run the private-key server. HTTPS is required outside localhost for browser media permissions.

## Validation and remaining demo gates

`npm test` checks fabricated quotes, missing evidence and invalid tutor verdicts. These tests do not establish semantic correctness of a model-generated rule. Manually verify every rule against the expert's explanation.

Before submission: validate your keys/model access; test microphone and shared tab on your Mac; capture at least three live questions and three debrief questions; correct a rule and demonstrate changed tutor behavior; test the unseen case; inspect export; record a real demo. Do not present screenshots or offline UI checks as a tested live integration.

## Sources

- https://elevenlabs.io/docs/eleven-agents/libraries/java-script
- https://developers.openai.com/api/docs/guides/images-vision
- Hack-Nation Challenge 1 brief provided by the entrant.

## Moonshot

An expert-approved memory of how work is decided, with every exception traceable to its source. Future sessions ask only about changed rules; people and automation share the same reviewed guardrails.

Provider update: OpenAI is now the application backend for vision and structured reasoning. Existing installs should run `git pull`, set OPENAI_API_KEY in .env, run `npm run build`, and restart. The ElevenLabs dashboard LLM setting is separate and need not change. No live OpenAI call has been tested without your key.
