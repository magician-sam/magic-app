/** Public planning preferences, never a quote, capacity promise or reservation. */
export const designerOccasions = ["Birthday", "School event", "Wedding", "Corporate event", "Festival", "Christmas", "Baptism", "First Communion", "Private party", "Just because", "Playground visit"] as const;
export type DesignerAnswers = { occasion: string; format: string; guests: string; feeling: string; audience: string; setting: string };
export type DesignerStep = { key: keyof DesignerAnswers; title: string; hint: string; choices: readonly (readonly [string, string])[] };
export const emptyDesignerAnswers = (): DesignerAnswers => ({ occasion: "", format: "", guests: "", feeling: "", audience: "", setting: "" });
const choices = (values: string[]) => values.map(value => ["", value] as const);

export function designerSteps(occasion: string): DesignerStep[] {
  const steps: DesignerStep[] = [{ key: "occasion", title: "What are you planning?", hint: "A spark of an idea is all we need to begin.", choices: [["🎂", "Birthday"], ["🏫", "School event"], ["🎪", "Festival"], ["🏢", "Corporate event"], ["💍", "Wedding"], ["🎄", "Christmas"], ["🕊️", "Baptism"], ["🕯️", "First Communion"], ["🎉", "Private party"], ["✨", "Just because"], ["🛝", "Playground visit"]] }];
  const formats: Record<string, { title: string; choices: string[] }> = {
    Birthday: { title: "What kind of birthday are we celebrating?", choices: ["A children’s birthday", "An adult birthday", "A milestone celebration", "Help me choose"] },
    "School event": { title: "What kind of school day?", choices: ["A classroom workshop", "An assembly or school celebration", "A trip or activity day", "Help us choose"] },
    Festival: { title: "How will your festival flow?", choices: ["A stage performance", "Roaming acts around the venue", "Drop-in activity stations", "A mix of experiences"] },
    "Corporate event": { title: "What are you bringing people together for?", choices: ["A team celebration", "A family day", "A launch or public activation", "A formal reception"] },
    Wedding: { title: "Which wedding moment needs a little magic?", choices: ["Welcome and cocktail hour", "The main celebration", "Entertainment for the children", "Help us shape the moment"] },
    Christmas: { title: "What kind of festive gathering?", choices: ["A family celebration", "A school celebration", "A public Christmas event", "A company celebration"] },
    Baptism: { title: "How would you like to celebrate the baptism?", choices: ["A gathering after the ceremony", "A family lunch or reception", "Styling and keepsakes for the occasion", "Help us plan the celebration"] },
    "First Communion": { title: "What are you planning for their First Communion?", choices: ["A celebration after the ceremony", "A family meal with children’s entertainment", "A shared celebration for several families", "Help us shape this milestone"] },
    "Playground visit": { title: "What would you like to arrange?", choices: ["An individual play visit", "A group play visit", "A birthday at a playground", "Help me find a playground"] },
    "Private party": { title: "What brings your guests together?", choices: ["A family gathering", "A party with friends", "An anniversary", "A surprise celebration"] },
    "Just because": { title: "What moment would you like to create?", choices: ["A surprise for someone", "A creative day together", "A little weekend adventure", "Help me imagine it"] },
  };
  const format = formats[occasion];
  if (format) steps.push({ key: "format", title: format.title, hint: "Picture the moment. We’ll work through the practical details with you.", choices: choices(format.choices) });
  const guestTitles: Record<string, string> = { Birthday: "How many birthday guests?", "School event": "How many students will join in?", Wedding: "How many wedding guests?", "Corporate event": "How many people are attending?", Festival: "How big is the audience you expect?", Christmas: "How many guests at your festive gathering?", "Private party": "How many guests are on your list?", "Just because": "How many people will share this moment?", "Playground visit": "How many people are coming?" };
  const milestone = occasion === "Baptism" || occasion === "First Communion";
  steps.push({ key: "guests", title: milestone ? "How many family and friends will join you?" : guestTitles[occasion] || "How many guests?", hint: "A rough number helps us shape the experience. We’ll check venue capacity before booking.", choices: choices(occasion === "Festival" ? ["Up to 100", "101–300", "More than 300", "Not sure yet"] : ["1–20", "21–50", "More than 50", "Not sure yet"]) });
  steps.push({ key: "feeling", title: milestone ? "What would make the celebration feel like yours?" : "How should the moment feel?", hint: milestone ? "Choose the atmosphere for your family gathering. Ceremony arrangements stay with your chosen venue." : "Laughter, wonder or a room full of energy? Follow your instinct.", choices: milestone ? choices(["Soft and elegant", "Colourful and playful", "A personal family moment", "Help us find our style"]) : [["😂", "Make everyone laugh"], ["😮", "Leave everyone speechless"], ["❤️", "Create a personal moment"], ["🔥", "A high-energy party"]] });
  const school = occasion === "School event", birthday = occasion === "Birthday", play = occasion === "Playground visit";
  steps.push({ key: "audience", title: milestone ? "Who will share the celebration?" : school ? "Which students are taking part?" : birthday ? "Who is the birthday celebration for?" : play ? "Who will be playing?" : "Who are we entertaining?", hint: birthday ? "Start with their age group. We’ll add the birthday details later." : "Help us picture your guests. We’ll check each experience’s age requirements with you.", choices: choices(milestone ? ["Family and friends of mixed ages", "Mostly adults", "Many children under 6", "Many children 6–12"] : school ? ["Preschool / kindergarten", "Primary school", "Secondary school", "Several school stages"] : ["Children under 6", "Children 6–12", "Teens and adults", "Mixed ages"]) });
  steps.push({ key: "setting", title: milestone ? "Where will the gathering take place?" : play ? "Have you chosen a playground?" : "Where shall we set the scene?", hint: "We’ll confirm the place, setup and availability before any booking.", choices: choices(milestone ? ["At home", "A restaurant or reception venue", "A garden celebration", "Help me find a venue"] : play ? ["I have a playground in mind", "Help me find a playground", "Not decided yet"] : ["Indoors", "Outdoors", "Help me find a venue", "Not decided yet"]) });
  return steps;
}

/** Saved device preferences are untrusted: keep only current, relevant choices. */
export function readDesignerAnswers(value: unknown): DesignerAnswers {
  const result = emptyDesignerAnswers();
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const input = value as Record<string, unknown>;
  if (!designerOccasions.some(occasion => occasion === input.occasion)) return result;
  result.occasion = String(input.occasion);
  for (const step of designerSteps(result.occasion)) {
    if (step.choices.some(([, choice]) => choice === input[step.key])) result[step.key] = String(input[step.key]);
  }
  return result;
}

export function designerAudienceAge(answers: DesignerAnswers): number | null {
  return ({ "Children under 6": 4, "Children 6–12": 9, "Teens and adults": 18, "Preschool / kindergarten": 4, "Primary school": 9, "Secondary school": 15, "Many children under 6": 4, "Many children 6–12": 9, "Mostly adults": 18 } as Record<string, number>)[answers.audience] ?? null;
}

export function designerSummary(value: unknown): string {
  const answers = readDesignerAnswers(value);
  return designerSteps(answers.occasion).map(step => answers[step.key]).filter(Boolean).join(" · ");
}
