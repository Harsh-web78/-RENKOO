import 'reflect-metadata';
import {
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import {
  json,
  raw,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  /*
   * Fail fast in production: without a signing secret
   * every authenticated request would fail at the guard
   * anyway — crashing at boot turns a silent outage into
   * an explicit deployment error.
   */
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.JWT_ACCESS_SECRET
  ) {
    throw new Error(
      'JWT_ACCESS_SECRET must be set in production.',
    );
  }

  const app = await NestFactory.create(
    AppModule,
    { bodyParser: false },
  );

  /*
   * Webhooks require the exact raw bytes for HMAC
   * verification, so these paths keep the raw
   * buffer (stashed as req.rawBody) while every
   * other route gets parsed JSON.
   */
  const rawBodySaver = (
    req: any,
    _res: unknown,
    buf: Buffer,
  ) => {
    req.rawBody = Buffer.from(buf);
  };

  app.use(
    '/api/billing/stripe/webhook',
    raw({
      type: 'application/json',
      limit: '1mb',
      verify: rawBodySaver,
    }),
  );
  app.use(
    '/api/billing/razorpay/webhook',
    raw({
      type: 'application/json',
      limit: '1mb',
      verify: rawBodySaver,
    }),
  );
  app.use(
    json({ limit: '1mb' }),
  );

  /*
   * Lightweight correlation IDs. Never carries
   * secrets; only used for log correlation.
   */
  app.use(
    (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      const id = randomUUID();

      (req as any).id = id;
      res.setHeader(
        'x-request-id',
        id,
      );
      next();
    },
  );

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new GlobalExceptionFilter());

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  /*
   * Exact-match allowlist driven by FRONTEND_URL (comma-separated).
   * Trailing slashes are stripped because the Origin header never
   * carries one — without this, a dashboard value like
   * "https://renkoo.online/" would fail-closed with 403.
   * No wildcards, no `origin: true`, credentials stay enabled.
   */
  const allowedOrigins = frontendUrl
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      /*
       * Fail closed with 403 (not 500): a rejected origin
       * is a client/configuration problem, never a server
       * crash. The global filter preserves 4xx messages.
       */
      callback(
        new ForbiddenException(
          'CORS origin not allowed',
        ),
      );
    },
    credentials: true,
  });

  app.use(helmet());
  app.use(compression());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT || 4000);

  await app.listen(port);

  console.log(`RENKOO API running at http://localhost:${port}/api`);
}

bootstrap();
