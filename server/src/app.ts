import path from 'path';
import express, { Express } from 'express';
import cors from 'cors';
import fs from 'fs';
import { config } from './config';
import { errorHandler } from './middleware/errors';
import activityRouter from './routes/activity';
import authRouter from './routes/auth';
import customersRouter from './routes/customers';
import notificationsRouter from './routes/notifications';
import projectsRouter from './routes/projects';
import searchRouter from './routes/search';
import usersRouter from './routes/users';

/** Builds the Express application (kept separate from bootstrap for testing). */
export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/search', searchRouter);

  // In production the API also serves the built single-page frontend.
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
