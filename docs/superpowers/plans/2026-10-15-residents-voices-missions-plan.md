# Residents who sound like themselves, missions that make sense

Date: 2026-10-15. Requested: fix the "escalator" bugs and anything else
broken, make the game functional with coherent missions, give every
resident their own way of talking and a voice that fits them, and fix
the voices' pronunciation. The user could not answer questions, so the
design calls below are mine; assumptions are stated.

## Findings (measured before changing anything)

- Dialogue (`npcs/life/Talk.js`), voices (`audio/voice/*`), residents
  (`NPCDefinitions.js`) and missions (`gameplay/SideMission*.js`) are
  byte-identical to the original three.js game: the complaints are design
  gaps carried over, not porting bugs.
- Every resident greets with the same two sentences ("Oh, hello! I don't
  think we've met. I'm X — role.") and shares one pool of "what I'm doing"
  lines. Voices are hashed onto the first 9 female / 6 male Kokoro voices,
  so an elderly resident and a schoolgirl can share one.
- The Kokoro voices (espeak-ng G2P) mispronounce the Japanese names:
  "Aoi", "Kaede", "Tomoe", "Nao", "Shiori", "Ayame", "Teppei" come out as
  English words ("kayd", "now"...).
- Escalators: scripted rides (up, down, angled, running, standing, jumping,
  walking back, at 60 fps) all board, carry and step off correctly; shoppers
  and carts can't board (carts ride as `player.ride`). No ride bug
  reproduced. Mission objective props do render (a false alarm while
  checking: she was standing on the prop).
- Missions work mechanically (the exploration check passes them) but are
  thin: nothing is carried, the text claims things the game doesn't show
  ("take this watering can"), residents named in a mission don't know
  about it until it is active, and with nothing active the tracker gives
  no target.

## Design

### 1. Personas (`src/npcs/Personas.js`, new, data only)
One entry per resident: `voice { id, speed, pitch }` chosen by age, gender
and temperament from Kokoro's 28 voices, and lines in their own words:
`hello[]` (first meeting, says name and what they do), `again[]` (later
greetings), `self[]` (their life, work, opinions, small stories, specific
to the town). `Talk.lineFor` uses them for the greeting and the "own life"
sentence; memory, gossip, mission hints and place tips stay as they are.
`Voices.profile` takes the persona's voice (hash fallback for anyone
without one). Mall shoppers (`ShopperTalk`) open with a persona greeting.

### 2. Pronunciation (`src/audio/voice/VoiceWorker.js`)
Phonemize in the worker ourselves: the text is split at known names
(a dictionary of Japanese names and words → IPA in Kokoro's symbol set),
the rest goes through the same espeak-ng phonemizer Kokoro uses
(`phonemizer`, already a dependency of `kokoro-js`), then Kokoro's
tokenizer and `generate_from_ids`. Same model, same voices, names said
right.

### 3. Missions (`SideMissionData.js`, `SideMissionSystem.js`)
- She carries what the story says: Aoi's order (paper bag) while the
  delivery runs, collected parcels (a stack in her arms), Hana's watering
  can, and Sora's camera is raised at each viewpoint. Props are built with
  the system's existing instanced parts and held through the heroine's act
  layer (`holdR` / `carry`), as the walk-in shops hold a bag.
- Each objective is a short act (crouch to pick up / water, raise the
  camera), not an instant tick; controls are held for the moment.
- Residents named in a mission know about it before it starts (`hints`:
  Emi waits for her order), givers remind her while it runs.
- Tracker with nothing active: the nearest available favor and its
  distance, so there is always a target. Journal text matches.
- Tests updated (`scripts/side-missions.test.mjs`, exploration check).

### 4. Mall / escalators
Keep the verified behaviour. Check whether the car can be driven into the
mall through the automatic doors (the door opens for her even in the car);
if so, doors ignore her while she drives and bollards close the entrance
crossings to cars.

### 5. QA
`npm test`, exploration check, perf check, build; a scripted talk with
every resident (no errors, every line unique), mall trip smoke test.

## Steps
1. Plan committed. Persona content written (subagent) to the format above.
2. VoiceWorker phonemization with the name dictionary; `Voices.profile`
   from personas; device-voice fallback keeps gender/pitch.
3. `Talk.lineFor` persona integration; `ShopperTalk` greeting.
4. Missions: hints, tracker suggestion, carried props, objective acts,
   text; tests.
5. Mall door/car check and fix if needed.
6. QA runs, screenshots, commit.
