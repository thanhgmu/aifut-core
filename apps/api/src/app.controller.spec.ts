import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { PrismaService } from './prisma.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return the platform foundation status payload', () => {
      expect(appController.root()).toMatchObject({
        name: 'AIFUT API',
        status: 'ok',
        focus: {
          model: 'C',
        },
        endpoints: {
          health: '/health',
          orchestration: [
            '/orchestration/capabilities',
            '/orchestration/business-systems/draft-preview',
            '/orchestration/business-systems/runtime-binding-setup-preview',
            '/orchestration/roadmap',
          ],
        },
      });
    });
  });
});
