import type { Package } from "./models.js";

/** Original service illustrations, distinct from real provider portfolio media. */
export function serviceArtwork(name: string): string {
  const art = [
    [/inflatabl|climbing tower|obstacle course/i,'<path d="M9 66V30h14v9h10V26h14v13h10v-9h14v36ZM9 30l7-14 7 14M57 30l7-14 7 14M30 66V51a10 10 0 0 1 20 0v15M7 69h66"/>'],
    [/popcorn|cotton candy|hot dog|cr[eê]pe|slush|soft serve|rolled ice cream|food station|party machine/i,'<path d="M15 36h50l-6 30H21ZM10 29h60l-6-13H16ZM20 16V9m40 7V9M29 36v30m22-30v30M13 70h54"/><circle cx="30" cy="72" r="3"/><circle cx="50" cy="72" r="3"/>'],
    [/photograph/i, '<rect x="12" y="27" width="56" height="37" rx="8"/><path d="m25 27 5-10h20l5 10M59 34h2"/><circle cx="40" cy="44" r="12"/><path d="M13 12h8M17 8v8M65 15h8M69 11v8"/>'],
    [/videograph|video coverage|event film/i, '<rect x="13" y="24" width="54" height="43" rx="7"/><path d="M13 35h54m-50-9 8-10 12 10 8-10 12 10M35 44l14 8-14 8Z"/>'],
    [/floral|flower decor|flower arrang/i, '<path d="M40 66V38m0 16c-13 0-17-7-17-13 10 0 17 5 17 13Zm0-8c13 0 17-7 17-13-10 0-17 5-17 13Z"/><path d="M40 13c7-9 15 0 11 8 13-2 15 10 4 15 7 9-4 17-15 7-11 10-22 2-15-7-11-5-9-17 4-15-4-8 4-17 11-8Z"/><circle cx="40" cy="28" r="6"/><path d="M24 69h32"/>'],
    [/favou?rs?|keepsakes?|giveaways?|guest gifts?|souvenirs?/i, '<rect x="14" y="29" width="52" height="13" rx="3"/><path d="M19 42v25h42V42M40 29v38M40 29c-26 0-24-19-14-19 10 0 14 19 14 19Zm0 0c26 0 24-19 14-19-10 0-14 19-14 19ZM10 15H4m3-3v6M70 52h7m-3.5-3.5v7"/>'],
  ] as const;
  const path = art.find(([pattern]) => pattern.test(name))?.[1];
  return path ? `<svg class="service-illustration" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>` : "";
}

