import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
// Wait, I need to check how nest-winston is exported. Usually it's WinstonModule.
// Let me write standard code.

async function bootstrap() {
    const logger = new Logger('Bootstrap'); // Temporary logger until Winston is configured

    const app = await NestFactory.create(AppModule, {
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    // Global Pipes
    app.useGlobalPipes(new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
    }));

    app.enableCors(); // Enable CORS for Frontend

    const port = process.env.PORT || 8080;
    await app.listen(port);
    logger.log(`Application is running on: ${await app.getUrl()}`);
    logger.log(`Port: ${port}`);
}
bootstrap();
