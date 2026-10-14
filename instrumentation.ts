export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await Promise.all([
    import("./src/app/api/voice/twilio/route"),
    import("./src/app/api/voice/status/route"),
    import("./src/app/api/voice/recording/route"),
  ]);
}
