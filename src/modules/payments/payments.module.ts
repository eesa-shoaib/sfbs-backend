import { Module } from '@nestjs/common';
import { PaymentsService } from './payments/payments.service';
import { PaymentsController } from './payments/payments.controller';

@Module({
  providers: [PaymentsService],
  controllers: [PaymentsController]
})
export class PaymentsModule {}
