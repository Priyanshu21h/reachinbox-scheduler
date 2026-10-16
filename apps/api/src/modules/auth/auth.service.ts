import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';

export const googleOAuthClient = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_CALLBACK_URL,
);

export function getGoogleAuthUrl(): string {
  return googleOAuthClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'select_account',
  });
}
