import { Test, TestingModule } from '@nestjs/testing';
import { IdentityAccessController } from './identity-access.controller';

describe('IdentityAccessController', () => {
  let controller: IdentityAccessController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentityAccessController],
    }).compile();

    controller = module.get<IdentityAccessController>(IdentityAccessController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
