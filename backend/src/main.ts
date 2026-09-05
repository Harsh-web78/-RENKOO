import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
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
  const allowedOrigins = frontendUrl
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin not allowed'));
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
