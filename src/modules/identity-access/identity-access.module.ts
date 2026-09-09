import { Module } from '@nestjs/common';
import { IdentityAccessService } from './identity-access/identity-access.service';
import { IdentityAccessController } from './identity-access/identity-access.controller';

@Module({
  providers: [IdentityAccessService],
  controllers: [IdentityAccessController]
})
export class IdentityAccessModule {}
