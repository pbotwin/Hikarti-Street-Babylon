/**
 * Who each resident is: how they talk (their own words, in their own
 * manner) and the voice that says it. Lines are spoken by text-to-speech
 * (audio/voice): short, plain spoken English, no symbols. Talk.js picks
 * from them; Voices.js reads `voice`.
 *
 *   voice  Kokoro voice id, speaking speed and pitch (playback rate)
 *   hello  first meeting: they introduce themselves, name and what they do
 *   again  later meetings: a greeting in their manner (no name)
 *   self   about their life, work, habits, opinions of the town
 */
export const PERSONAS = {
  aoi: {
    voice: { id: 'af_heart', speed: 0.97, pitch: 1.0 },
    hello: [
      "Welcome in! I'm Aoi, and I run the little café here on Hikari Street.",
      "Oh, a new face. I'm Aoi, the café on the corner is mine. Come by any time.",
    ],
    again: [
      "There you are! Have you eaten yet today?",
      "Welcome back, the kettle is always on for you.",
      "Hello again, dear, come sit down for a minute.",
    ],
    self: [
      "I open the café before the street wakes up, and the first coffee of the day is mine.",
      "I keep a jar of sweets by the till for the children from the shrine steps.",
      "The pocket park across the way is where I eat lunch when the tables are quiet.",
      "One day I would love to put tables outside under the lanterns and serve the whole street.",
    ],
  },
  ren: {
    voice: { id: 'am_puck', speed: 1.08, pitch: 1.04 },
    hello: [
      "Can't stop long! I'm Ren, bicycle courier, I deliver all over town.",
      "Hey, I'm Ren. Parcels, letters, lunch boxes, if it fits on a bike I carry it.",
    ],
    again: [
      "Oh hey, quick hello, I'm on the clock!",
      "You again! Walk with me, I've got drops to make.",
      "No time to chat, but good to see you!",
    ],
    self: [
      "My round starts at the market and ends at the civic quarter, twice a day if the strap holds.",
      "I eat standing up, usually a rice ball by the underpass between runs.",
      "The railway underpass is the fastest way north, if you don't mind the echo of the trains.",
      "I timed myself from the café to the northern park once. Nobody believes the number, so I keep it to myself.",
    ],
  },
  emi: {
    voice: { id: 'af_bella', speed: 1.02, pitch: 0.98 },
    hello: [
      "Hello there! I'm Emi, I sell fruit and pickles at the stall by the east end of the market.",
      "You must be new! Emi's the name, come see my stall, best peaches in Komorebi Market.",
    ],
    again: [
      "Hey hey! Back for more, are you?",
      "There's my favourite customer, come here!",
      "Good to see you, loud as ever, I know!",
    ],
    self: [
      "I set up before dawn and I shout the prices until my voice goes. It's the best job in town.",
      "Every afternoon I trade a peach for a coffee from Aoi's café. We both come out ahead.",
      "Sunday Records next door plays the same old songs all day, and honestly I hum along.",
      "My dream is a second stall in the northern park, right by the big lawn, with a bigger sign.",
    ],
  },
  sora: {
    voice: { id: 'af_aoede', speed: 0.95, pitch: 1.02 },
    hello: [
      "Hi, I'm Sora. I photograph the streets here, mostly in the last hour of light.",
      "Oh, hello. Sora, street photographer. Don't mind the camera, I was framing the stalls behind you.",
    ],
    again: [
      "Hold still, the light on you is perfect right now.",
      "Hello again, you came at the golden hour.",
      "Back again? Stand there, the shadows are just right.",
    ],
    self: [
      "I shoot from low angles so the lanterns float above the rooftops instead of hiding behind them.",
      "I carry only one lens. Fewer choices means I look harder at what's in front of me.",
      "The west side of the market goes amber in the evening. I have never found a better place for colour.",
      "I want a wall of postcards one day, every corner of Hikari pinned up in order from south to north.",
    ],
  },
  hana: {
    voice: { id: 'af_sarah', speed: 0.92, pitch: 0.96 },
    hello: [
      "Welcome. I'm Hana, I look after the community garden here in Sakura Gardens.",
      "Hello, dear. My name is Hana. If the planters look tidy, that's my doing.",
    ],
    again: [
      "Oh, hello. Mind the seedlings along the path there.",
      "Good to see you, the roses were asking after you.",
      "Back among the flowers, I see. Welcome.",
    ],
    self: [
      "I water at dawn and again at dusk, because the midday sun scorches anything wet.",
      "I talk to the camellias. They don't answer, but they bloom better than the quiet ones.",
      "The cherry trees by the fountain drop their petals in a single week, and that week is why I stay here.",
      "Someday I would like a greenhouse by the north planters, so winter has colour too.",
    ],
  },
  kenji: {
    voice: { id: 'bm_george', speed: 0.9, pitch: 0.95 },
    hello: [
      "Ah, a visitor! I am Kenji, your humble neighbourhood guide, and nobody knows these streets better than I do.",
      "Good day to you. Kenji is my name, and showing people this town has been my pleasure for many years.",
    ],
    again: [
      "Ah, you have returned to learn more, splendid, splendid.",
      "Well now, our newest explorer graces me with another visit.",
      "Back again, and there is still so much I haven't shown you.",
    ],
    self: [
      "Every morning I walk from the shrine on Hikari Street to the northern park, and I never tire of it.",
      "I keep a notebook of every shop that has opened or closed here since I was a young man.",
      "Sakura Gardens, in my considered opinion, is the finest spot in the district, and I will defend that view against anyone.",
      "I once guided a lost tour bus through the underpass on foot. They still send me a card each year.",
    ],
  },
  yuki: {
    voice: { id: 'af_sky', speed: 1.06, pitch: 1.08 },
    hello: [
      "Oh hi! I'm Yuki, I go to the high school. Just heading home, kind of.",
      "Hey, you're new, right? I'm Yuki. Student, mostly. Don't tell my teacher I'm wandering.",
    ],
    again: [
      "Oh hey, it's you! What's up?",
      "Hi hi! Still exploring, or just lost again?",
      "You're everywhere lately, that's so cool.",
    ],
    self: [
      "School ends, I grab a drink from the vending machines, then I walk the long way home. Every day.",
      "I keep my earphones in even when nothing's playing. It makes people leave me alone.",
      "The garden past the market is my spot. I do homework on the bench by the fountain, kind of.",
      "I want to see the cherry blossoms there at night once. My mum says no, so, we'll see.",
    ],
  },
  daichi: {
    voice: { id: 'am_fenrir', speed: 0.95, pitch: 0.98 },
    hello: [
      "Hey. Name's Daichi. I play guitar around here, wherever the sound carries.",
      "Yo, I'm Daichi. Musician, more or less. The street's my practice room.",
    ],
    again: [
      "Hey, easy, good to see you around.",
      "Oh, hey, pull up some pavement.",
      "You again, nice, the day just got better.",
    ],
    self: [
      "I write songs on the shrine steps at night. The echo off the shutters does half the work.",
      "I tune by ear and I'm always a little flat. Nobody has complained yet.",
      "The railway underpass has the best reverb in town. Trains ruin the take, but the take's worth it.",
      "Someday I'll play a set in the northern park at sunset, no amp, just whoever stops.",
    ],
  },
  mika: {
    voice: { id: 'af_kore', speed: 1.03, pitch: 1.04 },
    hello: [
      "Hi. I'm Mika, I study fashion. And yes, I noticed your shoes before your face.",
      "Mika, fashion student. I sketch what people wear on this street. You're interesting, actually.",
    ],
    again: [
      "Oh, hello, new jacket? No? Shame.",
      "There you are, still dressing for comfort, I see.",
      "Hello again, turn around, let me see the back.",
    ],
    self: [
      "I sketch three outfits a day from the people walking past the café. Nobody notices me.",
      "I only wear one colour at a time. Mixing is for people who haven't decided who they are.",
      "The alley off Hikari Street has the best wall for photographs. Grey brick makes any fabric sing.",
      "My final collection will be inspired by the lanterns here. Paper, silk and a lot of warm orange.",
    ],
  },
  haru: {
    voice: { id: 'am_michael', speed: 0.95, pitch: 0.93 },
    hello: [
      "Haru. I fix things at the repair shop by the underpass. Bikes, kettles, whatever breaks.",
      "Name's Haru. Repair shop. If it's broken, bring it. If it's not, don't.",
    ],
    again: [
      "You again, has something broken already?",
      "Hm, still in one piece, I see.",
      "Right, hello, mind the oil on the ground.",
    ],
    self: [
      "I open at eight, close when the work's done. Some days that's five, some days it's dark.",
      "I never throw a screw away. Jars of them line the wall, and I've needed every one.",
      "The underpass floods when it rains hard. I keep sandbags by the door and tell the council every year.",
      "Ren's bike comes in every month with the same loose strap. One day I'll weld it on.",
    ],
  },
  natsumi: {
    voice: { id: 'af_nicole', speed: 0.95, pitch: 1.0 },
    hello: [
      "Good evening. I am Natsumi. I walk out in my kimono when the lanterns come on, that is all I do.",
      "Oh, hello. My name is Natsumi. I simply stroll in the evenings and let the town drift past.",
    ],
    again: [
      "Ah, you again, like a lantern finding me twice.",
      "Good evening, the air is soft tonight, isn't it?",
      "Hello, I was just thinking of you, or someone like you.",
    ],
    self: [
      "I dress slowly before each walk. Tying the sash properly takes time, and the evening waits for me.",
      "I count the lanterns from the underpass to the market. The number changes, or perhaps I do.",
      "Komorebi Market after closing is my favourite. Empty stalls, warm lamps, the smell of fruit still in the air.",
      "I would like to see the canal by moonlight in winter, when the water is still enough to hold the stars.",
    ],
  },
  riku: {
    voice: { id: 'am_liam', speed: 1.02, pitch: 1.04 },
    hello: [
      "Hi, I'm Riku, I study design. Can I ask what brought you to this square?",
      "Riku, design student. I was just wondering how the stalls here got their shapes. Sorry, hello!",
    ],
    again: [
      "Oh, hello again, quick question, what did you notice today?",
      "You're back! I have about ten things to ask you.",
      "Hi again, have you looked closely at the stall roofs yet?",
    ],
    self: [
      "I spend my afternoons in the market, measuring stall awnings with my eyes and guessing the angles.",
      "I take apart every object I buy. The kettle at home has not been the same since.",
      "Sunday Records has the best shop sign in town. Hand painted, slightly crooked, and completely honest.",
      "I want to design a bench for the market square that three strangers would actually share.",
    ],
  },
  akari: {
    voice: { id: 'af_alloy', speed: 0.97, pitch: 1.03 },
    hello: [
      "Oh, hello. I'm Akari. I read, mostly. Right now, on that bench over there.",
      "Hello. My name is Akari. I'm not a vendor, I just like to read where it's busy.",
    ],
    again: [
      "Oh, hello, sorry, I was in the middle of a chapter.",
      "You found me again, I'm never far from a bench.",
      "Hello, quietly please, the hero is about to confess.",
    ],
    self: [
      "I finish a book every three days. I read on benches because home is too quiet to concentrate.",
      "I press a leaf from wherever I finish a story, so the pages remember the place.",
      "The bench by the flower stall is the best seat in Komorebi Market. Shade, and nobody talks to you.",
      "There's no bookshop anywhere in Hikari. One day I'd like to open a small one near the shrine.",
    ],
  },
  tomo: {
    voice: { id: 'am_echo', speed: 0.97, pitch: 1.02 },
    hello: [
      "Hi, I'm Tomo. I help at the flower stall here, wrapping bouquets and hauling buckets.",
      "Hello! Tomo, from the flower stall. If your hands smell of stems, that's my doing.",
    ],
    again: [
      "Hey, hello, careful, those buckets are full.",
      "Welcome back, the tulips just came in.",
      "Oh, hi, here, smell this one first.",
    ],
    self: [
      "I sort the stems by colour each morning, because customers buy with their eyes, not their noses.",
      "I keep a single wilted flower in my pocket. Reminds me to sell the fresh ones first.",
      "Sakura Gardens is where our best stems grow. Hana cuts them at dawn and I carry them down.",
      "Spring sells itself. Winter is the real test, and I'm learning to make bare branches look like bouquets.",
    ],
  },
  kaede: {
    voice: { id: 'bf_isabella', speed: 0.9, pitch: 0.95 },
    hello: [
      "Hello. I'm Kaede. I don't work here, I just come to the gardens to breathe.",
      "Kaede. I visit this garden most days. There's no hurry here, which is why I come.",
    ],
    again: [
      "Hello again, walk slowly, the petals are falling.",
      "Ah, it's you, sit a while, if you like.",
      "Good afternoon, the garden has been kind today.",
    ],
    self: [
      "I walk the same loop through the gardens every day, and every day a different thing catches me.",
      "I leave my phone at home when I come here. The fountain is louder without it.",
      "The little paths in Sakura Gardens bend just enough that you never see the whole garden at once. I like that.",
      "One spring I'd like to sit under the cherry trees from first light to last and simply watch.",
    ],
  },
  jun: {
    voice: { id: 'bm_fable', speed: 0.93, pitch: 0.97 },
    hello: [
      "Hello there. I'm Jun. During the week I work at a desk, but on weekends I paint out here.",
      "Oh, hi. Jun. I paint the gardens, badly but happily. You've got a good face for a portrait.",
    ],
    again: [
      "Hello again, the light's changed since you were last here.",
      "Welcome back, I kept your spot on the bench.",
      "Ah, good, someone to talk to while this dries.",
    ],
    self: [
      "I only paint on weekends, so I notice everything that changed since the last one. New benches, old friends, less hair.",
      "I mix my greens from memory, so the gardens on my canvas are always a little warmer than real ones.",
      "The north garden view, where the paths open up, is the one I keep coming back to. I've painted it nine times.",
      "I'd love to hang one little painting in Aoi's café. Just one, near the window, where the steam rises.",
    ],
  },
  kasumi: {
    voice: { id: 'bf_emma', speed: 0.96, pitch: 0.99 },
    hello: [
      "Good afternoon. I am Kasumi, the neighbourhood librarian. Returns are due on Thursdays, for the record.",
      "Hello. Kasumi. I run the small library near the avenue. Quietly, as libraries should be run.",
    ],
    again: [
      "Hello again, your timing is precise, as usual.",
      "Good day, I trust you've been reading something.",
      "Ah, back again, noted, with pleasure.",
    ],
    self: [
      "I shelve by subject, then by author, then by height. Anything else is chaos pretending to be a system.",
      "I keep a list of every question anyone has asked me. The oldest one is still unanswered.",
      "The west residential streets are my walk home. Small gardens, named cats, and nobody in a hurry.",
      "I would like a reading room with a view of the canal. Water helps people finish long books.",
    ],
  },
  teppei: {
    voice: { id: 'am_onyx', speed: 0.96, pitch: 0.92 },
    hello: [
      "Teppei. I keep the canal clear. Leaves, bottles, the odd bicycle. Somebody has to.",
      "Name's Teppei, canal maintenance. If the water's moving, I did my job.",
    ],
    again: [
      "Hm, you again, keep off the wet stones.",
      "Afternoon, don't lean on that railing, it's new.",
      "Right, hello, work's not going to clear itself.",
    ],
    self: [
      "I start at the sluice gate at six and work my way down. The water never waits for anyone.",
      "I take my break by the bakery because the smell beats the canal every time.",
      "The canal path east of the avenue is the straightest walk in town. Flat, wide, and I keep it that way.",
      "Last autumn I pulled a whole shopping trolley out of the water, and I still don't know how it got there.",
    ],
  },
  mei: {
    voice: { id: 'af_jessica', speed: 0.95, pitch: 1.04 },
    hello: [
      "Hello. My name is Mei. I study the tea ceremony, so forgive me if I move a little slowly.",
      "Oh, good day. I am Mei, a tea student. I was practising my steps on the way home.",
    ],
    again: [
      "Hello again, may I offer you a moment of quiet?",
      "Good day, you walk more gently than before, I think.",
      "Ah, welcome, please, there is no need to rush.",
    ],
    self: [
      "I practise one movement a day, the lifting of the ladle, until my hands forget to think.",
      "I warm the bowl before I warm the water. The order matters more than the tea, my teacher says.",
      "These residential streets west of the avenue are the quietest in town. I rehearse my steps on the way home.",
      "I hope to serve tea in Sakura Gardens when the blossoms fall, with the petals landing in the bowls.",
    ],
  },
  fumi: {
    voice: { id: 'af_nova', speed: 1.0, pitch: 1.0 },
    hello: [
      "Hi, I'm Fumi. I sketch the canal, mostly the reflections, and sometimes the people in them.",
      "Fumi, hello. I draw by the water here. Don't worry, I only sketch rooftops and ripples.",
    ],
    again: [
      "Hello again, the water's calm, good drawing weather.",
      "Oh, hi, stand still, you're in the reflection.",
      "Back again? The canal's gone silver today.",
    ],
    self: [
      "I draw the canal upside down first, the reflection, then flip the page to find the real town.",
      "I sharpen six pencils before I sit down. Stopping to sharpen breaks the line.",
      "The east canal at midday is too bright for colour. Late afternoon turns the water copper, and that's when I come.",
      "I want to fill one sketchbook with only rooftops, from Hikari Street to the civic quarter, in order.",
    ],
  },
  ayame: {
    voice: { id: 'bf_lily', speed: 1.03, pitch: 1.08 },
    hello: [
      "Hi! I'm Ayame, I play violin in the school orchestra. Loudly, apparently.",
      "Oh hey, I'm Ayame. School orchestra, second violin, don't laugh.",
    ],
    again: [
      "Hey! Did you hear me practising? Sorry, sorry.",
      "Oh, you! Guess what, we have a concert soon.",
      "Hiya, the long walk again, right?",
    ],
    self: [
      "I practise scales on the walk home so my neighbours only get the pretty parts later.",
      "I tap rhythms on everything. Railings, lunch boxes, my friend's head once.",
      "The west streets are so quiet I can hear my own bow squeak. It's embarrassing and perfect.",
      "I want to play in the civic quarter plaza with the whole orchestra, outdoors, with everyone stopping to listen.",
    ],
  },
  shun: {
    voice: { id: 'am_eric', speed: 1.03, pitch: 1.0 },
    hello: [
      "Hey! Shun here, weekend cyclist. Forty kilometres before breakfast, then I'm useless all day.",
      "Hi, I'm Shun! I ride the canal loop every weekend. If you hear a bell, that's me.",
    ],
    again: [
      "Hey, you! Keep up, I'm only stretching!",
      "Back on your feet again? Get a bike!",
      "Hello hello! Great day for a ride, isn't it?",
    ],
    self: [
      "I'm up at five on Saturdays and on the bike before the bakery opens. Then I eat everything in it.",
      "I ring my bell at every corner, even empty ones. Habit saves lives.",
      "The canal district is the best riding in town. Flat, wide, and Teppei keeps the stones dry.",
      "One day I'll ride from the café all the way to the mall and back without stopping once.",
    ],
  },
  chiyo: {
    voice: { id: 'bf_alice', speed: 0.86, pitch: 0.92 },
    hello: [
      "Good day to you, young lady. I am Chiyo. I have lived on this street since before the avenue was built.",
      "How do you do. My name is Chiyo, and I am simply a resident, a very longstanding one.",
    ],
    again: [
      "Ah, good day once more, you are most faithful in your visits.",
      "Well now, the young newcomer, do mind the step, dear.",
      "Good afternoon, one grows accustomed to seeing you about.",
    ],
    self: [
      "I rise with the sun, sweep the doorstep, and take my tea facing the street. One keeps one's habits.",
      "I still write letters by hand and post them at the box on the avenue. The reply takes longer, which is rather the point.",
      "When I was a girl, Hikari Street was the whole town. The shrine is the only thing that has not changed one bit.",
      "I should like to see the northern park full of children one more summer. That would be quite enough for me.",
    ],
  },
  nao: {
    voice: { id: 'af_river', speed: 1.0, pitch: 1.0 },
    hello: [
      "Morning, or whatever it is now. I'm Nao, the baker by the canal. Flour on everything, sorry.",
      "Hi. Nao, canalside bakery. If you smelled bread on the way here, that was me.",
    ],
    again: [
      "Hello again, the second batch is nearly out.",
      "Oh, you're back, still warm, if you hurry.",
      "Hey there, sorry, flour everywhere again.",
    ],
    self: [
      "I'm at the oven by three every morning. By the time the town wakes up, the first loaves are already gone.",
      "I knead by hand and I count in my head. Lose count and the loaf tells on you.",
      "The canal side is the right place for a bakery. Damp mornings make the crust crackle just so.",
      "I'd like to teach a bread class in the civic hall one winter, so the whole town smells like mine.",
    ],
  },
  shiori: {
    voice: { id: 'af_heart', speed: 1.02, pitch: 1.05 },
    hello: [
      "Good day, and welcome. I'm Shiori, a volunteer at the civic hall. Do ask if you need directions.",
      "Hello. My name is Shiori, I help at the civic hall here. Maps, forms, lost umbrellas, that sort of thing.",
    ],
    again: [
      "Hello again, is there anything I can help you with?",
      "Welcome back to the civic quarter, do you need directions?",
      "Good day, lovely to see a familiar face.",
    ],
    self: [
      "I volunteer three mornings a week at the hall, mostly helping newcomers find the right counter.",
      "I always carry a spare umbrella. Someone always needs one, and it's usually me.",
      "The plazas in the civic quarter are wide enough for the whole town, and on festival days they are full.",
      "I'd love to organise a welcome walk for new residents, from the café on Hikari Street right up to the park.",
    ],
  },
  kaito: {
    voice: { id: 'bm_lewis', speed: 1.0, pitch: 1.02 },
    hello: [
      "Hi, I'm Kaito, architecture student. Sorry, I was staring at that cornice, not at you.",
      "Kaito, hello. I study buildings, and this quarter has the best ones in town to study.",
    ],
    again: [
      "Oh, hey, look up, you're missing the good part.",
      "Hello again, notice anything new about these façades?",
      "You're back, good, I need a second opinion on that roofline.",
    ],
    self: [
      "I sketch one building a day and write down what holds it up. Concrete mostly, courage sometimes.",
      "I can't walk past a doorway without checking how the frame meets the wall. It slows my friends down.",
      "The civic quarter was all built at once, so the buildings agree with each other. Hikari Street argues, and I love both.",
      "I'd like to design a small bridge for the canal one day, something people stop on instead of crossing.",
    ],
  },
  hinata: {
    voice: { id: 'af_kore', speed: 0.95, pitch: 0.97 },
    hello: [
      "Hello! I'm Hinata, groundskeeper for the northern park. If the grass looks happy, that's me.",
      "Hi there. Hinata, I look after the big park up here. Lawns, hedges, the lot.",
    ],
    again: [
      "Oh, hello, mind the fresh seed over there.",
      "Welcome back, the hedges have grown since you came last.",
      "Hello again, the park's in a good mood today.",
    ],
    self: [
      "I mow in long straight lines from east to west, so the stripes catch the evening sun.",
      "I leave one corner of the park unmown every year. The butterflies found it before I did.",
      "The northern park is twice the size of Sakura Gardens, but Hana's cherry trees still win in spring. I don't mind.",
      "I'm hoping to plant a row of maples along the north edge, so autumn has somewhere to show off.",
    ],
  },
  asahi: {
    voice: { id: 'bm_daniel', speed: 0.98, pitch: 1.0 },
    hello: [
      "Hello. I'm Asahi, I photograph public art. Statues, murals, even the odd manhole cover.",
      "Asahi, pleased to meet you. I'm documenting every plaza sculpture in town before the light goes.",
    ],
    again: [
      "Hello again, stand left, you're casting a nice shadow.",
      "Ah, it's you, the bronze is glowing today.",
      "Welcome back, the light is being generous this afternoon.",
    ],
    self: [
      "I visit every statue in the civic quarter at three different hours, because bronze changes colour with the sun.",
      "I always shoot from the shade so the sculpture carries all the light. People think I'm hiding.",
      "The civic plazas are the best lit in town. Pale stone bounces the sky back up onto everything.",
      "I'm building a little map of every mural and statue here, and someday I'd like it printed for visitors.",
    ],
  },
  tomoe: {
    voice: { id: 'af_aoede', speed: 1.06, pitch: 1.08 },
    hello: [
      "Oh hi! I'm Tomoe, science club. I was measuring how fast the clouds move, don't ask.",
      "Hey, Tomoe here, science club at the high school. Have you seen the glowing crystals? I need samples.",
    ],
    again: [
      "Hey! Quick, what's the temperature feel like to you?",
      "Oh, you! I've got a new theory.",
      "Hi hi! Still no idea what those crystals are, by the way.",
    ],
    self: [
      "After school I log the weather from the plaza steps. Same spot, same time, two years of numbers so far.",
      "I carry a magnifying glass everywhere. It's embarrassing and extremely useful.",
      "The civic quarter has the clearest sky in town, because nobody's cooking or burning anything up here.",
      "I want to figure out what those glowing crystals are made of. Nobody at school believes they even exist.",
    ],
  },
  makoto: {
    voice: { id: 'am_michael', speed: 0.93, pitch: 0.98 },
    hello: [
      "Good afternoon. I'm Makoto, an urban planner. I helped lay out the avenues up here, for better or worse.",
      "Makoto. I plan streets for a living, so if a crossing annoys you, it may well be my fault.",
    ],
    again: [
      "Hello again, did the crossings behave themselves today?",
      "Ah, good, tell me which street brought you here.",
      "Welcome back, I've been counting footsteps, don't mind me.",
    ],
    self: [
      "I walk a different route to work each day and note where people cut corners. The corners tell me what to fix.",
      "I carry a tape measure in my coat. Pavement width is a moral question, in my view.",
      "The wide avenues get people across town, but Hikari Street, with its narrow shops, is where they actually stop. That's the lesson.",
      "I'd like to make the railway underpass brighter and wider. It's the one stretch where the town holds its breath.",
    ],
  },
  izumi: {
    voice: { id: 'af_bella', speed: 1.0, pitch: 1.04 },
    hello: [
      "Hello, hello! I'm Izumi, I sell flowers here at the park gate. Fresh this morning, promise.",
      "Welcome to the park! Izumi, flower seller. Take a bunch home, your walk deserves it.",
    ],
    again: [
      "Oh, hello again! The peonies are in today.",
      "Back for more blooms, I hope?",
      "Hello, hello! You look like someone who needs tulips.",
    ],
    self: [
      "I buy my stems from Hana's garden at dawn and sell them here by lunch. Nothing travels far.",
      "I wrap every bunch in brown paper and tie it with the same green string. People recognise it across the park.",
      "The northern park is at its best in early summer, when the lawns are green and the hydrangeas turn blue.",
      "My quiet hope is that someone buys a bunch here and walks it all the way back to Hikari Street.",
    ],
  },
  tsuki: {
    voice: { id: 'af_nova', speed: 0.95, pitch: 1.04 },
    hello: [
      "Hi, I'm Tsuki. I'm a travel illustrator, and this whole town is going into my journal.",
      "Oh, hello. Tsuki, I draw places for a living. I started at the café and ended up here somehow.",
    ],
    again: [
      "Hello again! You've turned up in my sketches twice now.",
      "Oh, it's you, the colours are kind today.",
      "Welcome back, hold that pose, just a second.",
    ],
    self: [
      "I draw one page per district, in order. The northern park gets the last page, and the widest sky.",
      "I paint the shadows first, in violet. Then everything else only has to be honest.",
      "Hikari Street has the warmest colours in town. Lantern orange, shutter red, and that café window at dusk.",
      "When this journal is full I'll leave a copy at Aoi's café, so newcomers can find their way with pictures.",
    ],
  },
};
