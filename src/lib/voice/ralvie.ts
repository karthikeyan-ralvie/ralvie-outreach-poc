export function openingLine(agentName: string, firstName: string) {
  return firstName
    ? `Hey, this is ${agentName} — am I talking to ${firstName}?`
    : `Hey, this is ${agentName}. Who am I speaking with?`;
}

export function ralviePitch(name: string) {
  return `Great, ${name}. I am calling from Ralvie AI Frontdesk. We help businesses answer every call with an AI front desk. Do you have a minute?`;
}

export function ralvieDetailPitch(name: string) {
  return `Thanks, ${name}. Ralvie AI Frontdesk is an AI receptionist that answers every customer call, even after hours, so no lead is missed. If you are interested, I can share more details on email with a demo link you can schedule based on your availability. Would that be helpful?`;
}

export const minuteRetry = "Do you have a minute? Please say yes or no.";

export const demoOfferRetry =
  "If you are interested, I can email you more details with a demo link you can schedule based on your availability. Would that be helpful? Please say yes or no.";

export const emailAsk =
  "Perfect. Please say your email in one go, like john at gmail dot com. Don't spell it letter by letter.";

export const emailRetry =
  "I didn't catch a full email. Say it in one go, like name at gmail dot com. Or say use the one on the list.";

export function listedEmailAsk(email: string) {
  return `I already have ${email.replace(/@/g, " at ").replace(/\./g, " dot ")} on the list. Should I send the demo link there?`;
}

export function emailConfirmAsk(email: string) {
  return `I heard ${email.replace(/@/g, " at ").replace(/\./g, " dot ")}. Is that right?`;
}

export const phoneAsk = "Thanks. And what's the best phone number to reach you on?";

export const phoneRetry = "I didn't catch that number. Please say the digits slowly, or say this number.";

export const wrapThanks =
  "Got it. I will send the details and a demo link you can book around your schedule. Thanks for your time. Goodbye.";

export const noMinute = "No problem. I'll catch you another time. Goodbye.";

export const notInterestedBye = "Understood. Sorry to bother you. Goodbye.";

export const INTERESTED_SLUG = "interested";
