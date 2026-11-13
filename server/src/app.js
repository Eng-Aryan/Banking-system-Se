import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import api from './routes/index.js';
import { apiLimit, sanitize, notFound, errorHandler } from './middleware/index.js';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(sanitize);
app.use('/api', apiLimit, api);
app.use(notFound);
app.use(errorHandler);
