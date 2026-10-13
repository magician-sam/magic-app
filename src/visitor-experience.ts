import type { Package } from "./models.js";

export function experienceFor(name: string) {
  const entries = [
    [/food|beverage|f&b/i, "hospitality", "Good company. Something delicious.", "Let the conversation flow over food and drinks chosen for your gathering.", "Share your guest count, menu ideas and dietary requirements. We confirm catering and serving arrangements with you."],
    [/cake/i, "sweet", "Make a wish. Make it yours.", "The candles, the wish, the first slice. A cake that feels part of your story.", "Tell us your theme, preferred flavours and guest count. Design, size and delivery are agreed with you."],
    [/\bdj\b/i, "nightlife", "Your crowd. Your soundtrack.", "From a warm welcome to the dance floor, set the mood with music chosen for your celebration.", "Share your favourite music and the atmosphere you want. We confirm the DJ, playlist preferences and event arrangements."],
    [/sound system|audio equipment/i, "sound", "Give the moment its voice", "Every speech, every note, every cue. Sound is part of the performance, too.", "Tell us about your venue, guest count and microphone needs. We confirm equipment, setup and technical support."],
    [/science/i, "science", "Curiosity takes centre stage", "A question, a colourful experiment, a spark of discovery. Science turns curiosity into part of the show.", "Tell us the audience’s ages and interests so we can discuss a suitable format."],
    [/workshop/i, "science", "Little hands, bright ideas", "A chance to make, try and discover. Little hands become part of the creative process.", "Tell us the ages and interests of the children. We agree the workshop topic and materials with you."],
    [/bubble/i, "bubbles", "Wonder, floating by", "Drifting shapes, shimmering colours and surprises that float into view. A little daydream brought to life.", "Let us know who is attending and the atmosphere you would like."],
    [/close.up|magic/i, "magic", "Wonder, up close", "A little sleight of hand. A shared laugh. That delicious moment of “how did they do that?”", "Tell us whether you want a shared performance or more personal moments with your guests."],
    [/character/i, "party", "Make-believe makes an entrance", "A familiar face at the door, a colourful costume in the crowd. Invite a little make-believe into the celebration.", "Choose a costume idea. We confirm the exact character and availability for your event."],
    [/decoration|balloon decor/i, "party", "Your occasion, in full colour", "Colour, shape and thoughtful little details. Give your celebration a setting that feels like you.", "Share your theme, colours and inspiration. The final design is agreed with you."],
    [/face paint|glitter/i, "party", "A splash of imagination", "A brushstroke, a shimmer, a new character. Let imagination wear a little colour.", "Tell us the guest count and preferred designs so we can plan the arrangement."],
    [/balloon twist/i, "party", "A twist of imagination", "A simple balloon becomes something unexpected, one playful twist at a time.", "Share your theme and guest count so we can discuss the available creations."],
    [/animation/i, "party", "Come for the party. Be part of it.", "Games, movement and playful moments invite your guests into the action.", "Tell us the ages and interests of your guests. We agree the activities with you."],
    [/carnival/i, "party", "Step right up. Have a go.", "A playful challenge, a friendly cheer and another reason to try again. Bring a little carnival spirit to your gathering.", "Tell us the ages, guest count and available venue arrangement so we can discuss the games."],
    [/clown/i, "party", "Let the laughter begin", "Comic timing, playful surprises and a character with mischief in mind. Let laughter take the lead.", "Tell us the audience’s ages and preferred atmosphere so we can discuss a suitable act."],
    [/juggl/i, "energy", "Skill in the air. Eyes on the act.", "Rhythm, precision and one more thing in the air. Juggling makes skill part of the spectacle.", "We confirm the performer, props and format for your event."],
    [/football/i, "energy", "The beautiful game, reimagined", "Balance, footwork and a ball that seems to have other plans. Football skills take the spotlight.", "Tell us about your audience and event. The performer and exact format are confirmed separately."],
    [/dog/i, "party", "A different kind of guest star", "A four-legged guest star brings a different kind of personality to the performance.", "We confirm the performer, animal arrangements and suitability for your event before booking."],
    [/theatre/i, "party", "A story to step into", "Characters come forward, a story unfolds, and imagination finds its stage.", "Tell us the ages and interests of your audience. We agree the story and format with you."],
    [/caricatur/i, "party", "Your guests, with a playful twist", "A few lines, a familiar expression, a little exaggeration. An artist turns the occasion into a keepsake.", "Tell us the guest count so we can discuss the artist’s arrangement and drawing format."],
    [/mime/i, "spectacle", "A story without a word", "A glance, a gesture, a whole conversation. Mime lets movement do the talking.", "Tell us whether you want a focal performance or moments among the guests."],
    [/human statue/i, "spectacle", "Stillness with a surprise", "A pose held still, a sudden gesture. A living statue plays with the art of surprise.", "We confirm the costume, performer and placement with you."],
    [/bmx/i, "energy", "Two wheels. A different kind of stage.", "Balance, control and bicycle tricks put a fresh spin on the performance.", "We confirm the rider, performance format and suitable venue arrangement with you."],
    [/led/i, "energy", "Paint the moment in light", "Illuminated costumes turn movement into colour and bring a glow to the performance.", "We confirm the costumes, performers and lighting conditions for your venue."],
    [/breakdance/i, "energy", "Bring the beat to life", "Footwork, rhythm and expressive movement give the beat a life of its own.", "Tell us about your guests. We agree the performer and format with you."],
    [/dance/i, "energy", "A celebration in motion", "Music finds its movement. Choreography brings rhythm and expression to your celebration.", "Share the mood you want. We confirm the performers and dance style with you."],
    [/stilt/i, "spectacle", "An entrance above the ordinary", "A character above the crowd, a welcome with a twist. Stilt performers bring a different perspective.", "We confirm the costume, performer and suitable route around the venue."],
    [/aerial/i, "spectacle", "Grace takes flight", "Grace, strength and movement in the air turn the space above into part of the stage.", "The act requires a suitable venue and confirmed rigging and safety arrangements."],
    [/chair|balance/i, "spectacle", "The art of holding the moment", "Precision, poise and rising anticipation. A balancing act lets suspense share the spotlight.", "We confirm the performer, equipment and venue safety arrangements before booking."],
    [/circus/i, "spectacle", "Roll up. The circus is calling.", "Characters, colour and the spirit of the circus make an entrance of their own.", "We agree the participating acts, costumes and parade arrangement with you."],
    [/fire/i, "spectacle", "A dance with fire", "Movement and flame meet in a performance shaped by rhythm and control.", "The performer, venue permissions and safety arrangements must be confirmed before booking."],
    [/acrobat/i, "spectacle", "Strength, turned into art", "Balance, strength and precision come together in a performance of extraordinary movement.", "We agree the performer, act and suitable venue arrangements before booking."],
    [/fire|aerial|acrobat|balance|stilt|circus/i, "spectacle", "Make an entrance worth remembering", "A distinctive visual act adds a striking moment to the event.", "We discuss the performer, venue and required safety checks before confirming the act."],
    [/music|parade/i, "energy", "Give your event a rhythm", "A live note, a moving crowd, a rhythm to gather around. Give your occasion its own soundtrack.", "Tell us the mood you want. We confirm the performers and format with you."],
    [/caricatur|mime|statue|theatre|dog/i, "spectacle", "Something a little unexpected", "A distinctive guest act gives your celebration another story to tell.", "Tell us what interests your guests. We confirm the performer and details before booking."],
  ] as const;
  const match = entries.find(([pattern]) => pattern.test(name));
  return match
    ? { theme: match[1], heading: match[2], experience: match[3], personal: match[4] }
    : { theme: "party", heading: "Make the moment yours", experience: "Discover another way to give your celebration its own character.", personal: "Share your ideas. We confirm the performer, format and availability with you." };
}

