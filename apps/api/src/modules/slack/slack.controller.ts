import type { Request, Response, NextFunction } from 'express';
import {
  generateState,
  verifyState,
  exchangeSlackCode,
  getSlackStatus,
  disconnectSlack,
} from './slack.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../core/logger/index.js';

export function oauthStart(req: Request, res: Response): void {
  const state = generateState(req.user!.userId);
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'incoming-webhook',
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
}

export async function oauthCallback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { code, state, error } = req.query as Record<string, string>;
    if (error) {
      res.redirect(`${env.FRONTEND_URL}/dashboard?slack_error=authorization_denied`);
      return;
    }
    if (!code) {
      res.redirect(`${env.FRONTEND_URL}/dashboard?slack_error=missing_code`);
      return;
    }

    const verified = verifyState(state ?? '');
    if (!verified) {
      res.redirect(`${env.FRONTEND_URL}/dashboard?slack_error=invalid_state`);
      return;
    }

    await exchangeSlackCode(code, verified.userId);
    logger.info({ userId: verified.userId }, 'Slack connected');
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=connected`);
  } catch (err) {
    logger.error({ errorName: err instanceof Error ? err.name : 'UnknownError' }, 'Failed to exchange Slack OAuth code');
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack_error=connection_failed`);
  }
}

export async function status(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slackStatus = await getSlackStatus(req.user!.userId);
    res.json({ data: slackStatus });
  } catch (err) {
    next(err);
  }
}

export async function disconnect(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await disconnectSlack(req.user!.userId);
    res.json({ data: { message: 'Slack disconnected' } });
  } catch (err) {
    next(err);
  }
}
