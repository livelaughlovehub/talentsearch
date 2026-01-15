import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { searchRoutes } from './routes/search';
import { candidateRoutes } from './routes/candidates';
import { emailRoutes } from './routes/email';
import { jobRoutes } from './routes/jobs';
import { initDatabase } from './database';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize database
initDatabase();

// Routes
app.use('/api/search', searchRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/jobs', jobRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

