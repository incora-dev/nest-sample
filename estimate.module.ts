import { Module } from '@nestjs/common';

import { EstimateController } from './estimate.controller';
import { EstimateService } from './estimate.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [EstimateController],
  imports: [
    AuthModule,
  ],
  providers: [
    EstimateService,
  ],

})
export class EstimateModule {}
