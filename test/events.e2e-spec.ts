/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('Events (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/events', () => {
    it('should create a valid event', async () => {
      const uniqueKey = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/events')
        .send({
          employeeId: 'EMP-TEST-001',
          eventType: 'SALARY_CHANGE',
          idempotencyKey: uniqueKey,
          payload: { salary: 50000 },
        })
        .expect(201);

      expect(res.body.event).toBeDefined();
      expect(res.body.event.id).toBeDefined();
      expect(res.body.event.status).toBe('PENDING');
      expect(res.body.event.eventType).toBe('SALARY_CHANGE');
      expect(res.body.event.employeeId).toBe('EMP-TEST-001');
      expect(res.body.event.idempotencyKey).toBe(uniqueKey);
    });

    it('should return existing event for duplicate idempotency key', async () => {
      const uniqueKey = `dup-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/events')
        .send({
          employeeId: 'EMP-DUP-001',
          eventType: 'ADDRESS_CHANGE',
          idempotencyKey: uniqueKey,
          payload: {
            street: '123 Main St',
            city: 'Boston',
            state: 'MA',
            zip: '02101',
          },
        })
        .expect(201);

      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/events')
        .send({
          employeeId: 'EMP-DUP-001',
          eventType: 'ADDRESS_CHANGE',
          idempotencyKey: uniqueKey,
          payload: {
            street: '123 Main St',
            city: 'Boston',
            state: 'MA',
            zip: '02101',
          },
        })
        .expect(201);

      expect(secondRes.body.event.id).toBe(firstRes.body.event.id);
      expect(secondRes.body.event.idempotencyKey).toBe(uniqueKey);
    });

    it('should reject invalid event type', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .send({
          employeeId: 'EMP-001',
          eventType: 'INVALID_TYPE',
          idempotencyKey: 'test-invalid',
          payload: { data: 'test' },
        })
        .expect(400);
    });

    it('should reject missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .send({
          employeeId: 'EMP-001',
        })
        .expect(400);
    });

    it('should reject empty employeeId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .send({
          employeeId: '',
          eventType: 'SALARY_CHANGE',
          idempotencyKey: 'test-empty',
          payload: { salary: 50000 },
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/events/:id', () => {
    it('should return an event by id', async () => {
      const uniqueKey = `get-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/events')
        .send({
          employeeId: 'EMP-GET-001',
          eventType: 'BANK_ACCOUNT_CHANGE',
          idempotencyKey: uniqueKey,
          payload: {
            accountNumber: '123456',
            routingNumber: '021000021',
            bankName: 'Chase',
          },
        })
        .expect(201);

      const eventId = createRes.body.event.id;

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/events/${eventId}`)
        .expect(200);

      expect(getRes.body.event.id).toBe(eventId);
      expect(getRes.body.event.status).toBe('PENDING');
      expect(getRes.body.event.eventType).toBe('BANK_ACCOUNT_CHANGE');
      expect(getRes.body.event.employeeId).toBe('EMP-GET-001');
    });

    it('should return 404 for non-existent event', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/events/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });
});
