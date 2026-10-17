import type * as SourceMessaging from "../../packages/adapters/src/messaging-platforms.js";
export type { MessagingEnvironmentValues } from "../../packages/adapters/src/messaging-platforms.js";

// This explicit local profile has no messaging providers. These names mirror
// the existing typed boundary; adding a source field requires a guard here.
const environmentKeys = {
  sendblueApiKeyId: "SENDBLUE_API_KEY_ID",
  sendblueApiSecret: "SENDBLUE_API_SECRET",
  sendblueSigningSecret: "SENDBLUE_SIGNING_SECRET",
  sendbluePhoneNumber: "SENDBLUE_PHONE_NUMBER",
  slackBotToken: "SLACK_BOT_TOKEN",
  slackSigningSecret: "SLACK_SIGNING_SECRET",
  whatsappAccessToken: "WHATSAPP_ACCESS_TOKEN",
  whatsappPhoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
  whatsappAppSecret: "WHATSAPP_APP_SECRET",
  whatsappVerifyToken: "WHATSAPP_VERIFY_TOKEN",
  telegramBotToken: "TELEGRAM_BOT_TOKEN",
  telegramWebhookSecret: "TELEGRAM_WEBHOOK_SECRET_TOKEN",
  larkAppId: "LARK_APP_ID",
  larkAppSecret: "LARK_APP_SECRET",
  larkVerificationToken: "LARK_VERIFICATION_TOKEN",
  larkEncryptKey: "LARK_ENCRYPT_KEY",
  larkDomain: "LARK_DOMAIN",
} satisfies Record<keyof SourceMessaging.MessagingEnvironmentValues, string>;

const unsupported = () => new Error("Messaging is unsupported by native-mcp-local-v1");
const configured = (value: string | undefined) => Boolean(value?.trim());

export const messagingEnvFromProcess: typeof SourceMessaging.messagingEnvFromProcess = (env) => {
  if (Object.values(environmentKeys).some(key => configured(env[key]))) throw unsupported();
  return {};
};
export const messagingPlatformsFromEnv: typeof SourceMessaging.messagingPlatformsFromEnv = (env) => {
  if ((Object.keys(environmentKeys) as (keyof typeof environmentKeys)[]).some(key => configured(env[key]))) throw unsupported();
  return [];
};
export const isMessagingEnabled: typeof SourceMessaging.isMessagingEnabled = (platforms) => {
  if (platforms.length) throw unsupported();
  return false;
};
export const isMessagingSurfaceEnabled: typeof SourceMessaging.isMessagingSurfaceEnabled = (platforms) => isMessagingEnabled(platforms);
export const parseSendblueStatus: typeof SourceMessaging.parseSendblueStatus = () => { throw unsupported(); };
export const enrichSlackTeamRoom: typeof SourceMessaging.enrichSlackTeamRoom = () => { throw unsupported(); };
