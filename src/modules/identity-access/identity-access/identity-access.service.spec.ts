import { Test, TestingModule } from '@nestjs/testing';
import { IdentityAccessService } from './identity-access.service';

describe('IdentityAccessService', () => {
  let service: IdentityAccessService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IdentityAccessService],
    }).compile();

    service = module.get<IdentityAccessService>(IdentityAccessService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