export function recommendationReasons(show: Package, answers: { occasion: string; feeling: string; audience: string; guests: string }) {
  const category = show.category.toLowerCase();
  const reasons: string[] = [];
  if (answers.occasion === "School event" && category === "science") reasons.push("Your school occasion makes discovery a natural starting point.");
  if (answers.occasion === "Birthday" && category === "bubbles") reasons.push("A playful visual choice for your birthday celebration.");
  if (["Wedding", "Private party", "Corporate event"].includes(answers.occasion) && show.adultShow) reasons.push("This show is listed for adult celebrations.");
  if (answers.feeling === "Make everyone laugh" && ["magic", "bubbles"].includes(category)) reasons.push("Suggested for the playful atmosphere you chose.");
  if (answers.feeling === "Leave everyone speechless" && ["magic", "science"].includes(category)) reasons.push("Suggested for your preference for surprise and discovery.");
  if (answers.feeling === "Create a personal moment" && category === "magic") reasons.push("Magic is a starting point for the personal moment you described.");
  if (answers.feeling === "A high-energy party" && category === "science") reasons.push("A lively starting point for the energetic atmosphere you chose.");
  const age = answers.audience === "Children under 6" ? 4 : answers.audience === "Children 6–12" ? 9 : answers.audience === "Teens and adults" ? 18 : null;
  if (age !== null && show.minAge <= age && show.maxAge >= age) reasons.push(show.minAge === 0 && show.maxAge === 99 ? "Listed for all ages. We’ll discuss the right format for your guests." : "Its listed age range overlaps your audience group. We’ll confirm suitability with you.");
  if (!reasons.length) reasons.push("A starting point from the shows that match your audience preferences.");
  return reasons.slice(0, 2);
}
