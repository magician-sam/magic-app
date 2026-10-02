import type { Package } from "./models.js";

export function experienceFor(name: string) {
  const entries = [
    [/food|beverage|f&b/i, "hospitality", "A feast for your celebration", "Bring your guests together over food, drinks and a menu that suits your occasion.", "Share your guest count, menu ideas and dietary requirements. We confirm catering and serving arrangements with you."],
    [/cake/i, "sweet", "Make a wish. Make it yours.", "A celebration cake adds a personal centrepiece and a sweet moment to remember.", "Tell us your theme, preferred flavours and guest count. Design, size and delivery are agreed with you."],
    [/\bdj\b/i, "nightlife", "Your crowd. Your soundtrack.", "From a warm welcome to the dance floor, set the mood with music chosen for your celebration.", "Share your favourite music and the atmosphere you want. We confirm the DJ, playlist preferences and event arrangements."],
    [/sound system|audio equipment/i, "sound", "Let every moment be heard", "Sound equipment helps bring speeches, performances and music to life at your event.", "Tell us about your venue, guest count and microphone needs. We confirm equipment, setup and technical support."],
    [/science/i, "science", "Curiosity takes centre stage", "Experiments and discoveries bring a sense of wonder to the celebration.", "Tell us the audience’s ages and interests so we can discuss a suitable format."],
    [/workshop/i, "science", "Little hands, bright ideas", "Creative or science activities give children a chance to explore and take part.", "Tell us the ages and interests of the children. We agree the workshop topic and materials with you."],
    [/bubble/i, "bubbles", "A little more daydream", "A visual celebration of bubbles, from delicate floating moments to bigger surprises.", "Let us know who is attending and the atmosphere you would like."],
    [/close.up|magic/i, "magic", "Wonder, up close", "A performance built around surprise, laughter and the feeling of seeing something extraordinary.", "Tell us whether you want a shared performance or more personal moments with your guests."],
    [/character/i, "party", "Their favourites come to life", "Character costumes bring a colourful entrance and a familiar face to the celebration.", "Choose a costume idea. We confirm the exact character and availability for your event."],
    [/decoration|balloon decor/i, "party", "Set the scene for your celebration", "Balloon backdrops and themed decoration help turn your venue into part of the occasion.", "Share your theme, colours and inspiration. The final design is agreed with you."],
    [/face paint|glitter/i, "party", "A splash of imagination", "Colourful face painting and glitter looks add a personal touch to the party.", "Tell us the guest count and preferred designs so we can plan the arrangement."],
    [/balloon twist/i, "party", "Little creations, big smiles", "Balloon shapes and playful creations give guests something colourful to enjoy.", "Share your theme and guest count so we can discuss the available creations."],
    [/animation/i, "party", "Everyone joins the fun", "Guided party activities bring guests into the celebration instead of leaving them watching from the sidelines.", "Tell us the ages and interests of your guests. We agree the activities with you."],
    [/carnival/i, "party", "A little friendly competition", "Carnival-style games add playful challenges and another way for guests to join in.", "Tell us the ages, guest count and available venue arrangement so we can discuss the games."],
    [/clown/i, "party", "Let the laughter begin", "Comic performance and playful moments bring a cheerful character to your party.", "Tell us the audience’s ages and preferred atmosphere so we can discuss a suitable act."],
    [/juggl/i, "energy", "Keep your eyes on the surprise", "Juggling brings coordination, colourful props and fast-moving visual tricks to the celebration.", "We confirm the performer, props and format for your event."],
    [/football/i, "energy", "Football with a twist", "Ball-control skills and football tricks turn a familiar game into a performance.", "Tell us about your audience and event. The performer and exact format are confirmed separately."],
    [/dog/i, "party", "A different kind of guest star", "A dog performance adds an animal-focused act for guests who enjoy that kind of entertainment.", "We confirm the performer, animal arrangements and suitability for your event before booking."],
    [/theatre/i, "party", "A story to step into", "Children’s theatre brings characters, storytelling and performance into the celebration.", "Tell us the ages and interests of your audience. We agree the story and format with you."],
    [/caricatur/i, "party", "A memory with personality", "Live caricature drawing gives guests a playful illustrated keepsake from the occasion.", "Tell us the guest count so we can discuss the artist’s arrangement and drawing format."],
    [/mime/i, "spectacle", "A story without a word", "Expressive movement and visual comedy create a performance guests can follow without dialogue.", "Tell us whether you want a focal performance or moments among the guests."],
    [/human statue/i, "spectacle", "Stillness with a surprise", "A living-statue act creates an unexpected visual detail for arrivals and event moments.", "We confirm the costume, performer and placement with you."],
    [/bmx/i, "energy", "Two wheels, plenty of wow", "BMX skills turn balance and bicycle tricks into a performance guests can gather around.", "We confirm the rider, performance format and suitable venue arrangement with you."],
    [/led/i, "energy", "Light up the celebration", "Illuminated costumes bring movement, colour and a glowing visual moment to your event.", "We confirm the costumes, performers and lighting conditions for your venue."],
    [/breakdance/i, "energy", "Bring the beat to life", "Breakdance adds rhythm, expressive movement and a lively performance to the celebration.", "Tell us about your guests. We agree the performer and format with you."],
    [/dance/i, "energy", "A celebration in motion", "A dance performance brings choreography, music and a shared focal moment to the occasion.", "Share the mood you want. We confirm the performers and dance style with you."],
    [/stilt/i, "spectacle", "An entrance above the ordinary", "A towering stilt character adds a surprising welcome and a striking presence among your guests.", "We confirm the costume, performer and suitable route around the venue."],
    [/aerial/i, "spectacle", "Wonder above your heads", "Aerial performance brings graceful movement and an unusual perspective to the celebration.", "The act requires a suitable venue and confirmed rigging and safety arrangements."],
    [/chair|balance/i, "spectacle", "Hold your breath for the balance", "A balancing act builds anticipation around precision, control and an unexpected feat.", "We confirm the performer, equipment and venue safety arrangements before booking."],
    [/circus/i, "spectacle", "The circus comes to your celebration", "Circus characters and performance bring a colourful sense of arrival to the event.", "We agree the participating acts, costumes and parade arrangement with you."],
    [/fire/i, "spectacle", "A dramatic spark of wonder", "A fire performance creates a striking visual moment with movement and flame.", "The performer, venue permissions and safety arrangements must be confirmed before booking."],
    [/acrobat/i, "spectacle", "A moment of extraordinary movement", "Acrobatic skills bring balance, strength and striking movement to the performance.", "We agree the performer, act and suitable venue arrangements before booking."],
    [/fire|aerial|acrobat|balance|stilt|circus/i, "spectacle", "Make an entrance worth remembering", "A distinctive visual act adds a striking moment to the event.", "We discuss the performer, venue and required safety checks before confirming the act."],
    [/music|parade/i, "energy", "Give your event a rhythm", "Live performance or a parade brings music, colour and a sense of occasion.", "Tell us the mood you want. We confirm the performers and format with you."],
    [/caricatur|mime|statue|theatre|dog/i, "spectacle", "Something a little unexpected", "A distinctive guest act gives your celebration another story to tell.", "Tell us what interests your guests. We confirm the performer and details before booking."],
  ] as const;
  const match = entries.find(([pattern]) => pattern.test(name));
  return match
    ? { theme: match[1], heading: match[2], experience: match[3], personal: match[4] }
    : { theme: "party", heading: "Make the moment yours", experience: "Explore this guest act as part of your celebration.", personal: "Share your ideas. We confirm the performer, format and availability with you." };
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
