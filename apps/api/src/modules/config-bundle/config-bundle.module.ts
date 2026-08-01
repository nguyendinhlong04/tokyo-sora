import { Module } from '@nestjs/common'
import { ConfigBundleController } from './config-bundle.controller'
import { ConfigBundleService } from './config-bundle.service'

@Module({
  controllers: [ConfigBundleController],
  providers: [ConfigBundleService],
  exports: [ConfigBundleService],
})
export class ConfigBundleModule {}
