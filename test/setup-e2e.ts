process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/t';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';
process.env.THROTTLE_TTL = '60';
process.env.THROTTLE_LIMIT = '10000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.ENABLE_SWAGGER = 'false';
process.env.LOG_LEVEL = 'fatal';

delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