export function experienceFor(name: string) {
  const entries = [
    [/inflatabl|climbing tower|obstacle course/i,"party","Room for adventure","Castles, slides & active adventures.","Space, age range, power, anchoring, weather and supervision must be reviewed by the provider before confirmation."],
    [/popcorn|cotton candy|hot dog|cr[eê]pe|slush|soft serve|rolled ice cream|food station|party machine/i,"hospitality","A station for every celebration","Treat stations & party machines, by request.","Choose rental or staffed service. Servings, ingredients, hygiene, utilities and delivery are agreed with the provider."],
    [/food|beverage|f&b/i, "hospitality", "Good company. Something delicious.", "Food & drinks for your guests.", "Share your guest count, menu ideas and dietary requirements. We confirm catering and serving arrangements with you."],
    [/cake/i, "sweet", "Make a wish. Make it yours.", "A celebration cake, made for your theme.", "Tell us your theme, preferred flavours and guest count. Design, size and delivery are agreed with you."],
    [/\bdj\b/i, "nightlife", "Your crowd. Your soundtrack.", "Your party. Your soundtrack.", "Share your favourite music and the atmosphere you want. We confirm the DJ, playlist preferences and event arrangements."],
    [/sound system|audio equipment/i, "sound", "Give the moment its voice", "Sound, microphones & event setup.", "Tell us about your venue, guest count and microphone needs. We confirm equipment, setup and technical support."],
    [/science/i, "science", "Curiosity takes centre stage", "Colourful experiments and curious minds.", "Tell us the audience’s ages and interests so we can discuss a suitable format."],
    [/workshop/i, "science", "Little hands, bright ideas", "Hands-on fun for creative kids.", "Tell us the ages and interests of the children. We agree the workshop topic and materials with you."],
    [/bubble/i, "bubbles", "Wonder, floating by", "Giant bubbles and floating surprises.", "Let us know who is attending and the atmosphere you would like."],
    [/close.up|magic/i, "magic", "Wonder, up close", "Close-up tricks and shared surprises.", "Tell us whether you want a shared performance or more personal moments with your guests."],
    [/character/i, "party", "Make-believe makes an entrance", "Favourite characters, ready to join the party.", "Choose a costume idea. We confirm the exact character and availability for your event."],
    [/balloon decor|balloons? styling/i, "balloon-styling", "A little lift. A lot of colour.", "Balloon arches, backdrops & colourful displays.", "Share your colours, theme, venue and the arrangement you have in mind. We confirm the design, installation and collection details with you."],
    [/floral|flower decor|flower arrang/i, "floral-styling", "Let your occasion bloom.", "Fresh flowers for tables, backdrops & welcomes.", "Share your flower preferences, colours, venue and inspiration. We confirm the floral arrangement, delivery and setup with you."],
    [/photograph/i, "capture", "Keep the feeling in the frame.", "Your event, captured in photos.", "Tell us the event date, location, coverage you want and preferred style. We agree the photographer, edited-photo delivery and image-use permissions before booking."],
    [/videograph|video coverage|event film/i, "capture", "A moment worth pressing play on.", "Event films and highlight videos.", "Tell us the coverage, video format and editing you have in mind. We confirm the videographer, delivery, music rights and publication permissions with you."],
    [/favou?rs?|keepsakes?|giveaways?|guest gifts?|souvenirs?/i, "keepsake", "A little thank-you. A lasting memory.", "Personalised gifts for your guests.", "Share your occasion, quantity, theme and preferred gifts. We agree materials, packaging, delivery and any personalised names or dates before production."],
    [/decoration|balloon decor/i, "party", "Your occasion, in full colour", "Balloons, backdrops & complete event styling.", "Share your theme, colours and inspiration. We agree what is included in the decoration plan and the final design with you."],
    [/face paint|glitter/i, "party", "A splash of imagination", "Colourful faces and a little sparkle.", "Tell us the guest count and preferred designs so we can plan the arrangement."],
    [/balloon twist/i, "party", "A twist of imagination", "Playful balloon creations, twisted live.", "Share your theme and guest count so we can discuss the available creations."],
    [/animation/i, "party", "Come for the party. Be part of it.", "Games, dancing & party fun.", "Tell us the ages and interests of your guests. We agree the activities with you."],
    [/carnival/i, "party", "Step right up. Have a go.", "Fairground games and friendly challenges.", "Tell us the ages, guest count and available venue arrangement so we can discuss the games."],
    [/clown/i, "party", "Let the laughter begin", "Playful surprises and plenty of laughs.", "Tell us the audience’s ages and preferred atmosphere so we can discuss a suitable act."],
    [/juggl/i, "energy", "Skill in the air. Eyes on the act.", "Skilful tricks that keep eyes up.", "We confirm the performer, props and format for your event."],
    [/football/i, "energy", "The beautiful game, reimagined", "Freestyle football tricks and ball skills.", "Tell us about your audience and event. The performer and exact format are confirmed separately."],
    [/dog/i, "party", "A different kind of guest star", "A four-legged guest star.", "We confirm the performer, animal arrangements and suitability for your event before booking."],
    [/theatre/i, "party", "A story to step into", "Stories and characters brought to life.", "Tell us the ages and interests of your audience. We agree the story and format with you."],
    [/caricatur/i, "party", "Your guests, with a playful twist", "Fun portraits to take home.", "Tell us the guest count so we can discuss the artist’s arrangement and drawing format."],
    [/mime/i, "spectacle", "A story without a word", "Comedy and storytelling without words.", "Tell us whether you want a focal performance or moments among the guests."],
    [/human statue/i, "spectacle", "Stillness with a surprise", "Living statues with a surprise.", "We confirm the costume, performer and placement with you."],
    [/bmx/i, "energy", "Two wheels. A different kind of stage.", "Bicycle tricks with a daring twist.", "We confirm the rider, performance format and suitable venue arrangement with you."],
    [/led/i, "energy", "Paint the moment in light", "Light-up costumes and dance.", "We confirm the costumes, performers and lighting conditions for your venue."],
    [/breakdance/i, "energy", "Bring the beat to life", "Beats, footwork & acrobatic moves.", "Tell us about your guests. We agree the performer and format with you."],
    [/dance/i, "energy", "A celebration in motion", "Choreography with rhythm and energy.", "Share the mood you want. We confirm the performers and dance style with you."],
    [/stilt/i, "spectacle", "An entrance above the ordinary", "Towering characters above the crowd.", "We confirm the costume, performer and suitable route around the venue."],
    [/aerial/i, "spectacle", "Grace takes flight", "Grace and acrobatics in the air.", "The act requires a suitable venue and confirmed rigging and safety arrangements."],
    [/chair|balance/i, "spectacle", "The art of holding the moment", "Balance, precision & suspense.", "We confirm the performer, equipment and venue safety arrangements before booking."],
    [/circus/i, "spectacle", "Roll up. The circus is calling.", "Colourful circus acts on the move.", "We agree the participating acts, costumes and parade arrangement with you."],
    [/fire/i, "spectacle", "A dance with fire", "Flame, movement & spectacle.", "The performer, venue permissions and safety arrangements must be confirmed before booking."],
    [/acrobat/i, "spectacle", "Strength, turned into art", "Strength, balance & extraordinary movement.", "We agree the performer, act and suitable venue arrangements before booking."],
    [/fire|aerial|acrobat|balance|stilt|circus/i, "spectacle", "Make an entrance worth remembering", "A distinctive visual act adds a striking moment to the event.", "We discuss the performer, venue and required safety checks before confirming the act."],
    [/music|parade/i, "energy", "Give your event a rhythm", "Live performers for your event’s soundtrack.", "Tell us the mood you want. We confirm the performers and format with you."],
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
