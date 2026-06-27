import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    /**
     * rawBody: true is required for Stripe webhook signature verification.
     * Without it, req.rawBody is undefined and the HMAC check cannot run.
     * The body-parser still parses JSON as usual — both raw and parsed bodies
     * are available in the request object.
     */
    rawBody: true,
  });

  const allowedOrigins = ['https://app.aifut.net', 'http://localhost:3000'];

  app.enableCors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== 'production' &&
          /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin))
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3002);
  console.log(`🚀 AIFUT API running on http://localhost:${process.env.PORT ?? 3002}`);
}

bootstrap();
