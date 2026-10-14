import twilio from "twilio";

export function twilioClient(accountSid: string, authToken: string) {
  return twilio(accountSid, authToken);
}

export function validateTwilioRequest(authToken: string, signature: string | null, url: string, params: Record<string, string>) {
  if (process.env.TWILIO_SKIP_VALIDATION === "1") return true;
  if (!signature) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

export function formToParams(form: FormData) {
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  return params;
}
